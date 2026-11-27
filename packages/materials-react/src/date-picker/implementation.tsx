'use client';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { ActionFeedback, useActionFeedback } from '../_internal/action-feedback.js';
import { useFieldControl } from '../_internal/field-context.js';
import { CalendarTrigger } from '../_internal/shadcn/date-controls.js';
import type { TextControlProps } from '../_internal/types.js';
import { draftText, isDate } from '../_internal/date.js';
import { manifest } from './manifest.js';

export interface DatePickerProps extends TextControlProps {
  min?: string;
  max?: string;
}

const contract = defineMaterialContract<
  DatePickerProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);
const missing = Symbol('missing');

function dateError(text: string, { min, max }: DatePickerProps) {
  if (text === '') return undefined;
  if (!isDate(text)) return '请选择有效公历日期';
  if (min && text < min) return `日期不得早于 ${min}`;
  if (max && text > max) return `日期不得晚于 ${max}`;
  return undefined;
}

function DatePicker() {
  const adapter = useMaterialAdapter(contract);
  const props = adapter.props;
  const field = useFieldControl(adapter.validation.value, undefined, '日期');
  const feedback = useActionFeedback();
  const current = adapter.values.value.kind === 'value' ? adapter.values.value.value : missing;
  const value = draftText(current);
  const problem =
    current === missing || current === null
      ? undefined
      : typeof current === 'string' && current !== ''
        ? dateError(current, props)
        : '当前值不是有效的日期';
  function commit(next: string | null) {
    if (props.readOnly || props.disabled || Object.is(current, next)) return;
    feedback.accept(adapter.set('value', next));
  }
  const errorId = `${field.id}-date-error`;
  const control = {
    ...field,
    'aria-invalid': field['aria-invalid'] || Boolean(problem),
    'aria-describedby':
      [field['aria-describedby'], problem && errorId].filter(Boolean).join(' ') || undefined,
  };
  return (
    <div className="fe-control">
      {props.readOnly ? (
        <input
          {...control}
          className="fe-input"
          value={value}
          placeholder={props.placeholder ?? '选择日期'}
          disabled={props.disabled}
          readOnly
        />
      ) : (
        <CalendarTrigger
          label="日期日历"
          triggerProps={control}
          value={value}
          placeholder={props.placeholder}
          min={props.min}
          max={props.max}
          disabled={props.disabled}
          onSelect={commit}
          onClear={current !== missing && current !== null ? () => commit(null) : undefined}
        />
      )}
      {problem && (
        <p id={errorId} className="fe-feedback">
          {problem}
        </p>
      )}
      <ActionFeedback error={feedback.error} />
    </div>
  );
}

export function createDatePicker(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, DatePicker);
}
