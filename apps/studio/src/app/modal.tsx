'use client';

import { Button } from '@form-engine/studio-design-components/controls';
import { type ReactNode, useEffect, useRef } from 'react';

export function Modal({
  title,
  onClose,
  children,
  closeDisabled = false,
  returnFocus,
  closeLabel = '关闭',
  wide = false,
  className,
  size,
  actions,
  toolbar,
  customChrome = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeDisabled?: boolean;
  returnFocus?: HTMLElement;
  closeLabel?: string;
  wide?: boolean;
  className?: string;
  size?: 'standard' | 'wide';
  actions?: ReactNode;
  toolbar?: ReactNode;
  customChrome?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={dialog}
      className={[wide ? 'wide-dialog' : '', className].filter(Boolean).join(' ')}
      data-studio-modal-size={size}
      data-custom-chrome={customChrome || undefined}
      data-base-ui-swipe-ignore=""
      aria-label={title}
      onKeyDown={(event) => {
        // Native cancel handles this dialog's Escape and leaves the enclosing drawer open.
        if (event.key === 'Escape') event.stopPropagation();
      }}
      onCancel={(event) => {
        event.stopPropagation();
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      <div className="toolbar">
        <h2>{title}</h2>
        {customChrome ? (
          <button type="button" className="quiet" disabled={closeDisabled} onClick={onClose}>
            {closeLabel}
          </button>
        ) : (
          <Button variant="secondary" disabled={closeDisabled} onClick={onClose}>
            {closeLabel}
          </Button>
        )}
      </div>
      {toolbar}
      {size ? <div className="studio-modal-body">{children}</div> : children}
      {actions && <div className="studio-modal-actions">{actions}</div>}
    </dialog>
  );
}
