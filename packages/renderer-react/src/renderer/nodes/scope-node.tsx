import { useMemo, useSyncExternalStore } from 'react';
import type { PreparedViewNode } from '@form-engine/protocol/prepared';
import { scopes, scopeKey } from '../../composition/scope-projection.js';
import { OwnedNode } from './owned-node.js';
import type { RecursiveNodeProps } from './types.js';

/**
 * ScopeNode 的集合呈现：让 Runtime 展开 one / each，再为有效绑定呈现子树。
 * useMemo 返回外部观察源，不保存数组业务值；useSyncExternalStore 返回稳定 ScopeBinding[]。
 * each 成员移动后使用稳定 key 复用实例；删除 / 整替换移除旧组件，订阅由 Hook 释放。
 */
export function ScopeNodeView({
  environment,
  node,
  scope,
  occurrence,
  owners,
  renderNode,
}: Omit<RecursiveNodeProps, 'node'> & { node: Extract<PreparedViewNode, { scope: unknown }> }) {
  const projection = useMemo(
    () => scopes(environment.runtime, node.scope, scope),
    [environment, node, scope],
  );
  const bindings = useSyncExternalStore(
    projection.subscribe,
    projection.getSnapshot,
    projection.getSnapshot,
  );
  return bindings.map((binding) => (
    <OwnedNode
      key={scopeKey(binding)}
      environment={environment}
      node={node.node}
      scope={binding}
      owners={owners}
      renderNode={renderNode}
      occurrence={`${occurrence}/scope`}
    />
  ));
}
