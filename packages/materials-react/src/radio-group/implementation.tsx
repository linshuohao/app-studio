'use client';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
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

export interface RadioGroupProps {
  options: SelectOption[];
  disabled?: boolean;
}
const contract = defineMaterialContract<
  RadioGroupProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);

function RadioGroup() {
  const adapter = useMaterialAdapter(contract);
  const { options, disabled } = adapter.props;
  const raw = adapter.values.value;
  const value = raw.kind === 'value' ? raw.value : null;
  const selected =
    typeof value === 'string' && options.some((option) => option.id === value) ? value : null;
  const field = useFieldControl(adapter.validation.value, undefined, '单选组');
  const feedback = useActionFeedback();
  return (
    <div className="fe-control">
      <RadioGroupPrimitive<string | null>
        {...field}
        data-slot="radio-group"
        className="fe-choice-group"
        value={selected}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== value) feedback.accept(adapter.set('value', next));
        }}
      >
        {options.map((option, index) => {
          const id = `${field.id}-${index}`;
          return (
            <div className="fe-choice" key={option.id}>
              <Radio.Root
                id={id}
                data-slot="radio-group-item"
                className="fe-choice-control fe-radio"
                value={option.id}
              >
                <Radio.Indicator className="fe-radio-indicator" />
              </Radio.Root>
              <label htmlFor={id}>{option.label}</label>
            </div>
          );
        })}
      </RadioGroupPrimitive>
      {value !== null && selected === null && <p className="fe-feedback">当前选项不可用</p>}
      <ActionFeedback error={feedback.error} />
    </div>
  );
}

export function createRadioGroup(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, RadioGroup);
}
