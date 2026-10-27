import type { PreparedForm } from '@form-engine/protocol/prepared';
import { isCapturedPreparedForm } from '@form-engine/protocol/internal/prepared';
import { useLayoutEffect, useMemo } from 'react';
import { copyJson } from '../material/json.js';
import { RendererContent } from './renderer-content.js';
import { RendererContext } from './renderer-context.js';
import { registerRendererInspection } from './inspection.js';
import type { FormRendererProps } from './types.js';
import { MaterialBoundary } from '../diagnostics/material-boundary.js';
import { DiagnosticEmitter } from '../diagnostics/emitter.js';
/**
 * Host 呈现入口：接管配置，注入每个表单自己的根上下文，返回受错误边界保护的子树。
 * 配置接管只依赖 prepared 引用；注册变化重建接入，但不重复复制同一配置。
 * Host 持有 Runtime 和业务状态；这里仅管理诊断与呈现接入生命周期。
 */
export function FormRenderer(props: FormRendererProps) {
  const { prepared: compiledFormInput, runtime, materials, requests, onDiagnostic } = props;
  const capturedForm = useMemo(() => {
    try {
      return {
        compiledForm: isCapturedPreparedForm(compiledFormInput)
          ? compiledFormInput
          : (copyJson(compiledFormInput) as unknown as PreparedForm),
      };
    } catch (error) {
      return { captureError: error instanceof Error ? error : Error(String(error)) };
    }
  }, [compiledFormInput]);
  const contextValue = useMemo(
    () => ({
      ...capturedForm,
      inspectionOwner: { runtime, materials, requests },
      diagnostics: new DiagnosticEmitter(),
    }),
    [capturedForm, runtime, materials, requests],
  );
  // 这里只读取已接管 JSON，缺少身份也使用可报告的占位；正式形状检查在错误边界内执行。
  const identity = useMemo(
    () => ({
      formId:
        typeof capturedForm.compiledForm?.definition?.id === 'string'
          ? capturedForm.compiledForm.definition.id
          : '<invalid-form>',
      profile:
        typeof capturedForm.compiledForm?.build?.profile === 'string'
          ? capturedForm.compiledForm.build.profile
          : '<invalid-profile>',
    }),
    [capturedForm],
  );
  // 先登记开发消费者，再登记 Host；初次错误统一交付，两者都可收到提交前发生的错误。
  useLayoutEffect(
    () => registerRendererInspection(contextValue, runtime, identity),
    [contextValue, runtime, identity],
  );
  useLayoutEffect(() => {
    const unsubscribe = contextValue.diagnostics.subscribe((diagnostic) =>
      onDiagnostic?.(diagnostic),
    );
    contextValue.diagnostics.flushPending();
    return unsubscribe;
  }, [contextValue, onDiagnostic]);
  return (
    <RendererContext.Provider value={contextValue}>
      <MaterialBoundary
        resetKey={contextValue}
        key={JSON.stringify([identity.formId, identity.profile])}
        diagnostic={{
          code: 'RENDERER_UNAVAILABLE',
          phase: 'assembly',
          formId: identity.formId,
          profile: identity.profile,
          message: 'Renderer assembly failed',
        }}
        report={contextValue.diagnostics.report}
        fallback={props.renderMaterialError}
      >
        <RendererContent {...props} />
      </MaterialBoundary>
    </RendererContext.Provider>
  );
}
