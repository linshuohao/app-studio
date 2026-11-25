'use client';

import { StudioSelect } from '@form-engine/studio-design-components/select';
import { Button, Input } from '@form-engine/studio-design-components';
import { FieldPicker } from '../components/field-picker';
import { schemaTypes } from './schema-drawer-values';
import { child, escapeKey } from './semantic-model';
import { dataSchemaModel } from './data-schema-model';
import { SchemaJsonValue } from './schema-json-value';
import { JsonEditor } from '../components/json/json-editor';
import { useState, type ReactNode } from 'react';
import type { JsonNode } from '../components/json/model';
import { LiteralValueEditor, literalSource, readLiteral } from './literal-value-editor';
import type { DataSchemaModel } from './data-schema-model';

export const groups = ['allOf', 'anyOf', 'oneOf'];
export const singles = [
  'not',
  'additionalProperties',
  'unevaluatedProperties',
  'propertyNames',
  'contains',
  'unevaluatedItems',
  'items',
  'contentSchema',
];
export const labels: Record<string, string> = {
  if: '当',
  then: '成立时',
  else: '否则',
  required: '必填字段',
  properties: '字段约束',
  allOf: '全部满足',
  anyOf: '至少满足一项',
  oneOf: '恰好满足一项',
  not: '取反',
  additionalProperties: '其他属性',
  unevaluatedProperties: '未评估属性',
  propertyNames: '属性名约束',
  contains: '元素匹配',
  unevaluatedItems: '未评估元素',
  items: '元素模型',
  prefixItems: '前缀元素',
  contentSchema: '内容模型',
  dependentSchemas: '依赖模型',
  patternProperties: '模式属性',
  dependentRequired: '属性依赖',
  type: '数据类型',
  const: '匹配值',
  enum: '允许值',
  minimum: '最小值',
  maximum: '最大值',
  minLength: '最短长度',
  maxLength: '最长长度',
  pattern: '匹配模式',
};
const seeds: Record<string, string> = {
  required: '[]',
  properties: '{}',
  const: '""',
  enum: '[""]',
  type: '"string"',
  minimum: '0',
  maximum: '0',
  minLength: '0',
  maxLength: '10',
  pattern: '""',
  ...Object.fromEntries(
    [
      ...singles,
      'if',
      'then',
      'else',
      'dependentSchemas',
      'dependentRequired',
      'patternProperties',
    ].map((k) => [k, '{}']),
  ),
  ...Object.fromEntries([...groups, 'prefixItems'].map((k) => [k, '[{}]'])),
};
export type RuleEditing = {
  model: DataSchemaModel;
  compact?: boolean;
  fieldScope?: JsonNode;
  change: (operation: (model: DataSchemaModel) => string) => void;
};
function KeyChooser({
  keys,
  label,
  action,
  add,
  showKeywords = false,
}: {
  keys: string[];
  label: string;
  action: string;
  showKeywords?: boolean;
  add: (s: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const key = keys.includes(choice) ? choice : keys[0];
  if (!key) return null;
  return (
    <div className="toolbar">
      <label>
        {label}
        <StudioSelect value={key} onValueChange={(selected) => setChoice(selected)}>
          {keys.map((k) => (
            <option key={k} value={k}>
              {labels[k] ?? k}
              {showKeywords && labels[k] ? ' · ' + k : ''}
            </option>
          ))}
        </StudioSelect>
      </label>
      <button type="button" className="quiet" onClick={() => add(key)}>
        {action}
      </button>
    </div>
  );
}
export { KeyChooser };

function NamedEntry({
  keys,
  add,
  label,
}: {
  keys: string[];
  add: (name: string) => void;
  label: string;
}) {
  const [name, setName] = useState('');
  return (
    <div className="toolbar">
      <label>
        {label}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        type="button"
        className="quiet"
        disabled={!name || keys.includes(name)}
        onClick={() => {
          add(name);
          setName('');
        }}
      >
        添加{label}
      </button>
    </div>
  );
}

const literalDefaults = {
  string: '""',
  number: '0',
  boolean: 'true',
  null: 'null',
  object: '{}',
  array: '[]',
};
function RequiredMark() {
  return (
    <span className="schema-required-mark" title="必填" aria-label="必填">
      {' '}
      *
    </span>
  );
}

function LiteralInput({
  node,
  label,
  flexible = false,
  rawJson = false,
  showRequired = false,
  editing,
}: {
  node: JsonNode;
  label: string;
  flexible?: boolean;
  rawJson?: boolean;
  showRequired?: boolean;
  editing: RuleEditing;
}) {
  const { model, change } = editing;
  const [invalid, setInvalid] = useState<{ path: string; initial: string; value: string }>();
  const raw = model.raw(node);
  const literal = readLiteral(raw);
  const invalidValue =
    invalid?.initial === raw && invalid.path === node.path ? invalid.value : undefined;
  return (
    <div
      className="schema-next-field"
      data-invalid-json-rule={invalidValue !== undefined || undefined}
    >
      <span>
        {label}
        {showRequired && <RequiredMark />}
      </span>
      {rawJson ? (
        <SchemaJsonValue
          label={label}
          text={raw}
          onChange={(next) => change((m) => m.replace(node.path, next))}
        />
      ) : (
        <LiteralValueEditor
          label={label}
          value={{ ...literal, text: invalidValue ?? literal.text }}
          allowTypeChange={flexible}
          onChange={(next) => {
            try {
              const token = literalSource(next);
              setInvalid(undefined);
              change((m) => m.replace(node.path, token));
            } catch {
              setInvalid({ initial: raw, path: node.path, value: next.text });
            }
          }}
        />
      )}
      {invalidValue !== undefined && <small role="alert">请输入有效的数值。</small>}
    </div>
  );
}

function Remove({ node, editing }: { node: JsonNode; editing: RuleEditing }) {
  return (
    <button
      type="button"
      className="text-button"
      aria-label={'移除 ' + (labels[node.key!] ?? node.key)}
      onClick={() => editing.change((m) => m.remove(node.path))}
    >
      移除此项
    </button>
  );
}
export function schemaRuleFields(model: DataSchemaModel, scope?: JsonNode) {
  return (child(scope, 'properties')?.children ?? [])
    .filter((node) => !model.ambiguous.has(node.path))
    .map((node) => ({
      ref: { source: 'data' as const, path: '/' + escapeKey(node.key!) },
      label: model.str(child(node, 'title')) ?? node.key!,
      type: model.str(child(node, 'type')) ?? '模型',
    }));
}

export function SchemaConditionInput({
  node,
  scope,
  editing,
}: {
  node: JsonNode;
  scope: JsonNode;
  editing: RuleEditing;
}) {
  const { model, change } = editing;
  function descendants(
    parent: JsonNode,
    prefix: string[] = [],
  ): ReturnType<typeof schemaRuleFields> {
    return schemaRuleFields(model, parent).flatMap((field) => {
      const key = field.ref.path.slice(1).replaceAll('~1', '/').replaceAll('~0', '~');
      const nested = child(child(parent, 'properties'), key);
      const path = [...prefix, field.ref.path];
      return [
        { ...field, ref: { ...field.ref, path: path.join('') } },
        ...(nested ? descendants(nested, path) : []),
      ];
    });
  }
  const fields = descendants(scope);
  function read(condition: JsonNode, path = ''): { path: string; constant?: JsonNode } | undefined {
    const required = child(condition, 'required');
    const properties = child(condition, 'properties');
    const key = required?.children?.length === 1 ? model.str(required.children[0]) : undefined;
    if (
      condition.kind !== 'object' ||
      key === undefined ||
      condition.children?.length !== (properties ? 2 : 1) ||
      [condition, required, properties].some((n) => n && model.ambiguous.has(n.path))
    )
      return;
    const next = path + '/' + escapeKey(key);
    if (!properties) return { path: next };
    const branch = child(properties, key);
    if (properties.children?.length !== 1 || !branch || model.ambiguous.has(branch.path)) return;
    const constant = child(branch, 'const');
    if (constant && branch.children?.length === 1) return { path: next, constant };
    if (child(branch, 'type') && model.str(child(branch, 'type')) === 'object') {
      return read({ ...branch, children: branch.children?.filter((n) => n.key !== 'type') }, next);
    }
  }
  const parsed = read(node);
  const constant = parsed?.constant;
  const selected = fields.find((field) => field.ref.path === parsed?.path);
  if ((!selected && (node.kind !== 'object' || node.children?.length)) || !fields.length)
    return <RuleInputs node={node} editing={editing} />;
  function fieldKind(path: string) {
    const leaf = path
      .slice(1)
      .split('/')
      .reduce<JsonNode | undefined>(
        (parent, key) =>
          child(child(parent, 'properties'), key.replaceAll('~1', '/').replaceAll('~0', '~')),
        scope,
      );
    const type = model.str(child(leaf, 'type'));
    const kind = type === 'integer' ? 'number' : type;
    return kind && Object.hasOwn(literalDefaults, kind)
      ? (kind as keyof typeof literalDefaults)
      : undefined;
  }
  const kind = parsed && fieldKind(parsed.path);
  function write(path: string, mode: string) {
    const keys = path
      .slice(1)
      .split('/')
      .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
    const field = JSON.stringify(keys.pop());
    function constraint(key: string, nested?: string) {
      return (
        '"required":[' + key + ']' + (nested ? ',"properties":{' + key + ':' + nested + '}' : '')
      );
    }
    const kind = fieldKind(path);
    const token =
      constant && path === parsed?.path && (!kind || constant.kind === kind)
        ? model.raw(constant)
        : kind
          ? literalDefaults[kind]
          : 'null';
    let raw = constraint(field, mode === 'equals' ? '{"const":' + token + '}' : undefined);
    for (const key of keys.reverse())
      raw = constraint(JSON.stringify(key), '{"type":"object",' + raw + '}');
    change((m) => m.replace(node.path, '{' + raw + '}'));
  }
  return (
    <div className="schema-next-stack">
      <div className="schema-next-grid">
        <div className="schema-next-field">
          <span>
            条件字段
            <RequiredMark />
          </span>
          <FieldPicker
            fields={fields}
            label="选择条件字段"
            value={selected?.ref ?? null}
            onChange={(ref) => write(ref.path, constant ? 'equals' : 'exists')}
          />
          {selected && <small>{selected.ref.path}</small>}
        </div>
        {selected && (
          <label className="schema-next-field">
            <span>
              判断方式
              <RequiredMark />
            </span>
            <StudioSelect
              value={constant ? 'equals' : 'exists'}
              onValueChange={(selected) => write(parsed!.path, selected)}
            >
              <option value="equals">等于</option>
              <option value="exists">字段存在</option>
            </StudioSelect>
          </label>
        )}
      </div>
      {constant &&
        (kind && constant.kind !== kind ? (
          <div role="status">
            <p>原匹配值与当前字段类型不同。</p>
            <Button variant="secondary" onClick={() => write(parsed!.path, 'equals')}>
              按字段类型重设匹配值
            </Button>
          </div>
        ) : (
          <LiteralInput
            key={constant.path + ':' + constant.kind}
            node={constant}
            label="匹配值"
            editing={editing}
            rawJson={!kind}
            showRequired
          />
        ))}
      <details>
        <summary>完整条件模型（可选）</summary>
        <JsonEditor
          label="条件 JSON"
          text={model.raw(node)}
          readOnly
          size="compact"
          initialMode="text"
        />
        <RuleInputs node={node} editing={editing} />
      </details>
    </div>
  );
}

function requiredFieldNames(node: JsonNode, editing: RuleEditing) {
  const options = schemaRuleFields(editing.model, editing.fieldScope);
  return (node.children ?? []).map((item) => {
    const key = editing.model.str(item);
    if (key === undefined) return editing.model.raw(item);
    const label = options.find((option) => option.ref.path === '/' + escapeKey(key))?.label;
    return label && label !== key ? label + '（' + key + '）' : key || '空字段名';
  });
}

function StringList({ node, editing }: { node: JsonNode; editing: RuleEditing }) {
  const fieldOptions = schemaRuleFields(editing.model, editing.fieldScope);
  const values = node.children?.map((n) => editing.model.str(n) ?? '') ?? [];
  const refs = values.map((key) => ({ source: 'data' as const, path: '/' + escapeKey(key) }));
  if (
    editing.compact &&
    fieldOptions.length &&
    refs.every((ref) => fieldOptions.some((f) => f.ref.path === ref.path))
  ) {
    return (
      <div className="schema-next-stack">
        {values.length ? (
          <ul className="schema-required-fields" aria-label="已选必填字段">
            {requiredFieldNames(node, editing).map((name, index) => (
              <li key={index}>{name}</li>
            ))}
          </ul>
        ) : (
          <small>尚未选择必填字段</small>
        )}
        <FieldPicker
          multiple
          label="选择必填字段"
          fields={fieldOptions}
          value={refs}
          onChange={(next) =>
            editing.change((m) =>
              m.replace(
                node.path,
                JSON.stringify(
                  next.map((ref) => ref.path.slice(1).replaceAll('~1', '/').replaceAll('~0', '~')),
                ),
              ),
            )
          }
        />
      </div>
    );
  }
  return (
    <>
      {node.children?.map((n) => (
        <div key={n.path} className="toolbar">
          <LiteralInput node={n} label="必填字段名" editing={editing} />
          <Remove node={n} editing={editing} />
        </div>
      ))}
      <NamedEntry
        keys={node.children?.map((n) => editing.model.str(n) ?? '') ?? []}
        label="必填字段"
        add={(name) => editing.change((m) => m.append(node.path, JSON.stringify(name)))}
      />
    </>
  );
}
function CompactRuleInputs({
  node,
  editing,
  leading,
}: {
  node: JsonNode;
  editing: RuleEditing;
  leading?: ReactNode;
}) {
  const { model, change } = editing;
  const [addedField, setAddedField] = useState<string>();
  const typeNode = child(node, 'type');
  const value = model.str(typeNode) ?? '';
  const optionalNumbers: [string, string, string, boolean?][] = [
    ['string', 'minLength', '最短长度', true],
    ['string', 'maxLength', '最长长度', true],
    ['number', 'minimum', '最小值'],
    ['number', 'maximum', '最大值'],
    ['number', 'exclusiveMinimum', '必须大于'],
    ['number', 'exclusiveMaximum', '必须小于'],
    ['number', 'multipleOf', '倍数'],
    ['array', 'minItems', '最少项数', true],
    ['array', 'maxItems', '最多项数', true],
    ['object', 'minProperties', '最少属性数', true],
    ['object', 'maxProperties', '最多属性数', true],
  ];
  const applicable = optionalNumbers.filter(
    ([kind, key]) =>
      kind === value ||
      (kind === 'number' && value === 'integer') ||
      child(node, key)?.kind === 'number',
  );
  const direct = new Set(['title', 'description', ...applicable.map(([, key]) => key)]);
  if (!typeNode || typeNode.kind === 'string') direct.add('type');
  const properties = child(node, 'properties');
  const required = child(node, 'required');
  const canEditProperties =
    (!properties || properties.kind === 'object') && (!required || required.kind === 'array');
  if (canEditProperties) direct.add('properties');
  const items = child(node, 'items');
  if (items && (items.kind === 'object' || items.kind === 'boolean')) direct.add('items');
  function set(key: string, raw?: string) {
    const old = child(node, key);
    if (raw !== undefined) change((m) => m.set(node.path, key, raw));
    else if (old) change((m) => m.remove(old.path));
  }
  function manageRequired(key: string, include: boolean) {
    const match = required?.children?.find((n) => model.str(n) === key);
    if (include && !match)
      change((m) =>
        required
          ? m.append(required.path, JSON.stringify(key))
          : m.set(node.path, 'required', JSON.stringify([key])),
      );
    if (!include && match)
      change((m) => m.remove(required?.children?.length === 1 ? required.path : match.path));
  }
  return (
    <div className="schema-next-stack">
      <div className="schema-next-grid">
        {leading}
        {direct.has('type') && (
          <label className="schema-next-field">
            子模型类型
            <StudioSelect
              value={value}
              onValueChange={(selected) =>
                set('type', selected ? JSON.stringify(selected) : undefined)
              }
            >
              <option value="">不限类型</option>
              {value && !schemaTypes.some(([key]) => key === value) && <option>{value}</option>}
              {schemaTypes.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </StudioSelect>
          </label>
        )}
        {(['title', 'description'] as const).map((key) => {
          const old = child(node, key);
          if (old && old.kind !== 'string') return null;
          const label = key === 'title' ? '显示名称' : '说明';
          return (
            <label
              className={'schema-next-field' + (key === 'description' ? ' schema-next-wide' : '')}
              key={key}
            >
              {label}
              {key === 'description' ? (
                <textarea
                  className="schema-rule-description"
                  rows={2}
                  value={model.str(old) ?? ''}
                  onChange={(e) =>
                    set(key, e.target.value ? JSON.stringify(e.target.value) : undefined)
                  }
                />
              ) : (
                <Input
                  value={model.str(old) ?? ''}
                  onChange={(e) =>
                    set(key, e.target.value ? JSON.stringify(e.target.value) : undefined)
                  }
                />
              )}
            </label>
          );
        })}
        {applicable.map(([, key, label, count]) => {
          const old = child(node, key);
          if (old && old.kind !== 'number') return null;
          return (
            <label className="schema-next-field" key={key}>
              {label}
              <Input
                type="number"
                min={count ? 0 : undefined}
                step={count ? 1 : 'any'}
                value={old ? model.raw(old) : ''}
                onChange={(e) => {
                  if (e.target.value === '' || e.target.validity.valid)
                    set(key, e.target.value || undefined);
                }}
              />
            </label>
          );
        })}
      </div>
      {canEditProperties && (value === '' || value === 'object' || !!properties) && (
        <section className="schema-next-stack" aria-label="子字段">
          <strong>子字段</strong>
          {properties?.children?.map((field) => {
            const key = field.key!;
            return (
              <details
                className="schema-next-submodel"
                key={field.path}
                open={addedField === key ? true : undefined}
              >
                <summary>
                  {key}
                  {required?.children?.some((n) => model.str(n) === key) ? ' · 必填' : ''}
                </summary>
                {model.ambiguous.has(field.path) ? (
                  <p>该位置有重复声明，请在 JSON 中核对。</p>
                ) : (
                  <>
                    <label className="schema-next-check">
                      <input
                        type="checkbox"
                        checked={!!required?.children?.some((n) => model.str(n) === key)}
                        onChange={(e) => manageRequired(key, e.target.checked)}
                      />
                      此子字段必填
                    </label>
                    <RuleInputs node={field} editing={{ ...editing, fieldScope: undefined }} />
                    <Button
                      variant="text"
                      onClick={() =>
                        change((m) => {
                          const match = required?.children?.find((n) => model.str(n) === key);
                          const next = match
                            ? m.remove(
                                required?.children?.length === 1 ? required.path : match.path,
                              )
                            : undefined;
                          return (next ? dataSchemaModel(next) : m).remove(field.path);
                        })
                      }
                    >
                      移除 {key}
                    </Button>
                  </>
                )}
              </details>
            );
          })}
          <NamedEntry
            keys={properties?.children?.map((n) => n.key!) ?? []}
            label="子字段标识"
            add={(key) => {
              setAddedField(key);
              change((m) =>
                properties
                  ? m.set(properties.path, key, '{"type":"string"}')
                  : m.set(node.path, 'properties', JSON.stringify({ [key]: { type: 'string' } })),
              );
            }}
          />
        </section>
      )}
      {(value === 'array' || items) && (
        <details className="schema-next-submodel">
          <summary>数组元素模型</summary>
          {items ? (
            <RuleInputs node={items} editing={{ ...editing, fieldScope: undefined }} />
          ) : (
            <Button variant="secondary" onClick={() => set('items', '{}')}>
              配置元素模型
            </Button>
          )}
        </details>
      )}
      {!required &&
        editing.fieldScope &&
        schemaRuleFields(model, editing.fieldScope).length > 0 && (
          <FieldPicker
            multiple
            label="选择必填字段"
            fields={schemaRuleFields(model, editing.fieldScope)}
            value={[]}
            onChange={(next) => {
              if (next.length)
                set(
                  'required',
                  JSON.stringify(
                    next.map((ref) =>
                      ref.path.slice(1).replaceAll('~1', '/').replaceAll('~0', '~'),
                    ),
                  ),
                );
            }}
          />
        )}
      {node.children
        ?.filter((n) => !direct.has(n.key!))
        .map((n) => (
          <details className="schema-next-submodel" key={n.path}>
            <summary>
              {labels[n.key!] ?? n.key}
              {n.key === 'required' && n.kind === 'array' && (
                <span className="schema-required-summary">
                  {n.children?.length
                    ? ' · 已选 ' +
                      n.children.length +
                      ' 项：' +
                      requiredFieldNames(n, editing).join('、')
                    : ' · 未配置'}
                </span>
              )}
            </summary>
            {model.ambiguous.has(n.path) ? (
              <p>该位置有重复声明，请在 JSON 中核对。</p>
            ) : (
              <>
                <RuleKeyword node={n} editing={editing} />
                <Remove node={n} editing={editing} />
              </>
            )}
          </details>
        ))}
      <KeyChooser
        keys={Object.keys(seeds).filter((key) => !child(node, key) && !direct.has(key))}
        label="添加子模型限制"
        action="添加限制"
        add={(key) => set(key, seeds[key])}
      />
    </div>
  );
}
export function RuleInputs({ node, editing }: { node: JsonNode; editing: RuleEditing }) {
  const { model, change } = editing;
  if (model.ambiguous.has(node.path)) return <p>路径存在重复属性，请前往 JSON 定位。</p>;
  if (!['object', 'boolean'].includes(node.kind))
    return <p>此位置需要 Schema 对象或布尔值，请通过 JSON 修复。</p>;
  const constraintType = (
    <label className="schema-next-field schema-rule-constraint-type">
      约束形式
      <StudioSelect
        value={node.kind === 'object' ? 'object' : model.raw(node)}
        onValueChange={(selected) =>
          change((m) => m.replace(node.path, selected === 'object' ? '{}' : selected))
        }
      >
        <option value="object">配置约束</option>
        <option value="true">允许任何值</option>
        <option value="false">拒绝所有值</option>
      </StudioSelect>
    </label>
  );
  if (node.kind === 'object' && editing.compact)
    return <CompactRuleInputs node={node} editing={editing} leading={constraintType} />;
  return (
    <>
      {constraintType}
      {node.kind === 'object' && (
        <>
          {node.children?.map((n) => (
            <fieldset key={n.start + ':' + n.path} className="schema-rule-key">
              <legend>{labels[n.key!] ?? n.key}</legend>
              {model.ambiguous.has(n.path) ? (
                <p>该属性存在重复项，请通过 JSON 修复。</p>
              ) : (
                <>
                  <RuleKeyword node={n} editing={editing} />
                  <Remove node={n} editing={editing} />
                </>
              )}
            </fieldset>
          ))}
          <KeyChooser
            keys={Object.keys(seeds).filter((k) => !node.children?.some((n) => n.key === k))}
            label="新增约束类型"
            action="添加一项"
            add={(k) => change((m) => m.set(node.path, k, seeds[k]))}
          />
        </>
      )}
    </>
  );
}
function RuleKeyword({ node, editing }: { node: JsonNode; editing: RuleEditing }) {
  const k = node.key!;
  const { model, change } = editing;
  if (k === 'required' && node.kind === 'array' && node.children?.every((n) => n.kind === 'string'))
    return <StringList node={node} editing={editing} />;
  if (k === 'type' && node.kind === 'string')
    return (
      <label>
        数据类型
        <StudioSelect
          value={model.str(node) ?? ''}
          onValueChange={(selected) =>
            change((m) => m.replace(node.path, JSON.stringify(selected)))
          }
        >
          {[
            ...new Set([
              model.str(node)!,
              'string',
              'integer',
              'number',
              'boolean',
              'object',
              'array',
              'null',
            ]),
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </StudioSelect>
      </label>
    );
  if (
    k === 'const' ||
    ['type', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern'].includes(k)
  )
    return (
      <LiteralInput node={node} label={labels[k]} flexible={k === 'const'} editing={editing} />
    );
  if (
    ['properties', 'dependentSchemas', 'dependentRequired', 'patternProperties'].includes(k) &&
    node.kind === 'object'
  )
    return (
      <>
        {node.children?.map((n) => (
          <fieldset key={n.path + ':' + n.start}>
            <legend>{n.key}</legend>
            {model.ambiguous.has(n.path) ? (
              <p>字段存在重复项，请通过 JSON 修复。</p>
            ) : (
              <>
                {k === 'dependentRequired' ? (
                  <StringList node={n} editing={editing} />
                ) : (
                  <RuleInputs node={n} editing={editing} />
                )}
                <Remove node={n} editing={editing} />
              </>
            )}
          </fieldset>
        ))}
        <NamedEntry
          label="字段名"
          keys={node.children?.map((n) => n.key!) ?? []}
          add={(name) =>
            change((m) => m.set(node.path, name, k === 'dependentRequired' ? '[]' : '{}'))
          }
        />
      </>
    );
  if ([...groups, 'prefixItems'].includes(k) && node.kind === 'array')
    return (
      <>
        {node.children?.map((n, i) => (
          <fieldset key={n.path}>
            <legend>分支 {i + 1}</legend>
            <RuleInputs node={n} editing={editing} />
            <button
              type="button"
              className="text-button"
              onClick={() =>
                change((m) => m.remove(node.children?.length === 1 ? node.path : n.path))
              }
            >
              移除此分支
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="quiet"
          onClick={() => change((m) => m.append(node.path, '{}'))}
        >
          新增分支
        </button>
      </>
    );
  if ([...singles, 'if', 'then', 'else'].includes(k))
    return <RuleInputs node={node} editing={editing} />;
  return (
    <p>
      通过 JSON 编辑此属性。<code>{model.raw(node)}</code>
    </p>
  );
}
