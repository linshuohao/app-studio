'use client';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { manifest } from './manifest.js';
import { formatValue, type DisplayValueProps } from '../_internal/display-value.js';
export type ValueDisplayProps = DisplayValueProps;
const contract = defineMaterialContract<
  ValueDisplayProps,
  never,
  Record<string, never>,
  Record<string, never>
>(manifest);
export function ValueDisplay() {
  const a = useMaterialAdapter(contract);
  return <span className="fe-value">{formatValue(a.props)}</span>;
}
export function createValueDisplay(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, ValueDisplay);
}
