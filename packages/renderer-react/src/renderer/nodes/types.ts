import type { ComponentType } from 'react';
import type { PreparedViewNode } from '@form-engine/protocol/prepared';
import type { ScopeBinding } from '@form-engine/runtime';
import type { RenderEnvironment } from '../create-render-environment.js';

/** 一个节点出现位置的输入；不是表单值，也不拥有 Runtime 生命周期。 */
export interface NodeProps {
  /** 当前视图共用的静态装配结果与外部能力引用。 */
  readonly environment: RenderEnvironment;
  /** Compiler 已准备的三类节点之一。 */
  readonly node: PreparedViewNode;
  /** 当前节点可以读取的词法别名，只包含显式传入的定位句柄。 */
  readonly scope: ScopeBinding;
  /** 结构出现位置，用于区分同一模板的多次使用与错误定位。 */
  readonly occurrence: string;
  /** 所属挂载实例的资格链；模板不捕获调用方别名，但仍属于外层数组成员。 */
  readonly owners: readonly ScopeBinding[];
}

/** 递归能力由入口传入，子节点组件无需反向 import ViewNode，避免循环依赖。 */
export interface RecursiveNodeProps extends NodeProps {
  readonly renderNode: ComponentType<NodeProps>;
}
