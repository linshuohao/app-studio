import { useMemo } from 'react';
import type { RecursiveNodeProps } from './types.js';

/**
 * 给当前展开实例追加存活资格，保持词法 Scope 与挂载所属关系分离。
 * useMemo 返回只读 owners 链；输入稳定时复用其引用，避免成员移动误触发下游改绑。
 * 本组件不注册观察；返回沿用该资格链的子节点，真正资格检查由 Projection 完成。
 */
export function OwnedNode({
  environment,
  node,
  scope,
  occurrence,
  owners,
  renderNode: RenderNode,
}: RecursiveNodeProps) {
  const lineage = useMemo(() => Object.freeze([...owners, scope]), [owners, scope]);
  return (
    <RenderNode
      environment={environment}
      node={node}
      scope={scope}
      occurrence={occurrence}
      owners={lineage}
    />
  );
}
