import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { PlatformAccess } from '../src/platform/access.js';
import { PlatformForms } from '../src/platform/forms.js';
import { defaultSpaceId } from '../src/platform/credentials.js';

it('coordinates independent API instances for idempotent saves, last-admin protection and revocation', async () => {
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', 'http://127.0.0.1:3200');
  const modules = await Promise.all(
    [0, 1].map(() => Test.createTestingModule({ imports: [AppModule] }).compile()),
  );
  const apps = modules.map((module) => module.createNestApplication());
  try {
    await Promise.all(apps.map((app) => app.init()));
    const db = modules[0]!.get(PlatformDatabase).executor;
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    const tokens: string[] = [];
    for (const id of ['a', 'b']) {
      await db.execute('INSERT INTO platform_users VALUES ($1,1)', [id]);
      await db.execute('INSERT INTO platform_members VALUES ($1,$1,$2,1)', [id, defaultSpaceId]);
      await db.execute("INSERT INTO platform_member_roles VALUES ($1,'admin')", [id]);
      tokens.push((await modules[0]!.get(PlatformAccess).issueSession(id, 'test')).token);
    }
    const forms = modules.map((module) => module.get(PlatformForms));
    const created = await Promise.all(
      forms.map((service) => service.create(tokens[0], 'same-create', 'Concurrent form')),
    );
    expect(created[0]).toEqual(created[1]);
    const formId = created[0]!.formId;
    const saves = await Promise.all(
      forms.map((service) =>
        service.save(tokens[0], 'same-save', formId, ' {\r\n invalid\0', null),
      ),
    );
    expect(saves[0]).toEqual(saves[1]);
    expect((await db.one('SELECT count(*) AS n FROM platform_versions'))?.n).toBe(1);
    const results = await Promise.all(
      apps.map((app, i) =>
        request(app.getHttpServer())
          .post('/api/platform/members/' + ['a', 'b'][i])
          .set('Origin', 'http://127.0.0.1:3200')
          .set('Cookie', 'platform-session=' + tokens[i])
          .send({ revision: 0, active: true, roles: ['viewer'] }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      (await db.one("SELECT count(*) AS n FROM platform_member_roles WHERE role='admin'"))?.n,
    ).toBe(1);
    await modules[0]!.get(PlatformAccess).revokeSession(tokens[1]);
    await expect(modules[1]!.get(PlatformAccess).authenticate(tokens[1])).rejects.toThrow();
  } finally {
    await Promise.all(apps.map((app) => app.close()));
    vi.unstubAllEnvs();
  }
});
