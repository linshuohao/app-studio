'use client';
import { Button } from '@base-ui/react/button';
import { Checkbox } from '@base-ui/react/checkbox';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { ActionFeedback, useActionFeedback } from '../_internal/action-feedback.js';
import { useFieldControl } from '../_internal/field-context.js';
import type { SelectOption } from '../select/implementation.js';
import { manifest } from './manifest.js';

export interface CheckboxGroupProps {
  options: SelectOption[];
  disabled?: boolean;
}
const contract = defineMaterialContract<
  CheckboxGroupProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);

function CheckboxGroup() {
  const adapter = useMaterialAdapter(contract);
  const { options, disabled } = adapter.props;
  const raw = adapter.values.value;
  const value = raw.kind === 'value' ? raw.value : undefined;
  const selected = Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  const unavailable =
    value !== undefined &&
    (!Array.isArray(value) ||
      selected.length !== value.length ||
      selected.some((id) => !options.some((option) => option.id === id)));
  const field = useFieldControl(adapter.validation.value, undefined, '多选组');
  const feedback = useActionFeedback();
  return (
    <div className="fe-control">
      <div {...field} className="fe-choice-group" role="group">
        {options.map((option, index) => {
          const id = `${field.id}-${index}`;
          return (
            <div className="fe-choice" key={option.id}>
              <Checkbox.Root
                id={id}
                data-slot="checkbox"
                className="fe-choice-control fe-checkbox-item"
                checked={selected.includes(option.id)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...selected, option.id]
                    : selected.filter((value) => value !== option.id);
                  feedback.accept(adapter.set('value', [...new Set(next)]));
                }}
              >
                <Checkbox.Indicator className="fe-checkbox-indicator">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="m3 8 3 3 7-7" />
                  </svg>
                </Checkbox.Indicator>
              </Checkbox.Root>
              <label htmlFor={id}>{option.label}</label>
            </div>
          );
        })}
      </div>
      {unavailable && (
        <div>
          <p className="fe-feedback">当前值含不可用选项</p>
          <Button
            className="fe-button"
            disabled={disabled}
            onClick={() => feedback.accept(adapter.set('value', []))}
          >
            清空多选
          </Button>
        </div>
      )}
      <ActionFeedback error={feedback.error} />
    </div>
  );
}

export function createCheckboxGroup(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, CheckboxGroup);
}
