'use client';
import { AttemptHistory, useRunningConversation } from './agent-attempt';
import { AgentIssues } from './agent-issues';
import { AgentInteractionCard, AgentTurnProgress } from './agent-interaction';
import { studioUrl, writeLocation } from './studio-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { Button, Feedback, IconButton, Input } from '../components/ui/controls';
import { Modal } from './modal';
import { semanticModel } from './semantic-model';
import { JsonSource } from './json-source';
import {
  renameConversation,
  assistantText,
  type AssistantConversation,
  type ConversationLink,
  type FormDraft,
  type PanelPosition,
  type TurnResponse,
} from './agent-conversation';
import { AgentReply } from './agent-reply';
import { AgentPanel, ConversationTitle } from './agent-panel';
import { AgentDockButton } from './agent-dock-button';
import { AgentMerge } from './agent-merge';
import { type UnderstandingItem, failureMessage, platform, PlatformError } from './platform-api';
import { installedWebCapabilities } from './web-capabilities';
import { PreviewRuntime } from './preview-runtime';
import './agent-creation.css';

type WorkingCopy = Pick<FormDraft, 'text' | 'appliedDigest' | 'name' | 'versionName'>;
const empty: WorkingCopy = { text: '', appliedDigest: '', name: '', versionName: '' };
function workingCopy(draft: FormDraft): WorkingCopy {
  return {
    text: draft.text,
    appliedDigest: draft.appliedDigest,
    name: draft.name,
    versionName: draft.versionName,
  };
}

