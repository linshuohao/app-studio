'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Icon, Input, Menu } from '@form-engine/studio-design-components';
import { Feedback } from '@form-engine/studio-design-components/controls';
import { renameConversation, type ConversationSummary } from './agent-conversation';
import { Modal } from './modal';
import { failureMessage, platform } from './platform-api';

type Edit = {
  row: ConversationSummary;
  kind: 'rename' | 'delete';
  trigger?: HTMLElement;
};

export function AgentConversationList({
  activeId,
  revision,
  onOpen,
  onRename,
  onDelete,
}: {
  activeId?: string;
  revision: number;
  onOpen: (row: ConversationSummary) => void;
  onRename: (row: Pick<ConversationSummary, 'id' | 'title'>) => void;
  onDelete: (id: string, next?: ConversationSummary) => void;
}) {
  const [rows, setRows] = useState<ConversationSummary[]>();
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [edit, setEdit] = useState<Edit>();
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const newestRequest = useRef(0);
  const list = useRef<HTMLUListElement>(null);
  const path = '/agent-conversations';

  useEffect(() => {
    let active = true;
    const generation = ++newestRequest.current;
    void platform<ConversationSummary[]>(path).then(
      (value) => {
        if (active && generation === newestRequest.current) {
          setRows(value);
          setLoadError('');
        }
      },
      (e) => {
        if (active && generation === newestRequest.current) setLoadError(failureMessage(e));
      },
    );
    return () => {
      active = false;
    };
  }, [revision, reload]);

  function begin(row: ConversationSummary, kind: Edit['kind']) {
    const trigger = list.current?.querySelector<HTMLElement>(
      '[data-conversation-actions="' + CSS.escape(row.id) + '"]',
    );
    setEdit({ row, kind, trigger: trigger ?? undefined });
    setTitle(row.title);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit || busy || (edit.kind === 'rename' && !title.trim())) return;
    const url = path + '/' + encodeURIComponent(edit.row.id);
    setBusy(true);
    setError('');
    try {
      if (edit.kind === 'rename') {
        const result = await renameConversation(edit.row.id, title);
        ++newestRequest.current;
        setRows((previous) =>
          previous?.map((row) => (row.id === result.id ? { ...row, ...result } : row)),
        );
        onRename(result);
      } else {
        await platform(url, { method: 'DELETE' });
        ++newestRequest.current;
        const index = rows?.findIndex((row) => row.id === edit.row.id) ?? -1;
        const next = index >= 0 ? (rows?.[index + 1] ?? rows?.[index - 1]) : undefined;
        setRows((previous) => previous?.filter((row) => row.id !== edit.row.id));
        onDelete(edit.row.id, next);
        requestAnimationFrame(() => {
          const row = list.current?.querySelector<HTMLElement>('[aria-current="true"]');
          (
            row ??
            list.current?.querySelector<HTMLElement>('button') ??
            list.current?.parentElement?.querySelector<HTMLElement>('button')
          )?.focus();
        });
      }
      setReload((value) => value + 1);
      setEdit(undefined);
    } catch (e) {
      setError(failureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {loadError && (
        <Feedback kind="error">
          {loadError}{' '}
          <Button variant="text" onClick={() => setReload((value) => value + 1)}>
            重新加载
          </Button>
        </Feedback>
      )}
      {!rows && !loadError && <p role="status">正在读取对话…</p>}
      {rows?.length === 0 && <p>暂无对话。</p>}
      <ul className="studio-conversation-list" ref={list}>
        {rows?.map((row) => (
          <li key={row.id}>
            <Button
              className="studio-conversation-name"
              variant="text"
              title={row.title}
              aria-current={activeId === row.id ? 'true' : undefined}
              onClick={() => onOpen(row)}
            >
              {row.title}
            </Button>
            <Menu.Root>
              <Menu.Trigger
                render={<Button variant="text" className="studio-conversation-menu-trigger" />}
                aria-label={row.title + '的更多操作'}
                title="对话操作"
                data-conversation-actions={row.id}
              >
                <Icon name="Ellipsis" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  side="bottom"
                  align="end"
                  sideOffset={4}
                  className="studio-account-positioner"
                >
                  <Menu.Popup className="studio-account-menu">
                    <Menu.Item onClick={() => begin(row, 'rename')}>编辑标题</Menu.Item>
                    <Menu.Item
                      className="studio-conversation-delete"
                      onClick={() => begin(row, 'delete')}
                    >
                      删除对话
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </li>
        ))}
      </ul>
      {edit && (
        <Modal
          closeLabel="取消"
          title={edit.kind === 'rename' ? '编辑标题' : '删除对话'}
          size="standard"
          closeDisabled={busy}
          returnFocus={edit.trigger}
          onClose={() => setEdit(undefined)}
        >
          <form onSubmit={(event) => void submit(event)}>
            {edit.kind === 'rename' ? (
              <label className="studio-conversation-title-field">
                对话标题
                <Input
                  required
                  maxLength={60}
                  value={title}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
            ) : (
              <p>删除「{edit.row.title}」的对话记录？关联表单和草稿仍可打开。</p>
            )}
            {error && <Feedback kind="error">{error}</Feedback>}
            <div className="action-row">
              <Button type="submit" disabled={busy || (edit.kind === 'rename' && !title.trim())}>
                {edit.kind === 'rename' ? '保存标题' : '删除对话'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
