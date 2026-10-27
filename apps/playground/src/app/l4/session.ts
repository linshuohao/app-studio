import { compile } from '@form-engine/compiler';
import { createRuntime, type ReadonlyJson } from '@form-engine/runtime';
import type { DataReference } from '@form-engine/protocol/definition';
import { artifact, fixtureDefinitions } from './materials';
const ref = (path: string, scope?: string): DataReference => ({
  source: 'data',
  path,
  ...(scope ? { scope } : {}),
});
/** 可控 Host 验证夹具，真实业务装配留给下一阶段。 */
export function createFixtureSession(
  snapshot: (value: ReadonlyJson) => void,
  saved: (value: string) => void,
) {
  const compiled = compile({
    definition: {
      protocolVersion: 'fixture',
      id: 'l4-browser',
      version: '1',
      data: {
        schema: {
          type: 'object',
          required: ['name', 'age'],
          properties: {
            name: { type: 'string', minLength: 1 },
            age: { type: 'number' },
            date: { type: 'string' },
            city: { type: 'string' },
            rows: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' } } },
            },
          },
        },
      },
      constraints: [
        {
          id: 'name-available',
          kind: 'external',
          validator: 'name.check',
          watch: [ref('/name')],
          target: ref('/name'),
          requires: [{ kind: 'field', target: ref('/name'), phase: 'sync' }],
        },
      ],
      views: {
        main: {
          material: 'fixture.group',
          slots: {
            default: [
              {
                material: 'fixture.input',
                props: { label: '姓名' },
                bindings: { value: ref('/name') },
              },
              {
                material: 'fixture.input',
                props: { label: '年龄', numeric: true },
                bindings: { value: ref('/age') },
              },
              { material: 'fixture.date', bindings: { value: ref('/date') } },
              {
                material: 'fixture.search',
                bindings: { value: ref('/city') },
                requests: { search: { type: 'host.request', request: 'city.lookup' } },
              },
              {
                scope: { from: ref('/rows'), as: 'insured', mode: 'each' },
                node: { material: 'fixture.row', bindings: { value: ref('/name', 'insured') } },
              },
              { material: 'fixture.broken' },
              {
                material: 'fixture.save',
                on: { click: { type: 'host.emit', event: 'application.save' } },
              },
            ],
          },
        },
      },
    },
    catalog: {
      id: 'fixture-catalog',
      materials: Object.fromEntries(
        fixtureDefinitions.map((material) => [
          material.contract.manifest.id,
          { manifest: material.contract.manifest, artifact },
        ]),
      ),
      pureFunctions: {},
    },
  });
  if (!compiled.success) throw Error(JSON.stringify(compiled.diagnostics));
  let alive = true;
  const runtime = createRuntime({
    prepared: compiled.prepared,
    data: {
      name: 'Alice',
      age: 20,
      date: '2026-10-26',
      city: '',
      rows: [{ name: 'A' }, { name: 'B' }],
    },
    host: {
      validators: {
        'name.check': (input) => ({
          result: new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                input.read(ref('/name')).kind === 'value' &&
                  input.read(ref('/name')).value === 'blocked'
                  ? [{ code: 'NAME_UNAVAILABLE', message: '姓名不可用' }]
                  : [],
              );
            }, 5);
          }),
        }),
      },
      events: {
        'application.save': async () => {
          await runtime.flush();
          const result = await runtime.validate();
          if (alive)
            saved(result.status === 'valid' ? JSON.stringify(result.snapshot) : result.status);
        },
      },
    },
  });
  const observation = runtime.observe([ref('')], () => snapshot(runtime.snapshot()));
  snapshot(runtime.snapshot());
  return {
    prepared: compiled.prepared,
    runtime,
    requests: { 'city.lookup': (query: string) => Promise.resolve([`${query}市`]) },
    dispose: () => {
      alive = false;
      observation.dispose();
      runtime.dispose();
    },
  };
}