export function AgentCreation({
  resumeId,
  draftId,
  owner,
  space,
  close,
  saved,
  onConversationChange,
  onConversationRename,
  conversationTitle,
  presentation,
  initialPanelPosition,
  openAgentPage,
  initialDockPosition,
  panelOpen,
  onPanelPosition,
  onDockPosition,
  onPanelOpenChange,
}: {
  resumeId?: string;
  draftId?: string;
  owner: string;
  space: string;
  close: () => void;
  onConversationChange?: (conversation: AssistantConversation) => void;
  onConversationRename?: (entry: { id: string; title: string }) => void;
  conversationTitle?: { id: string; title: string };
  presentation: 'page' | 'draft' | 'dock';
  initialPanelPosition?: PanelPosition;
  openAgentPage?: () => void;
  initialDockPosition?: PanelPosition;
  panelOpen: boolean;
  onPanelPosition?: (position: PanelPosition) => void;
  onDockPosition?: (position: PanelPosition) => void;
  onPanelOpenChange: (open: boolean) => void;
  saved: (formId: string, workId: string, conversation?: ConversationLink) => void;
}) {
  const panelPosition = useRef<PanelPosition | undefined>(initialPanelPosition);
  const [localId] = useState(() => crypto.randomUUID());
  const id = resumeId ?? localId;
  const path = '/agent-conversations/' + id;
  const [resource, setResource] = useState<FormDraft>();
  const [pendingDelivery, setPendingDelivery] = useState<string>();
  const [missingDraft, setMissingDraft] = useState(false);
  const [editingNameOf, setEditingNameOf] = useState<string>();
  const originalName = useRef('');
  const titleButton = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<WorkingCopy>(empty);
  const [recovery, setRecovery] = useState<WorkingCopy>();
  const [session, setSession] = useState<AssistantConversation>();
  const [message, setMessage] = useState(''),
    [operation, setOperation] = useState(''),
    [error, setError] = useState('');
  const draftStoragePrefix = 'studio-form-draft:' + owner + ':' + space + ':';
  const draftPath = '/form-drafts/' + resource?.id;
  const isDock = presentation === 'dock';
  const isDraftPage = presentation === 'draft';
  const [pending, setPending] = useState(false),
    [review, setReview] = useState(false),
    [profile, setProfile] = useState('desktop');
  const [preview, setPreview] = useState<{
      text: string;
      candidateDigest: string;
      digest: string;
      prepared: ReadonlyPreparedForm;
    }>(),
    [showPreview, setShowPreview] = useState(false),
    [ready, setReady] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sent, setSent] = useState('');
  const [sendFailure, setSendFailure] = useState<{
    input: string;
    originalComposer: boolean;
    description: string;
    retryable: boolean;
  }>();
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(
    (why: string) => {
      setReady(false);
      setConfirmed(false);
      setError(why);
    },
    [setConfirmed],
  );

  const [chatLoad, setChatLoad] = useState({ id: resumeId, finished: false });
  if (chatLoad.id !== resumeId) {
    setChatLoad({ id: resumeId, finished: false });
    if (!resumeId) {
      setSession(undefined);
      setMessage('');
    }
  }
  useEffect(() => {
    if (!resumeId) return;
    let active = true;
    void platform<AssistantConversation>(path)
      .then(
        (chat) => {
          if (!active) return;
          setSession(chat);
          setMessage(chat.pendingInput ?? '');
        },
        (reason) => {
          if (active) setError(failureMessage(reason));
        },
      )
      .finally(() => {
        if (active) setChatLoad({ id: resumeId, finished: true });
      });
    return () => {
      active = false;
    };
  }, [resumeId, path]);
  const draftTurn = session?.turns.findLast((turn) => turn.draftId && !turn.formId);
  const draftReference = draftId ?? draftTurn?.draftId;
  const deliveryTurnId = draftId ? undefined : draftTurn?.turnId;
  const draftConversationPath = draftId ? '' : path;
  const draftLoadKey = draftReference
    ? JSON.stringify([
        draftReference,
        draftId,
        deliveryTurnId,
        draftConversationPath,
        draftStoragePrefix,
      ])
    : undefined;
  const [draftLoad, setDraftLoad] = useState({ key: draftLoadKey, finished: false });
  if (draftLoad.key !== draftLoadKey) {
    setDraftLoad({ key: draftLoadKey, finished: false });
    if (!draftLoadKey) {
      setResource(undefined);
      setDraft(empty);
      setRecovery(undefined);
      setPendingDelivery(undefined);
    }
  }
  useEffect(() => {
    if (!draftReference) return;
    let active = true;
    async function restoreDraft() {
      try {
        let stored: FormDraft;
        if (draftId) {
          stored = await platform<FormDraft>('/form-drafts/' + draftId);
        } else if (deliveryTurnId) {
          const { draft: delivered } = await platform<{ draft: FormDraft | null }>(
            draftConversationPath + '/deliveries/' + deliveryTurnId,
          );
          if (!active) return;
          if (delivered) stored = delivered;
          else {
            setPendingDelivery(deliveryTurnId);
            try {
              stored = await platform<FormDraft>('/form-drafts/' + draftReference);
            } catch (reason) {
              if (reason instanceof PlatformError && reason.status === 404) return;
              throw reason;
            }
          }
        } else return;
        if (!active) return;
        let copy = workingCopy(stored);
        try {
          const cache = JSON.parse(
            sessionStorage.getItem(draftStoragePrefix + stored.id) ?? 'null',
          );
          if (
            cache &&
            typeof cache.copy?.text === 'string' &&
            typeof cache.copy?.appliedDigest === 'string' &&
            typeof cache.copy?.name === 'string' &&
            typeof cache.copy?.versionName === 'string'
          ) {
            if (cache.revision === stored.revision) copy = cache.copy;
            else if (cache.dirty && !stored.formId) setRecovery(cache.copy);
          }
        } catch {
          /* Server checkpoint remains available. */
        }
        setResource(stored);
        setDraft(copy);
      } catch (reason) {
        if (active) setError(failureMessage(reason));
      } finally {
        if (active) setDraftLoad({ key: draftLoadKey, finished: true });
      }
    }
    void restoreDraft();
    return () => {
      active = false;
    };
  }, [
    draftReference,
    draftId,
    deliveryTurnId,
    draftConversationPath,
    draftStoragePrefix,
    draftLoadKey,
  ]);
  const busy =
    operation ||
    (draftLoadKey && !draftLoad.finished
      ? '正在打开工作稿'
      : resumeId && !chatLoad.finished
        ? '正在打开聊天'
        : '');
  useEffect(() => {
    if (!resource || resource.formId || recovery) return;
    try {
      sessionStorage.setItem(
        draftStoragePrefix + resource.id,
        JSON.stringify({
          revision: resource.revision,
          copy: draft,
          dirty: Object.entries(workingCopy(resource)).some(
            ([key, value]) => draft[key as keyof WorkingCopy] !== value,
          ),
        }),
      );
    } catch {
      /* The open workbench can still checkpoint directly to Platform. */
    }
  }, [draft, resource, draftStoragePrefix, recovery]);
  const unfinished = session?.attempts?.filter((a) => a.status !== 'done') ?? [];
  const loadingHistory = !!resumeId && session?.id !== resumeId;
  const activeAttempt = unfinished.some((a) => a.status === 'running' || a.resumable);
  useRunningConversation(
    session,
    '',
    setSession,
    !sent && (!busy || busy === '正在继续处理'),
    busy === '正在继续处理',
  );
  function resumeTurn(turnId: string) {
    void perform('正在继续处理', async () => {
      const next = await platform<TurnResponse>(path + '/turns/' + turnId + '/resume', {});
      setSession(next.conversation);
      onConversationChange?.(next.conversation);
      if (next.draft) {
        setResource(next.draft);
        if (!resource) setDraft(workingCopy(next.draft));
      }
      setSendFailure(undefined);
    });
  }
  const revision = session?.revision ?? 0;
  const candidate = resource?.candidateText;
  const digest = resource?.candidateDigest;
  const isCurrent = !!preview && preview.text === draft.text && preview.candidateDigest === digest;
  const archived = resource?.formId;
  async function checkpoint() {
    if (!resource) throw Error('找不到表单草稿。');
    if (
      Object.entries(workingCopy(resource)).every(
        ([key, value]) => draft[key as keyof WorkingCopy] === value,
      )
    )
      return resource;
    const savedDraft = await platform<FormDraft>(draftPath, {
      method: 'PATCH',
      body: { revision: resource.revision, ...draft },
    });
    setResource(savedDraft);
    return savedDraft;
  }
  async function perform(label: string, fn: () => Promise<void>) {
    setOperation(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof PlatformError && e.detail ? e.detail : failureMessage(e));
    } finally {
      setOperation('');
    }
  }
  function edit(text: string) {
    setInspection(undefined);
    setDraft((d) => ({ ...d, text }));
    setConfirmed(false);
    setPreview(undefined);
  }
  const [items, setItems] = useState<UnderstandingItem[]>([]);
  const retry = useRef<{ id: string; input: string } | null>(null);
  function receive() {
    if (!pendingDelivery) return;
    void perform('正在接收草稿', async () => {
      const { draft: delivered } = await platform<{ draft: FormDraft | null }>(
        path + '/deliveries/' + pendingDelivery + '/receive',
        {},
      );
      if (delivered) {
        setResource(delivered);
        if (!resource) setDraft(workingCopy(delivered));
      } else setMissingDraft(true);
      setPendingDelivery(undefined);
    });
  }
  async function send(value = message, fromComposer = true) {
    const input = value.trim();
    if (!input || busy || pending || activeAttempt || loadingHistory) return false;
    setReplyText('');
    setSendFailure(undefined);
    setItems([]);
    setSent(input);
    if (fromComposer) setMessage('');
    let accepted = false;
    await perform('正在处理消息', async () => {
      try {
        const attached = resource ? await checkpoint() : undefined;
        const payload = {
          revision,
          message: input,
          ...(attached && {
            draftId: attached.id,
            draftRevision: attached.revision,
            workingText: draft.text,
          }),
        };
        const fingerprint = JSON.stringify(payload);
        if (retry.current?.input !== fingerprint)
          retry.current = { id: crypto.randomUUID(), input: fingerprint };
        const turnId = retry.current.id;
        if (presentation === 'page') writeLocation({ page: 'agent', conversation: id }, true);
        const next = await platform<TurnResponse>(path + '/turns', {
          progress: setOperation,
          text: setReplyText,
          reset: () => {
            setItems([]);
            setOperation('正在重新核对需求');
          },
          item: (value) => setItems((previous) => [...previous, value]),
          body: { ...payload, turnId },
        });
        if (!next.conversation.turns.some((t) => t.turnId === turnId))
          throw Error('会话与本轮结果不一致。');
        retry.current = null;
        accepted = true;
        setSession(next.conversation);
        onConversationChange?.(next.conversation);
        if (next.draft) {
          setMissingDraft(false);
          setPendingDelivery(undefined);
          setResource(next.draft);
          if (!resource) setDraft(workingCopy(next.draft));
          if (next.draft.candidateDigest !== digest) {
            setConfirmed(false);
            setPreview(undefined);
          }
        }
      } catch (e) {
        const persisted = await platform<AssistantConversation>(path).catch(() => undefined);
        if (persisted) {
          setSession(persisted);
          onConversationChange?.(persisted);
        }
        if (fromComposer && !persisted?.attempts?.some((a) => a.turnId === retry.current?.id))
          setMessage(input);
        const retryable = !(e instanceof PlatformError) || e.status >= 500;
        setSendFailure({
          input,
          originalComposer: fromComposer,
          description: e instanceof PlatformError && e.detail ? e.detail : failureMessage(e),
          retryable,
        });
      } finally {
        setSent('');
      }
    });
    return accepted;
  }
  const [inspection, setInspection] = useState<{
    success: boolean;
    diagnostics: { message: string; sourcePointer: string; severity?: string }[];
  }>();
  const selectedProfile = useMemo(() => {
    try {
      const views = Object.keys(JSON.parse(draft.text).views ?? {});
      return views.includes(profile) ? profile : views[0];
    } catch {
      return undefined;
    }
  }, [draft.text, profile]);
  const [diagnosticFocus, setDiagnosticFocus] = useState<{ path: string; revision: number }>();
  function locateDiagnostic(pointer: string) {
    let path = pointer || '';
    try {
      const { byPath } = semanticModel(draft.text);
      while (path && !byPath.has(path)) path = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    } catch {
      path = '';
    }
    setDiagnosticFocus((previous) => ({ path, revision: (previous?.revision ?? 0) + 1 }));
  }
  function inspect() {
    void perform('正在检查配置', async () => {
      const result = await platform<NonNullable<typeof inspection>>(draftPath + '/editor/check', {
        body: { text: draft.text, profile: selectedProfile },
      });
      setInspection(result);
      const first = result.diagnostics.find((d) => d.severity === 'error') ?? result.diagnostics[0];
      if (!result.success && first) locateDiagnostic(first.sourcePointer);
    });
  }
  function prepare() {
    void perform('正在编译工作稿', async () => {
      const stored = await checkpoint();
      const target = selectedProfile;
      const next = await platform<{ digest: string; prepared: ReadonlyPreparedForm }>(
        draftPath + '/preview',
        { body: { revision: stored.revision, digest, workingText: draft.text, profile: target } },
      );
      setReady(false);
      setConfirmed(false);
      setPreview({ ...next, text: draft.text, candidateDigest: digest! });
      setShowPreview(true);
    });
  }
  function enterEditor(formId: string, workId: string) {
    saved(
      formId,
      workId,
      session ? { id: session.id, position: panelPosition.current } : undefined,
    );
  }
  function leave() {
    if (!resource || resource.formId) return close();
    void perform('正在保存草稿', async () => {
      await checkpoint();
      sessionStorage.removeItem(draftStoragePrefix + resource.id);
      close();
    });
  }
  function save() {
    if (!resource) return;
    void perform('正在保存', async () => {
      const result = await platform<{ formId: string; workId: string }>(draftPath + '/save', {
        body: {
          revision: resource.revision,
          digest,
          workingText: draft.text,
          previewDigest: preview?.digest,
          name: draft.name,
          versionName: draft.versionName,
        },
      });
      sessionStorage.removeItem(draftStoragePrefix + resource.id);
      enterEditor(result.formId, result.workId);
    });
  }
  const showDraftEditor = !!resource && !isDock && (isDraftPage || !!draftId);
  const floatingPanel = isDock || isDraftPage || showDraftEditor;
  const outstanding = session?.turns.findLast((turn) => turn.result.kind !== 'answer');
  const savedTitle =
    conversationTitle?.id === session?.id ? conversationTitle?.title : session?.title;
  async function renameSession(value: string) {
    if (!session) return;
    const result = await renameConversation(session.id, value);
    setSession((current) =>
      current?.id === result.id ? { ...current, title: result.title } : current,
    );
    onConversationRename?.(result);
  }
  const draftLink =
    resource?.formId && resource.versionId
      ? studioUrl({ form: resource.formId, work: resource.versionId })
      : resource
        ? studioUrl({ page: 'draft', draft: resource.id, conversation: session?.id })
        : undefined;
  const backLabel = !isDraftPage ? '返回对话' : '返回表单列表';
  const nameLocked = busy === '正在保存' || busy === '正在保存草稿';
  const canPreview = !!resource && draft.appliedDigest === digest && !pending && !busy && !archived;
  return (
    <section
      className={'agent-workspace' + (isDock ? ' agent-presentation-dock' : '')}
      data-studio-ui
      data-config-workspace={!isDock || undefined}
      data-presentation={presentation}
    >
      {!isDock && (
        <header className="toolbar page-title">
          <div>
            {(isDraftPage || draftId) && (
              <IconButton
                icon="ChevronLeft"
                aria-label={backLabel}
                title={backLabel}
                disabled={(!!busy && !!resource) || pending}
                onClick={leave}
              />
            )}
            <h1
              className={!showDraftEditor ? 'agent-page-title' : undefined}
              aria-label={showDraftEditor ? draft.name || '表单草稿' : undefined}
            >
              {showDraftEditor && resource && !archived ? (
                editingNameOf === resource.id ? (
                  <Input
                    aria-label="表单名称"
                    maxLength={120}
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    value={draft.name}
                    disabled={nameLocked}
                    onChange={(event) => {
                      const name = event.currentTarget.value;
                      setDraft((current) => ({ ...current, name }));
                    }}
                    onBlur={() => setEditingNameOf(undefined)}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing || !['Enter', 'Escape'].includes(event.key))
                        return;
                      event.preventDefault();
                      if (event.key === 'Escape')
                        setDraft((current) => ({ ...current, name: originalName.current }));
                      setEditingNameOf(undefined);
                      requestAnimationFrame(() => titleButton.current?.focus());
                    }}
                  />
                ) : (
                  <Button
                    ref={titleButton}
                    variant="text"
                    className="draft-name-trigger"
                    aria-label="编辑表单名称"
                    title={draft.name || '表单草稿'}
                    disabled={nameLocked}
                    onClick={() => {
                      originalName.current = draft.name;
                      setEditingNameOf(resource.id);
                    }}
                  >
                    {draft.name || '表单草稿'}
                  </Button>
                )
              ) : showDraftEditor ? (
                draft.name || '表单草稿'
              ) : session ? (
                <ConversationTitle title={savedTitle || '新对话'} onRename={renameSession} />
              ) : (
                savedTitle || '新对话'
              )}
            </h1>
            <small>
              {archived ? '已保存' : showDraftEditor ? '已生成草稿 · 待试填保存' : '对话'}
            </small>
          </div>
          <div className="action-row">
            {showDraftEditor && (
              <>
                {!archived && (
                  <>
                    <label>
                      版本名称{' '}
                      <Input
                        value={draft.versionName}
                        maxLength={80}
                        disabled={busy === '正在保存' || busy === '正在保存草稿'}
                        onChange={(e) => setDraft((d) => ({ ...d, versionName: e.target.value }))}
                      />
                    </label>
                  </>
                )}

                <Button
                  variant="secondary"
                  disabled={!!busy || pending || !!archived}
                  onClick={inspect}
                >
                  检查配置
                </Button>
                <Button variant="secondary" disabled={!canPreview} onClick={prepare}>
                  预览试填
                </Button>
                <Button
                  disabled={!canPreview || !confirmed || !isCurrent || !!message.trim()}
                  onClick={save}
                >
                  保存配置
                </Button>
              </>
            )}
          </div>
        </header>
      )}
      {recovery && resource && (
        <Modal
          title="恢复本机编辑"
          size="wide"
          onClose={() => {
            close();
          }}
          actions={
            <>
              <Button variant="secondary" onClick={() => setRecovery(undefined)}>
                采用服务器草稿
              </Button>
              <Button
                onClick={() => {
                  setDraft({ ...recovery, appliedDigest: resource.appliedDigest });
                  setRecovery(undefined);
                }}
              >
                恢复本机内容
              </Button>
            </>
          }
        >
          <p>其他窗口已更新这份草稿。请核对两个版本，选择继续编辑的内容。</p>
          <details>
            <summary>
              本机编辑 · {recovery.name} · {recovery.versionName}
            </summary>
            <pre>{recovery.text}</pre>
          </details>
          <details>
            <summary>
              服务器草稿 · {resource.name} · {resource.versionName}
            </summary>
            <pre>{resource.text}</pre>
          </details>
        </Modal>
      )}
      {error && <Feedback kind="error">{error}</Feedback>}
      {archived && !isDock ? (
        <section className="surface">
          <h2>已保存「{draft.name || '表单'}」</h2>
          <p>已将确认试填的工作稿保存为首个配置版本。</p>
          <Button onClick={() => resource?.versionId && enterEditor(archived, resource.versionId)}>
            打开已保存的表单
          </Button>
        </section>
      ) : (
        <div inert={busy === '正在保存' || busy === '正在保存草稿'} className="agent-workbench">
          {showDraftEditor && resource && (
            <div className="agent-canvas surface">
              {inspection && (
                <section aria-label="配置检查结果" className="surface">
                  <div className="toolbar">
                    <strong>
                      {inspection.success ? '当前工作稿检查通过' : '当前工作稿检查未通过'}
                    </strong>
                    <Button variant="text" onClick={() => setInspection(undefined)}>
                      关闭
                    </Button>
                  </div>
                  {inspection.diagnostics.map((item, index) => (
                    <div key={index}>
                      <Button variant="text" onClick={() => locateDiagnostic(item.sourcePointer)}>
                        {item.sourcePointer || '/'} · {item.message}
                      </Button>
                    </div>
                  ))}
                </section>
              )}
              <JsonSource
                text={draft.text}
                onChange={edit}
                focusPath={diagnosticFocus}
                initialSection="layout"
                readOnly={false}
                profile={selectedProfile ?? ''}
                onProfile={(value) => {
                  setProfile(value);
                  setConfirmed(false);
                }}
                formPath={draftPath + '/editor'}
                onPendingChange={setPending}
              />
            </div>
          )}
          {floatingPanel && !panelOpen && (
            <AgentDockButton
              initialPosition={initialDockPosition}
              onPosition={onDockPosition}
              onOpen={() => onPanelOpenChange(true)}
            />
          )}
          <AgentPanel
            title={savedTitle || 'Agent 聊天'}
            conversationId={session?.id}
            onRename={session ? renameSession : undefined}
            onExpand={openAgentPage}
            onPosition={(p) => {
              panelPosition.current = p;
              onPanelPosition?.(p);
            }}
            initialPosition={initialPanelPosition}
            open={
              presentation === 'page'
                ? true
                : isDock
                  ? panelOpen
                  : panelOpen || (presentation !== 'draft' && !showDraftEditor)
            }
            floating={floatingPanel}
            jumpToLatest
            onCollapse={() => onPanelOpenChange(false)}
            label="发送消息"
            message={message}
            onMessage={setMessage}
            onSend={() => void send()}
            disabled={!!busy}
            sendDisabled={!!busy || pending || activeAttempt || loadingHistory}
          >
            {!session && !sent && (
              <p>
                {resource
                  ? '可以询问或修改当前草稿。'
                  : '你可以直接提问，也可以描述想创建的表单或粘贴需求文档。'}
              </p>
            )}
            {session && session.turns.length === 0 && !unfinished.length && !sent && (
              <p className="agent-history-empty" role="status">
                此对话目前没有已完成的消息记录。
              </p>
            )}
            {pendingDelivery && (
              <div className="action-row">
                <Button variant="secondary" onClick={receive} disabled={!!busy}>
                  接收草稿
                </Button>
                <Button
                  variant="text"
                  onClick={() => setPendingDelivery(undefined)}
                  disabled={!!busy}
                >
                  忽略此候选
                </Button>
              </div>
            )}
            {missingDraft && <p>此草稿已删除。</p>}
            {session?.turns.map((t) => (
              <section key={t.turnId}>
                <div data-speaker="user">
                  <b>你</b>
                  <AgentReply text={t.message} />
                </div>
                {session?.attempts
                  ?.filter((a) => a.turnId === t.turnId && a.status === 'done')
                  .map((a) => (
                    <AttemptHistory key={a.turnId} attempt={a} disabled />
                  ))}
                {t.result.kind === 'clarification' ? (
                  <AgentInteractionCard title="待你补充" tone="info">
                    <AgentReply text={assistantText(t.result)} />
                  </AgentInteractionCard>
                ) : t.result.kind === 'requirements_unmet' || t.result.kind === 'blocked' ? (
                  <AgentInteractionCard
                    title={t.result.kind === 'blocked' ? '任务阻塞' : '补充材料'}
                    tone="warning"
                    links={
                      t === outstanding && draftLink
                        ? [{ href: draftLink, label: '打开关联工作稿', newTab: true }]
                        : undefined
                    }
                  >
                    <AgentReply text={assistantText(t.result)} />
                    {t.result.issues && t.result.verification && (
                      <AgentIssues issues={t.result.issues} verification={t.result.verification} />
                    )}
                  </AgentInteractionCard>
                ) : (
                  <>
                    <div data-speaker="assistant">
                      <b>表单助手{t.result.kind === 'clarification' ? ' · 待你补充' : ''}</b>
                      <AgentReply text={assistantText(t.result)} />
                    </div>
                    {t.result.issues && t.result.verification && (
                      <AgentIssues issues={t.result.issues} verification={t.result.verification} />
                    )}
                    {t.draftId && draftLink && t.draftId === resource?.id && (
                      <AgentInteractionCard
                        title="关联页面"
                        links={[
                          {
                            href: draftLink,
                            label: resource.name || '打开工作稿',
                            detail: resource.formId ? '表单编辑页' : '草稿页',
                            newTab: true,
                          },
                        ]}
                      />
                    )}
                  </>
                )}
              </section>
            ))}
            {!sent &&
              unfinished.map((attempt) => (
                <AttemptHistory
                  key={attempt.turnId}
                  attempt={attempt}
                  disabled={!!busy || pending}
                  resume={() => resumeTurn(attempt.turnId)}
                />
              ))}
            {showDraftEditor && resource && draft.appliedDigest !== resource.candidateDigest && (
              <Button
                variant="secondary"
                disabled={!!busy || pending}
                onClick={() => setReview(true)}
              >
                对比并应用
              </Button>
            )}
            {sent && (
              <section data-speaker="user">
                <b>你</b>
                <AgentReply text={sent} />
              </section>
            )}
            {sendFailure && !unfinished.length && (
              <AgentInteractionCard title="本轮发送失败">
                <Feedback kind="error">{sendFailure.description}</Feedback>
                {sendFailure.retryable && (
                  <Button
                    variant="secondary"
                    disabled={!!busy || pending}
                    onClick={() => void send(sendFailure.input, sendFailure.originalComposer)}
                  >
                    重试本轮
                  </Button>
                )}
              </AgentInteractionCard>
            )}
            <AgentTurnProgress
              label={busy}
              text={sent ? replyText : ''}
              items={sent ? items : []}
            />
          </AgentPanel>
        </div>
      )}
      {review && candidate && (
        <AgentMerge
          base={resource?.candidateBaseText ?? resource?.text ?? draft.text}
          current={draft.text}
          candidate={candidate}
          onClose={() => setReview(false)}
          onApply={(text) => {
            edit(text);
            setDraft((d) => ({ ...d, appliedDigest: digest! }));
            setReview(false);
          }}
        />
      )}
      {showPreview && preview && (
        <Modal title="工作稿试填" size="wide" onClose={() => setShowPreview(false)}>
          <section aria-label="候选预览">
            <PreviewRuntime
              capabilities={installedWebCapabilities}
              prepared={preview.prepared}
              onReady={onReady}
              onFailure={onFailure}
            />
          </section>
          <Button
            disabled={!ready || !isCurrent}
            onClick={() => {
              setConfirmed(true);
              setShowPreview(false);
            }}
          >
            确认此版试填结果
          </Button>
        </Modal>
      )}
    </section>
  );
}
