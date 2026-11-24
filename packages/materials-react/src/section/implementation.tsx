'use client';
import { useId, useState } from 'react';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { manifest } from './manifest.js';
export interface SectionProps {
  title?: string;
  description?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}
const contract = defineMaterialContract<
  SectionProps,
  never,
  Record<string, never>,
  Record<string, never>
>(manifest);
export function Section() {
  const a = useMaterialAdapter(contract),
    p = a.props,
    id = useId();
  const [open, setOpen] = useState(() => p.defaultExpanded ?? true);
  const expanded = !p.collapsible || open;
  const title = p.title ?? '内容';
  return (
    <section
      className="fe-section"
      aria-labelledby={p.title || p.collapsible ? `${id}-title` : undefined}
    >
      <header className="fe-section-header">
        {p.collapsible ? (
          <h2 id={`${id}-title`}>
            <button
              className="fe-section-toggle"
              type="button"
              aria-expanded={expanded}
              aria-controls={`${id}-content`}
              onClick={() => setOpen((v) => !v)}
            >
              {title}
              <span aria-hidden="true">{expanded ? ' −' : ' +'}</span>
            </button>
          </h2>
        ) : p.title ? (
          <h2 id={`${id}-title`}>{p.title}</h2>
        ) : null}
        {a.slots.actions ? <div className="fe-section-actions">{a.slots.actions}</div> : null}
      </header>
      {p.description ? <p className="fe-help">{p.description}</p> : null}
      <div id={`${id}-content`}>{expanded ? a.slots.default : null}</div>
    </section>
  );
}
export function createSection(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, Section);
}
