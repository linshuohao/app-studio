'use client';

import { Button } from '../components/ui';
import { LiteralValueEditor, newLiteral, type Literal } from './literal-value-editor';

export function LiteralValueList({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: Literal[];
  onChange: (next: Literal[]) => void;
  type?: string;
}) {
  return (
    <div className="literal-value-list" role="group" aria-label={label}>
      {value.map((item, index) => (
        <div key={index} className="literal-value-list-row">
          <LiteralValueEditor
            label={label + ' ' + (index + 1)}
            value={item}
            allowTypeChange
            onChange={(next) => onChange(value.map((entry, i) => (i === index ? next : entry)))}
          />
          <Button
            variant="text"
            aria-label={'删除' + label + ' ' + (index + 1)}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            删除
          </Button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => onChange([...value, newLiteral(type)])}>
        添加{label}
      </Button>
    </div>
  );
}
