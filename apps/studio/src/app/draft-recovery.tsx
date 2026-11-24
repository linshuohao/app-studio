'use client';
import { useEffect, useMemo, useState, useImperativeHandle, useRef, type Ref } from 'react';
import { Modal } from './modal';
import { DiffResult } from './config-diff';
import { updateDrafts, type DraftContent, type LocalDraft } from './local-drafts';
import {
  platform,
  type Access,
  type OpenForm,
  type VersionSummary,
  failureMessage,
} from './platform-api';
import { versionLabel } from './record-labels';

export function DraftRecovery({
  checkpointRef,
  userId,
  spaceId,
  formId,
  workId,
  content,
  protect,
  versions,
  currentId,
  disabled,
  onRestore,
}: {
  checkpointRef: Ref<{ persist: (content: DraftContent) => Promise<void> }>;
  userId: string;
  spaceId: string;
  formId: string;
  workId: string;
  content: DraftContent;
  protect: boolean;
  versions: VersionSummary[];
  currentId: string | null;
  disabled: boolean;
  onRestore: (row: LocalDraft) => void;
}) {
  const owner = useMemo(
    () => ({ userId, spaceId, formId: formId + '/' + workId }),
    [userId, spaceId, formId, workId],
  );
  const [id] = useState(() => crypto.randomUUID());
  const [epoch, setEpoch] = useState<string>();
  const [rows, setRows] = useState<LocalDraft[]>([]);
  const [stored, setStored] = useState<DraftContent>();
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const [diff, setDiff] = useState<LocalDraft>();
  const [restoring, setRestoring] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!navigator.locks) return;
    const controller = new AbortController();
    let release = () => {};
    void navigator.locks
      .request(
        'studio-draft:' + id,
        { signal: controller.signal },
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .catch(() => {});
    return () => {
      controller.abort();
      release();
    };
  }, [id]);
  useImperativeHandle(
    checkpointRef,
    () => ({
      async persist(snapshot) {
        try {
          const sessionEpoch = epoch ?? (await updateDrafts(owner)).epoch;
          await updateDrafts(owner, sessionEpoch, (store) =>
            store.set(id, { ...owner, ...snapshot, id, updated: Date.now() }),
          );
        } catch {
          setFailed(true);
        }
      },
    }),
    [id, owner, epoch],
  );
  useEffect(() => {
    let active = true;
    updateDrafts(owner).then(
      (result) => {
        if (active) {
          setRows(result.rows);
          setEpoch(result.epoch);
        }
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [owner]);
  useEffect(() => {
    if (epoch === undefined) return;
    let active = true;
    updateDrafts(owner, epoch, (store) => {
      if (protect) store.set(id, { ...owner, ...content, id, updated: Date.now() });
      else store.delete(id);
    }).then(
      ({ rows }) => {
        if (active) {
          setStored(content);
          setFailed(false);
          setRows(rows.filter((row) => row.id !== id));
        }
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [content, epoch, id, owner, protect]);
  useEffect(() => {
    if (epoch === undefined) return;
    let active = true;
    const refresh = () => {
      void updateDrafts(owner, epoch).then(
        ({ rows }) => {
          if (!active) return;
          setRows(rows.filter((row) => row.id !== id));
          if (protect && !rows.some((row) => row.id === id)) setFailed(true);
        },
        () => {
          if (active) setFailed(true);
        },
      );
    };
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [epoch, id, owner, protect]);
  async function choose(row: LocalDraft, restore: boolean) {
    if (restoring || epoch === undefined) return;
    setRestoring(true);
    setError('');
    try {
      if (restore) {
        const [access, form] = await Promise.all([
          platform<Access>('/access'),
          platform<OpenForm>('/forms/' + formId),
        ]);
        if (
          access.userId !== userId ||
          access.spaceId !== spaceId ||
          !access.permissions.includes('form:edit') ||
          form.archived
        )
          throw Error('当前账号或表单状态不允许恢复编辑。');
      }
      async function take(canRemove: boolean) {
        if (!restore && !canRemove) throw Error('此草稿仍在其他标签页编辑，请先关闭该编辑页。');
        let changed = false;
        const result = await updateDrafts(owner, epoch, (rows) => {
          if (!mounted.current || rows.get(row.id)?.updated !== row.updated) {
            changed = true;
            return;
          }
          if (canRemove) rows.delete(row.id);
          if (restore) rows.set(id, { ...row, id, updated: Date.now() });
        });
        if (changed) {
          setRows(result.rows.filter((r) => r.id !== id));
          throw Error('本机草稿已变化，请重新选择。');
        }
        return result;
      }
      const result = navigator.locks
        ? await navigator.locks.request('studio-draft:' + row.id, { ifAvailable: true }, (lock) =>
            take(!!lock),
          )
        : await take(false);
      setRows(result.rows.filter((r) => r.id !== row.id && r.id !== id));
      if (restore && mounted.current) onRestore(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : failureMessage(e));
    } finally {
      setRestoring(false);
    }
  }
  return (
    <div className="draft-recovery" data-protected={(protect && stored === content) || undefined}>
      {restoring && (
        <Modal title="正在读取本机草稿" closeDisabled onClose={() => {}}>
          <p role="status">正在核对编辑权限与草稿状态…</p>
        </Modal>
      )}
      {failed && <p role="status">本机保护不可用</p>}
      {rows.length > 0 && (
        <details className="local-draft-recovery">
          <summary>本机草稿（{rows.length}）</summary>
          <section className="surface authoring-panel local-draft-panel" aria-label="本机草稿">
            {rows.map((row) => (
              <div className="draft-row" key={row.id}>
                <div>
                  <strong>未命名草稿</strong> · {new Date(row.updated).toLocaleString('zh-CN')}
                  <small>
                    基于
                    {row.versionId
                      ? versionLabel(versions.find((v) => v.versionId === row.versionId))
                      : '初始配置'}
                    {row.versionId !== currentId ? ' · 服务器已有更新版本' : ''}
                    {row.pending ? ' · 请求结果待确认' : ''}
                  </small>
                </div>
                <div className="action-row">
                  <button className="quiet" onClick={() => setDiff(row)}>
                    查看差异
                  </button>
                  <button
                    disabled={disabled || restoring || protect}
                    onClick={() => void choose(row, true)}
                  >
                    恢复编辑
                  </button>
                  <button
                    className="text-button"
                    disabled={restoring}
                    onClick={() => void choose(row, false)}
                  >
                    放弃此草稿
                  </button>
                </div>
              </div>
            ))}
          </section>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      {diff && (
        <Modal wide title="本机草稿差异" onClose={() => setDiff(undefined)}>
          <div className="config-diff">
            <DiffResult texts={[diff.savedText, diff.text]} />
          </div>
        </Modal>
      )}
    </div>
  );
}
