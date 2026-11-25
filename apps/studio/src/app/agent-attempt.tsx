'use client';
import { AgentUserMessage } from './agent-panel';
import { useEffect } from 'react';
import { Button } from '@form-engine/studio-design-components';
import { AgentMessage, AgentReply } from './agent-reply';
import type { AssistantConversation, TurnAttempt } from './agent-conversation';
import { platform, type ComposePhase } from './platform-api';

const stageLabels: Record<ComposePhase['stage'], string> = {
  schema: 'Schema',
  capabilities: '匹配物料与能力',
  view: '视图',
  validation: '校验',
  reaction: '联动',
  compile: '编译',
};
const statusLabels: Record<ComposePhase['status'], string> = {
  started: '处理中',
  completed: '已完成',
  retrying: '重试中',
  failed: '未通过',
};

function latestPhases(events: ComposePhase[]) {
  return new Map(events.map((event) => [event.stage, event]));
}

export function ComposeProgress({
  events,
  stopped = false,
}: {
  events: ComposePhase[];
  stopped?: boolean;
}) {
  if (!events.length) return null;
  const phases = latestPhases(events);
  return (
    <ul aria-label="表单生成进度" aria-live="polite" aria-relevant="additions text">
      {(Object.keys(stageLabels) as ComposePhase['stage'][]).map((stage) => {
        const event = phases.get(stage);
        if (stage === 'capabilities' && !event) return null;
        const status = event?.status;
        const label =
          stopped && (status === 'started' || status === 'retrying')
            ? '未完成'
            : status
              ? statusLabels[status]
              : stopped
                ? '未执行'
                : '等待开始';
        return (
          <li key={stage}>
            {stageLabels[stage]} · {label}
            {event?.attempt && (status === 'retrying' || stopped)
              ? `（第 ${event.attempt} 次）`
              : ''}
            {event?.detail ? ` · ${event.detail}` : ''}
          </li>
        );
      })}
    </ul>
  );
}

export function useRunningConversation(
  chat: AssistantConversation | undefined,
  scope: string,
  update: (value: AssistantConversation) => void,
  enabled: boolean,
) {
  const id =
    enabled && chat && chat.attempts?.some((a) => a.status === 'running') ? chat.id : undefined;
  useEffect(() => {
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await platform<AssistantConversation>('/agent-conversations/' + id + scope);
        if (active) update(next);
      } finally {
        if (active) timer = setTimeout(() => void refresh().catch(() => {}), 2000);
      }
    }
    timer = setTimeout(() => void refresh().catch(() => {}), 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, scope, update]);
}

export function AttemptHistory({
  attempt,
  disabled,
  resume,
  livePhases,
}: {
  attempt: TurnAttempt;
  disabled: boolean;
  resume?: () => void;
  livePhases?: ComposePhase[];
}) {
  let partial = '';
  let lastProgress = '';
  const entries: string[] = [];
  const phases: ComposePhase[] = [];
  for (const event of attempt.events) {
    if (event.type === 'progress') {
      lastProgress = event.message;
      entries.push(event.message);
    }
    if (event.type === 'compose_phase') {
      phases.push(event);
      entries.push(
        `${stageLabels[event.stage]} · ${statusLabels[event.status]}` +
          (event.attempt ? `（第 ${event.attempt} 次）` : '') +
          (event.detail ? ` · ${event.detail}` : ''),
      );
    }
    if (event.type === 'understanding_reset') entries.push('重新核对需求');
    if (event.type === 'understanding_item') entries.push(event.text);
    if (event.type === 'text_reset') partial = '';
    if (event.type === 'text_delta') partial += event.delta;
  }
  const done = attempt.status === 'done';
  const interrupted = attempt.status === 'interrupted' && !livePhases;
  if (livePhases) phases.push(...livePhases);
  const latest = [...latestPhases(phases).values()];
  const active = latest.filter(({ status }) => status === 'started' || status === 'retrying');
  const failed = latest.filter(({ status }) => status === 'failed');
  const location =
    [...active, ...failed].map(({ stage }) => stageLabels[stage]).join('、') ||
    lastProgress ||
    '准备执行';
  return (
    <section>
      {!done && <AgentUserMessage text={attempt.message} references={attempt.references} />}
      {!done && <ComposeProgress events={phases} stopped={interrupted} />}
      {!!entries.length && (
        <details open={!done && !phases.length}>
          <summary>处理过程</summary>
          <ol>
            {entries.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ol>
        </details>
      )}
      {!done && partial && (
        <AgentMessage text={partial}>
          <AgentReply text={partial} />
        </AgentMessage>
      )}
      {attempt.status === 'running' && <p role="status">{lastProgress || '正在处理'}</p>}
      {interrupted && (
        <p role="status">
          中断位置：{location}。{attempt.interruptionReason ?? '本轮未留下具体中断原因。'}
          {attempt.resumable ? '可以继续本轮。' : '本轮无法继续，请重新发送。'}
        </p>
      )}
      {resume && attempt.resumable && interrupted && (
        <Button disabled={disabled} onClick={resume}>
          继续处理
        </Button>
      )}
    </section>
  );
}
