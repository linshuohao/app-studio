'use client';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import type { TextControlProps } from '../_internal/types.js';
import { useFieldControl } from '../_internal/field-context.js';
import { useTextEditor } from '../_internal/use-text-editor.js';
import { ActionFeedback } from '../_internal/action-feedback.js';
import { manifest } from './manifest.js';

export interface TextareaProps extends TextControlProps {
  rows?: number;
  maxLength?: number;
}
const contract = defineMaterialContract<
  TextareaProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);
const text = (value: string) => value;

function Textarea() {
  const adapter = useMaterialAdapter(contract);
  const p = adapter.props;
  const field = useFieldControl(adapter.validation.value, undefined, '多行文本');
  const raw = adapter.values.value;
  const { error, ...editor } = useTextEditor(
    raw,
    (value) => adapter.set('value', value),
    text,
    p.disabled || p.readOnly,
  );
  return (
    <div className="fe-control">
      {/* shadcn/ui Textarea uses the native textarea with a scoped style. */}
      <textarea
        {...field}
        {...editor}
        data-slot="textarea"
        className="fe-input fe-textarea"
        rows={p.rows ?? 3}
        maxLength={p.maxLength}
        placeholder={p.placeholder}
        disabled={p.disabled}
        readOnly={p.readOnly}
      />
      {raw.kind === 'value' && raw.value !== null && typeof raw.value !== 'string' && (
        <p className="fe-feedback">当前值不是有效的文本</p>
      )}
      <ActionFeedback error={error} />
    </div>
  );
}

export function createTextarea(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, Textarea);
}
