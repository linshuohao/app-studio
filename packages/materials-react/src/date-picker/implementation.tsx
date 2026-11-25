'use client';
import { useRef, useState } from 'react';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { ActionFeedback, useActionFeedback } from '../_internal/action-feedback.js';
import { useFieldControl } from '../_internal/field-context.js';
import {
  CalendarTrigger,
  ClearDateButton,
  DateTextInput,
} from '../_internal/shadcn/date-controls.js';
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
  if (!isDate(text)) return '请输入有效公历日期（YYYY-MM-DD）';
  if (min && text < min) return `日期不得早于 ${min}`;
  if (max && text > max) return `日期不得晚于 ${max}`;
  return undefined;
}

function DatePicker() {
  const adapter = useMaterialAdapter(contract);
  const props = adapter.props;
  const field = useFieldControl(adapter.validation.value, undefined, '日期');
  const feedback = useActionFeedback();
  const input = useRef<HTMLInputElement>(null);
  const current = adapter.values.value.kind === 'value' ? adapter.values.value.value : missing;
  const [observed, setObserved] = useState(current);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  if (!Object.is(observed, current)) {
    setObserved(current);
    setDraft(null);
    setError(undefined);
  }
  const locked = props.readOnly || props.disabled;
  const value = draft ?? draftText(current);
  const problem =
    error ??
    (draft === null && current !== missing && current !== null
      ? typeof current === 'string' && current !== ''
        ? dateError(current, props)
        : '当前值不是有效的日期'
      : undefined);
  function commit(text: string) {
    if (locked) return;
    const invalid = dateError(text, props);
    setError(invalid);
    if (invalid) return;
    const next = text === '' ? null : text;
    if (Object.is(current, next) || feedback.accept(adapter.set('value', next))) setDraft(null);
  }
  const errorId = `${field.id}-date-error`;
  return (
    <div className="fe-control">
      <div className="fe-date-input">
        <DateTextInput
          {...field}
          ref={input}
          aria-invalid={field['aria-invalid'] || Boolean(problem)}
          aria-describedby={
            [field['aria-describedby'], problem && errorId].filter(Boolean).join(' ') || undefined
          }
          value={value}
          placeholder={props.placeholder ?? 'YYYY-MM-DD'}
          disabled={props.disabled}
          readOnly={props.readOnly}
          onChange={(event) => {
            if (locked) return;
            setDraft(event.currentTarget.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing || locked) return;
            event.preventDefault();
            if (draft !== null) commit(draft);
          }}
          onBlur={() => {
            if (draft !== null) commit(draft);
          }}
        />
        {!props.readOnly && (
          <>
            <CalendarTrigger
              label="打开日期日历"
              value={value}
              min={props.min}
              max={props.max}
              disabled={props.disabled}
              onSelect={commit}
            />
            {(value !== '' || (current !== missing && current !== null)) && (
              <ClearDateButton
                disabled={props.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  commit('');
                  input.current?.focus();
                }}
              />
            )}
          </>
        )}
      </div>
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
