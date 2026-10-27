import { useContext } from 'react';
import { PresentationContext } from '../presentation-context.js';
import type { PreparedMaterialNode } from '@form-engine/protocol/prepared';
import { MaterialBoundary } from '../../diagnostics/material-boundary.js';
import { MaterialFallback } from '../../diagnostics/material-fallback.js';
import type { RendererDiagnostic } from '../../diagnostics/types.js';
import { MaterialMount } from './material-mount.js';
import type { RecursiveNodeProps } from './types.js';

/**
 * MaterialNode 的呈现边界：已知配置错误直接降级，正常节点进入物料挂载。
 * 输入来自静态装配环境；自身不保存业务状态，错误恢复由 MaterialBoundary 负责。
 * 返回单物料边界或局部降级元素，使相邻可用节点继续运行。
 */
export function MaterialNodeView({
  environment,
  node,
  scope,
  occurrence,
  owners,
  renderNode,
}: Omit<RecursiveNodeProps, 'node'> & { node: PreparedMaterialNode }) {
  const renderMaterialError = useContext(PresentationContext);
  const diagnostic: RendererDiagnostic = {
    code: 'MATERIAL_UNAVAILABLE',
    phase: 'assembly',
    formId: environment.compiledForm.definition.id,
    profile: environment.compiledForm.build.profile,
    nodeId: node.id,
    material: node.material,
    scope,
    occurrence,
    message:
      environment.errors.get(`node:${node.id}`) ??
      environment.errors.get(`material:${node.material}`) ??
      'Material render failed',
  };
  const error =
    environment.errors.has(`node:${node.id}`) ||
    environment.errors.has(`material:${node.material}`);
  if (error)
    return (
      <MaterialFallback
        diagnostic={diagnostic}
        report={environment.report}
        fallback={renderMaterialError}
      />
    );
  return (
    <MaterialBoundary
      resetKey={environment}
      diagnostic={{ ...diagnostic, phase: 'render' }}
      report={environment.report}
      fallback={renderMaterialError}
    >
      <MaterialMount
        environment={environment}
        node={node}
        scope={scope}
        owners={owners}
        occurrence={occurrence}
        renderNode={renderNode}
      />
    </MaterialBoundary>
  );
}
