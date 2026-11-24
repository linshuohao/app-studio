'use client';
import type { ReactElement } from 'react';
import type { ArtifactIdentity } from '@form-engine/protocol';
import { defineMaterial, defineMaterialContract, useMaterialAdapter } from '@form-engine/renderer-react';
import { manifest } from './manifest.js';

const contract = defineMaterialContract<object, 'value'>(manifest);

export function __TITLE__(): ReactElement {
  useMaterialAdapter(contract);
  throw new Error('Asset __ID__ not implemented');
}

export function create__TITLE__(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, __TITLE__);
}
