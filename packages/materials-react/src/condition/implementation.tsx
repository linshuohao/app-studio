'use client';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { manifest } from './manifest.js';
export interface ConditionProps {
  visible: boolean;
}
const contract = defineMaterialContract<
  ConditionProps,
  never,
  Record<string, never>,
  Record<string, never>
>(manifest);
export function Condition() {
  const a = useMaterialAdapter(contract);
  return a.props.visible ? a.slots.default : null;
}
export function createCondition(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, Condition);
}
