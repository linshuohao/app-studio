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
import { parseNumber } from '../_internal/number.js';
import { ActionFeedback } from '../_internal/action-feedback.js';
import { manifest } from './manifest.js';
export interface NumberInputProps extends TextControlProps {
  inputMode?: 'numeric' | 'decimal';
}
const contract = defineMaterialContract<
  NumberInputProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);
export function NumberInput() {
  const a = useMaterialAdapter(contract);
  const p = a.props;
  const field = useFieldControl(a.validation.value);
  const { error, ...editor } = useTextEditor(
    a.values.value,
    (v) => a.set('value', v),
    parseNumber,
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
        inputMode={p.inputMode ?? 'decimal'}
      />
      {raw.kind === 'value' &&
      raw.value !== null &&
      !['string', 'number'].includes(typeof raw.value) ? (
        <p className="fe-feedback">当前值不是可编辑的数字</p>
      ) : null}
      <ActionFeedback error={error} />
    </div>
  );
}
export function createNumberInput(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, NumberInput);
}
