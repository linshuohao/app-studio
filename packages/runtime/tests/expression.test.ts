import { expect, it } from 'vitest';
import { DataStore } from '../src/data/store.js';
import { Evaluator } from '../src/expression/evaluator.js';
import { createCoreFunctions } from '@form-engine/pure-functions';
import type { FunctionBinding } from '@form-engine/pure-functions';
import { compile } from '@form-engine/compiler';
import { createRuntime } from '../src/index.js';
import { artifact, prepared } from './fixtures.js';

const data = (path: string) => ({ ref: { source: 'data' as const, path } });
it('短路只求值所需分支；Missing、false、异常分开；ValueSpec 不重解释返回对象', () => {
  const functions = createCoreFunctions({
    id: 'core',
    platform: 'web',
    digest: `sha256:${'0'.repeat(64)}`,
  });
  const evaluator = new Evaluator({}, functions);
  const frame = { view: new DataStore({ age: 20 }).capture(), context: {}, scope: {} };
  expect(evaluator.expression({ op: 'core.if', args: [true, 1, data('/absent')] }, frame)).toBe(1);
  expect(evaluator.expression({ op: 'core.if', args: [true, 1, Infinity] }, frame)).toBe(1);
  expect(evaluator.expression({ op: 'core.and', args: [false, Infinity] }, frame)).toBe(false);
  expect(evaluator.expression({ op: 'core.or', args: [true, Infinity] }, frame)).toBe(true);
  expect(evaluator.expression({ op: 'core.exists', args: [data('/absent')] }, frame)).toBe(false);
  expect(() => evaluator.expression(data('/absent'), frame)).toThrow('missing');
  expect(() => evaluator.expression({ op: 'core.add', args: ['-', 1] }, frame)).toThrow();
  expect(
    evaluator.value({ $literal: { $expr: { ref: { source: 'data', path: '/age' } } } }, frame),
  ).toEqual({ $expr: { ref: { source: 'data', path: '/age' } } });
});
it('具名表达式使用根词法环境；函数返回 Promise / 非 JSON 是执行错误', () => {
  const evaluator = new Evaluator(
    { illegal: { ref: { source: 'data', path: '', scope: 'row' } } },
    {},
  );
  const frame = { view: new DataStore({}).capture(), context: {}, scope: { row: { path: '' } } };
  expect(() => evaluator.expression({ use: 'illegal' }, frame)).toThrow('scope');
  expect(() => evaluator.expression({ use: 'toString' }, frame)).toThrow('unknown');
  const invalid = new Evaluator(
    {},
    {
      'business.invalid': {
        artifact: { id: 'test', platform: 'web', digest: `sha256:${'0'.repeat(64)}` },
        manifest: { id: 'business.invalid', version: '1', parameters: [], returns: true },
        invoke: () => Promise.resolve(1) as never,
      },
    },
  );
  expect(() => invalid.expression({ op: 'business.invalid', args: [] }, frame)).toThrow(
    'must return JSON synchronously',
  );
});

it('普通函数错误即使与 Missing 同文案也保持 error，真正的缺失仍返回 missing', () => {
  const binding: FunctionBinding = {
    artifact,
    manifest: { id: 'app.raise', version: '1', parameters: [], returns: { type: 'boolean' } },
    invoke: () => {
      throw Error('expression: missing value');
    },
  };
  const expression = { op: 'app.raise', args: [] };
  const result = compile({
    definition: {
      protocolVersion: 'test',
      id: 'expression-errors',
      version: 'draft',
      data: { schema: { type: 'object', properties: { age: { type: 'number' } } } },
      views: { main: { material: 'display' } },
      constraints: [
        {
          id: 'check',
          kind: 'internal',
          assert: expression,
          issue: { target: { source: 'data', path: '/age' }, code: 'BAD' },
        },
      ],
    },
    catalog: {
      id: 'fixed',
      materials: { display: { manifest: { id: 'display', version: '1' }, artifact } },
      pureFunctions: { 'app.raise': { manifest: binding.manifest, artifact } },
    },
  });
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  const runtime = createRuntime({
    prepared: result.prepared,
    data: { age: 20 },
    functions: { 'app.raise': binding },
  });
  try {
    expect(runtime.evaluate(expression)).toEqual({
      kind: 'error',
      error: 'Error: expression: missing value',
    });
    expect(runtime.evaluateValue({ $expr: expression }).kind).toBe('error');
    expect(runtime.read({ source: 'data', path: '/absent' })).toEqual({ kind: 'missing' });
    expect(runtime.evaluate(data('/absent'))).toEqual({ kind: 'missing' });
    expect(runtime.evaluateValue({ $expr: data('/absent') })).toEqual({ kind: 'missing' });
  } finally {
    runtime.dispose();
  }
});

it.each([NaN, Infinity, -Infinity])('公开求值入口拒绝非有限数 %s', (value) => {
  const runtime = createRuntime({ prepared: prepared(), data: {} });
  try {
    expect(runtime.evaluate(value).kind).toBe('error');
    expect(runtime.evaluateValue(value).kind).toBe('error');
    expect(runtime.evaluateValue({ $expr: value }).kind).toBe('error');
  } finally {
    runtime.dispose();
  }
});

it('公开求值入口保留合法的空值、布尔值和有限数', () => {
  const runtime = createRuntime({ prepared: prepared(), data: {} });
  try {
    for (const value of [null, false, '', 0, -0, -1, Number.MAX_VALUE]) {
      expect(runtime.evaluate(value)).toEqual({ kind: 'value', value });
      expect(runtime.evaluateValue(value)).toEqual({ kind: 'value', value });
    }
  } finally {
    runtime.dispose();
  }
});
