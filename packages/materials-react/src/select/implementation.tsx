'use client';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { useFieldControl } from '../_internal/field-context.js';
import { ActionFeedback, useActionFeedback } from '../_internal/action-feedback.js';
import { manifest } from './manifest.js';
export interface SelectOption {
  id: string;
  label: string;
}
export interface SelectProps {
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}
const contract = defineMaterialContract<
  SelectProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);
export function Select() {
  const a = useMaterialAdapter(contract),
    p = a.props,
    value = a.values.value;
  const field = useFieldControl(a.validation.value),
    feedback = useActionFeedback();
  const index =
    value.kind === 'value' && typeof value.value === 'string'
      ? p.options.findIndex((o) => o.id === value.value)
      : -1;
  const absent = value.kind === 'missing' || (value.kind === 'value' && value.value === null);
  const selected = index >= 0 ? `option:${index}` : absent ? 'empty' : 'unknown';
  return (
    <div className="fe-control">
      <select
        {...field}
        className="fe-input"
        disabled={p.disabled}
        value={selected}
        aria-invalid={field['aria-invalid'] || (!absent && index < 0)}
        onChange={(e) => {
          if (p.disabled) return;
          const key = e.currentTarget.value;
          if (key === 'empty') {
            if (p.clearable !== false) feedback.accept(a.set('value', null));
            return;
          }
          const option = p.options.find((_, i) => key === `option:${i}`);
          if (option) feedback.accept(a.set('value', option.id));
        }}
      >
        <option value="empty" disabled={p.clearable === false}>
          {p.placeholder ?? '请选择'}
        </option>
        {selected === 'unknown' ? (
          <option value="unknown" disabled>
            选项不可用
          </option>
        ) : null}
        {p.options.map((o, i) => (
          <option key={`${i}:${o.id}`} value={`option:${i}`}>
            {o.label}
          </option>
        ))}
      </select>
      <ActionFeedback error={feedback.error} />
    </div>
  );
}
export function createSelect(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, Select);
}
