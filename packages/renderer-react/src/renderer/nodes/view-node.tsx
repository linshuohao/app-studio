import { MaterialNodeView } from './material-node.js';
import { ScopeNodeView } from './scope-node.js';
import { TemplateNodeView } from './template-node.js';
import type { NodeProps } from './types.js';

/**
 * Prepared 节点的纯分发入口：输入一个节点出现位置，返回相应的物料 / Scope / 模板元素。
 * 不持有状态或订阅；把自身作为固定递归能力传给子组件，不让它们反向导入入口。
 */
export function ViewNode(props: NodeProps) {
  if ('scope' in props.node)
    return <ScopeNodeView {...props} node={props.node} renderNode={ViewNode} />;
  if ('$use' in props.node)
    return <TemplateNodeView {...props} node={props.node} renderNode={ViewNode} />;
  return <MaterialNodeView {...props} node={props.node} renderNode={ViewNode} />;
}
