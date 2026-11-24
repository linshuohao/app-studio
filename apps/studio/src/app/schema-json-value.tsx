'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/ui';
import { JsonEditor } from '../components/json/json-editor';
import { Modal } from './modal';

export function SchemaJsonValue({
  label,
  text,
  kind,
  onChange,
  readOnly = false,
}: {
  label: string;
  text: string;
  kind?: 'object' | 'array';
  onChange: (text: string) => void;
  readOnly?: boolean;
}) {
  const [dialog, setDialog] = useState<{
    editing: boolean;
    trigger: HTMLButtonElement;
    text: string;
  }>();
  function open(editing: boolean, trigger: HTMLButtonElement) {
    setDialog({ editing, trigger, text });
  }
  let valid = false;
  if (dialog) {
    try {
      const parsed: unknown = JSON.parse(dialog.text);
      valid =
        !kind ||
        (kind === 'array'
          ? Array.isArray(parsed)
          : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
    } catch {
      // Keep incomplete JSON in the dialog until it can be applied.
    }
  }
  return (
    <div className="schema-json-value">
      <code title={text}>{text}</code>
      <Button
        variant="text"
        aria-label={'查看' + label}
        onClick={(e) => open(false, e.currentTarget)}
      >
        查看
      </Button>
      {!readOnly && (
        <Button
          variant="text"
          aria-label={'编辑' + label}
          onClick={(e) => open(true, e.currentTarget)}
        >
          编辑
        </Button>
      )}
      {dialog &&
        createPortal(
          <Modal
            title={(dialog.editing ? '编辑' : '查看') + label}
            size="wide"
            returnFocus={dialog.trigger}
            onClose={() => setDialog(undefined)}
            actions={
              dialog.editing && (
                <Button
                  disabled={!valid}
                  onClick={() => {
                    onChange(dialog.text);
                    setDialog(undefined);
                  }}
                >
                  应用 JSON
                </Button>
              )
            }
          >
            <JsonEditor
              label={label}
              text={dialog.text}
              readOnly={!dialog.editing}
              initialMode="text"
              onChange={(next) => setDialog({ ...dialog, text: next })}
            />
            {dialog.editing && !valid && (
              <p role="status">
                请输入有效的 JSON{kind === 'object' ? ' 对象' : kind === 'array' ? ' 数组' : ' 值'}
                。
              </p>
            )}
          </Modal>,
          dialog.trigger.closest('main') ?? document.body,
        )}
    </div>
  );
}
