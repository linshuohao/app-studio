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
export interface CheckboxProps {
  label: string;
  disabled?: boolean;
}
const contract = defineMaterialContract<
  CheckboxProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);
export function Checkbox() {
  const a = useMaterialAdapter(contract),
    v = a.values.value;
  const invalid = v.kind === 'value' && typeof v.value !== 'boolean';
  const field = useFieldControl(a.validation.value, a.props.label);
  const feedback = useActionFeedback();
  return (
    <div className="fe-control">
      <label className="fe-checkbox" htmlFor={field.id}>
        <input
          {...field}
          type="checkbox"
          checked={v.kind === 'value' && v.value === true}
          aria-invalid={field['aria-invalid'] || invalid}
          disabled={a.props.disabled}
          onChange={(e) => {
            if (!a.props.disabled) feedback.accept(a.set('value', e.currentTarget.checked));
          }}
        />
        {a.props.label}
      </label>
      {invalid ? <p className="fe-feedback">当前值不是有效的勾选值</p> : null}
      <ActionFeedback error={feedback.error} />
    </div>
  );
}
export function createCheckbox(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, Checkbox);
}
