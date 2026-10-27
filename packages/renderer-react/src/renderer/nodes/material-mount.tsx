import { useLayoutEffect, useMemo } from 'react';
import type { PreparedMaterialNode } from '@form-engine/protocol/prepared';
import { Projection } from '../../adapter/projection.js';
import { MaterialContext } from '../../adapter/material-context.js';
import type { RecursiveNodeProps } from './types.js';

/**
 * 将一个已通过装配检查的物料连接到 React。
 * 输入：确定组件、Prepared 节点、词法 Scope、所属实例资格及递归呈现函数。
 * 返回：提供 MaterialContext 的物料元素；Slots 先构造元素，容器真正呈现它们才会挂载。
 * 状态：useMemo 保留本次关联的 Projection；渲染阶段仅构造对象，提交后才 start 订阅。
 * 释放：卸载 / 改绑时 stop，撤销旧操作与请求资格，不 dispose Host 持有的 Runtime。
 */
export function MaterialMount({
  environment,
  node,
  scope,
  occurrence,
  owners,
  renderNode: RenderNode,
}: Omit<RecursiveNodeProps, 'node'> & { node: PreparedMaterialNode }) {
  const material = environment.materials[node.material]!;
  const projection = useMemo(
    () =>
      new Projection(
        environment,
        node,
        scope,
        material,
        occurrence,
        owners,
        Object.freeze(
          Object.fromEntries(
            Object.entries(node.slots ?? {}).map(([slot, nodes]) => [
              slot,
              nodes.map((child, i) => (
                <RenderNode
                  key={i}
                  environment={environment}
                  node={child}
                  scope={scope}
                  owners={owners}
                  occurrence={`${occurrence}/slots/${slot}/${i}`}
                />
              )),
            ]),
          ),
        ),
      ),
    [environment, node, scope, material, occurrence, owners, RenderNode],
  );
  useLayoutEffect(() => {
    projection.start();
    return projection.stop;
  }, [projection]);
  const Component = material.component;
  return (
    <MaterialContext.Provider value={projection}>
      <Component />
    </MaterialContext.Provider>
  );
}
