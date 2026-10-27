import { useContext, useEffect, useMemo, useRef } from 'react';
import {
  createRenderEnvironment,
  validateRenderInput,
  type RenderEnvironment,
} from './create-render-environment.js';
import { ViewNode } from './nodes/view-node.js';
import { PresentationContext } from './presentation-context.js';
import { RendererContext } from './renderer-context.js';
import type { FormRendererProps } from './types.js';
const ROOT_SCOPE = Object.freeze({});
const ROOT_OWNERS = Object.freeze([ROOT_SCOPE]);
/** 错误边界内建立呈现环境并返回节点树；根上下文负责配置接管，业务错误选项独立更新。 */
export function RendererContent(props: FormRendererProps) {
  const { runtime, materials, requests, renderMaterialError } = props;
  const contextValue = useContext(RendererContext);
  if (!contextValue) throw Error('RendererContent requires renderer context');
  const { compiledForm, captureError } = contextValue;
  const renderInput = useMemo(
    () => validateRenderInput(runtime, { compiledForm, captureError }),
    [runtime, compiledForm, captureError],
  );
  const environment = useMemo(
    () => createRenderEnvironment(renderInput, { materials, requests }, contextValue),
    [renderInput, materials, requests, contextValue],
  );
  // Strict Mode 模拟清理保留交付身份；新装配结果或真实重挂有自己的首次交付。
  const reportedEnvironment = useRef<RenderEnvironment | null>(null);
  useEffect(() => {
    if (reportedEnvironment.current === environment) return;
    reportedEnvironment.current = environment;
    environment.assemblyDiagnostics.forEach(environment.report);
  }, [environment]);
  const root = environment.compiledForm.definition.views[environment.compiledForm.build.profile]!;
  return (
    <PresentationContext.Provider value={renderMaterialError}>
      <ViewNode
        environment={environment}
        node={root}
        scope={ROOT_SCOPE}
        owners={ROOT_OWNERS}
        occurrence="root"
      />
    </PresentationContext.Provider>
  );
}
