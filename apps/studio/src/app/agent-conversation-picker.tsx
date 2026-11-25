'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Icon } from '@form-engine/studio-design-components';
import { Feedback } from '@form-engine/studio-design-components/controls';
import { failureMessage, platform } from './platform-api';

import type { ConversationSummary } from './agent-conversation';

export function AgentConversationPicker({
  activeId,
  revision,
  disabled,
  onOpen,
  onNew,
}: {
  activeId?: string;
  revision: number;
  disabled: boolean;
  onOpen: (conversation: ConversationSummary) => void;
  onNew: () => void;
}) {
  const [rows, setRows] = useState<ConversationSummary[]>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    void platform<ConversationSummary[]>('/agent-conversations').then(
      (value) => {
        if (!current) return;
        setRows(value);
        setError('');
      },
      (reason) => {
        if (current) setError(failureMessage(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [revision, reload]);

  const [expanded, setExpanded] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!expanded) return;
    function dismiss(event: Event) {
      if (container.current && !event.composedPath().includes(container.current))
        setExpanded(false);
    }
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('focusin', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('focusin', dismiss);
    };
  }, [expanded]);

  const activeTitle = rows?.find((row) => row.id === activeId)?.title;
  return (
    <div
      ref={container}
      className="agent-picker"
      onKeyDown={(event) => {
        if (expanded && event.key === 'Escape') {
          event.stopPropagation();
          setExpanded(false);
          trigger.current?.focus();
        }
      }}
    >
      <Button
        ref={trigger}
        variant="secondary"
        className="agent-conversation-trigger"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
        title={activeTitle ?? '近期聊天'}
        disabled={disabled}
        aria-label="选择近期 Agent 聊天"
      >
        <Icon name="Bot" />
        <span>Agent 聊天</span>
        <Icon name="ChevronDown" />
      </Button>
      {expanded && (
        <section
          id={panelId}
          aria-label="近期聊天"
          className="studio-account-menu agent-conversation-menu"
        >
          <strong>近期聊天</strong>
          {error ? (
            <Feedback kind="error">
              {error}{' '}
              <Button variant="text" onClick={() => setReload((value) => value + 1)}>
                重试
              </Button>
            </Feedback>
          ) : !rows ? (
            <p role="status">正在读取聊天…</p>
          ) : rows.length ? (
            <div className="agent-conversation-options">
              {rows.slice(0, 8).map((row) => (
                <Button
                  variant="text"
                  key={row.id}
                  aria-current={activeId === row.id ? 'true' : undefined}
                  onClick={() => {
                    setExpanded(false);
                    onOpen(row);
                  }}
                >
                  <span className="agent-conversation-avatar" aria-hidden="true">
                    {Array.from(row.title)[0]}
                  </span>
                  <span className="agent-conversation-option-title">{row.title}</span>
                  <time dateTime={row.updatedAt}>
                    {new Date(row.updatedAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </Button>
              ))}
            </div>
          ) : (
            <p>还没有聊天记录。</p>
          )}
          <div className="agent-conversation-menu-actions">
            <Button
              variant="text"
              onClick={() => {
                setExpanded(false);
                onNew();
              }}
            >
              打开完整 Agent 页面
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
