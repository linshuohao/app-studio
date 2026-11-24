'use client';

import { Select } from '../components/ui';

export const schemaTypes = [
  ['string', '文本'],
  ['integer', '整数'],
  ['number', '数值'],
  ['boolean', '布尔'],
  ['object', '对象'],
  ['array', '数组'],
  ['null', '空值'],
] as const;

export function SchemaTypeSelect({
  value,
  onChange,
  portal,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  portal: HTMLElement | null;
}) {
  const labels = new Map<string, string>(schemaTypes);
  return (
    <div className="schema-next-field">
      <span id="schema-next-type-label">数据类型</span>
      <Select.Root multiple value={value} onValueChange={onChange}>
        <Select.Trigger aria-labelledby="schema-next-type-label">
          <Select.Value>
            {value.map((key) => labels.get(key) ?? key).join('、') || '不限类型'}
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Portal container={portal ?? undefined}>
          <Select.Positioner alignItemWithTrigger={false}>
            <Select.Popup>
              {schemaTypes.map(([key, label]) => (
                <Select.Item key={key} value={key}>
                  <Select.ItemIndicator />
                  <Select.ItemText>{label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
