import type { JsonSchema } from '../common.js';
import type { FormDefinition, Reaction } from '../definition/form.js';
import type { PreparedReactionWatch, PreparedScopeDeclaration } from './reference.js';
import type { CapabilityLock, HostRequirements } from './requirements.js';
import type { PreparedConstraint } from './validation.js';
import type { PreparedViewNode, PreparedViewTemplate } from './view.js';

/** 显式 watch 保留，when / then 不参与自动触发依赖补全。 */
export interface PreparedReaction extends Omit<Reaction, 'watch' | 'runOnActivate' | 'scope'> {
  scope?: PreparedScopeDeclaration;
  watch: PreparedReactionWatch[];
  /** 缺省 false 在输出中明确保存；只控制新实例首次激活。 */
  runOnActivate: boolean;
}
/** 保留原 Definition 的领域结构；不携带实例业务值、Issues 或任务状态。 */
export interface PreparedDefinition extends Omit<
  FormDefinition,
  'constraints' | 'reactions' | 'views' | 'viewTemplates'
> {
  constraints?: PreparedConstraint[];
  reactions?: PreparedReaction[];
  /**
   * 当前选定的唯一视图；单视图自动选中，名称不要求为 default。
   * @minProperties 1
   * @maxProperties 1
   */
  views: Record<string, PreparedViewNode>;
  viewTemplates?: Record<string, PreparedViewTemplate>;
}
/** 构建追踪信息；不重复 Definition 身份，也不替代各能力的实际目标平台。 */
export interface PreparedBuild {
  compilerVersion: string;
  catalogSnapshotId: string;
  /** 最终选择的视图名，与 definition.views 的唯一键一致性由 Compiler 检查。 */
  profile: string;
  /** 无显式全局目标时可省略；能力 artifact 的实际平台身份仍须保留和核对。 */
  platform?: string;
}
/** 闭合的静态 Schema 资源，不包含 Ajv 生成函数，也不在运行时联网补引用。 */
export interface PreparedResources {
  /** 必要外部业务资源；根 Schema 仍在 definition.data.schema。 */
  schemas: Record<string, JsonSchema>;
  /** 请求契约独立资源表，不加入业务字段校验或 Validator Pending。 */
  requestSchemas: Record<string, JsonSchema>;
}
/** 独立调试附件的来源位置；不放进执行结构充当调度或订阅关系。 */
export interface DefinitionSourceLocation {
  documentId: string;
  pointer: string;
}
export type PreparedSourceMap = Record<string, DefinitionSourceLocation[]>;

/** 确定、可序列化且可跨实例复用的运行输入；Runtime 不回退执行原始 Definition。 */
export interface PreparedForm {
  /** Runtime 精确匹配支持的格式；独立于 L1 和 Compiler 实现版本。 */
  preparedFormatVersion: string;
  build: PreparedBuild;
  definition: PreparedDefinition;
  resources: PreparedResources;
  capabilityLock: CapabilityLock;
  hostRequirements: HostRequirements;
}

/** 编译成功产物的深度只读视图；JSON 构造 / 克隆仍可使用 PreparedForm。 */
type ReadonlyTree<T> = T extends readonly (infer Item)[]
  ? readonly ReadonlyTree<Item>[]
  : T extends object
    ? { readonly [K in keyof T]: ReadonlyTree<T[K]> }
    : T;
export type ReadonlyPreparedForm = ReadonlyTree<PreparedForm>;
