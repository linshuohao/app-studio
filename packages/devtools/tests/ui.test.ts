import { afterEach, expect, it, vi } from 'vitest';
import { mountDevtools } from '../src/ui/mount.js';
import { pageRequest } from '../src/bridge/page-request.js';
import { registerDevtoolsSource } from '@form-engine/runtime/devtools';
import type { PageReply } from '../src/bridge/types.js';
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
});
it('独立面板只读检查、异常文本不作为 HTML，断开清空缓存并停止轮询', async () => {
  vi.useFakeTimers();
  const source = registerDevtoolsSource(
    {},
    { kind: 'runtime', label: '安全 <img>', formId: 'form' },
    () => ({ name: '<img src=x onerror=alert(1)>' }),
  );
  const root = document.createElement('div');
  document.body.append(root);
  const request = vi.fn(async (command: Parameters<typeof pageRequest>[0]): Promise<PageReply> =>
    pageRequest(command),
  );
  const destroy = mountDevtools(root, { request });
  await vi.advanceTimersByTimeAsync(0);
  expect(root.textContent).toContain('已连接');
  expect(root.textContent).not.toContain('onerror');
  root.querySelector('nav button')!.dispatchEvent(new MouseEvent('click'));
  await vi.advanceTimersByTimeAsync(0);
  expect(root.textContent).toContain('onerror');
  expect(root.querySelector('img')).toBeNull();
  root.querySelector('header button')!.dispatchEvent(new MouseEvent('click'));
  await vi.advanceTimersByTimeAsync(0);
  const count = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(request).toHaveBeenCalledTimes(count);
  expect(root.textContent).not.toContain('onerror');
  destroy();
  source.dispose();
});
it('失联面板租约自动释放，不再积累事件或保留订阅', async () => {
  vi.useFakeTimers();
  const source = registerDevtoolsSource(
    {},
    { kind: 'runtime', label: 'form', formId: 'form' },
    () => ({}),
  );
  pageRequest({ op: 'poll', session: 'lease' });
  await vi.advanceTimersByTimeAsync(15_001);
  source.publish('after-timeout');
  await Promise.resolve();
  expect(pageRequest({ op: 'poll', session: 'lease' }).events).toEqual([]);
  pageRequest({ op: 'disconnect', session: 'lease' });
  source.dispose();
});

it('轮询与点击交错时，每次取走的轨迹都进入缓存，不静默丢失', async () => {
  vi.useFakeTimers();
  const root = document.createElement('div');
  document.body.append(root);
  const base: PageReply = {
    status: 'connected',
    sources: [{ id: 'one', kind: 'runtime', label: 'form', formId: 'form' }],
    events: [],
    dropped: 0,
  };
  let calls = 0,
    release!: (reply: PageReply) => void;
  const destroy = mountDevtools(root, {
    request: async (command) => {
      if (command.op === 'poll' && ++calls > 1)
        return new Promise((resolve) => {
          release = resolve;
        });
      return {
        ...base,
        ...(command.op === 'inspect'
          ? { selectedId: 'one', snapshot: { value: { data: 'current' }, truncated: false } }
          : {}),
      };
    },
  });
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(1_000);
  root.querySelector('nav button')!.dispatchEvent(new MouseEvent('click'));
  release({ ...base, events: [{ sequence: 1, sourceId: 'one', kind: 'request', dropped: 0 }] });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(root.textContent).toContain('最近 1 条 · 丢弃 0 条');
  expect(root.textContent).toContain('current');
  destroy();
});

it('旧轮询在断开重连后完成，不得再产生第二条定时轮询链', async () => {
  vi.useFakeTimers();
  const root = document.createElement('div');
  document.body.append(root);
  const reply: PageReply = { status: 'connected', sources: [], events: [], dropped: 0 };
  let release!: (reply: PageReply) => void,
    polls = 0;
  const request = vi.fn(async (command: Parameters<typeof pageRequest>[0]) => {
    if (command.op === 'poll' && ++polls === 1)
      return new Promise<PageReply>((resolve) => {
        release = resolve;
      });
    return reply;
  });
  const destroy = mountDevtools(root, { request });
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector('header button')!.dispatchEvent(new MouseEvent('click'));
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector('header button')!.dispatchEvent(new MouseEvent('click'));
  await vi.advanceTimersByTimeAsync(0);
  release(reply);
  await vi.advanceTimersByTimeAsync(0);
  expect(polls).toBe(2);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(polls).toBe(3);
  destroy();
});
