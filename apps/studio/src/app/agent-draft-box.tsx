'use client';
import { useEffect, useState } from 'react';
import { Modal } from './modal';
import { Button, DataTable, type Column } from '@form-engine/studio-design-components';
import { Feedback } from '@form-engine/studio-design-components/controls';
import { failureMessage, platform } from './platform-api';

type DraftEntry = {
  id: string;
  name: string;
  updatedAt: string;
  versionName: string;
};

const path = '/form-drafts';

export function AgentDraftBox({
  returnFocus,
  close,
  resume,
}: {
  returnFocus?: HTMLElement;
  close: () => void;
  resume: (entry: DraftEntry) => void;
}) {
  const [rows, setRows] = useState<DraftEntry[]>();
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    platform<DraftEntry[]>(path).then(
      (data) => {
        if (active) setRows(data);
      },
      (e) => {
        if (active) setError(failureMessage(e));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function remove(entries: DraftEntry[]) {
    if (!entries.length || deleting) return;
    const target =
      entries.length === 1 ? '「' + entries[0]!.name + '」' : '选中的 ' + entries.length + ' 项';
    if (!window.confirm('删除' + target + '？将删除这份工作稿。')) return;
    setDeleting(true);
    setError('');
    const removed = new Set<string>();
    const failures: string[] = [];
    for (const row of entries) {
      try {
        await platform(path + '/' + row.id, { method: 'DELETE' });
        removed.add(row.id);
      } catch (e) {
        failures.push(row.name + '：' + failureMessage(e));
      }
    }
    setRows((previous) => previous?.filter((row) => !removed.has(row.id)));
    setSelected((previous) => previous.filter((id) => !removed.has(id)));
    setError(failures.join('；'));
    setDeleting(false);
  }
  const actions = !!rows?.length && (
    <Button
      variant="secondary"
      disabled={deleting || !selected.length}
      onClick={() => void remove(rows.filter((row) => selected.includes(row.id)))}
    >
      批量删除（{selected.length}）
    </Button>
  );
  const draftColumns: Column<DraftEntry>[] = [
    {
      key: 'selection',
      title: '选择',
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.includes(row.id)}
          disabled={deleting}
          aria-label={`选择草稿「${row.name}」`}
          onChange={(event) => {
            const checked = event.target.checked;
            setSelected((current) =>
              checked ? [...current, row.id] : current.filter((id) => id !== row.id),
            );
          }}
        />
      ),
    },
    {
      key: 'name',
      title: '草稿名称',
      render: (row) => <strong>{row.name}</strong>,
    },
    { key: 'version', title: '版本', render: (row) => row.versionName || '—' },
    {
      key: 'updated',
      title: '最近更新',
      render: (row) => (
        <time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleString('zh-CN')}</time>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (row) => (
        <div className="action-row">
          <Button variant="secondary" disabled={deleting} onClick={() => resume(row)}>
            打开草稿
          </Button>
          <Button variant="text" disabled={deleting} onClick={() => void remove([row])}>
            删除
          </Button>
        </div>
      ),
    },
  ];
  const content = (
    <>
      {error && <Feedback kind="error">{error}</Feedback>}
      {!rows ? (
        !error && <Feedback kind="status">正在读取…</Feedback>
      ) : (
        <DataTable
          label="草稿列表"
          rows={rows}
          columns={draftColumns}
          rowKey={(row) => row.id}
          empty="暂无表单草稿。"
        />
      )}
    </>
  );
  return (
    <Modal
      returnFocus={returnFocus}
      title="表单草稿"
      size="wide"
      onClose={close}
      closeDisabled={deleting}
      actions={actions}
    >
      {content}
    </Modal>
  );
}
