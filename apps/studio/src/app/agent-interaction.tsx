'use client';

import { useId, type ReactNode } from 'react';
import type { UnderstandingItem } from './platform-api';
import { AgentMessage, AgentReply } from './agent-reply';

export function AgentInteractionCard({
  title,
  children,
  tone = 'neutral',
  links,
}: {
  title: string;
  children?: ReactNode;
  tone?: 'neutral' | 'info' | 'warning';
  links?: { href: string; label: string; detail?: string; newTab?: boolean }[];
}) {
  const heading = useId();
  return (
    <section className="agent-interaction-card" data-tone={tone} aria-labelledby={heading}>
      <h3 id={heading}>{title}</h3>
      {children}
      {links?.map(({ href, label, detail, newTab }) => (
        <a
          key={href}
          className="agent-resource-link"
          href={href}
          target={newTab ? '_blank' : undefined}
          rel={newTab ? 'noopener' : undefined}
        >
          <strong>{label}</strong>
          {detail && <small>{detail}</small>}
        </a>
      ))}
    </section>
  );
}

export function AgentTurnProgress({
  label,
  text,
  items,
}: {
  label: string;
  text: string;
  items: UnderstandingItem[];
}) {
  return (
    <>
      {label && <p role="status">{label}…</p>}
      {!!items.length && (
        <details className="agent-interaction-card">
          <summary>查看暂时识别的需求</summary>
          <ul>
            {items.map((item, index) => (
              <li key={index}>
                {item.kind === 'question' ? '待确认：' : ''}
                {item.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      {text && (
        <AgentMessage text={text}>
          <div data-speaker="assistant">
            <b>表单助手</b>
            <AgentReply text={text} streaming />
          </div>
        </AgentMessage>
      )}
    </>
  );
}
