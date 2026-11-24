'use client';

import { JsonEditor } from '../components/json/json-editor';
import { removeLayoutMember } from './layout-token-edit';
import { isLiteralOptionList, LayoutOptionList } from './layout-option-list';
import { LayoutFieldPicker as FieldSelect } from './layout-field-picker';
import { useId, useLayoutEffect, useState } from 'react';
import type { JsonSchema } from '@form-engine/protocol/capability';
import type { DataReference } from '@form-engine/protocol/definition';
import type { Schema } from '../components/catalog/contract-reference';
import { possibleBinding } from './possible-binding';
import { defaultLiteral, ManifestInput, validateLiteral } from './manifest-input';
import { LayoutExpressionDialog } from './layout-expression';
import type { ExpressionVerificationContext } from './expression-verification';
import { child, semanticModel } from './semantic-model';
import { ValueSourceSelect, type ValueSource } from './value-source-select';

export type LayoutBindingField = {
  schemaPath: string;
  label: string;
  ref: DataReference;
  schema: Schema;
};

export function compatibleFields(fields: LayoutBindingField[], schema: Schema) {
  return fields.filter((f) => schema !== false && possibleBinding(schema, f.schema));
}
export function isDataRef(value: unknown): value is DataReference {
  return (
    !!value &&
    typeof value === 'object' &&
    'source' in value &&
    value.source === 'data' &&
    'path' in value &&
    typeof value.path === 'string' &&
    (!('scope' in value) || typeof value.scope === 'string') &&
    Object.keys(value).every((k) => ['source', 'scope', 'path'].includes(k))
  );
}
export { LayoutFieldPicker as FieldSelect } from './layout-field-picker';

export { removeLayoutMember } from './layout-token-edit';

function declared(schema: Schema) {
  return (typeof schema === 'object' ? (schema.properties ?? {}) : {}) as Record<string, Schema>;
}

export function initialValue(schema: Schema): string {
  if (typeof schema === 'object' && schema.type === 'object' && Array.isArray(schema.required)) {
    const properties = declared(schema);
    return (
      '{' +
      schema.required
        .map((key: string) => JSON.stringify(key) + ':' + initialValue(properties[key] ?? true))
        .join(',') +
      '}'
    );
  }
  return defaultLiteral(schema);
}

export function validateValue(schema: Schema, raw: string) {
  const val: unknown = JSON.parse(raw);
  // Dynamic children and their enclosing structure are checked by the real Compiler.
  function dynamic(v: unknown): boolean {
    if (!v || typeof v !== 'object') return false;
    if ('$literal' in v || '$expr' in v) return true;
    return Object.values(v).some(dynamic);
  }
  if (!dynamic(val)) validateLiteral(schema, val);
}

type ValueProps = {
  schema: Schema;
  raw: string;
  set: (raw: string) => void;
  label: string;
  fields: LayoutBindingField[];
  optionList?: boolean;
  verification?: ExpressionVerificationContext;
  title?: string;
  titleInSummary?: boolean;
  onIncomplete?: (id: string, active: boolean) => void;
};

function read(raw: string) {
  try {
    return semanticModel(raw);
  } catch {
    return undefined;
  }
}

