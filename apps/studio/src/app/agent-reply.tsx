'use client';
import { cjk } from '@streamdown/cjk';
import { useEffect, useState, type ReactNode } from 'react';
import { Streamdown } from 'streamdown';
import { Button, Icon } from '@form-engine/studio-design-components';

export function AgentMessage({ text, children }: { text: string; children: ReactNode }) {
  const [feedback, setFeedback] = useState<'copied' | 'failed'>();

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(undefined), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  async function copyMessage() {
    setFeedback(undefined);
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('copied');
    } catch {
      setFeedback('failed');
    }
  }

  if (!text) return children;

  return (
    <div className="agent-message" data-copy-feedback={feedback}>
      {children}
      <div className="agent-message-actions">
        <Button
          variant="text"
          className="agent-message-copy"
          aria-label="复制消息"
          title="复制消息"
          onClick={copyMessage}
        >
          <Icon name={feedback === 'copied' ? 'Check' : 'Copy'} />
        </Button>
        <span role="status">
          {feedback === 'copied' && '已复制'}
          {feedback === 'failed' && '复制失败，请手动复制。'}
        </span>
      </div>
    </div>
  );
}

export function AgentReply({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <Streamdown
      plugins={{ cjk }}
      className="agent-markdown"
      mode={streaming ? 'streaming' : 'static'}
      parseIncompleteMarkdown={streaming}
      controls={false}
      skipHtml
      disallowedElements={['img']}
    >
      {text}
    </Streamdown>
  );
}

export function AgentCandidateCard({ children }: { children: ReactNode }) {
  return (
    <section className="agent-candidate-card" aria-label="候选配置">
      {children}
    </section>
  );
}
