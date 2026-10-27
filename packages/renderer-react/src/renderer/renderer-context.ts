import type { PreparedForm } from '@form-engine/protocol/prepared';
import { createContext } from 'react';
import type { DiagnosticEmitter } from '../diagnostics/emitter.js';
/** 每个 FormRenderer 独立的根上下文；通过 Provider 注入，不是页面级单例或网络连接。 */
export interface RendererContextValue {
  /** 已接管的配置，呈现和观测共用；不包含 Working Data。 */
  readonly compiledForm?: PreparedForm;
  /** 配置不是纯 JSON 时保存失败原因，交给错误边界内的执行体抛出。 */
  readonly captureError?: Error;
  /** 开发目录的身份令牌，与 Scope 的 owners 存活链无关。 */
  readonly inspectionOwner: object;
  readonly diagnostics: DiagnosticEmitter;
}
export const RendererContext = createContext<RendererContextValue | null>(null);
