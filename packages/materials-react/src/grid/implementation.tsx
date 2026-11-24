'use client';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { manifest } from './manifest.js';
export interface GridProps {
  columns?: 1 | 2 | 3;
  gap?: 'small' | 'medium' | 'large';
}
const contract = defineMaterialContract<
  GridProps,
  never,
  Record<string, never>,
  Record<string, never>
>(manifest);
export function Grid() {
  const a = useMaterialAdapter(contract);
  return (
    <div
      className={`fe-grid fe-grid--columns-${a.props.columns ?? 2} fe-grid--gap-${a.props.gap ?? 'medium'}`}
    >
      {a.slots.default}
    </div>
  );
}
export function createGrid(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, Grid);
}
