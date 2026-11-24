'use client';
import { cjk } from '@streamdown/cjk';
import type { ReactNode } from 'react';
import { Streamdown } from 'streamdown';

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
