'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
  type RequestCall,
} from '@form-engine/renderer-react';
import { useFieldControl } from '../_internal/field-context.js';
import { ActionFeedback, useActionFeedback } from '../_internal/action-feedback.js';
import { manifest } from './manifest.js';
import {
  remoteSelectRequests,
  type RemoteSelectOption,
  type RemoteSelectSearchResult,
} from './requests.js';
export interface RemoteSelectProps {
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  filterKey?: string | null;
}
const contract = defineMaterialContract<
  RemoteSelectProps,
  'value',
  Record<string, never>,
  typeof remoteSelectRequests
>({ ...manifest, requests: remoteSelectRequests });
interface Owner {
  id: number;
  live: boolean;
  query: string;
  filterKey: string | null;
  serial: number;
  pending?: RequestCall<RemoteSelectSearchResult>;
}
interface SearchState {
  query: string;
  filterKey: string | null;
  disabled: boolean;
  ownerId: number;
  serial: number;
  phase: 'idle' | 'pending' | 'success' | 'error';
  items: RemoteSelectOption[];
}
const idle = (query: string, filterKey: string | null, disabled: boolean): SearchState => ({
  query,
  filterKey,
  disabled,
  ownerId: 0,
  serial: 0,
  phase: 'idle',
  items: [],
});
function isOption(value: unknown): value is RemoteSelectOption {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.label === 'string';
}
export function RemoteSelect() {
  const a = useMaterialAdapter(contract),
    p = a.props,
    filterKey = p.filterKey ?? null,
    disabled = Boolean(p.disabled),
    read = a.values.value;
  const [query, setQuery] = useState(''),
    [state, setState] = useState(() => idle('', filterKey, disabled));
  const current = useRef<Owner | null>(null),
    nextId = useRef(0),
    feedback = useActionFeedback();
  const field = useFieldControl(a.validation.value, undefined, '搜索选项');
  if (
    state.query !== query ||
    !Object.is(state.filterKey, filterKey) ||
    state.disabled !== disabled
  )
    setState(idle(query, filterKey, disabled));
  useLayoutEffect(() => {
    const owner: Owner = { id: ++nextId.current, live: true, query, filterKey, serial: 0 };
    current.current = owner;
    return () => {
      owner.live = false;
      owner.serial++;
      owner.pending?.cancel();
      if (current.current === owner) current.current = null;
    };
  }, [query, filterKey, disabled]);
  const stop = () => {
    const owner = current.current;
    if (owner) {
      owner.serial++;
      owner.pending?.cancel();
      owner.pending = undefined;
    }
    setState(idle(query, filterKey, disabled));
  };
  const search = () => {
    const owner = current.current;
    if (disabled || !owner?.live || owner.query !== query || !Object.is(owner.filterKey, filterKey))
      return;
    const serial = ++owner.serial;
    owner.pending?.cancel();
    const call = a.request('search', { query, filterKey });
    owner.pending = call;
    const base = { query, filterKey, disabled, ownerId: owner.id, serial, items: [] };
    setState({ ...base, phase: 'pending' });
    void call.result.then((outcome) => {
      if (!owner.live || owner.serial !== serial) return;
      owner.pending = undefined;
      const next: SearchState =
        outcome.status === 'success'
          ? { ...base, phase: 'success', items: outcome.value.items }
          : outcome.status === 'error'
            ? { ...base, phase: 'error' }
            : { ...base, phase: 'idle' };
      setState((previous) => (owner.live && owner.serial === serial ? next : previous));
    });
  };
  const choose = (option: RemoteSelectOption) => {
    const owner = current.current;
    if (
      disabled ||
      !owner?.live ||
      owner.id !== state.ownerId ||
      owner.serial !== state.serial ||
      owner.query !== query ||
      !Object.is(owner.filterKey, filterKey) ||
      state.phase !== 'success'
    )
      return;
    if (feedback.accept(a.set('value', { id: option.id, label: option.label }))) stop();
  };
  const eligible =
    state.query === query &&
    Object.is(state.filterKey, filterKey) &&
    state.disabled === disabled &&
    !disabled;
  const selected = read.kind === 'value' && isOption(read.value) ? read.value : undefined;
  const invalid = read.kind === 'value' && read.value !== null && !selected;
  return (
    <div className="fe-remote-select">
      <div className="fe-search-controls">
        <input
          {...field}
          className="fe-input"
          type="search"
          value={query}
          placeholder={p.placeholder ?? '输入关键词'}
          disabled={disabled}
          aria-invalid={field['aria-invalid'] || invalid}
          onChange={(e) => {
            if (disabled) return;
            stop();
            setQuery(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="fe-button" disabled={disabled} onClick={search}>
          搜索
        </button>
        {eligible && state.phase === 'pending' ? (
          <button type="button" className="fe-button" onClick={stop}>
            取消搜索
          </button>
        ) : null}
      </div>
      <p className="fe-selected">
        当前选择：{selected ? selected.label : invalid ? '选中值格式无效' : '未选择'}
      </p>
      {p.clearable !== false ? (
        <button
          type="button"
          className="fe-button"
          disabled={disabled}
          onClick={() => {
            if (!disabled && feedback.accept(a.set('value', null))) stop();
          }}
        >
          清空选择
        </button>
      ) : null}
      <p className="fe-status" role="status">
        {eligible && state.phase === 'pending'
          ? '搜索中'
          : eligible && state.phase === 'error'
            ? '搜索失败，请重试'
            : eligible && state.phase === 'success'
              ? state.items.length === 0
                ? '未找到选项'
                : `找到 ${state.items.length} 个选项，请选择`
              : disabled
                ? '搜索已禁用'
                : selected
                  ? p.clearable === false
                    ? '已选择，可重新搜索'
                    : '已选择，可重新搜索或清空选择'
                  : query
                    ? '点击搜索查找选项'
                    : '输入关键词后搜索'}
      </p>
      {eligible && state.phase === 'error' ? (
        <p className="fe-feedback" role="alert">
          搜索暂时无法完成，请重试
        </p>
      ) : null}
      {eligible && state.phase === 'success' && state.items.length ? (
        <ul className="fe-search-results" aria-label="搜索结果">
          {state.items.map((option, i) => (
            <li key={`${i}:${option.id}`}>
              <button type="button" className="fe-button" onClick={() => choose(option)}>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ActionFeedback error={feedback.error} />
    </div>
  );
}
export function createRemoteSelect(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, RemoteSelect);
}
