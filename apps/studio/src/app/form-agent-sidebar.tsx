'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@form-engine/studio-design-components';
import { AttemptHistory, useRunningConversation } from './agent-attempt';
import { AgentIssues } from './agent-issues';
import { AgentReply, AgentCandidateCard, AgentMessage } from './agent-reply';
import { AgentCandidateGuide } from './agent-candidate-guide';
import { renameConversation } from './agent-conversation';
import { AgentPanel, AgentUserMessage } from './agent-panel';
import { AgentMerge } from './agent-merge';
import { platform, failureMessage, PlatformError, type TurnEvent } from './platform-api';
import {
  assistantText,
  addReference,
  referenceId,
  referenceRequest,
  type MessageReference,
  keepConversation,
  type ConversationLink,
  type AssistantConversation,
  type TurnResponse,
  type EditorProposal,
} from './agent-conversation';

export function FormAgentSidebar({
  chatKey,
  initialChat,
  open,
  onCollapse,
  needsPreview,
  formId,
  workId,
  source,
  locked,
  disabled,
  setLocked,
  apply,
}: {
  chatKey: string;
  initialChat?: ConversationLink;
  open: boolean;
  onCollapse: () => void;
  needsPreview: boolean;
  formId: string;
  workId: string;
  source: string;
  locked: boolean;
  disabled: boolean;
  setLocked: (busy: boolean) => void;
  apply: (text: string) => void;
}) {
  const [conversation, setConversation] = useState<AssistantConversation>();
  const [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [proposal, setProposal] = useState<EditorProposal>();
  const [sent, setSent] = useState('');
  const [references, setReferences] = useState<MessageReference[]>([]);
  const submitting = useRef(false);
  const [turnEvents, setTurnEvents] = useState<TurnEvent[]>([]);
  const [resumingTurn, setResumingTurn] = useState<string>();
  function recordTurnEvent(event: TurnEvent) {
    setTurnEvents((previous) => [...previous, event]);
  }
  const [review, setReview] = useState(false),
    [loaded, setLoaded] = useState(false);
  const conversationId = useRef(initialChat?.id);
  const position = useRef(initialChat?.position);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const scope = '?' + new URLSearchParams({ formId, workId });
  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    async function restore() {
      try {
        let next: AssistantConversation | undefined;
        if (conversationId.current) {
          try {
            next = await platform<AssistantConversation>(
              '/agent-conversations/' + conversationId.current + scope,
            );
          } catch (e) {
            if (!(e instanceof PlatformError && e.status === 404)) throw e;
          }
        }
        if (!next) {
          const list = await platform<{ id: string }[]>('/agent-conversations' + scope);
          if (list[0])
            next = await platform<AssistantConversation>(
              '/agent-conversations/' + list[0].id + scope,
            );
        }
        if (!active) return;
        conversationId.current = next?.id;
        setConversation(next);
        if (next?.pendingInput) setMessage(next.pendingInput);
        if (next) {
          keepConversation(chatKey, { id: next.id, position: position.current });
        } else keepConversation(chatKey, undefined);
        if (active) setLoaded(true);
      } catch (e) {
        if (active) setError(failureMessage(e));
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, [open, loaded, scope, formId, chatKey]);
  const latestProposal = conversation?.turns.findLast(
    (turn) => turn.result.kind === 'proposal' && turn.formId === formId,
  )?.turnId;
  const currentId = conversation?.id;
  useEffect(() => {
    if (
      !open ||
      !currentId ||
      !latestProposal ||
      sessionStorage.getItem(chatKey + ':reviewed') === latestProposal
    )
      return;
    let active = true;
    void platform<{ editorProposal?: EditorProposal }>(
      '/agent-conversations/' + currentId + '/deliveries/' + latestProposal + scope,
    ).then(
      (value) => {
        if (active && value.editorProposal) setProposal(value.editorProposal);
      },
      (reason) => {
        if (active) setError(failureMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [open, currentId, latestProposal, chatKey, scope]);
  const unfinished = conversation?.attempts?.filter((a) => a.status !== 'done') ?? [];
  const activeAttempt = unfinished.some((a) => a.status === 'running' || a.resumable);
  useRunningConversation(conversation, scope, setConversation, open && !sent && !resumingTurn);
  async function resumeTurn(turnId: string) {
    if (!conversation || locked || disabled) return;
    setLocked(true);
    setError('');
    setTurnEvents([]);
    setResumingTurn(turnId);
    try {
      const next = await platform<TurnResponse>(
        '/agent-conversations/' + conversation.id + '/turns/' + turnId + '/resume',
        { onTurnEvent: recordTurnEvent },
      );
      setConversation(next.conversation);
      if (next.editorProposal) setProposal(next.editorProposal);
    } catch (e) {
      const persisted = await platform<AssistantConversation>(
        '/agent-conversations/' + conversation.id + scope,
      ).catch(() => undefined);
      if (persisted) setConversation(persisted);
      setError(e instanceof PlatformError && e.detail ? e.detail : failureMessage(e));
    } finally {
      setLocked(false);
      setResumingTurn(undefined);
    }
  }
  async function send() {
    const content = message.trim();
    if (!content || !loaded || disabled || locked || activeAttempt || submitting.current) return;
    submitting.current = true;
    const id = conversationId.current ?? crypto.randomUUID();
    conversationId.current = id;
    const payload = {
      revision: conversation?.revision ?? 0,
      message: content,
      formId,
      workId,
      workingText: source,
      ...(references.length && { references: references.map(referenceRequest) }),
    };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { id: crypto.randomUUID(), fingerprint };
    setSent(content);
    setMessage('');
    setTurnEvents([]);
    setError('');
    setLocked(true);
    try {
      const result = await platform<TurnResponse>('/agent-conversations/' + id + '/turns', {
        onTurnEvent: recordTurnEvent,
        body: { ...payload, turnId: retry.current.id },
      });
      setConversation(result.conversation);
      setReferences([]);
      if (result.editorProposal) setProposal(result.editorProposal);
      keepConversation(chatKey, { id, position: position.current });
      retry.current = null;
    } catch (e) {
      setError(e instanceof PlatformError && e.detail ? e.detail : failureMessage(e));
      const persisted = await platform<AssistantConversation>(
        '/agent-conversations/' + id + scope,
      ).catch(() => undefined);
      if (persisted) {
        setConversation(persisted);
        keepConversation(chatKey, { id, position: position.current });
      }
      if (
        persisted?.attempts?.some((a) => a.turnId === retry.current?.id) ||
        persisted?.turns.some((t) => t.turnId === retry.current?.id)
      )
        setReferences([]);
      else setMessage(content);
    } finally {
      setLocked(false);
      setSent('');
      submitting.current = false;
    }
  }
  function clearProposal() {
    if (proposal)
      try {
        sessionStorage.setItem(chatKey + ':reviewed', proposal.turnId);
      } catch {
        /* Active panel retains the decision. */
      }
    setProposal(undefined);
  }
  return (
    <>
      <AgentPanel
        title={conversation?.title}
        conversationId={conversation?.id}
        onRename={
          conversation
            ? async (value) => {
                const result = await renameConversation(conversation.id, value);
                setConversation((current) =>
                  current?.id === result.id ? { ...current, title: result.title } : current,
                );
              }
            : undefined
        }
        initialPosition={initialChat?.position}
        open={open}
        jumpToLatest
        onCollapse={onCollapse}
        onPosition={(p) => {
          position.current = p;
          if (conversation) keepConversation(chatKey, { id: conversation.id, position: p });
        }}
        label="修改要求"
        message={message}
        onMessage={setMessage}
        references={references}
        onReference={(reference) => setReferences((items) => addReference(items, reference))}
        onRemoveReference={(id) =>
          setReferences((items) => items.filter((item) => referenceId(item) !== id))
        }
        onSend={send}
        sendLabel="发送修改要求"
        disabled={locked}
        sendDisabled={!loaded || disabled || locked || activeAttempt}
      >
        {conversation?.turns.map((t) => (
          <section key={t.turnId}>
            <AgentUserMessage text={t.message} references={t.references} />
            {conversation?.attempts
              ?.filter((a) => a.turnId === t.turnId && a.status === 'done')
              .map((a) => (
                <AttemptHistory key={a.turnId} attempt={a} disabled />
              ))}
            {t.result.kind === 'proposal' && t.result.candidateGuide ? (
              <AgentCandidateGuide
                guide={t.result.candidateGuide}
                conversationId={conversation.id}
                turnId={t.turnId}
              >
                {proposal?.turnId === t.turnId && (
                  <div className="agent-candidate-actions">
                    <Button
                      variant="secondary"
                      disabled={disabled || locked}
                      onClick={() => setReview(true)}
                    >
                      对比并应用候选
                    </Button>
                    <Button variant="text" disabled={disabled || locked} onClick={clearProposal}>
                      放弃候选
                    </Button>
                  </div>
                )}
              </AgentCandidateGuide>
            ) : (
              <AgentMessage text={assistantText(t.result)}>
                <div data-speaker="assistant">
                  <b>表单助手</b>
                  <AgentReply text={assistantText(t.result)} />
                  {t.result.issues && t.result.verification && (
                    <AgentIssues issues={t.result.issues} verification={t.result.verification} />
                  )}
                </div>
                {t.result.kind === 'proposal' && (
                  <AgentCandidateCard>
                    <strong>表单候选配置</strong>
                    {proposal?.turnId === t.turnId && (
                      <div className="agent-candidate-actions">
                        <Button
                          variant="secondary"
                          disabled={disabled || locked}
                          onClick={() => setReview(true)}
                        >
                          对比并应用候选
                        </Button>
                        <Button
                          variant="text"
                          disabled={disabled || locked}
                          onClick={clearProposal}
                        >
                          放弃候选
                        </Button>
                      </div>
                    )}
                  </AgentCandidateCard>
                )}
              </AgentMessage>
            )}
          </section>
        ))}
        {!sent &&
          unfinished.map((attempt) => (
            <AttemptHistory
              key={attempt.turnId}
              attempt={attempt}
              disabled={locked || disabled}
              liveEvents={resumingTurn === attempt.turnId ? turnEvents : undefined}
              resume={() => void resumeTurn(attempt.turnId)}
            />
          ))}
        {sent && (
          <AttemptHistory
            attempt={{ message: sent, status: 'running', resumable: false, events: turnEvents }}
            disabled
          />
        )}
        {error && <p role="alert">{error}</p>}
        {needsPreview && <p>请在配置预览中试填并确认，再保存。</p>}
      </AgentPanel>
      {review && proposal && (
        <AgentMerge
          base={proposal.candidateBaseText ?? source}
          current={source}
          candidate={proposal.candidateText}
          onClose={() => setReview(false)}
          onApply={(text) => {
            if (disabled || locked) return;
            apply(text);
            clearProposal();
            setReview(false);
          }}
        />
      )}
    </>
  );
}
