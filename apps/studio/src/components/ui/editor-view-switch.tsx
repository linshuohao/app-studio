'use client';

import { Button } from './controls';

export type EditorView = 'form' | 'json';

export function EditorViewSwitch({
  value,
  onChange,
  formDisabled,
  jsonDisabled,
}: {
  value: EditorView;
  onChange: (view: EditorView) => void;
  formDisabled?: boolean;
  jsonDisabled?: boolean;
}) {
  return (
    <div className="editor-view-switch" role="group" aria-label="编辑视图">
      <Button
        variant={value === 'form' ? 'secondary' : 'text'}
        aria-pressed={value === 'form'}
        disabled={formDisabled}
        onClick={() => {
          if (value !== 'form') onChange('form');
        }}
      >
        表单编辑
      </Button>
      <Button
        variant={value === 'json' ? 'secondary' : 'text'}
        aria-pressed={value === 'json'}
        disabled={jsonDisabled}
        onClick={() => {
          if (value !== 'json') onChange('json');
        }}
      >
        JSON 编辑
      </Button>
    </div>
  );
}
