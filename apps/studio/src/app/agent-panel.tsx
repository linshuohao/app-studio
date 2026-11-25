'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, IconButton, Input } from '@form-engine/studio-design-components/controls';
import { Icon } from '@form-engine/studio-design-components';
import { AgentMessage, AgentReply } from './agent-reply';
import { failureMessage, platform, type FormListEntry } from './platform-api';
import { Modal } from './modal';
import type { Summary } from './asset-catalog';
import {
  maxReferences,
  assetReference,
  referenceId,
  referenceLabel,
  referenceUrl,
  type MessageReference,
  type PanelPosition,
} from './agent-conversation';
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

export function AgentUserMessage({
  text,
  references,
}: {
  text: string;
  references?: MessageReference[];
}) {
  return (
    <AgentMessage text={text}>
      <div data-speaker="user">
        <b>你</b>
        <AgentReply text={text} />
        <MessageReferenceLinks references={references} />
      </div>
    </AgentMessage>
  );
}

function MessageReferenceLinks({ references }: { references?: MessageReference[] }) {
  if (!references?.length) return null;
  return (
    <ul className="agent-form-references" aria-label="消息引用">
      {references.map((reference) => (
        <li key={referenceId(reference)}>
          <a href={referenceUrl(reference)} target="_blank" rel="noreferrer">
            {referenceLabel(reference)}
          </a>
        </li>
      ))}
    </ul>
  );
}

