import { useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { containTab } from './modal-focus.js';
interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  closeLabel?: string;
  children: ReactNode;
  footer: ReactNode;
}
/** UI shell only: no Material Hook, Binding, validation store or business draft. */
export function Modal({
  open,
  title,
  description,
  onClose,
  returnFocus,
  closeLabel = '关闭编辑',
  children,
  footer,
}: ModalProps) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const modal = dialog.current,
      opener = returnFocus.current;
    if (!modal) return;
    if (!modal.open) modal.showModal();
    return () => {
      if (modal.open) modal.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open, returnFocus]);
  return open
    ? createPortal(
        <dialog
          ref={dialog}
          className="fe-dialog"
          aria-labelledby={`${id}-title`}
          aria-describedby={description ? `${id}-description` : undefined}
          aria-modal="true"
          onKeyDown={containTab}
          onCancel={(e) => {
            e.preventDefault();
            onClose();
          }}
          onClose={onClose}
        >
          <div className="fe-dialog-header">
            <h2 id={`${id}-title`}>{title}</h2>
            <button type="button" className="fe-button" aria-label={closeLabel} onClick={onClose}>
              关闭
            </button>
          </div>
          {description ? (
            <p id={`${id}-description`} className="fe-help">
              {description}
            </p>
          ) : null}
          <div className="fe-dialog-content">{children}</div>
          <footer className="fe-dialog-footer">{footer}</footer>
        </dialog>,
        document.body,
      )
    : null;
}
