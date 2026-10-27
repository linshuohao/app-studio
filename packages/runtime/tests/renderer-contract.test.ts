import type { PreparedForm } from '@form-engine/protocol/prepared';
import { expect, it } from 'vitest';
import { createRuntime } from '../src/index.js';
import { data, prepared } from './fixtures.js';

it('视图兼容检查比较执行契约，Scope 资格在删除及销毁后立即失效', () => {
  const form = prepared();
  const runtime = createRuntime({ prepared: form, data: { rows: [{ name: 'A' }] } });
  const scope = runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' })[0]!;
  expect(runtime.isScopeAlive(scope)).toBe(true);
  expect(runtime.checkView(form)).toEqual({ compatible: true });
  const other = structuredClone(form) as PreparedForm;
  other.definition.data.schema = { type: 'array' };
  expect(runtime.checkView(other).compatible).toBe(false);
  runtime.dispatch({ op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } }, scope);
  expect(runtime.isScopeAlive(scope)).toBe(false);
  runtime.dispose();
  expect(runtime.isScopeAlive({})).toBe(false);
  expect(runtime.checkView(form).compatible).toBe(false);
});

it('视图事件使用本次 Event、Data、Context 和 Scope；Host 异步不延长 Flush', async () => {
  const seen: unknown[] = [];
  const runtime = createRuntime({
    prepared: prepared(),
    data: { name: 'A' },
    context: { region: 'CN' },
    host: {
      events: {
        save: (input) => {
          seen.push(input);
        },
      },
    },
  });
  expect(
    runtime.interact(
      {
        type: 'host.emit',
        event: 'save',
        payload: { $expr: { ref: { source: 'event', path: '/name' } } },
      },
      {},
      { name: 'clicked' },
    ).ok,
  ).toBe(true);
  expect(seen).toMatchObject([
    { event: 'save', payload: 'clicked', snapshot: { name: 'A' }, context: { region: 'CN' } },
  ]);
  expect(
    runtime.interact(
      {
        type: 'form.command',
        command: {
          op: 'set',
          target: data('/name'),
          value: { $expr: { ref: { source: 'event', path: '' } } },
        },
      },
      {},
      'B',
    ).ok,
  ).toBe(true);
  expect(runtime.snapshot()).toEqual({ name: 'B' });
  expect((await runtime.flush()).status).toBe('settled');
  runtime.dispose();
});

it('Scope 失效观察在成员删除及实例销毁时各交付一次，释放后不交付', () => {
  const runtime = createRuntime({ prepared: prepared(), data: { rows: [{ name: 'A' }] } });
  const scope = runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' })[0]!;
  const calls: string[] = [];
  runtime.observeScope(scope, () => calls.push('member'));
  runtime.observeScope({}, () => calls.push('runtime'));
  const released = runtime.observeScope({}, () => calls.push('released'));
  released.dispose();
  runtime.dispatch({ op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } }, scope);
  expect(calls).toEqual(['member']);
  runtime.dispose();
  runtime.dispose();
  expect(calls).toEqual(['member', 'runtime']);
  expect(runtime.observeScope({}, () => calls.push('late')).alive).toBe(false);
});

it('执行契约比较不将具名表达式的负零变化压平', () => {
  const form = prepared({ expressions: { zero: -0 } });
  const runtime = createRuntime({ prepared: form, data: {} });
  const candidate = structuredClone(form) as PreparedForm;
  candidate.definition.expressions!.zero = 0;
  expect(runtime.checkView(candidate).compatible).toBe(false);
  runtime.dispose();
});

it('Profile 可改变请求专用资源，但不能改变实际业务 Schema 依赖', async () => {
  const { compile } = await import('@form-engine/compiler');
  const { artifact } = await import('./fixtures.js');
  const make = (profile: string) => {
    const compiled = compile({
      definition: {
        protocolVersion: 'test',
        id: 'view-resources',
        version: '1',
        data: { schema: { $ref: 'https://example.test/business' } },
        views: {
          main: { material: 'input' },
          other: {
            material: 'query',
            requests: { search: { type: 'host.request', request: 'lookup' } },
          },
        },
      },
      catalog: {
        id: 'same-catalog',
        pureFunctions: {},
        materials: {
          input: { manifest: { id: 'input', version: '1' }, artifact },
          query: {
            manifest: {
              id: 'query',
              version: '1',
              requests: {
                search: {
                  payloadSchema: { $id: 'https://example.test/search/request', $ref: '../text' },
                  resultSchema: true,
                },
              },
            },
            artifact,
          },
        },
      },
      target: { profile },
      schemaResources: {
        'https://example.test/business': {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        'https://example.test/text': { type: 'string' },
      },
    });
    if (!compiled.success) throw Error(JSON.stringify(compiled.diagnostics));
    return compiled.prepared;
  };
  const main = make('main'),
    other = make('other');
  const runtime = createRuntime({ prepared: main, data: { name: 'A' } });
  expect(Object.keys(main.resources.schemas)).not.toContain('https://example.test/text');
  expect(Object.keys(other.resources.schemas)).toContain('https://example.test/text');
  expect(runtime.checkView(other)).toEqual({ compatible: true });
  const changed = structuredClone(other) as PreparedForm;
  changed.resources.schemas['https://example.test/business'] = { type: 'array' };
  expect(runtime.checkView(changed).compatible).toBe(false);
  runtime.dispose();
});
