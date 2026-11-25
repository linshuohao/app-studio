// Build from the repository root with the Vite config next to this file.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Input } from '@base-ui/react/input';
import { Select } from '@form-engine/studio-design-components/primitives';

function SelectSample({ multiple }) {
  const [value, setValue] = useState(multiple ? ['草稿'] : '草稿');
  return (
    <Select.Root multiple={multiple} value={value} onValueChange={setValue}>
      <Select.Trigger className="handbook-select" aria-label="发布状态">
        <Select.Value>
          {(selected) => (Array.isArray(selected) ? selected.join('、') : selected) || '选择状态'}
        </Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} className="handbook-positioner">
          <Select.Popup className="handbook-options">
            <Select.List>
              {['草稿', '审核中', '已发布'].map((status) => (
                <Select.Item key={status} value={status}>
                  <Select.ItemText>{status}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function InputSample({ type }) {
  const [result, setResult] = useState(type === 'time' ? '09:30' : '');
  return (
    <div>
      <label>
        {type === 'time' ? '开始时间' : '选择 JSON 文件'}
        {type === 'time' ? (
          <Input
            type="time"
            min="08:00"
            max="18:00"
            step={60}
            value={result}
            onValueChange={setResult}
          />
        ) : (
          <Input
            type="file"
            accept=".json"
            onChange={(e) => setResult(e.currentTarget.files?.[0]?.name ?? '')}
          />
        )}
      </label>
      <output>{result}</output>
    </div>
  );
}

for (const mount of document.querySelectorAll('[data-select-demo], [data-input-demo]')) {
  createRoot(mount).render(
    mount.dataset.inputDemo ? (
      <InputSample type={mount.dataset.inputDemo} />
    ) : (
      <SelectSample multiple={mount.dataset.selectDemo === 'multiple'} />
    ),
  );
}
