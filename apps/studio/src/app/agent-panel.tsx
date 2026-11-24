'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, IconButton, Input } from '../components/ui/controls';
import { Icon } from '../components/ui';
import { failureMessage } from './platform-api';
import type { PanelPosition } from './agent-conversation';
import './agent-panel.css';

export function ConversationTitle({
  title,
  onRename,
}: {
  title: string;
  onRename?: (title: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close(restoreFocus: boolean) {
    setDraft(null);
    setError('');
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  }
  async function commit(restoreFocus: boolean) {
    if (draft === null || pending.current || !onRename) return;
    const value = draft.trim();
    if (!value || value === title) return close(restoreFocus);
    pending.current = true;
    setSaving(true);
    try {
      await onRename(value);
      close(restoreFocus);
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  if (!onRename)
    return (
      <span className="agent-conversation-title" title={title}>
        {title}
      </span>
    );
  if (draft === null)
    return (
      <Button
        ref={trigger}
        className="agent-conversation-title"
        variant="text"
        title={title}
        aria-label={'编辑对话标题：' + title}
        onClick={() => setDraft(title)}
      >
        {title}
      </Button>
    );
  return (
    <div className="agent-title-edit">
      <Input
        aria-label="对话标题"
        autoFocus
        maxLength={60}
        value={draft}
        readOnly={saving}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setError('');
          setDraft(event.currentTarget.value);
        }}
        onBlur={() => void commit(false)}
        onKeyDown={(event) => {
          if (saving || event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit(true);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

export function AgentPanel({
  title = 'Agent 协作',
  conversationId,
  onRename,
  onExpand,
  initialPosition,
  onPosition,
  open,
  floating = true,
  onCollapse,
  children,
  label,
  message,
  onMessage,
  onSend,
  sendLabel = '发送',
  disabled,
  sendDisabled,
  jumpToLatest = false,
}: {
  title?: string;
  conversationId?: string;
  onRename?: (value: string) => Promise<void>;
  onExpand?: () => void;
  initialPosition?: PanelPosition;
  onPosition?: (p: PanelPosition) => void;
  open: boolean;
  floating?: boolean;
  onCollapse: () => void;
  children: ReactNode;
  label: string;
  message: string;
  onMessage: (value: string) => void;
  onSend: () => void;
  sendLabel?: string;
  disabled: boolean;
  sendDisabled: boolean;
  jumpToLatest?: boolean;
}) {
  const id = useId(),
    panel = useRef<HTMLElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const historyContent = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showLatest, setShowLatest] = useState(false);

  function syncScroll() {
    const el = history.current;
    if (!el) return;
    following.current = el.scrollHeight - el.clientHeight - el.scrollTop <= 4;
    setShowLatest(!following.current);
  }

  useEffect(() => {
    const el = history.current;
    const content = historyContent.current;
    if (!open || !jumpToLatest || !el || !content) return;
    following.current = true;
    const observer = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight;
      syncScroll();
    });
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
  }, [open, jumpToLatest]);
  const position = useRef<PanelPosition | null>(initialPosition ?? null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const resizeDrag = useRef<{
    id: number;
    right: number;
    bottom: number;
    dx: number;
    dy: number;
  } | null>(null);
  const listener = useRef(onPosition);
  useEffect(() => {
    listener.current = onPosition;
  }, [onPosition]);
  function resize(width: number, height: number) {
    const el = panel.current;
    if (!el) return;
    el.style.width = Math.max(240, width) + 'px';
    el.style.height = Math.max(224, height) + 'px';
    el.dataset.resized = 'true';
  }
  function move(x: number, y: number) {
    const el = panel.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, document.documentElement.clientWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));
    position.current = { x: left, y: top, ...(el.dataset.resized && { width, height }) };
    listener.current?.(position.current);
    Object.assign(el.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
  }
  useEffect(() => {
    const el = panel.current;
    if (!open || !floating || !el) return;
    const fit = () => {
      if (position.current) move(position.current.x, position.current.y);
    };
    if (position.current?.width && position.current?.height)
      resize(position.current.width, position.current.height);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      drag.current = null;
      resizeDrag.current = null;
    };
  }, [open, floating]);
  if (!open) return null;
  return (
    <aside
      ref={panel}
      className="agent-thread surface"
      data-floating={floating || undefined}
      aria-label="Agent 协作"
    >
      {floating && (
        <button
          type="button"
          className="agent-resize-handle"
          aria-label="调整浮窗大小"
          title="拖动左上角调整大小，或使用方向键"
          onPointerDown={(e) => {
            if (!e.isPrimary || e.button !== 0) return;
            const r = panel.current!.getBoundingClientRect();
            resizeDrag.current = {
              id: e.pointerId,
              right: r.right,
              bottom: r.bottom,
              dx: e.clientX - r.left,
              dy: e.clientY - r.top,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = resizeDrag.current;
            if (d?.id !== e.pointerId) return;
            const x = Math.min(d.right - 240, Math.max(8, e.clientX - d.dx)),
              y = Math.min(d.bottom - 224, Math.max(8, e.clientY - d.dy));
            resize(d.right - x, d.bottom - y);
            move(x, y);
          }}
          onLostPointerCapture={() => {
            resizeDrag.current = null;
          }}
          onKeyDown={(e) => {
            const r = panel.current!.getBoundingClientRect();
            const dx = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : 0,
              dy = e.key === 'ArrowUp' ? 16 : e.key === 'ArrowDown' ? -16 : 0;
            if (!dx && !dy) return;
            e.preventDefault();
            resize(r.width + dx, r.height + dy);
            const next = panel.current!.getBoundingClientRect();
            move(r.right - next.width, r.bottom - next.height);
          }}
        >
          ◤
        </button>
      )}
      <div className="agent-thread-heading">
        {floating ? (
          <button
            className="agent-drag-handle"
            type="button"
            title="拖动浮窗，或用方向键移动"
            aria-label="移动 Agent 协作浮窗"
            onPointerDown={(e) => {
              if (!e.isPrimary || e.button !== 0) return;
              const rect = panel.current!.getBoundingClientRect();
              drag.current = {
                id: e.pointerId,
                dx: e.clientX - rect.left,
                dy: e.clientY - rect.top,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d?.id === e.pointerId) move(e.clientX - d.dx, e.clientY - d.dy);
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={(e) => {
              const steps: Record<string, [number, number]> = {
                ArrowLeft: [-16, 0],
                ArrowRight: [16, 0],
                ArrowUp: [0, -16],
                ArrowDown: [0, 16],
              };
              const step = steps[e.key];
              if (step) {
                e.preventDefault();
                const r = panel.current!.getBoundingClientRect();
                move(r.left + step[0], r.top + step[1]);
              }
            }}
          >
            <Icon name="Bot" />
          </button>
        ) : (
          <h2>Agent 协作</h2>
        )}
        {floating && (
          <>
            <ConversationTitle key={conversationId} title={title} onRename={onRename} />
            {onExpand && (
              <Button
                variant="text"
                data-icon-button=""
                aria-label="打开完整 Agent 页面"
                title="打开完整 Agent 页面"
                onClick={onExpand}
              >
                <span aria-hidden="true">↗</span>
              </Button>
            )}
            <IconButton icon="Minus" aria-label="收起" title="收起" onClick={onCollapse} />
          </>
        )}
      </div>
      <div className="agent-history-frame">
        <div
          className="agent-history"
          ref={history}
          role="log"
          aria-label="对话记录"
          tabIndex={0}
          onScroll={jumpToLatest ? syncScroll : undefined}
        >
          <div ref={historyContent}>{children}</div>
        </div>
        {jumpToLatest && showLatest && (
          <Button
            className="agent-jump-latest"
            variant="secondary"
            aria-label="回到最新消息"
            title="回到最新消息"
            onClick={() => {
              const el = history.current;
              if (!el) return;
              el.scrollTop = el.scrollHeight;
              el.focus({ preventScroll: true });
              syncScroll();
            }}
          >
            <Icon name="ChevronDown" />
            <Icon name="ChevronDown" />
          </Button>
        )}
      </div>
      <div className="agent-compose">
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <textarea
          id={id}
          rows={2}
          value={message}
          disabled={disabled}
          onChange={(e) => onMessage(e.target.value)}
          placeholder="输入问题、表单需求或修改意见"
        />
        <Button disabled={sendDisabled || !message.trim()} onClick={onSend}>
          {sendLabel}
        </Button>
      </div>
    </aside>
  );
}
