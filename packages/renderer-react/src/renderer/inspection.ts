import {
  DEVTOOLS_ENABLED,
  emitObservedEvent,
  registerObservedProducer,
  observedChildren,
  observedProducerRef,
  createMetadataReader,
  sharedPreparedCatalog,
  observedPreparedId,
} from '@form-engine/runtime/devtools';
import type { FormRuntime } from '@form-engine/runtime';
import type { RendererContextValue } from './renderer-context.js';
const histories = new WeakMap<
  object,
  {
    rows: Array<{ record: string; code: string; phase: string; nodeId: string | null }>;
    dropped: number;
  }
>();
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
  let history = histories.get(contextValue.inspectionOwner);
  if (!history) {
    history = { rows: [], dropped: 0 };
    histories.set(contextValue.inspectionOwner, history);
  }
  const stopMetadata = registerObservedProducer(
    contextValue.inspectionOwner,
    (ref, budget) =>
      createMetadataReader(ref, budget.maxBytes, () => ({
        rows: [
          {
            record: 'renderer-view',
            preparedId: contextValue.compiledForm
              ? observedPreparedId(contextValue.compiledForm)
              : null,
            ...(observedProducerRef(runtime)
              ? { runtime: { ...observedProducerRef(runtime)! } }
              : {}),
            formId: identity.formId,
            profile: identity.profile,
            lifecycle: 'active',
            diagnosticsDropped: history!.dropped,
            children: observedChildren(contextValue.inspectionOwner, budget.maxRows).map(
              (child) => ({ ...child }),
            ),
            coverage: { values: 'not-collected', execution: 'not-collected' },
          },
          ...(contextValue.compiledForm
            ? sharedPreparedCatalog(contextValue.compiledForm, budget.definition)
                .nodes.filter((node) =>
                  ['view', 'material', 'scope', 'template-use'].includes(node.kind),
                )
                .map((node) => ({ record: 'definition', ...node }))
            : []),
          ...(contextValue.compiledForm
            ? sharedPreparedCatalog(contextValue.compiledForm, budget.definition)
                .relations.filter((edge) => edge.subject.startsWith('view:'))
                .map((edge) => ({ record: 'relation', ...edge }))
            : []),
          ...history!.rows,
        ],
      })),
    runtime,
    { kind: 'view', label: identity.profile, capabilities: ['metadata', 'events'] },
  );
  const unsubscribe = contextValue.diagnostics.subscribe((diagnostic) => {
    const row = {
      record: 'diagnostic',
      code: diagnostic.code,
      phase: diagnostic.phase,
      nodeId: diagnostic.nodeId ?? null,
    };
    if (history!.rows.length === 100) {
      history!.rows.shift();
      history!.dropped++;
    }
    history!.rows.push(row);
    emitObservedEvent(contextValue.inspectionOwner, 'diagnostic', () => row);
  });
  return () => {
    unsubscribe();
    stopMetadata();
  };
}
