import type { ReactNode } from 'react';
import type { RendererDiagnostic } from './types.js';

/** 仅在错误呈现组件之间共享的内部输入，不通过包入口导出。 */
export interface BoundaryProps {
  /** 引用变化允许清除已有呈现错误；不负责清空 Runtime。 */
  readonly resetKey?: unknown;
  readonly children?: ReactNode;
  /** 结构化定位信息；默认业务提示不向终端用户展示这些内部名称。 */
  readonly diagnostic: RendererDiagnostic;
  readonly report?: (diagnostic: RendererDiagnostic) => void;
  readonly fallback?: (diagnostic: RendererDiagnostic) => ReactNode;
}
