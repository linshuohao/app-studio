import { useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, CompositionEvent } from 'react';
import type { JsonValue } from '@form-engine/protocol';
import type { AdapterActionResult } from '@form-engine/renderer-react';
import type { ValueRead } from './types.js';
import { displayInput } from './number.js';
import { useActionFeedback } from './action-feedback.js';
const missing = Symbol('missing');
/** Only transient spelling/IME state; committed values always come from Runtime. */
export function useTextEditor(
  read: ValueRead,
  set: (value: JsonValue) => AdapterActionResult,
  parse: (text: string) => JsonValue,
  disabled = false,
) {
  const value = read.kind === 'value' ? read.value : missing;
  const [observed, setObserved] = useState(value);
  const [draft, setDraft] = useState<{ text: string; base: unknown } | null>(null);
  const composing = useRef<{ base: unknown; cancelled: boolean } | null>(null);
  const skip = useRef<string | undefined>(undefined);
  const feedback = useActionFeedback();
  if (!Object.is(observed, value)) {
    setObserved(value);
    if (draft && !Object.is(draft.base, value)) setDraft(null);
  }
  useLayoutEffect(() => {
    if (composing.current && !Object.is(composing.current.base, value))
      composing.current.cancelled = true;
  }, [value]);
  const commit = (text: string) => {
    if (disabled) return;
    const next = parse(text);
    if (Object.is(next, value)) {
      setDraft({ text, base: value });
      return;
    }
    setDraft(feedback.accept(set(next)) ? { text, base: next } : null);
  };
  return {
    value: draft && Object.is(draft.base, value) ? draft.text : displayInput(value),
    error: feedback.error,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const text = event.currentTarget.value;
      if (disabled) return;
      if (skip.current === text) {
        skip.current = undefined;
        return;
      }
      skip.current = undefined;
      if (composing.current) {
        if (!composing.current.cancelled) setDraft({ text, base: composing.current.base });
      } else commit(text);
    },
    onCompositionStart: () => {
      if (!disabled) composing.current = { base: value, cancelled: false };
    },
    onCompositionEnd: (event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const active = composing.current;
      composing.current = null;
      const text = event.currentTarget.value;
      skip.current = text;
      queueMicrotask(() => {
        if (skip.current === text) skip.current = undefined;
      });
      if (!disabled && active && !active.cancelled && Object.is(active.base, value)) commit(text);
      else {
        event.currentTarget.value = displayInput(value);
        setDraft(null);
      }
    },
    onBlur: () => {
      if (!composing.current) setDraft(null);
    },
  };
}
