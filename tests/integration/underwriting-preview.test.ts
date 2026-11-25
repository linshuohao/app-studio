import { expect, it } from 'vitest';
import { createCoreFunctions, createDateInclusiveDays } from '@form-engine/pure-functions';
import { createRuntime } from '@form-engine/runtime';
import { projectUnderwritingSubmission } from '../../apps/studio/src/app/host/underwriting-projection.js';
import {
  compileWebConfig,
  webCatalog,
  webTarget,
} from '../../services/api/src/platform/web-check.js';

it('projects normalized identity and email without writing to the validated snapshot', () => {
  const applicant = Object.freeze({
    name: ' 张三 ',
    surname: ' zhang ',
    givenName: ' san ',
    birthDate: '1987-02-01',
    passportNumber: ' e00000001 ',
    passportExpiry: '2030-02-01',
    email: ' a@example.cn ',
    phone: '13800000000',
  });
  const self = Object.freeze({ relationship: 'self', personId: 'self', ageBand: 'adult' });
  const family = Object.freeze({
    name: '李四',
    surname: ' li ',
    givenName: ' si ',
    birthDate: '1988-02-01',
    passportNumber: ' e00000002 ',
    passportExpiry: '2030-02-01',
    relationship: 'spouse',
    personId: 'family',
  });
  const snapshot = { applicant, insureds: Object.freeze([self, family]), confirmed: true };
  const projected = projectUnderwritingSubmission(snapshot);
  expect(projected?.applicant).toMatchObject({
    email: 'a@example.cn',
    surname: 'ZHANG',
    passportNumber: 'E00000001',
  });
  expect(projected?.insureds).toEqual([
    {
      ...self,
      name: '张三',
      surname: 'ZHANG',
      givenName: 'SAN',
      birthDate: '1987-02-01',
      passportNumber: 'E00000001',
      passportExpiry: '2030-02-01',
    },
    { ...family, surname: 'LI', givenName: 'SI', passportNumber: 'E00000002' },
  ]);
  expect(snapshot.applicant.email).toBe(' a@example.cn ');
  expect(snapshot.insureds[0]).toEqual(self);
  expect(projectUnderwritingSubmission({ ...snapshot, insureds: [] })).toBeUndefined();
});

it('initializes the declared self row and revalidates the same person after a family row is removed', async () => {
  const ref = (path: string, scope?: string) => ({
    source: 'data' as const,
    path,
    ...(scope && { scope }),
  });
  const artifact = {
    id: 'underwriting-preview',
    platform: 'web',
    digest: `sha256:${'8'.repeat(64)}` as const,
  };
  const roster = { from: ref('/insureds'), as: 'row', mode: 'each' as const };
  const checked = compileWebConfig(
    JSON.stringify({
      protocolVersion: '1.0',
      id: 'underwriting-preview',
      version: '1.0',
      data: {
        schema: {
          type: 'object',
          properties: {
            endDate: { type: 'string', default: '2027-05-01' },
            insureds: {
              type: 'array',
              default: [{ relationship: 'self' }],
              items: {
                type: 'object',
                properties: { relationship: { type: 'string' }, expiry: { type: 'string' } },
              },
            },
          },
        },
      },
      views: { default: { material: 'section', props: { title: '投保预览' } } },
      constraints: [
        {
          id: 'passport-expiry',
          kind: 'internal',
          scope: roster,
          when: { op: 'core.exists', args: [{ ref: ref('/expiry', 'row') }] },
          assert: {
            op: 'core.ne',
            args: [
              {
                op: 'date.inclusiveDays',
                args: [{ ref: ref('/endDate') }, { ref: ref('/expiry', 'row') }],
              },
              null,
            ],
          },
          issue: { target: ref('/expiry', 'row'), code: 'EXPIRED' },
        },
      ],
    }),
    { catalog: webCatalog(artifact.id, artifact, artifact), target: webTarget(undefined) },
  );
  expect(checked.success, JSON.stringify(checked.diagnostics)).toBe(true);
  if (!checked.success) return;
  const runtime = createRuntime({
    prepared: checked.prepared,
    data: {},
    functions: {
      ...createCoreFunctions(artifact),
      'date.inclusiveDays': createDateInclusiveDays(artifact),
    },
  });
  try {
    expect(runtime.snapshot()).toEqual({
      endDate: '2027-05-01',
      insureds: [{ relationship: 'self' }],
    });
    const insert = (index: number, relationship: string, expiry: string) =>
      runtime.interact({
        type: 'form.command',
        command: {
          op: 'array.insert',
          target: ref('/insureds'),
          position: { kind: 'index', index },
          value: { $literal: { relationship, expiry } },
        },
      });
    expect(insert(1, 'spouse', '2027-06-01').ok).toBe(true);
    expect(insert(2, 'child', '2027-05-01').ok).toBe(true);
    expect((await runtime.validate()).status).toBe('valid');
    runtime.dispatch({ op: 'set', target: ref('/endDate'), value: '2027-05-02' });
    await runtime.flush();
    const [expired] = runtime.getValidation(ref('/insureds/2/expiry')).issues;
    expect(expired).toMatchObject({ code: 'EXPIRED', field: { member: expect.any(String) } });
    const spouse = runtime.bind(roster)[1];
    expect(
      runtime.interact(
        {
          type: 'form.command',
          command: { op: 'array.remove', target: ref('/insureds'), item: { $scope: 'row' } },
        },
        spouse,
      ).ok,
    ).toBe(true);
    expect(runtime.read(ref('/insureds/1/relationship'))).toEqual({
      kind: 'value',
      value: 'child',
    });
    await runtime.flush();
    expect(runtime.getValidation(ref('/insureds/1/expiry')).issues).toContainEqual(expired);
    runtime.dispatch({ op: 'set', target: ref('/endDate'), value: '2027-05-01' });
    expect((await runtime.validate()).status).toBe('valid');
  } finally {
    runtime.dispose();
  }
});
