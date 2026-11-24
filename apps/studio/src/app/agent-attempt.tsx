'use client';
import { useEffect } from 'react';
import { Button } from '../components/ui';
import { AgentReply } from './agent-reply';
import type { AssistantConversation, TurnAttempt } from './agent-conversation';
import { platform } from './platform-api';

export function useRunningConversation(
  chat: AssistantConversation | undefined,
  scope: string,
  update: (value: AssistantConversation) => void,
  enabled: boolean,
  resuming = false,
) {
  const id =
    enabled && chat && (resuming || chat.attempts?.some((a) => a.status === 'running'))
      ? chat.id
      : undefined;
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
}: {
  attempt: TurnAttempt;
  disabled: boolean;
  resume?: () => void;
}) {
  let partial = '';
  const entries: string[] = [];
  for (const event of attempt.events) {
    if (event.type === 'progress') entries.push(event.message);
    if (event.type === 'understanding_reset') entries.push('重新核对需求');
    if (event.type === 'understanding_item') entries.push(event.text);
    if (event.type === 'text_reset') partial = '';
    if (event.type === 'text_delta') partial += event.delta;
  }
  const done = attempt.status === 'done';
  return (
    <section>
      {!done && (
        <div data-speaker="user">
          <b>你</b>
          <AgentReply text={attempt.message} />
        </div>
      )}
      {!!entries.length && (
        <details open={!done}>
          <summary>处理过程</summary>
          <ol>
            {entries.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ol>
        </details>
      )}
      {!done && partial && <AgentReply text={partial} />}
      {!done && <p role="status">{attempt.status === 'running' ? '正在处理' : '上次处理已中断'}</p>}
      {resume && attempt.resumable && !done && (
        <Button disabled={disabled} onClick={resume}>
          继续处理
        </Button>
      )}
    </section>
  );
}
