import { useId, useLayoutEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { zhCN } from 'react-day-picker/locale';
import { isDate } from '../date.js';

// Adapted from shadcn/ui Calendar. CSS is shipped with the material package.
function calendarDate(text: string | undefined) {
  return text && isDate(text) ? new Date(`${text}T12:00:00Z`) : undefined;
}

interface CalendarProps {
  value: string;
  min?: string | undefined;
  max?: string | undefined;
  onSelect: (value: string) => void;
  focusOnOpen?: boolean;
}

export function Calendar({ value, min, max, onSelect, focusOnOpen }: CalendarProps) {
  const selected = calendarDate(value);
  const start = calendarDate(min) ?? new Date('0001-01-01T12:00:00Z');
  const end = calendarDate(max) ?? new Date('9999-12-31T12:00:00Z');
  const today = new Date();
  const [month, setMonth] = useState(() =>
    start > end
      ? (selected ?? today)
      : new Date(Math.min(+end, Math.max(+start, +(selected ?? today)))),
  );
  const [yearDraft, setYearDraft] = useState<string | null>(null);
  const yearId = useId();
  const yearInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (focusOnOpen) yearInput.current?.focus();
  }, [focusOnOpen]);
  const invalidBounds = start > end;
  const chooseYear = () => {
    setYearDraft(null);
    if (yearDraft === null || !/^\d{1,4}$/.test(yearDraft)) return;
    const target = new Date(month);
    target.setUTCDate(1);
    target.setUTCFullYear(Number(yearDraft));
    if (target.getUTCFullYear() < start.getUTCFullYear()) setMonth(start);
    else if (target.getUTCFullYear() > end.getUTCFullYear()) setMonth(end);
    else if (target.getUTCFullYear() === start.getUTCFullYear() && target < start) setMonth(start);
    else if (target.getUTCFullYear() === end.getUTCFullYear() && target > end) setMonth(end);
    else setMonth(target);
  };
  return (
    <div className="fe-calendar" data-slot="calendar">
      <label className="fe-calendar-year" htmlFor={yearId}>
        年份
        <input
          id={yearId}
          ref={yearInput}
          className="fe-input"
          inputMode="numeric"
          maxLength={4}
          value={yearDraft ?? String(month.getUTCFullYear())}
          disabled={invalidBounds}
          onChange={(event) => setYearDraft(event.currentTarget.value)}
          onBlur={chooseYear}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              chooseYear();
            }
          }}
        />
      </label>
      <DayPicker
        mode="single"
        required
        timeZone="UTC"
        locale={zhCN}
        captionLayout="dropdown-months"
        selected={selected}
        month={month}
        onMonthChange={setMonth}
        startMonth={invalidBounds ? month : start}
        endMonth={invalidBounds ? month : end}
        disabled={invalidBounds ? true : [{ before: start }, { after: end }]}
        onSelect={(day) => onSelect(day.toISOString().slice(0, 10))}
      />
    </div>
  );
}
