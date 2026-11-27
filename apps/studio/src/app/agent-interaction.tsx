'use client';

import { useId, type MouseEventHandler, type ReactNode } from 'react';

export function AgentInteractionCard({
  title,
  children,
  tone = 'neutral',
  links,
}: {
  title: string;
  children?: ReactNode;
  tone?: 'neutral' | 'info' | 'warning';
  links?: {
    href: string;
    label: string;
    detail?: string;
    newTab?: boolean;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }[];
}) {
  const heading = useId();
  return (
    <section className="agent-interaction-card" data-tone={tone} aria-labelledby={heading}>
      <h3 id={heading}>{title}</h3>
      {children}
      {links?.map(({ href, label, detail, newTab, onClick }) => (
        <a
          key={href}
          className="agent-resource-link"
          href={href}
          onClick={onClick}
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
