import { afterEach, expect, it } from 'vitest';
import { registerDevtoolsSource, getDevtoolsHook } from '@form-engine/runtime/devtools';
import { connectDevtools } from '../src/client/client.js';
import { pageRequest } from '../src/bridge/page-request.js';
afterEach(() => {
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
});
it('连接只取目录，检查才读副本；事件缓存有界，断开清空并拒绝旧查询', async () => {
  let reads = 0;
  const source = registerDevtoolsSource(
    {},
    { kind: 'runtime', label: 'form', formId: 'form' },
    () => {
      reads++;
      return { data: { name: 'A' } };
    },
  );
  const client = connectDevtools(getDevtoolsHook())!;
  expect(client.list()).toHaveLength(1);
  expect(reads).toBe(0);
  expect(client.inspect(source.id)?.value).toEqual({ data: { name: 'A' } });
  for (let i = 0; i < 150; i++) {
    source.publish('change', { i });
    await Promise.resolve();
  }
  expect(client.events()).toHaveLength(100);
  expect(client.dropped()).toBe(50);
  client.disconnect();
  source.publish('late');
  await Promise.resolve();
  expect(client.list()).toEqual([]);
  expect(client.events()).toEqual([]);
  expect(client.inspect(source.id)).toBeUndefined();
  source.dispose();
});
it('扩展页面桥接自包含、晚连接 / 重连、协议检查和断开均不暴露写能力', async () => {
  const source = registerDevtoolsSource(
    {},
    { kind: 'view', label: 'main', formId: 'form' },
    () => ({ tree: 'current' }),
  );
  // 模拟 inspectedWindow.eval：不能依赖打包模块的外部词法变量。
  const evaluate = new Function(
    'command',
    `return (${pageRequest.toString()})(command);`,
  ) as typeof pageRequest;
  expect(evaluate({ op: 'poll', session: 'test' })).toMatchObject({
    status: 'connected',
    sources: [{ kind: 'view' }],
  });
  expect(evaluate({ op: 'inspect', session: 'test', id: source.id }).snapshot?.value).toEqual({
    tree: 'current',
    diagnostics: [],
    diagnosticsTruncated: false,
  });
  source.publish('diagnostic', { message: 'example' });
  await Promise.resolve();
  expect(evaluate({ op: 'poll', session: 'test' }).events).toHaveLength(1);
  evaluate({ op: 'disconnect', session: 'test' });
  expect(evaluate({ op: 'poll', session: 'test' }).events).toEqual([]);
  evaluate({ op: 'disconnect', session: 'test' });
  source.dispose();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
  expect(evaluate({ op: 'poll', session: 'missing' }).status).toBe('waiting');
  Object.defineProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__', {
    value: { version: 99 },
    configurable: true,
  });
  expect(evaluate({ op: 'poll', session: 'missing' }).status).toBe('incompatible');
});
