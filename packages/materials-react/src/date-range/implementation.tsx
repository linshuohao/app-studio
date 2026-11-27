'use client';
import { useId, useRef, useState } from 'react';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { CalendarTrigger, DateTextInput } from '../_internal/shadcn/date-controls.js';
import { Modal } from '../_internal/modal.js';
import { ValidationMessages } from '../_internal/validation-messages.js';
import { draftText, displayDate, isDate } from '../_internal/date.js';
import { manifest } from './manifest.js';
export interface DateRangeProps {
  label: string;
  startLabel?: string;
  endLabel?: string;
  disabled?: boolean;
  startMin?: string;
  startMax?: string;
}
const contract = defineMaterialContract<
  DateRangeProps,
  'start' | 'end',
  Record<string, never>,
  Record<string, never>
>(manifest);
const missing = Symbol('missing'),
  refresh = Symbol('refresh');
interface Draft {
  start: string;
  end: string;
  baseStart: unknown;
  baseEnd: unknown;
  refreshMessage?: string;
}
function validateStart(value: string, { startMin, startMax }: DateRangeProps) {
  if (value === '') return undefined;
  if (!isDate(value)) return '请输入有效公历日期（YYYY-MM-DD）';
  if (startMin && value < startMin) return `开始日期不得早于 ${startMin}`;
  if (startMax && value > startMax) return `开始日期不得晚于 ${startMax}`;
  return undefined;
}
export function DateRange() {
  const a = useMaterialAdapter(contract),
    p = a.props,
    id = useId(),
    trigger = useRef<HTMLButtonElement>(null);
  const start = a.values.start.kind === 'value' ? a.values.start.value : missing,
    end = a.values.end.kind === 'value' ? a.values.end.value : missing;
  const current = (): Draft => ({
    start: draftText(start),
    end: draftText(end),
    baseStart: start,
    baseEnd: end,
  });
  const [calendar, setCalendar] = useState<'start' | 'end' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [failure, setFailure] = useState<string | null>(null),
    [errors, setErrors] = useState<{ start?: string; end?: string }>({});
  if (draft && (!Object.is(draft.baseStart, start) || !Object.is(draft.baseEnd, end))) {
    setDraft(current());
    setCalendar(null);
    setErrors({});
    if (draft.refreshMessage) {
      setFailure(draft.refreshMessage);
      setNotice(null);
    } else {
      setFailure(null);
      setNotice('日期已被外部更新，请重新确认');
    }
  }
  const open = () => {
    if (p.disabled) return;
    setDraft(current());
    setNotice(null);
    setFailure(null);
    setErrors({});
  };
  const close = () => {
    setDraft(null);
    setCalendar(null);
    setErrors({});
    setNotice(null);
    setFailure(null);
  };
  const reload = (message: string) => {
    if (draft)
      setDraft({ ...draft, baseStart: refresh, baseEnd: refresh, refreshMessage: message });
  };
  const confirm = () => {
    if (!draft || p.disabled) return;
    const invalid = {
      start: validateStart(draft.start, p),
      end: draft.end !== '' && !isDate(draft.end) ? '请输入有效公历日期（YYYY-MM-DD）' : undefined,
    };
    setErrors(invalid);
    if (invalid.start || invalid.end) return;
    const first = a.set('start', draft.start === '' ? null : draft.start);
    if (first.kind !== 'executed' || !first.result.ok) {
      reload('开始日期未能更新，请检查后重试');
      return;
    }
    const second = a.set('end', draft.end === '' ? null : draft.end);
    if (second.kind !== 'executed' || !second.result.ok) {
      reload(
        first.result.changed
          ? '开始日期已更新，结束日期未能更新，请检查后重试'
          : '结束日期未能更新，请检查后重试',
      );
      return;
    }
    close();
  };
  const startLabel = p.startLabel ?? '开始日期',
    endLabel = p.endLabel ?? '结束日期';
  return (
    <fieldset className="fe-date-range">
      <legend>{p.label}</legend>
      <dl className="fe-date-values">
        {(['start', 'end'] as const).map((name) => (
          <div key={name}>
            <dt>{name === 'start' ? startLabel : endLabel}</dt>
            <dd>
              {displayDate(a.values[name].kind === 'value' ? a.values[name].value : undefined)}
            </dd>
            <ValidationMessages
              validation={a.validation[name]}
              issuesLabel={`${name === 'start' ? startLabel : endLabel}问题`}
            />
          </div>
        ))}
      </dl>
      <button
        ref={trigger}
        type="button"
        className="fe-button"
        disabled={p.disabled}
        aria-haspopup="dialog"
        onClick={open}
      >
        选择日期
      </button>
      <Modal
        open={draft !== null}
        title={p.label}
        description="日期仅在确认后写入；取消不会修改当前日期"
        onClose={close}
        closeLabel="关闭日期选择"
        returnFocus={trigger}
        footer={
          <>
            <button type="button" className="fe-button" onClick={close}>
              取消日期
            </button>
            <button
              type="button"
              className="fe-button fe-button--primary"
              disabled={p.disabled}
              onClick={confirm}
            >
              确认日期
            </button>
          </>
        }
      >
        {draft ? (
          <>
            <div className="fe-date-drafts">
              {(['start', 'end'] as const).map((name) => (
                <div key={name}>
                  <label htmlFor={`${id}-${name}`}>
                    {name === 'start' ? startLabel : endLabel}
                  </label>
                  <div className="fe-date-input">
                    <DateTextInput
                      id={`${id}-${name}`}
                      value={draft[name]}
                      disabled={p.disabled}
                      aria-invalid={Boolean(errors[name])}
                      aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
                      onChange={(event) => {
                        setDraft({ ...draft, [name]: event.currentTarget.value });
                        setErrors({ ...errors, [name]: undefined });
                      }}
                    />
                    <CalendarTrigger
                      label={`打开${name === 'start' ? startLabel : endLabel}日历`}
                      value={draft[name]}
                      min={name === 'start' ? p.startMin : undefined}
                      max={name === 'start' ? p.startMax : undefined}
                      disabled={p.disabled}
                      open={calendar === name}
                      onOpenChange={(next) =>
                        setCalendar((current) => (next ? name : current === name ? null : current))
                      }
                      onSelect={(value) => {
                        setDraft((current) => current && { ...current, [name]: value });
                        setErrors((current) => ({ ...current, [name]: undefined }));
                      }}
                    />
                  </div>
                  {errors[name] ? (
                    <p id={`${id}-${name}-error`} className="fe-feedback">
                      {errors[name]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            {notice ? (
              <p role="status" className="fe-help">
                {notice}
              </p>
            ) : null}
            {failure ? (
              <p role="alert" className="fe-feedback">
                {failure}
              </p>
            ) : null}
          </>
        ) : null}
      </Modal>
    </fieldset>
  );
}
export function createDateRange(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, DateRange);
}
