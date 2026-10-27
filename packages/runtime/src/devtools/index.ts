import { DevtoolsRegistry } from './registry.js';
import type { DevtoolsHook, DevtoolsSource, DevtoolsSourceInfo } from './types.js';
export type * from './types.js';
/** 默认 dist 构建将此常量替换为 false；工作区 development 源码默认开启。 */
declare const __FORM_ENGINE_DEVTOOLS_ENABLED__: boolean;
export const DEVTOOLS_ENABLED =
  typeof __FORM_ENGINE_DEVTOOLS_ENABLED__ === 'undefined' || __FORM_ENGINE_DEVTOOLS_ENABLED__;
const KEY = '__FORM_ENGINE_DEVTOOLS__';
// 同页多份引擎共享 Symbol 标识的观测注册入口；不包含 Runtime / 指令执行能力。
const inactive: DevtoolsSource = Object.freeze({ id: '', publish() {}, dispose() {} });
/** 只读发现；标记不存在或协议版本不兼容时返回 undefined，不负责开启工具。 */
export function getDevtoolsHook(): DevtoolsHook | undefined {
  try {
    const hook = (globalThis as Record<string, unknown>)[KEY] as DevtoolsHook | undefined;
    return hook?.version === 1 &&
      typeof hook.list === 'function' &&
      typeof hook.read === 'function' &&
      typeof hook.subscribe === 'function'
      ? hook
      : undefined;
  } catch {
    return undefined;
  }
}
/** 引擎生命周期接缝：开发浏览器自动注册，生产 / 服务端 / 异常环境均安全空操作。 */
export function registerDevtoolsSource(
  owner: object,
  info: Omit<DevtoolsSourceInfo, 'id' | 'parentId'>,
  read: () => unknown,
  parent?: object,
): DevtoolsSource {
  if (!DEVTOOLS_ENABLED || !('window' in globalThis)) return inactive;
  try {
    let hook = getDevtoolsHook();
    if (!hook) {
      if (Object.hasOwn(globalThis, KEY)) return inactive;
      const registry = new DevtoolsRegistry();
      hook = registry.hook;
      Object.defineProperty(globalThis, KEY, { value: hook, configurable: true });
    }
    const register = (hook as unknown as Record<symbol, unknown>)[
      Symbol.for('form-engine.devtools.register.1')
    ];
    return typeof register === 'function' ? register(owner, info, read, parent) : inactive;
  } catch {
    return inactive;
  }
}
