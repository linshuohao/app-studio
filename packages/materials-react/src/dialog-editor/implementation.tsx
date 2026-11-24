'use client';
import { useRef, useState } from 'react';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { Modal } from '../_internal/modal.js';
import { manifest } from './manifest.js';
export interface DialogEditorProps {
  title: string;
  triggerLabel?: string;
  disabled?: boolean;
}
const contract = defineMaterialContract<
  DialogEditorProps,
  never,
  Record<string, never>,
  Record<string, never>
>(manifest);
export function DialogEditor() {
  const a = useMaterialAdapter(contract),
    [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="fe-editor">
      <div className="fe-editor-summary">{a.slots.summary}</div>
      <button
        ref={trigger}
        type="button"
        className="fe-button"
        disabled={a.props.disabled}
        aria-haspopup="dialog"
        onClick={() => {
          if (!a.props.disabled) setOpen(true);
        }}
      >
        {a.props.triggerLabel ?? '编辑'}
      </button>
      <Modal
        open={open}
        title={a.props.title}
        description="修改实时生效，关闭后仍会保留"
        onClose={() => setOpen(false)}
        returnFocus={trigger}
        footer={
          <button
            type="button"
            className="fe-button fe-button--primary"
            onClick={() => setOpen(false)}
          >
            完成
          </button>
        }
      >
        {a.slots.content}
      </Modal>
    </div>
  );
}
export function createDialogEditor(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, DialogEditor);
}
