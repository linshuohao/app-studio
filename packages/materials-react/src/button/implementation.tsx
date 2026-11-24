'use client';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { ActionFeedback, useActionFeedback } from '../_internal/action-feedback.js';
import { manifest } from './manifest.js';
export interface ButtonProps {
  label: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}
const contract = defineMaterialContract<
  ButtonProps,
  never,
  { activate: undefined },
  Record<string, never>
>(manifest);
export function Button() {
  const a = useMaterialAdapter(contract),
    feedback = useActionFeedback();
  return (
    <div className="fe-control">
      <button
        type="button"
        className={`fe-button fe-button--${a.props.variant ?? 'secondary'}`}
        disabled={a.props.disabled}
        onClick={() => {
          if (!a.props.disabled) feedback.accept(a.emit('activate'));
        }}
      >
        {a.props.label}
      </button>
      <ActionFeedback error={feedback.error} />
    </div>
  );
}
export function createButton(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, Button);
}
