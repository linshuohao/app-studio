import { DEVTOOLS_ENABLED, registerDevtoolsSource } from '@form-engine/runtime/devtools';
import type { FormRuntime } from '@form-engine/runtime';
import type { RendererContextValue } from './renderer-context.js';
export interface RendererIdentity {
  readonly formId: string;
  readonly profile: string;
}
/**
 * 开发观测接缝，不加载工具 UI、不保存历史、不建立业务观察。
 * 历史窗口与截断统计归开发目录；返回注销函数。默认产物 / 服务端直接空操作。
 */
export function registerRendererInspection(
  contextValue: RendererContextValue,
  runtime: FormRuntime,
  identity: RendererIdentity,
): () => void {
  if (!DEVTOOLS_ENABLED || !('window' in globalThis)) return () => undefined;
  const source = registerDevtoolsSource(
    contextValue.inspectionOwner,
    { kind: 'view', formId: identity.formId, profile: identity.profile, label: identity.profile },
    () => ({
      tree: contextValue.compiledForm?.definition?.views,
      templates: contextValue.compiledForm?.definition?.viewTemplates,
    }),
    runtime,
  );
  const unsubscribe = contextValue.diagnostics.subscribe((diagnostic) =>
    source.publish('diagnostic', diagnostic),
  );
  return () => {
    unsubscribe();
    source.dispose();
  };
}
