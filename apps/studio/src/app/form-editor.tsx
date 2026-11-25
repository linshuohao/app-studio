'use client';
import {
  IconButton,
  Button,
  Feedback,
  Input,
} from '@form-engine/studio-design-components/controls';
import { Menu } from '@form-engine/studio-design-components/menu';
import { Field, FormLayout } from '@form-engine/studio-design-components/form-layout';
import { RecordIdentity } from '../components/record-identity';

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { versionLabel } from './record-labels';
import { CatalogInsert } from './catalog-insert';
import type { CatalogKind } from './catalog-targets';
import {
  conversationKey,
  keepConversation,
  readConversation,
  type ConversationLink,
  type FormReference,
} from './agent-conversation';
import { FormAgentSidebar } from './form-agent-sidebar';
import { AgentDockButton } from './agent-dock-button';
import { semanticModel } from './semantic-model';
import { JsonSource } from './json-source';
import './page-reference.css';
import { writeLocation } from './studio-location';
import { compactJson, displayJson, storageJson } from './format-json';
import { Modal } from './modal';
import { ConfigInspection } from './config-inspection';
import { ConfigDiff } from './config-diff';
import {
  accessDenied,
  failureMessage,
  type OpenForm,
  type VersionSummary,
  outcomeUnknown,
  platform,
} from './platform-api';

import { DraftRecovery } from './draft-recovery';
import type { DraftContent, SaveRequest } from './local-drafts';

