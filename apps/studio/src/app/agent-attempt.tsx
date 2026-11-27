'use client';
import { AgentUserMessage } from './agent-panel';
import { useEffect } from 'react';
import { Button } from '@form-engine/studio-design-components';
import { AgentMessage, AgentReply, CopyTextButton } from './agent-reply';
import type { AssistantConversation, TurnAttempt } from './agent-conversation';
import { platform, type ComposePhase, type TurnEvent } from './platform-api';

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
const runningLabels: Record<ComposePhase['stage'], string> = {
  schema: '生成并检查数据 Schema',
  capabilities: '匹配表单物料与纯函数',
  view: '生成视图片段',
  validation: '生成校验规则',
  reaction: '生成联动规则',
  compile: '编译整表候选',
};

type ProcessStage = ComposePhase['stage'] | 'understand' | 'general';
type StageRecord = { entries: string[]; latest?: ComposePhase };
const completionLabels: Record<ComposePhase['stage'], string> = {
  schema: '数据 Schema 已通过检查。',
  capabilities: '已核对目标物料与纯函数。',
  view: '视图片段已完成模块检查。',
  validation: '校验配置检查完成。',
  reaction: '联动配置检查完成。',
  compile: '表单候选已通过整表编译。',
};

function elapsedLabel(ms: number) {
  if (ms < 1000) return '用时不到 1 秒';
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return (
    '用时 ' +
    [hours && `${hours} 小时`, minutes && `${minutes} 分钟`, `${seconds % 60} 秒`]
      .filter(Boolean)
      .join(' ')
  );
}

function StageDetails({
  stage,
  record: { entries, latest },
  interrupted = false,
}: {
  stage: ProcessStage;
  record: StageRecord;
  interrupted?: boolean;
}) {
  const label =
    stage === 'general' ? '准备与执行' : stage === 'understand' ? '需求理解' : stageLabels[stage];
  const status = latest?.status;
  const stopped = interrupted && (status === 'started' || status === 'retrying');
  return (
    <details className="agent-attempt-stage">
      <summary>
        {label}
        {status && ` · ${stopped ? '未完成' : statusLabels[status]}`}
      </summary>
      <ol>
        {entries.map((entry, index) => (
          <li key={index}>{entry}</li>
        ))}
      </ol>
    </details>
  );
}

