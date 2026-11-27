'use client';

import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode, type Ref } from 'react';
import { Button, IconButton, Input } from '@form-engine/studio-design-components/controls';
import { failureMessage } from './platform-api';
import './page-heading.css';

type Rename = {
  label: string;
  onSave: (value: string) => void | Promise<void>;
  disabled?: boolean;
};

function EditableHeading({ value, rename }: { value: string; rename: Rename }) {
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const restoreFocusIn = useRef<Document | null>(null);

  function close(restoreFocus: boolean) {
    const editor = input.current;
    restoreFocusIn.current =
      restoreFocus && editor && editor.ownerDocument.activeElement === editor
        ? editor.ownerDocument
        : null;
    setDraft(undefined);
    setError('');
  }

  async function save(restoreFocus: boolean) {
    if (draft === undefined || pending.current) return;
    const next = draft.trim();
    if (rename.disabled || !next || next === value) {
      close(restoreFocus && !rename.disabled);
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      await rename.onSave(next);
      close(restoreFocus);
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  if (draft === undefined)
    return (
      <Button
        ref={(button) => {
          if (!button) return;
          const editorDocument = restoreFocusIn.current;
          restoreFocusIn.current = null;
          if (
            editorDocument &&
            editorDocument.activeElement === editorDocument.body &&
            !rename.disabled
          )
            button.focus();
        }}
        variant="text"
        className="studio-page-heading-edit"
        disabled={rename.disabled}
        aria-label={'编辑' + rename.label + '：' + value}
        onClick={() => setDraft(value)}
      >
        {value}
      </Button>
    );

  return (
    <span className="studio-page-heading-input">
      <Input
        ref={input}
        aria-label={rename.label}
        aria-invalid={!!error || undefined}
        autoFocus
        maxLength={120}
        value={draft}
        readOnly={saving || rename.disabled}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setError('');
          setDraft(event.currentTarget.value);
        }}
        onBlur={() => void save(false)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            if (pending.current) return;
            if (event.key === 'Enter') void save(true);
            else close(true);
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
    </span>
  );
}

export function PageHeading({
  title,
  back,
  description,
  rename,
  headingRef,
  headingClassName,
  headingLabel,
  headingTooltip,
  className,
  children,
  ...headerProps
}: Omit<ComponentPropsWithoutRef<'header'>, 'title'> & {
  title: ReactNode;
  back?: { label: string; onClick: () => void; disabled?: boolean };
  description?: ReactNode;
  rename?: Rename;
  headingRef?: Ref<HTMLHeadingElement>;
  headingClassName?: string;
  headingLabel?: string;
  headingTooltip?: string;
}) {
  return (
    <header
      {...headerProps}
      className={['toolbar page-title studio-page-heading', className].filter(Boolean).join(' ')}
    >
      <div className="studio-page-heading-identity">
        {back && (
          <IconButton
            icon="ChevronLeft"
            aria-label={back.label}
            title={back.label}
            disabled={back.disabled}
            onClick={back.onClick}
          />
        )}
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className={headingClassName}
          aria-label={headingLabel ?? (rename && typeof title === 'string' ? title : undefined)}
          title={headingTooltip}
        >
          {rename && typeof title === 'string' ? (
            <EditableHeading value={title} rename={rename} />
          ) : (
            title
          )}
        </h1>
        {description && <div className="studio-page-heading-description">{description}</div>}
      </div>
      {children && <div className="action-row studio-page-heading-actions">{children}</div>}
    </header>
  );
}