function LiteralInput({
  schema,
  raw,
  set,
  label,
  title,
  fields,
  optionList,
  onIncomplete,
  verification,
}: ValueProps) {
  const [generation, nextGeneration] = useState(0);
  const m = read(raw);
  const shape = typeof schema === 'object' ? schema : {};
  const root = m?.root;
  const properties = declared(schema);
  const wrapped = optionList ? child(root, '$literal') : undefined;
  const options =
    wrapped?.kind === 'array' && root?.children?.length === 1 && m ? read(m.raw(wrapped)) : m;
  if (optionList && options && isLiteralOptionList(options)) {
    return (
      <LayoutOptionList
        model={options}
        set={(next) => set(m && wrapped ? m.replace(wrapped, next) : next)}
      />
    );
  }
  if (
    m &&
    root &&
    root.kind === 'object' &&
    shape.type === 'object' &&
    Object.keys(properties).length
  ) {
    return (
      <fieldset>
        {Object.entries(properties).map(([k, s]) => {
          const n = child(root, k);
          const name = label + ' / ' + k;
          return n ? (
            <ValueInput
              key={k}
              fields={fields}
              verification={verification}
              onIncomplete={onIncomplete}
              label={name}
              schema={s}
              raw={m.raw(n)}
              set={(v) => set(m.property(root, k, v))}
            />
          ) : (
            <button type="button" key={k} onClick={() => set(m.property(root, k, initialValue(s)))}>
              添加 {name}
            </button>
          );
        })}
      </fieldset>
    );
  }
  if (m && root?.kind === 'array' && shape.type === 'array' && shape.items) {
    const item = shape.items as Schema;
    const entries = root.children ?? [];
    return (
      <fieldset>
        {entries.map((n, i) => (
          <div key={generation + '/' + i}>
            <ValueInput
              label={label + ' / ' + (i + 1)}
              fields={fields}
              verification={verification}
              onIncomplete={onIncomplete}
              schema={item}
              raw={m.raw(n)}
              set={(v) => set(m.replace(n, v))}
            />
            <button
              type="button"
              onClick={() => {
                set(removeLayoutMember(raw, n));
                nextGeneration((g) => g + 1);
              }}
            >
              删除第 {i + 1} 项
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            set(raw.slice(0, -1) + (entries.length ? ',' : '') + initialValue(item) + ']')
          }
        >
          新增{label}项
        </button>
      </fieldset>
    );
  }
  const types = Array.isArray(shape.type) ? shape.type.filter((type) => type !== 'null') : [];
  const inputSchema = types.length === 1 ? { ...shape, type: types[0] } : schema;
  return (
    <ManifestInput
      label={title ?? label}
      value={raw}
      schema={inputSchema}
      set={set}
      showLabel={false}
    />
  );
}

export function ValueInput(props: ValueProps) {
  const { schema, label, fields } = props;
  // Keep incomplete JSON at the edited leaf so a half-typed number or expression
  // cannot unmount the enclosing array/object or silently apply the previous value.
  const [incomplete, setIncomplete] = useState<string>();
  const { onIncomplete } = props;
  const id = useId();
  const invalid = incomplete !== undefined;
  useLayoutEffect(() => {
    if (!invalid || !onIncomplete) return;
    onIncomplete(id, true);
    return () => onIncomplete(id, false);
  }, [id, invalid, onIncomplete]);
  const raw = incomplete ?? props.raw;
  function set(next: string) {
    try {
      JSON.parse(next);
    } catch {
      setIncomplete(next);
      return;
    }
    setIncomplete(undefined);
    props.set(next);
  }
  const m = read(raw);
  const expr = child(m?.root, '$expr');
  const literal = child(m?.root, '$literal');
  const refNode = child(expr, 'ref');
  const candidate = refNode && m ? JSON.parse(m.raw(refNode)) : undefined;
  const ref =
    expr?.children?.length === 1 && m?.root.children?.length === 1 && isDataRef(candidate)
      ? candidate
      : undefined;
  const wrappedOptions =
    props.optionList && literal?.kind === 'array' && m?.root.children?.length === 1;
  const [editExpression, setEditExpression] = useState(false);
  const [choice, choose] = useState<ValueSource>();
  const [lastFixed, setLastFixed] = useState<string>();
  const mode =
    choice ??
    (ref ? 'field' : expr ? 'expression' : literal && !wrappedOptions ? 'quoted' : 'literal');
  const candidates = compatibleFields(fields, schema);
  function changeSource(next: ValueSource) {
    if (mode === 'literal') setLastFixed(props.raw);
    choose(next);
    if (next === 'field') set(JSON.stringify({ $expr: ref ? { ref } : {} }));
    else if (next === 'expression') set(expr ? raw : '{"$expr":null}');
    else if (next === 'quoted')
      set(literal && !wrappedOptions ? raw : '{"$literal":' + initialValue(schema) + '}');
    else set(lastFixed ?? initialValue(schema));
  }
  return (
    <div className="layout-value" data-layout-invalid={invalid || undefined}>
      <div className="layout-value-heading">
        {!props.titleInSummary && (
          <span className="layout-value-title">{props.title ?? label}</span>
        )}
        <ValueSourceSelect
          label={label}
          value={mode}
          canReadField={candidates.length > 0}
          onChange={changeSource}
        />
      </div>
      <div className="layout-value-editor">
        {mode === 'field' ? (
          <FieldSelect
            label={props.title ? props.title + ' · 读取字段' : label + '来源字段'}
            fields={fields}
            accepts={(field) => candidates.includes(field)}
            value={ref}
            set={(v) => set(JSON.stringify({ $expr: { ref: v } }))}
          />
        ) : mode === 'expression' || mode === 'quoted' ? (
          <>
            {mode === 'expression' &&
              props.verification &&
              m &&
              expr &&
              m.root.children?.length === 1 &&
              !m.ambiguous.size &&
              !invalid && (
                <>
                  <button type="button" onClick={() => setEditExpression(true)}>
                    编辑表达式
                  </button>
                  {editExpression && (
                    <LayoutExpressionDialog
                      title={(props.title ?? label) + ' · 表达式'}
                      initial={m.raw(expr)}
                      expected={schema as JsonSchema}
                      fields={fields}
                      verification={props.verification}
                      close={() => setEditExpression(false)}
                      apply={(value) => set(m.replace(expr, value))}
                    />
                  )}
                </>
              )}
            <JsonEditor
              readOnly={false}
              initialMode="text"
              label={label + '协议 JSON'}
              text={raw}
              onChange={set}
            />
          </>
        ) : (
          <LiteralInput {...props} raw={raw} set={set} />
        )}
      </div>
      {invalid && <small role="alert">请输入完整的 JSON 值。</small>}
    </div>
  );
}