export function FormEditor({
  form,
  continuation,
  working,
  userId,
  spaceId,
  canEdit,
  navigating,
  onBack,
  onReference,
  onObjectReference,
  pickingReference = false,
  referencePointer,
  backLabel,
  parked = false,
  onAccessLost,
  onRefreshAccess,
}: {
  userId: string;
  spaceId: string;
  form: OpenForm;
  continuation?: { key: string; conversation: ConversationLink };
  working: { id: string; name: string; history: VersionSummary[]; readOnly: boolean };
  canEdit: boolean;
  navigating: boolean;
  onBack: () => void;
  onReference?: () => void;
  onObjectReference?: (reference: FormReference) => void;
  pickingReference?: boolean;
  referencePointer?: string;
  backLabel: string;
  parked?: boolean;
  onAccessLost: () => void;
  onRefreshAccess: () => Promise<void>;
}) {
  const leavingByButton = useRef(false);
  const [inserting, setInserting] = useState<CatalogKind>();
  const [insertCheck, setInsertCheck] = useState<number>();
  const [diff, setDiff] = useState<{ left: string; right: string }>();
  const [text, setText] = useState(() => displayJson(form.text));
  const acceptedUrl = useRef('');
  const [focusPath, setFocusPath] = useState(() =>
    referencePointer ? { path: referencePointer, revision: 0 } : undefined,
  );
  useEffect(() => {
    acceptedUrl.current = location.pathname + location.search;
  }, []);
  const [showSaveDetails, setShowSaveDetails] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [note, setNote] = useState('');
  const [savedText, setSavedText] = useState(() => displayJson(form.text));
  const [versionId, setVersionId] = useState(form.version?.versionId ?? null);
  const [pending, setPending] = useState<SaveRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inspectionRevision, setInspectionRevision] = useState(0);
  const [profile, setProfile] = useState('');
  const path = `/forms/${form.formId}`;
  const [schemaPending, setSchemaPending] = useState(false);
  const storedText = useMemo(() => storageJson(text), [text]);
  const savedComparison = useMemo(() => storageJson(savedText), [savedText]);
  const dirty = storedText !== savedComparison || note !== '' || pending !== null;
  const hasUnsavedInput = dirty || schemaPending;
  const editable = canEdit && !form.archived && !working.readOnly;
  const chatKey = conversationKey(userId, spaceId, form.formId, working.id);
  const [initialChat, setInitialChat] = useState(
    () =>
      readConversation(chatKey) ??
      (continuation?.key === chatKey ? continuation.conversation : undefined),
  );
  const [previousContinuation, setPreviousContinuation] = useState(continuation);
  const [agentOpen, setAgentOpen] = useState(!!initialChat);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentApplied, setAgentApplied] = useState(false);
  const [confirmedPreview, setConfirmedPreview] = useState<string>();
  const needsPreview = agentApplied && confirmedPreview !== storedText;
  const blocked = agentBusy || busy || navigating;

  if (previousContinuation !== continuation) {
    setPreviousContinuation(continuation);
    if (previousContinuation?.key === chatKey && !continuation) {
      setInitialChat(undefined);
      setAgentOpen(false);
    } else if (continuation?.key === chatKey) {
      if (initialChat?.id !== continuation.conversation.id)
        setInitialChat(continuation.conversation);
      setAgentOpen(true);
    }
  }

  const draftContent = useMemo(
    () => ({
      text,
      note,
      versionId,
      savedText,
      pending,
      agentApplied,
    }),
    [text, note, versionId, savedText, pending, agentApplied],
  );
  useEffect(() => {
    if (!hasUnsavedInput) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedInput]);

  useEffect(() => {
    const guard = (event: PopStateEvent) => {
      if (parked) return;
      if (leavingByButton.current) {
        leavingByButton.current = false;
        return;
      }
      const destination = new URLSearchParams(window.location.search);
      if (
        (destination.get('form') !== form.formId || destination.get('work') !== working.id) &&
        (hasUnsavedInput || busy)
      ) {
        if (!window.confirm('当前有未保存的更改或待确认请求，确定离开？')) {
          event.stopImmediatePropagation();
          window.history.pushState(null, '', acceptedUrl.current);
        }
      }
    };
    window.addEventListener('popstate', guard, true);
    return () => window.removeEventListener('popstate', guard, true);
  }, [parked, hasUnsavedInput, busy, form.formId, working.id]);

  function leave(action: () => void) {
    if (!hasUnsavedInput || window.confirm('当前有未保存的配置，确定离开编辑？')) action();
  }

  const checkpoint = useRef<{ persist: (content: DraftContent) => Promise<void> }>(null);
  async function save() {
    if (blocked || (needsPreview && !pending) || schemaPending || !editable) return;
    if (!dirty && versionId !== null) {
      setAlreadySaved(true);
      return;
    }
    setAlreadySaved(false);
    if (!pending) {
      try {
        compactJson(text);
      } catch {
        setError('JSON 格式无效，请修复后再保存。');
        return;
      }
    }
    const snapshot = pending ?? {
      key: crypto.randomUUID(),
      text: storedText,
      basedOnVersionId: versionId,
      note,
    };
    setPending(snapshot);
    setBusy(true);
    setError('');
    try {
      await checkpoint.current?.persist({ ...draftContent, pending: snapshot });
      const result = await platform<{ versionId: string }>(`/forms/${form.formId}/versions`, {
        key: snapshot.key,
        body: {
          workId: working.id,
          text: snapshot.text,
          basedOnVersionId: snapshot.basedOnVersionId,
          ...(snapshot.note && { note: snapshot.note }),
          ...(snapshot.name && { name: snapshot.name }),
        },
      });
      setSavedText(snapshot.text);
      setAgentApplied(false);
      setNote((current) => (current === snapshot.note ? '' : current));
      setVersionId(result.versionId);
      setPending(null);
    } catch (error) {
      if (!outcomeUnknown(error) && (!pending || !accessDenied(error))) setPending(null);
      if (accessDenied(error)) onAccessLost();
      setError(failureMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const [referenceError, setReferenceError] = useState('');
  const canPickObject = pickingReference && !!versionId && !hasUnsavedInput && !blocked;
  function pickObject(event: SyntheticEvent) {
    if (!canPickObject || !(event.target instanceof Element)) return;
    const element = event.target.closest<HTMLElement>('[data-reference-path]');
    const pointer = element?.dataset.referencePath;
    if (!element || !pointer || !versionId) return;
    event.preventDefault();
    event.stopPropagation();
    const model = semanticModel(savedText);
    if (!model?.byPath.has(pointer) || model.ambiguous.has(pointer)) {
      setReferenceError('此对象无法在已保存配置中唯一定位。');
      return;
    }
    const version = working.history.find((row) => row.versionId === versionId) ?? form.version;
    setReferenceError('');
    onObjectReference?.({
      formId: form.formId,
      versionId,
      name: form.name,
      versionName: version?.versionId === versionId ? version.name : undefined,
      savedAt: version?.versionId === versionId ? version.savedAt : '',
      pointer,
      objectLabel: element.dataset.referenceLabel,
    });
  }
  const inspection = editable || (versionId && !dirty);

  return (
    <>
      <div className="toolbar page-title editor-title" data-config-workspace>
        <div>
          <IconButton
            icon="ChevronLeft"
            aria-label={backLabel}
            title={backLabel}
            disabled={blocked}
            onClick={() =>
              leave(() => {
                leavingByButton.current = true;
                onBack();
              })
            }
          />
          <h1>
            {working.name}
            {form.archived ? '（已归档）' : ''}
          </h1>
          <p className="badge" role="status">
            {!editable
              ? '只读配置'
              : busy
                ? '正在保存…'
                : pending
                  ? '保存结果待确认'
                  : schemaPending
                    ? '请先应用或取消当前分区的修改'
                    : needsPreview
                      ? '请先预览并确认试填结果'
                      : dirty
                        ? '有未保存的更改'
                        : versionId
                          ? alreadySaved
                            ? '当前配置已保存，无需重复保存'
                            : '已保存'
                          : '尚无配置版本'}
          </p>
        </div>
        <div className="action-row">
          {editable && (
            <Menu.Root>
              <Menu.Trigger>更多操作</Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner>
                  <Menu.Popup>
                    <Menu.Item disabled={blocked} onClick={() => setAgentOpen(!agentOpen)}>
                      Agent 协作
                    </Menu.Item>
                    <Menu.Item onClick={() => setShowSaveDetails(true)}>保存备注</Menu.Item>
                    {versionId && (
                      <Menu.Item onClick={() => setDiff({ left: versionId, right: 'draft' })}>
                        查看改动
                      </Menu.Item>
                    )}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          )}
          {inspection && (
            <ConfigInspection
              autoCheck={editable && insertCheck === inspectionRevision}
              key={`${inspectionRevision}:${editable}`}
              path={path}
              input={editable ? { text: storedText } : { versionId: versionId! }}
              confirmTrial={agentApplied ? (value) => setConfirmedPreview(value) : undefined}
              canCheck={editable}
              disabled={blocked || schemaPending}
              sourceText={text}
              profile={profile}
              onProfile={setProfile}
              onLocate={(path) =>
                setFocusPath((current) => ({ path, revision: (current?.revision ?? 0) + 1 }))
              }
            />
          )}
          {editable && (
            <>
              <Button
                type="button"
                className="workspace-save"
                onClick={() => void save()}
                disabled={blocked || (needsPreview && !pending) || schemaPending}
              >
                {busy && pending ? '正在保存…' : pending ? '重试本次保存' : '保存配置'}
              </Button>
            </>
          )}
          {onReference && (
            <Button variant="secondary" onClick={onReference}>
              引用到 Agent
            </Button>
          )}
          {!editable && versionId && (
            <Button variant="secondary" onClick={() => setShowSaveDetails(true)}>
              版本信息
            </Button>
          )}
          {showSaveDetails && (
            <Modal
              title={editable ? '保存备注' : '版本信息'}
              size="standard"
              onClose={() => setShowSaveDetails(false)}
            >
              <FormLayout density="dense">
                {editable && (
                  <Field label="保存备注（选填）">
                    {(control) => (
                      <Input
                        {...control}
                        name="note"
                        autoComplete="off"
                        maxLength={300}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                    )}
                  </Field>
                )}
                {versionId && (
                  <div className="version">
                    配置版本{' '}
                    <strong>
                      {versionLabel(
                        working.history.find((v) => v.versionId === versionId) ?? form.version,
                      )}
                    </strong>
                    <RecordIdentity id={versionId} />
                  </div>
                )}
              </FormLayout>
            </Modal>
          )}
        </div>
      </div>
      {editable && (
        <DraftRecovery
          checkpointRef={checkpoint}
          userId={userId}
          spaceId={spaceId}
          formId={form.formId}
          workId={working.id}
          content={draftContent}
          protect={dirty}
          currentId={working.history[0]?.versionId ?? form.version?.versionId ?? null}
          versions={working.history}
          disabled={blocked}
          onRestore={(row) => {
            setText(row.text);
            setAgentApplied(!!row.agentApplied);
            setConfirmedPreview(undefined);
            setNote(row.note);
            setVersionId(row.versionId);
            setSavedText(row.savedText);
            setPending(row.pending);
            setInspectionRevision((v) => v + 1);
            setError('');
            writeLocation({ form: form.formId, work: working.id });
            acceptedUrl.current = location.pathname + location.search;
          }}
        />
      )}
      {error && <Feedback kind="error">{error}</Feedback>}
      {diff && (
        <ConfigDiff
          path={path}
          initialLeft={diff.left}
          initialRight={diff.right}
          versions={working.history}
          draft={text}
          choose={false}
          onClose={() => setDiff(undefined)}
        />
      )}
      <div className="workbench-grid">
        <section className="surface editor">
          {editable && (
            <FormAgentSidebar
              key={initialChat?.id ?? 'new'}
              chatKey={chatKey}
              initialChat={initialChat}
              open={agentOpen}
              onCollapse={() => setAgentOpen(false)}
              needsPreview={needsPreview}
              formId={form.formId}
              workId={working.id}
              source={storedText}
              locked={agentBusy}
              disabled={schemaPending || busy || navigating || !!pending}
              setLocked={setAgentBusy}
              apply={(value) => {
                setText(displayJson(value));
                setAgentApplied(true);
                setConfirmedPreview(undefined);
                setInspectionRevision((r) => r + 1);
              }}
            />
          )}
          {editable && !agentOpen && initialChat && (
            <AgentDockButton
              initialPosition={initialChat.position}
              onPosition={(position) => {
                const link = { id: initialChat.id, position };
                setInitialChat(link);
                keepConversation(chatKey, link);
              }}
              onOpen={() => setAgentOpen(true)}
            />
          )}
          {pickingReference && (
            <Feedback kind="status">
              {canPickObject
                ? '点选高亮的字段、控件或规则。按 Escape 退出。'
                : '请先保存当前配置，再引用页面对象。'}
            </Feedback>
          )}
          {pickingReference && referenceError && <Feedback kind="error">{referenceError}</Feedback>}
          <div
            className="design-source"
            inert={agentBusy || navigating}
            data-pick-reference={canPickObject || undefined}
            onClickCapture={pickObject}
            onDragStartCapture={(event) => {
              if (
                canPickObject &&
                event.target instanceof Element &&
                event.target.closest('[data-reference-path]')
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onKeyDownCapture={(event) => {
              if (
                (event.key === 'Enter' || event.key === ' ') &&
                event.target instanceof HTMLElement &&
                event.target.matches('article[data-reference-path]')
              )
                pickObject(event);
            }}
          >
            <JsonSource
              formPath={path}
              profile={profile}
              onProfile={setProfile}
              onPendingChange={setSchemaPending}
              renderActions={(change, disabled) => (
                <div className="action-row">
                  <button
                    className="quiet"
                    disabled={disabled}
                    onClick={() => setInserting('materials')}
                  >
                    添加物料
                  </button>
                  <button
                    className="quiet"
                    disabled={disabled}
                    onClick={() => setInserting('functions')}
                  >
                    插入函数
                  </button>
                  {inserting && (
                    <CatalogInsert
                      kind={inserting}
                      text={text}
                      onClose={() => setInserting(undefined)}
                      onApply={(source, next, path) => {
                        if (source !== text || !editable || blocked) return;
                        change(next);
                        setInserting(undefined);
                        setFocusPath({ path, revision: inspectionRevision + 1 });
                        setInsertCheck(inspectionRevision + 1);
                      }}
                    />
                  )}
                </div>
              )}

              focusPath={focusPath}
              pickingReference={canPickObject}
              text={text}
              readOnly={!editable}
              onChange={(value) => {
                setText(value);
                if (storageJson(value) !== storageJson(text))
                  setInspectionRevision((revision) => revision + 1);
              }}
            />
          </div>
          <div className="editor-details">
            <div className="action-row">
              {!editable && !form.archived && dirty && (
                <button
                  type="button"
                  className="quiet"
                  disabled={navigating}
                  onClick={() => void onRefreshAccess()}
                >
                  刷新访问权限
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
