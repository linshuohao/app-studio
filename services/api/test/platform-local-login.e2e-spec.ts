import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { localLoginEnabled } from '../src/platform/local-login.controller.js';
it('gates local login and preserves normal session and membership checks', async () => {
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', 'http://127.0.0.1:3200');
  vi.stubEnv('HOST', '127.0.0.1');
  vi.stubEnv('PLATFORM_LOCAL_LOGIN', 'true');
  vi.stubEnv('NODE_ENV', 'production');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  await app.init();
  const api = request(app.getHttpServer());
  const post = () => api.post('/api/platform/local-login').set('Origin', 'http://127.0.0.1:3200');
  try {
    await post().expect(403);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PLATFORM_LOCAL_LOGIN', 'false');
    await post().expect(403);
    vi.stubEnv('PLATFORM_LOCAL_LOGIN', 'true');
    expect(
      localLoginEnabled({
        socket: { remoteAddress: '192.168.1.2' },
        headers: { host: '127.0.0.1' },
      } as never),
    ).toBe(false);
    await api.post('/api/platform/local-login').set('Origin', 'https://evil.example').expect(403);
    await post().set('X-Forwarded-Host', 'evil.example').expect(403);
    await post().set('X-Forwarded-For', '192.168.1.2').expect(403);
    await post().set('Forwarded', 'for=192.168.1.2').expect(403);
    const alternate = await api
      .post('/api/platform/local-login')
      .set('Origin', 'http://localhost:3200')
      .expect(200);
    await api
      .get('/api/platform/access')
      .set('Cookie', alternate.headers['set-cookie']!)
      .expect(200);
    const rejected = await api
      .post('/api/platform/local-login')
      .set('Origin', 'http://localhost:3201')
      .expect(403);
    expect(rejected.body).toMatchObject({
      code: 'STUDIO_ORIGIN_REJECTED',
      message: expect.stringContaining('http://localhost:3200'),
    });
    const missing = await api.post('/api/platform/local-login').expect(403);
    expect(missing.body.message).toContain('缺少页面来源');
    vi.stubEnv('PLATFORM_STUDIO_ORIGIN', 'http://localhost:3200');
    const login = await post().expect(200);
    const cookie = login.headers['set-cookie']!;
    expect(cookie[0]).toContain('HttpOnly');
    await api.get('/api/platform/access').set('Cookie', cookie).expect(200);
    vi.stubEnv('NODE_ENV', 'production');
    await api
      .post('/api/platform/login')
      .set('Origin', 'http://127.0.0.1:3200')
      .send({})
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('STUDIO_ORIGIN_REJECTED'));
    await api.get('/api/platform/access').set('Cookie', cookie).expect(401);
    vi.stubEnv('NODE_ENV', 'development');
    const db = module.get(PlatformDatabase).executor;
    expect((await db.one('SELECT COUNT(*) AS n FROM platform_credentials', []))?.n).toBe(0);
    await db.execute('UPDATE platform_members SET active=0 WHERE member_id=$1', [
      'local-development-only',
    ]);
    await post().expect(403);
    await api.get('/api/platform/access').set('Cookie', cookie).expect(403);
  } finally {
    await app.close();
    vi.unstubAllEnvs();
  }
});
