import type { ReactNode } from 'react';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import type { FormRuntime } from '@form-engine/runtime';
import type { MaterialRegistry } from '../material/types.js';
import type { RendererDiagnostic } from '../diagnostics/types.js';
import type { HostRequestRegistry } from '../requests/types.js';
/** Host 提供确定输入；Renderer 负责接入与呈现，业务实例仍归 Host 持有。 */
export interface FormRendererProps {
  /** 当前选定 Profile 的制品，必须与 runtime 的业务执行契约兼容。 */
  readonly prepared: ReadonlyPreparedForm;
  /** 已创建的实例；Renderer 卸载不会自动 dispose 它。 */
  readonly runtime: FormRuntime;
  /** 与 Prepared 能力锁对应的 React 物料实现集合。 */
  readonly materials: MaterialRegistry;
  /** 物料有返回值的请求；Runtime 的 Host 事件 / 外部校验另在实例创建时注册。 */
  readonly requests?: HostRequestRegistry;
  /** 接收结构化装配 / 呈现 / 请求诊断；回调异常被隔离，不作为业务执行许可。 */
  readonly onDiagnostic?: (diagnostic: RendererDiagnostic) => void;
  /** 返回错误位置的 React 降级元素；不返回业务执行结果，也不重置 Runtime。 */
  readonly renderMaterialError?: (diagnostic: RendererDiagnostic) => ReactNode;
}