const referenceCommands = [
  { kind: 'form', label: '表单' },
  { kind: 'function', label: '纯函数' },
  { kind: 'material', label: '物料' },
] as const;
type ReferenceKind = (typeof referenceCommands)[number]['kind'];

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
  composeActions,
  disabled,
  sendDisabled,
  jumpToLatest = false,
  references,
  onReference,
  onRemoveReference,
  referenceFocus = 0,
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
  composeActions?: ReactNode;
  disabled: boolean;
  sendDisabled: boolean;
  jumpToLatest?: boolean;
  references?: MessageReference[];
  onReference?: (reference: MessageReference) => void;
  onRemoveReference?: (versionId: string) => void;
  referenceFocus?: number;
}) {
  const id = useId(),
    panel = useRef<HTMLElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const historyContent = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showLatest, setShowLatest] = useState(false);

  const composer = useRef<HTMLTextAreaElement>(null);
  const [picker, setPicker] = useState<ReferenceKind>();
  const [command, setCommand] = useState<{
    start: number;
    end: number;
    token: string;
    selected: number;
  }>();
  const commandListId = id + '-commands';
  const commandOptions = command
    ? referenceCommands.filter(({ kind }) => ('/' + kind).startsWith(command.token))
    : [];
  const [resultsData, setResultsData] =
    useState<{ reference: MessageReference; keywords: string }[]>();
  const pickerLabel = referenceCommands.find(({ kind }) => kind === picker)?.label;
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLElement>(null);
  const [searchError, setSearchError] = useState('');
  const results = useRef<HTMLDivElement>(null);
  const pickerRequest = useRef(0);
  const canReference = !!onReference && !disabled && (references?.length ?? 0) < maxReferences;

  useEffect(() => {
    if (open && referenceFocus) composer.current?.focus({ preventScroll: true });
  }, [open, referenceFocus]);

  useEffect(() => {
    if (!picker) return;
    const frame = requestAnimationFrame(() => searchInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [picker]);

  function openPicker(kind: ReferenceKind = 'form') {
    setCommand(undefined);
    const request = ++pickerRequest.current;
    setSearch('');
    setSearchError('');
    setResultsData(undefined);
    setPicker(kind);
    const entries =
      kind === 'form'
        ? platform<FormListEntry[]>('/forms').then((rows) =>
            rows.flatMap((row) =>
              row.latestSave
                ? [
                    {
                      reference: { formId: row.formId, name: row.name, ...row.latestSave },
                      keywords: [row.name, row.description].join(' '),
                    },
                  ]
                : [],
            ),
          )
        : platform<Summary[]>('/catalog/' + (kind === 'function' ? 'functions' : 'materials')).then(
            (rows) =>
              rows.map((row) => ({
                reference: assetReference(kind, row),
                keywords: [row.id, row.title, row.summary, row.description].join(' '),
              })),
          );
    void entries.then(
      (rows) => {
        if (request === pickerRequest.current) setResultsData(rows);
      },
      (error) => {
        if (request === pickerRequest.current) setSearchError(failureMessage(error));
      },
    );
  }

  function closePicker() {
    pickerRequest.current += 1;
    setPicker(undefined);
    requestAnimationFrame(() => composer.current?.focus());
  }

  const searchWords = search.trim().toLocaleLowerCase().split(/\s+/u);
  const matches = resultsData?.filter(
    ({ reference, keywords }) =>
      !references?.some((item) => referenceId(item) === referenceId(reference)) &&
      searchWords.every((word) => keywords.toLocaleLowerCase().includes(word)),
  );
  function selectCommand(kind: ReferenceKind) {
    if (!command) return;
    onMessage(message.slice(0, command.start) + message.slice(command.end));
    openPicker(kind);
  }
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
        {!!references?.length && (
          <ul className="agent-form-references" aria-label="待发送的引用">
            {references.map((reference) => (
              <li key={referenceId(reference)}>
                <a href={referenceUrl(reference)} target="_blank" rel="noreferrer">
                  {referenceLabel(reference)}
                </a>
                <IconButton
                  icon="Minus"
                  aria-label={'移除引用 ' + reference.name}
                  title="移除引用"
                  disabled={disabled}
                  onClick={() => {
                    onRemoveReference?.(referenceId(reference));
                    composer.current?.focus();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {command && canReference && (
          <div
            id={commandListId}
            className="agent-command-menu"
            role="listbox"
            aria-label="斜杠命令"
          >
            {commandOptions.map(({ kind, label }, index) => (
              <Button
                key={kind}
                id={commandListId + '-' + index}
                type="button"
                role="option"
                aria-selected={index === command.selected}
                tabIndex={-1}
                variant="secondary"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCommand(kind)}
              >
                <code>/{kind}</code> 引用{label}
              </Button>
            ))}
          </div>
        )}
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <textarea
          id={id}
          ref={composer}
          rows={2}
          value={message}
          disabled={disabled}
          aria-autocomplete={onReference ? 'list' : undefined}
          aria-controls={command && canReference ? commandListId : undefined}
          aria-activedescendant={
            command && canReference ? commandListId + '-' + command.selected : undefined
          }
          onBlur={() => setCommand(undefined)}
          onClick={() => setCommand(undefined)}
          onChange={(event) => {
            const { value, selectionStart } = event.currentTarget;
            const native = event.nativeEvent as InputEvent;
            const before = value.slice(0, selectionStart);
            const token = before.match(/(?:^|\s)(\/[a-z]*)$/u)?.[1];
            const inputType = native.inputType;
            const typed =
              inputType === 'insertText' || (command && inputType === 'deleteContentBackward');
            if (
              canReference &&
              !native.isComposing &&
              typed &&
              token &&
              referenceCommands.some(({ kind }) => ('/' + kind).startsWith(token))
            ) {
              const start = selectionStart - token.length;
              const exact = referenceCommands.find(({ kind }) => '/' + kind === token);
              if (exact) {
                onMessage(value.slice(0, start) + value.slice(selectionStart));
                openPicker(exact.kind);
                return;
              }
              setCommand({ start, end: selectionStart, token, selected: 0 });
            } else setCommand(undefined);
            onMessage(value);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (command && canReference) {
              if (event.key === 'Escape') {
                event.preventDefault();
                setCommand(undefined);
                return;
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const offset = event.key === 'ArrowDown' ? 1 : -1;
                setCommand({
                  ...command,
                  selected:
                    (command.selected + offset + commandOptions.length) % commandOptions.length,
                });
                return;
              }
              if (!event.shiftKey && (event.key === 'Tab' || event.key === 'Enter')) {
                event.preventDefault();
                const item = commandOptions[command.selected];
                if (item) selectCommand(item.kind);
                return;
              }
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                setCommand(undefined);
            }
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            if (!event.repeat && !disabled && !sendDisabled && message.trim()) onSend();
          }}
          placeholder="输入问题、表单需求或修改意见"
        />
        <div className="agent-compose-actions">
          {composeActions}
          {onReference && (
            <Button variant="secondary" onClick={() => openPicker()} disabled={!canReference}>
              添加引用
            </Button>
          )}
          <Button
            disabled={disabled || sendDisabled || !message.trim()}
            onClick={onSend}
            title="Enter 发送，Shift+Enter 换行"
          >
            {sendLabel}
          </Button>
        </div>
        {picker && (
          <Modal title={'引用' + pickerLabel} onClose={closePicker} size="standard">
            <div className="action-row" aria-label="引用类型">
              {referenceCommands.map(({ kind, label }) => (
                <Button
                  key={kind}
                  variant="text"
                  aria-pressed={picker === kind}
                  onClick={() => openPicker(kind)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Input
              type="search"
              ref={(element) => {
                searchInput.current = element;
                element?.setAttribute('autofocus', '');
              }}
              aria-label={'搜索' + pickerLabel}
              placeholder="搜索名称、标识或说明"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                const first = results.current?.querySelector('button');
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  first?.focus();
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  first?.click();
                }
              }}
            />
            {searchError ? (
              <p role="alert">{searchError}</p>
            ) : !matches ? (
              <p role="status">正在加载…</p>
            ) : (
              !matches.length && <p role="status">没有匹配的可引用版本。</p>
            )}
            <div
              className="agent-reference-results"
              ref={results}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                event.preventDefault();
                const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
                const index = buttons.indexOf(event.target as HTMLButtonElement);
                buttons[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
              }}
            >
              {matches?.map(({ reference }) => (
                <Button
                  key={referenceId(reference)}
                  variant="secondary"
                  onClick={() => {
                    if (!canReference) return;
                    onReference?.(reference);
                    closePicker();
                  }}
                >
                  {referenceLabel(reference)}
                </Button>
              ))}
            </div>
          </Modal>
        )}
      </div>
    </aside>
  );
}
