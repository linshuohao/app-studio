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
export interface TextInputProps extends TextControlProps {
  maxLength?: number;
  inputMode?: 'text' | 'tel';
}
const contract = defineMaterialContract<
  TextInputProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);
const text = (value: string) => value;
export function TextInput() {
  const a = useMaterialAdapter(contract);
  const p = a.props;
  const field = useFieldControl(a.validation.value);
  const { error, ...editor } = useTextEditor(
    a.values.value,
    (v) => a.set('value', v),
    text,
    p.disabled || p.readOnly,
  );
  const raw = a.values.value;
  return (
    <div className="fe-control">
      <input
        {...field}
        {...editor}
        className="fe-input"
        type="text"
        placeholder={p.placeholder}
        disabled={p.disabled}
        readOnly={p.readOnly}
        maxLength={p.maxLength}
        inputMode={p.inputMode ?? 'text'}
      />
      {raw.kind === 'value' && raw.value !== null && typeof raw.value !== 'string' ? (
        <p className="fe-feedback">当前值不是有效的文本</p>
      ) : null}
      <ActionFeedback error={error} />
    </div>
  );
}
export function createTextInput(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, TextInput);
}
