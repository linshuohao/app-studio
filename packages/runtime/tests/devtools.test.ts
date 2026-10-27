import { afterEach, expect, it, vi } from 'vitest';
import { createRuntime } from '../src/index.js';
import { getDevtoolsHook, registerDevtoolsSource } from '../src/devtools/index.js';
import { data, prepared } from './fixtures.js';
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
});
function browser() {
  vi.stubGlobal('window', globalThis);
}
it('开发浏览器自动发现，晚连接读当前状态，无工具时也正常执行', async () => {
  browser();
  const runtime = createRuntime({ prepared: prepared(), data: { name: 'A' }, freeze: false });
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'B' });
  await runtime.flush();
  const hook = getDevtoolsHook()!;
  const source = hook.list().find((s) => s.kind === 'runtime')!;
  expect(source).toBeDefined();
  const result = hook.read(source.id)!;
  expect(result.value).toMatchObject({ data: { name: 'B' } });
  expect(Reflect.set((result.value as { data: object }).data, 'name', 'tamper')).toBe(false);
  expect(runtime.snapshot()).toEqual({ name: 'B' });
  runtime.dispose();
  expect(hook.list()).toEqual([]);
});
it('订阅异步隔离、释放后无交付，数据 / 校验无新增观察者副作用', async () => {
  browser();
  const runtime = createRuntime({ prepared: prepared(), data: { name: 'A' } });
  await runtime.flush();
  const hook = getDevtoolsHook()!;
  const events: unknown[] = [];
  const off = hook.subscribe((event) => {
    events.push(event);
    throw Error('tool failed');
  });
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'C' });
  expect(events).toHaveLength(0);
  await runtime.flush();
  await Promise.resolve();
  expect(events.length).toBeGreaterThan(0);
  expect(runtime.snapshot()).toEqual({ name: 'C' });
  const count = events.length;
  off();
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'D' });
  await runtime.flush();
  expect(events).toHaveLength(count);
  runtime.dispose();
});
it('工具查询与事件容量有限且明确截断，不保留业务对象引用', async () => {
  browser();
  const owner = {};
  const source = registerDevtoolsSource(
    owner,
    { kind: 'view', label: 'large', formId: 'form' },
    () => ({ huge: 'x'.repeat(200_000) }),
  );
  const hook = getDevtoolsHook()!;
  expect(hook.read(source.id)?.truncated).toBe(true);
  const events: Array<{ dropped: number }> = [];
  const off = hook.subscribe((event) => events.push(event));
  for (let i = 0; i < 500; i++) source.publish('test', { i });
  await Promise.resolve();
  expect(events.length).toBeLessThanOrEqual(200);
  expect(events.some((e) => e.dropped > 0)).toBe(true);
  off();
  source.dispose();
});
it('非浏览器和不兼容标记不能启用采集，失败不能阻止 Runtime 创建', () => {
  expect(getDevtoolsHook()).toBeUndefined();
  const runtime = createRuntime({ prepared: prepared(), data: {} });
  expect(getDevtoolsHook()).toBeUndefined();
  runtime.dispose();
  browser();
  vi.stubGlobal('__FORM_ENGINE_DEVTOOLS__', { version: 99 });
  const another = createRuntime({ prepared: prepared(), data: {} });
  expect(getDevtoolsHook()).toBeUndefined();
  another.dispose();
});

it('同页多份引擎共享发现目录，父实例销毁移除所有工具子项', async () => {
  browser();
  const owner = {},
    child = {};
  const root = registerDevtoolsSource(
    owner,
    { kind: 'runtime', label: 'root', formId: 'form' },
    () => ({}),
  );
  vi.resetModules();
  const second = await import('../src/devtools/index.js');
  const view = second.registerDevtoolsSource(
    child,
    { kind: 'view', label: 'view', formId: 'form' },
    () => ({}),
    owner,
  );
  expect(
    getDevtoolsHook()!
      .list()
      .map((source) => source.id),
  ).toEqual([root.id, view.id]);
  root.dispose();
  expect(getDevtoolsHook()!.list()).toEqual([]);
  view.dispose();
});

it('过长对象键造成展示缺失时也明确标记截断', () => {
  browser();
  const source = registerDevtoolsSource(
    {},
    { kind: 'view', label: 'keys', formId: 'form' },
    () => ({ ['a'.repeat(1100)]: 1, ['a'.repeat(1100) + 'b']: 2 }),
  );
  expect(getDevtoolsHook()!.read(source.id)!.truncated).toBe(true);
  source.dispose();
});

it('对象键也计入副本字符预算，不在值截断后继续复制大量键', () => {
  browser();
  const value = Object.fromEntries(
    Array.from({ length: 256 }, (_, i) => [`${i}:${'k'.repeat(1100)}`, 'value']),
  );
  const source = registerDevtoolsSource(
    {},
    { kind: 'view', label: 'budget', formId: 'form' },
    () => value,
  );
  const snapshot = getDevtoolsHook()!.read(source.id)!;
  expect(snapshot.truncated).toBe(true);
  expect(JSON.stringify(snapshot).length).toBeLessThan(110_000);
  source.dispose();
});

it('开发视图目录保存独立诊断尾部，晚连接可查询且明确截断', () => {
  browser();
  const source = registerDevtoolsSource(
    {},
    { kind: 'view', label: 'view', formId: 'form' },
    () => ({ tree: 'compiled' }),
  );
  for (let index = 0; index < 101; index++)
    source.publish('diagnostic', { code: `ERROR_${index}` });
  const snapshot = getDevtoolsHook()!.read(source.id)!;
  expect(snapshot.value).toMatchObject({ tree: 'compiled', diagnosticsTruncated: true });
  const diagnostics = (snapshot.value as { diagnostics: Array<{ code: string }> }).diagnostics;
  expect(diagnostics).toHaveLength(100);
  expect(diagnostics[0]!.code).toBe('ERROR_1');
  source.dispose();
  expect(getDevtoolsHook()!.read(source.id)).toBeUndefined();
});
