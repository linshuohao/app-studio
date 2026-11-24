'use client';

import { useState } from 'react';
import type { JsonSchema } from '@form-engine/protocol/capability';
import type { Expression } from '@form-engine/protocol/definition';
import type { JsonNode } from '../components/json/model';
import { ExpressionEditorDialog } from './expression-editor';
import { verificationContext, type ExpressionVerificationContext } from './expression-verification';
import { useFunctionCatalog } from './function-catalog';
import { ancestorBinders } from './layout-bindings';
import type { LayoutBindingField } from './layout-material-value';
import { validateReactionExpression } from './reaction-expression-model';
import { child, type Model } from './semantic-model';

export function layoutExpressionContext(
  formPath: string,
  m: Model,
  node: JsonNode,
  result?: ExpressionVerificationContext['result'],
) {
  const binders = ancestorBinders(m, node);
  const context = verificationContext(
    formPath,
    m,
    binders.map((b) => m.raw(b)),
    result,
  );
  return {
    ...context,
    ambiguity:
      context.ambiguity ||
      [...m.ambiguous].some((path) =>
        binders.some((binder) => path === binder.path || path.startsWith(binder.path + '/')),
      ),
  };
}

export function LayoutExpressionDialog({
  title,
  initial,
  expected,
  fields,
  verification,
  close,
  apply,
  action = '应用表达式',
}: {
  title: string;
  initial: string;
  expected: JsonSchema;
  fields: LayoutBindingField[];
  verification: ExpressionVerificationContext;
  close: () => void;
  apply: (raw: string) => void | Promise<void>;
  action?: string;
}) {
  const [raw, setRaw] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { manifests, functionDocs, error: catalogError, reload } = useFunctionCatalog();
  const named = verification.expressions && (JSON.parse(verification.expressions) as unknown);
  const choices =
    !verification.ambiguity && named && typeof named === 'object' && !Array.isArray(named)
      ? (named as Record<string, Expression>)
      : undefined;
  const context = {
    fields: fields.map((f) => ({ ...f, depth: f.ref.path.split('/').length - 1 })),
    manifests,
    functionDocs,
    named: choices,
    expected,
  };
  return (
    <ExpressionEditorDialog
      title={title}
      onClose={close}
      busy={busy}
      error={error}
      action={action}
      notice={
        catalogError && (
          <p role="alert">
            {catalogError}{' '}
            <button type="button" onClick={reload}>
              重试目录
            </button>
          </p>
        )
      }
      onApply={async () => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          validateReactionExpression(raw, context);
          await apply(raw);
          close();
        } catch (fault) {
          setError(fault instanceof Error ? fault.message : '无法应用表达式。');
          setBusy(false);
        }
      }}
      label={title}
      {...context}
      verification={verification}
      raw={raw}
      onChange={(value) => {
        setRaw(value);
        setError('');
      }}
      allowValidation={false}
    />
  );
}

export function visibleExpression(m: Model, node: JsonNode) {
  const visible = child(child(node, 'props'), 'visible');
  if (visible?.kind === 'boolean') return m.raw(visible);
  const expr = child(visible, '$expr');
  if (expr && visible?.children?.length === 1) return m.raw(expr);
  return undefined;
}
