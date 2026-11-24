'use client';

import { type FormEvent, useState } from 'react';
import { Button, Feedback, Input } from '../components/ui/controls';
import { Field, FormLayout } from '../components/ui/form-layout';
import {
  accessDenied,
  failureMessage,
  type FormSummary,
  outcomeUnknown,
  platform,
} from './platform-api';

export function CopyForm({
  path,
  versionId,
  disabled,
  allowNew,
  onBusyChange,
  onClose,
}: {
  path: string;
  versionId: string;
  disabled: boolean;
  allowNew: boolean;
  onBusyChange?: (busy: boolean) => void;
  onClose: (copiedName?: string) => void;
}) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState<{
    key: string;
    body: { versionId: string; name: string };
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function copy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const snapshot = pending ?? { key: crypto.randomUUID(), body: { versionId, name } };
    setPending(snapshot);
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      await platform(`${path}/copies`, snapshot);
      setPending(undefined);
      onBusyChange?.(false);
      onClose(snapshot.body.name.trim());
    } catch (error) {
      if (!outcomeUnknown(error) && (!pending || !accessDenied(error))) {
        setPending(undefined);
        onBusyChange?.(false);
      }
      setError(failureMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function cancelCopy() {
    if (pending && !window.confirm('本次复制结果待确认。确定放弃重试？')) return;
    setPending(undefined);
    onBusyChange?.(false);
    setError('');
    onClose();
  }

  return (
    <form onSubmit={(event) => void copy(event)}>
      <FormLayout
        feedback={error && <Feedback kind="error">{error}</Feedback>}
        actions={
          <>
            <Button type="submit" disabled={busy || disabled || (!pending && !allowNew)}>
              {pending && !busy ? '重试复制' : '确认复制'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={cancelCopy}>
              取消
            </Button>
          </>
        }
      >
        <Field label="新表单名称">
          {(control) => (
            <Input
              {...control}
              value={name}
              onChange={(event) => setName(event.target.value)}
              readOnly={!!pending}
              required
              maxLength={120}
            />
          )}
        </Field>
      </FormLayout>
    </form>
  );
}

export function FormManagement({
  form,
  path,
  editable,
  disabled,
  onMetadata,
  onBusyChange,
  onEditClose,
}: {
  form: FormSummary;
  path: string;
  editable: boolean;
  disabled: boolean;
  onMetadata: (form: FormSummary) => void;
  onBusyChange?: (busy: boolean) => void;
  onEditClose: () => void;
}) {
  const [metadata, setMetadata] = useState(() => ({
    name: form.name,
    description: form.description,
    revision: form.revision,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      onMetadata(await platform<FormSummary>(`${path}/metadata`, { body: metadata }));
      onEditClose();
    } catch (error) {
      setError(failureMessage(error));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <form aria-label="表单管理" onSubmit={(event) => void submit(event)}>
      <FormLayout
        feedback={error && <Feedback kind="error">{error}</Feedback>}
        actions={
          <>
            <Button type="submit" disabled={busy || disabled || !editable}>
              保存表单信息
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onEditClose}>
              取消
            </Button>
          </>
        }
      >
        <Field label="名称">
          {(control) => (
            <Input
              {...control}
              required
              readOnly={!editable}
              maxLength={120}
              value={metadata.name}
              onChange={(event) => setMetadata({ ...metadata, name: event.target.value })}
            />
          )}
        </Field>
        <Field label="说明">
          {(control) => (
            <Input
              {...control}
              readOnly={!editable}
              maxLength={2000}
              value={metadata.description}
              onChange={(event) => setMetadata({ ...metadata, description: event.target.value })}
            />
          )}
        </Field>
      </FormLayout>
    </form>
  );
}