function describeActivePhase({ stage, status, attempt }: ComposePhase) {
  if (status !== 'retrying') return '正在' + runningLabels[stage];
  const action =
    stage === 'compile' ? '正在修复候选，准备重新编译' : '正在重试' + runningLabels[stage];
  return action + (attempt ? `（第 ${attempt} 次）` : '');
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
  liveEvents,
}: {
  attempt: Omit<TurnAttempt, 'turnId'>;
  disabled: boolean;
  resume?: () => void;
  liveEvents?: TurnEvent[];
}) {
  let partial = '';
  let lastProgress = '';
  let latestMilestone: 'progress' | 'phase' | undefined;
  let lastPhase: ComposePhase | undefined;
  const phases = new Map<ProcessStage, StageRecord>();
  function record(stage: ProcessStage, entry: string, latest?: ComposePhase) {
    const group = phases.get(stage);
    if (!group) {
      phases.set(stage, { entries: [entry], latest });
      return;
    }
    group.entries.push(entry);
    if (latest) group.latest = latest;
  }
  const events = liveEvents ? [...attempt.events, ...liveEvents] : attempt.events;
  const lastUnderstandingReset = events.findLastIndex(({ type }) => type === 'understanding_reset');
  for (const [index, event] of events.entries()) {
    if (event.type === 'progress') {
      lastProgress = event.message;
      latestMilestone = 'progress';
      record(event.stage ?? 'general', event.message);
    }
    if (event.type === 'compose_phase') {
      lastPhase = event;
      latestMilestone = 'phase';
      record(
        event.stage,
        statusLabels[event.status] +
          (event.attempt ? `（第 ${event.attempt} 次）` : '') +
          (event.detail ? ` · ${event.detail}` : ''),
        event,
      );
    }
    if (event.type === 'understanding_reset') {
      lastProgress = '正在重新核对需求';
      latestMilestone = 'progress';
      record('understand', '重新核对需求');
    }
    if (event.type === 'understanding_item' && index > lastUnderstandingReset)
      record('understand', event.kind === 'question' ? '待确认：' + event.text : event.text);
    if (event.type === 'text_reset') partial = '';
    if (event.type === 'text_delta') partial += event.delta;
  }
  const done = attempt.status === 'done';
  const running = attempt.status === 'running' || !!liveEvents;
  const interrupted = attempt.status === 'interrupted' && !running;
  const latest = [...phases.values()].flatMap(({ latest }) => (latest ? [latest] : []));
  const active = latest.filter(({ status }) => status === 'started' || status === 'retrying');
  const failed = latest.filter(({ status }) => status === 'failed');
  const location =
    (latestMilestone === 'progress' && lastProgress) ||
    (active.length ? active : failed).map(({ stage }) => stageLabels[stage]).join('、') ||
    lastProgress ||
    (liveEvents ? '正在继续处理' : '正在处理消息');
  const stage = lastPhase ? stageLabels[lastPhase.stage] : '回复';
  const outcome = interrupted ? '处理中断' : lastPhase?.status === 'failed' ? '未通过' : '已结束';
  const completed = [...phases].filter(([, phase]) => phase.latest?.status === 'completed');
  const processGroups = running
    ? [...phases].filter(([, phase]) => phase.latest?.status !== 'completed')
    : [...phases];
  const finishedLabel = [
    attempt.elapsedMs !== undefined && elapsedLabel(attempt.elapsedMs),
    stage,
    outcome,
  ]
    .filter(Boolean)
    .join(' · ');
  const currentPhase = active.find((phase) => phase === lastPhase) ?? active.at(-1);
  const runningLabel =
    (latestMilestone === 'progress' && lastProgress) ||
    (currentPhase
      ? describeActivePhase(currentPhase)
      : lastPhase
        ? `${stage} · ${statusLabels[lastPhase.status]}`
        : location);
  return (
    <section>
      {!done && <AgentUserMessage text={attempt.message} references={attempt.references} />}
      {!done && partial && (
        <AgentMessage text={partial}>
          <div data-speaker="assistant">
            <b>表单助手</b>
            <AgentReply text={partial} streaming={running} />
          </div>
        </AgentMessage>
      )}
      {running &&
        completed.map(([stage, record]) => (
          <div className="agent-attempt-completed" key={stage}>
            <StageDetails stage={stage} record={record} />
            {record.latest && <p>{completionLabels[record.latest.stage]}</p>}
          </div>
        ))}
      {(running || phases.size > 0 || attempt.elapsedMs !== undefined) && (
        <details className="agent-attempt-process" key={running ? 'running' : 'finished'}>
          <summary>
            {running ? (
              <span className="agent-attempt-running" role="status">
                {runningLabel}
              </span>
            ) : (
              finishedLabel
            )}
          </summary>
          {running && processGroups.length === 0 && <p>正在等待下一条进度。</p>}
          {processGroups.map(([group, record]) => (
            <StageDetails key={group} stage={group} record={record} interrupted={interrupted} />
          ))}
        </details>
      )}
      {interrupted && (
        <>
          <div role="status">
            <p>
              中断位置：{location}。{attempt.interruptionReason ?? '本轮未留下具体中断原因。'}
              {!attempt.resumable && '本轮无法继续，请重新发送。'}
            </p>
          </div>
          {attempt.interruptionTraceId && (
            <div className="agent-attempt-trace">
              追踪 ID <code>{attempt.interruptionTraceId}</code>{' '}
              <CopyTextButton text={attempt.interruptionTraceId} label="复制追踪 ID" />
            </div>
          )}
        </>
      )}
      {resume && attempt.resumable && interrupted && (
        <Button disabled={disabled} onClick={resume}>
          继续处理
        </Button>
      )}
    </section>
  );
}
