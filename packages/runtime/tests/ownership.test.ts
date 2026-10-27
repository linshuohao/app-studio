import type { JsonValue } from '@form-engine/protocol';
import { expect, it, vi } from 'vitest';
import { createRuntime } from '../src/index.js';
import { Evaluator } from '../src/expression/evaluator.js';
import { DataStore } from '../src/data/store.js';
import * as json from '../src/data/json.js';
import * as load from '../src/lifecycle/load.js';
import { data, functions, prepared } from './fixtures.js';

it('ValueSpec 复用已接管的只读值，外部浅冻结对象仍须解除嵌套别名', () => {
  const evaluator = new Evaluator({}, {});
  const frame = { view: new DataStore({}).capture(), context: {}, scope: {} };
  const owned = json.copyJson({ nested: { value: 1 } });
  expect(evaluator.value({ $literal: owned }, frame)).toBe(owned);
  const nested = { value: 2 };
  const result = evaluator.value({ $literal: Object.freeze({ nested }) }, frame);
  nested.value = 9;
  expect(result).toEqual({ nested: { value: 2 } });
  expect(Object.isFrozen((result as { nested: object }).nested)).toBe(true);
});

it('ValueSpec 构造新容器时复用安全子值，仍拒绝稀疏数组与非法 JSON', () => {
  const store = new DataStore({ nested: { value: 1 } });
  const evaluator = new Evaluator({}, {});
  const frame = { view: store.capture(), context: {}, scope: {} };
  const value = evaluator.value({ child: { $expr: { ref: data('/nested') } } }, frame);
  expect(value).toEqual({ child: { value: 1 } });
  expect((value as { child: unknown }).child).toBe(store.read('/nested').value);
  expect(() => evaluator.value(Array(2), frame)).toThrow();
  expect(() => evaluator.value({ $literal: { bad: undefined } } as never, frame)).toThrow();
});

it('内部规则复用已检查命令，外部命令继续校验，失败后后续独立动作仍执行', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'mirror',
          watch: [data('/age')],
          then: [
            { op: 'set', target: data('/name'), value: { $expr: { ref: data('/absent/child') } } },
            { op: 'set', target: data('/total'), value: { $expr: { ref: data('/age') } } },
          ],
        },
      ],
    }),
    functions,
    data: { age: 0, total: 0 },
  });
  await runtime.flush();
  const check = vi.spyOn(load, 'validCommand');
  const capture = vi.spyOn(json, 'captureJson');
  try {
    expect(runtime.dispatch({ op: 'set', target: data('/age'), value: 2 }).ok).toBe(true);
    await runtime.flush();
    expect(runtime.snapshot()).toEqual({ age: 2, total: 2 });
    expect(check).toHaveBeenCalledTimes(1);
    expect(
      capture.mock.calls.filter(([value]) => (value as { op?: string })?.op === 'set'),
    ).toHaveLength(1);
    const error = runtime.diagnostics().find((entry) => entry.kind === 'command.error');
    expect(error?.evidence?.execution.ruleId).toBe('mirror');
    expect(error?.evidence?.input.snapshot).toEqual({ age: 2, total: 0 });
    expect(
      runtime.dispatch({ op: 'set', target: data('/age'), value: 3, invalid: true } as never).ok,
    ).toBe(false);
    expect(runtime.read(data('/age')).value).toBe(2);
  } finally {
    check.mockRestore();
    capture.mockRestore();
    runtime.dispose();
  }
});

it('关闭辅助 Trace 不序列化成功命令，失败时仍交付完整动作与输入', async () => {
  const reports: unknown[] = [];
  const runtime = createRuntime({
    prepared: prepared(),
    data: { name: 'A' },
    traceCapacity: 0,
    onDiagnostic: (report) => reports.push(report),
  });
  await runtime.flush();
  const stringify = vi.spyOn(JSON, 'stringify');
  try {
    expect(runtime.dispatch({ op: 'set', target: data('/name'), value: 'B' }).ok).toBe(true);
    expect(
      stringify.mock.calls.filter(([value]) => (value as { op?: string })?.op === 'set'),
    ).toHaveLength(0);
    runtime.dispatch({ op: 'set', target: data('/missing/child'), value: 1 });
    await runtime.flush();
    await Promise.resolve();
    expect(reports).toContainEqual(
      expect.objectContaining({
        kind: 'runtime',
        entry: expect.objectContaining({
          kind: 'command.error',
          evidence: expect.objectContaining({
            input: expect.objectContaining({ snapshot: { name: 'B' } }),
            action: { op: 'set', target: data('/missing/child'), value: 1 },
          }),
        }),
      }),
    );
  } finally {
    stringify.mockRestore();
    runtime.dispose();
  }
});

it('对象与数组替换仍创建新身份，旧快照和观察通知不因接管优化改变', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { rows: [{ name: 'A' }] } });
  const before = runtime.snapshot();
  const scope = runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' })[0]!;
  let changes = 0;
  runtime.observe([data('/rows')], () => changes++);
  const rows = runtime.read(data('/rows')).value! as JsonValue;
  runtime.dispatch({ op: 'set', target: data('/rows'), value: { $literal: rows } });
  expect(changes).toBe(1);
  expect(runtime.isScopeAlive(scope)).toBe(false);
  expect(runtime.read(data('/rows')).value).not.toBe(rows);
  expect(before).toEqual({ rows: [{ name: 'A' }] });
  await runtime.flush();
  runtime.dispose();
});

it('同进程编译产物复用完整结构验证，外部克隆重新接管，能力不匹配仍拒绝', () => {
  const compiled = prepared({
    reactions: [
      {
        id: 'sum',
        watch: [data('/age')],
        then: [
          {
            op: 'set',
            target: data('/total'),
            value: { $expr: { op: 'core.add', args: [{ ref: data('/age') }, 1] } },
          },
        ],
      },
    ],
  });
  expect(load.loadCompiledForm(compiled, functions)).toBe(compiled);
  const imported = structuredClone(compiled);
  const owned = load.loadCompiledForm(imported, functions);
  expect(owned).not.toBe(imported);
  expect(Object.isFrozen(owned)).toBe(true);
  expect(load.loadCompiledForm(owned, functions)).toBe(owned);
  expect(() => load.loadCompiledForm(compiled, {})).toThrow('incompatible function');
  Object.assign(imported.definition.views, { only: { broken: true } });
  expect(() => load.loadCompiledForm(imported, functions)).toThrow('invalid Prepared');
  expect(() =>
    load.loadCompiledForm(Object.freeze(structuredClone(imported)), functions),
  ).toThrow();
});

it('外部视图结构错误保持原有失败结果，不泄露内部接收器异常分类', () => {
  const runtime = createRuntime({ prepared: prepared(), data: {} });
  expect(runtime.checkView({} as never)).toEqual({
    compatible: false,
    error: 'Error: view: invalid Prepared format',
  });
  runtime.dispose();
});
