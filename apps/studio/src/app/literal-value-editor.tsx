'use client';

import { Input } from '../components/ui';
import { StudioSelect } from '../components/ui/select';
import { SchemaJsonValue } from './schema-json-value';

const literalLabels = {
  string: '文本',
  number: '数值',
  boolean: '布尔',
  object: '对象',
  array: '数组',
  null: '空值',
};

export type Literal = {
  kind: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
  text: string;
  original?: string;
};

export function readLiteral(raw: string): Literal {
  const value: unknown = JSON.parse(raw);
  const kind =
    value === null ? 'null' : Array.isArray(value) ? 'array' : (typeof value as Literal['kind']);
  return { kind, text: kind === 'string' ? (value as string) : raw, original: raw };
}

const initialValues: Record<Literal['kind'], string> = {
  string: '',
  number: '0',
  boolean: 'false',
  null: 'null',
  object: '{}',
  array: '[]',
};

export function newLiteral(type?: string): Literal {
  const kind =
    type === 'integer'
      ? 'number'
      : type && Object.hasOwn(initialValues, type)
        ? (type as Literal['kind'])
        : 'string';
  return { kind, text: initialValues[kind] };
}

export function literalSource(value: Literal) {
  if (value.original !== undefined) return value.original;
  if (value.kind === 'string') return JSON.stringify(value.text);
  const parsed: unknown = JSON.parse(value.text);
  const kind = parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
  if (kind !== value.kind) throw Error('值与所选类型不一致。');
  return value.text;
}

export function LiteralValueEditor({
  label,
  value,
  onChange,
  allowTypeChange = false,
  numeric,
  stringLimits,
}: {
  label: string;
  value: Literal;
  onChange: (next: Literal) => void;
  allowTypeChange?: boolean;
  numeric?: { integer?: boolean; min?: number; max?: number };
  stringLimits?: { minLength?: number; maxLength?: number };
}) {
  const update = (text: string) => onChange({ kind: value.kind, text });
  return (
    <div className="literal-value-editor" data-type-choice={allowTypeChange || undefined}>
      {allowTypeChange && (
        <StudioSelect
          aria-label={label + '类型'}
          value={value.kind}
          onValueChange={(selected) => onChange(newLiteral(selected))}
        >
          {Object.entries(literalLabels).map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </StudioSelect>
      )}
      {value.kind === 'array' || value.kind === 'object' ? (
        <SchemaJsonValue label={label} kind={value.kind} text={value.text} onChange={update} />
      ) : value.kind === 'boolean' ? (
        <StudioSelect aria-label={label} value={value.text} onValueChange={update}>
          <option value="true">真</option>
          <option value="false">假</option>
        </StudioSelect>
      ) : (
        <Input
          aria-label={label}
          type={value.kind === 'number' ? 'number' : 'text'}
          step={numeric?.integer ? 1 : 'any'}
          min={numeric?.min}
          max={numeric?.max}
          {...stringLimits}
          value={value.text}
          readOnly={value.kind === 'null'}
          onChange={(event) => update(event.target.value)}
        />
      )}
    </div>
  );
}
