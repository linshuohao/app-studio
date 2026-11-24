'use client';
import { useId, useRef, useState } from 'react';
import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
  useArrayBinding,
} from '@form-engine/renderer-react';
import { Modal } from '../_internal/modal.js';
import { manifest } from './manifest.js';
type Row = Record<string, JsonValue>;
type Props = {
  title: string;
  initial: Row;
  drawerTitle?: string;
  confirmTitle?: string;
  minItems?: number;
  columns?: number;
  defaultExpanded?: boolean;
};
const contract = defineMaterialContract<Props, 'value'>(manifest);
function ArrayEditor() {
  const a = useMaterialAdapter(contract),
    binding = useArrayBinding('value'),
    p = a.props;
  const read = a.values.value,
    values = read.kind === 'value' && Array.isArray(read.value) ? (read.value as Row[]) : [];
  const [edit, setEdit] = useState<{ id: string | null; value: Row; base: Row } | null>(null),
    [remove, setRemove] = useState<string | null>(null),
    [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null),
    heading = useId();
  const index = (id: string) => binding.ids.indexOf(id);
  function act(fn: () => void) {
    try {
      fn();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  }
  function open(id: string | null, row: Row) {
    setError('');
    setEdit({ id, value: structuredClone(row), base: structuredClone(row) });
  }
  const alive = edit?.id == null || index(edit.id) >= 0;
  return (
    <section className={'fe-array-editor' + (edit ? ' has-drawer' : '')} aria-label={p.title}>
      <header>
        <strong>{p.title}</strong>{' '}
        <button type="button" onClick={() => open(null, p.initial)}>
          新增成员
        </button>
      </header>
      <div className="fe-array-list">
        {binding.ids.map((id, i) => (
          <details key={id} open={p.defaultExpanded ?? true}>
            <summary>
              {i + 1}.{' '}
              {String(
                Object.values(values[i] ?? {}).find((v) => typeof v === 'string' && v) || '成员',
              )}
            </summary>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(' + (p.columns ?? 1) + ',minmax(0,1fr))',
              }}
            >
              {Object.entries(values[i] ?? {}).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
            <div className="fe-array-actions">
              <button type="button" onClick={() => open(id, values[i]!)}>
                编辑成员
              </button>
              {[-1, 1].map((delta) => (
                <button
                  type="button"
                  key={delta}
                  disabled={!binding.ids[i + delta]}
                  onClick={() => act(() => binding.write('move', id, {}, delta))}
                >
                  {delta < 0 ? '上移' : '下移'}
                </button>
              ))}
              <button
                type="button"
                disabled={values.length <= (p.minItems ?? 0)}
                onClick={(e) => {
                  trigger.current = e.currentTarget;
                  setRemove(id);
                }}
              >
                删除成员
              </button>
            </div>
          </details>
        ))}
      </div>
      {edit && (
        <aside className="fe-array-drawer" aria-labelledby={heading}>
          <h3 id={heading}>{p.drawerTitle ?? '成员编辑'}</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(() => {
                const changed = Object.fromEntries(
                  Object.entries(edit.value).filter(
                    ([k, v]) => JSON.stringify(edit.base[k]) !== JSON.stringify(v),
                  ),
                );
                binding.write(
                  edit.id === null ? 'insert' : 'patch',
                  edit.id,
                  edit.id === null ? edit.value : changed,
                );
                setEdit(null);
              });
            }}
          >
            {Object.entries({ ...p.initial, ...edit.base }).map(([k, base]) => (
              <label key={k}>
                {k}
                {typeof base === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={!!edit.value[k]}
                    onChange={(e) =>
                      setEdit({ ...edit, value: { ...edit.value, [k]: e.target.checked } })
                    }
                  />
                ) : typeof base === 'object' ? (
                  <textarea
                    key={edit.id + ':' + k}
                    defaultValue={JSON.stringify(edit.value[k] ?? base, null, 4)}
                    onChange={(e) => {
                      try {
                        const value = JSON.parse(e.target.value);
                        e.target.setCustomValidity('');
                        setEdit({ ...edit, value: { ...edit.value, [k]: value } });
                      } catch {
                        e.target.setCustomValidity('请输入有效 JSON');
                      }
                    }}
                  />
                ) : (
                  <input
                    type={typeof base === 'number' ? 'number' : 'text'}
                    step="any"
                    value={String(edit.value[k] ?? '')}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        value: {
                          ...edit.value,
                          [k]:
                            typeof base === 'number' && e.target.value !== ''
                              ? Number(e.target.value)
                              : e.target.value,
                        },
                      })
                    }
                  />
                )}
              </label>
            ))}
            {!alive && <p role="alert">此成员已被移除。</p>}
            <button type="button" onClick={() => setEdit(null)}>
              取消编辑
            </button>{' '}
            <button disabled={!alive}>保存成员</button>
          </form>
        </aside>
      )}
      <Modal
        open={remove !== null}
        title={p.confirmTitle ?? '确认删除成员？'}
        onClose={() => setRemove(null)}
        returnFocus={trigger}
        footer={
          <>
            <button type="button" onClick={() => setRemove(null)}>
              取消删除
            </button>
            <button
              type="button"
              disabled={remove === null || index(remove) < 0 || values.length <= (p.minItems ?? 0)}
              onClick={() =>
                act(() => {
                  binding.write('remove', remove);
                  if (edit?.id === remove) setEdit(null);
                  setRemove(null);
                })
              }
            >
              确认删除
            </button>
          </>
        }
      >
        {remove !== null && index(remove) >= 0
          ? '将删除成员 ' + (index(remove) + 1)
          : '此成员已移除'}
      </Modal>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function createArrayEditor(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, ArrayEditor);
}
