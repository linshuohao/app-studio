'use client';

import { StudioSelect } from '../components/ui/select';
import { Button } from '../components/ui/controls';
import { SchemaJsonValue } from './schema-json-value';
import { JsonEditor } from '../components/json/json-editor';
import { useId, useState } from 'react';
import type { JsonNode } from '../components/json/model';
import { dataSchemaModel, type DataSchemaModel } from './data-schema-model';
import { RegexInput } from './regex-input';
import { child, escapeKey } from './semantic-model';
import { usePendingNavigation, useSchemaNavigation } from './schema-navigation';

type Props = {
  text: string;
  node: JsonNode;
  apply: (text: string) => void;
  locate: (path: string) => void;
  select: (path: string) => void;
};

const types = [
  ['string', '文本'],
  ['integer', '整数'],
  ['number', '数值'],
  ['boolean', '布尔'],
  ['object', '对象'],
  ['array', '数组'],
  ['null', '空值'],
] as const;
type Property = {
  key: string;
  label: string;
  kind: 'text' | 'count' | 'number' | 'list' | 'literal' | 'flag';
  type?: string;
  advanced?: boolean;
  hint?: string;
};
const properties: Property[] = [
  { key: 'title', label: '显示名称', kind: 'text', hint: '填写字段的可读名称，例如「邮政编码」。' },
  {
    key: 'description',
    label: '说明',
    kind: 'text',
    advanced: true,
    hint: '说明字段用途，例如「用于寄送纸质保单」。',
  },
  {
    key: 'minLength',
    label: '最短长度',
    type: 'string',
    kind: 'count',
    hint: '填写允许的最少字符数，例如 6。',
  },
  {
    key: 'maxLength',
    label: '最长长度',
    type: 'string',
    kind: 'count',
    hint: '填写允许的最多字符数，例如 20。',
  },
  {
    key: 'format',
    label: '格式',
    type: 'string',
    kind: 'text',
    hint: '填写格式名称，例如 email 或 date。当前引擎不会用它校验字段值。',
  },
  { key: 'pattern', label: '正则匹配', type: 'string', kind: 'text', advanced: true },
  {
    key: 'minimum',
    label: '最小值',
    type: 'number',
    kind: 'number',
    hint: '填写包含边界的最小值，例如 0 表示允许 0。',
  },
  {
    key: 'maximum',
    label: '最大值',
    type: 'number',
    kind: 'number',
    hint: '填写包含边界的最大值，例如 100 表示允许 100。',
  },
  {
    key: 'exclusiveMinimum',
    label: '大于',
    type: 'number',
    kind: 'number',
    advanced: true,
    hint: '填写下界，例如 0 表示必须大于 0。',
  },
  {
    key: 'exclusiveMaximum',
    label: '小于',
    type: 'number',
    kind: 'number',
    advanced: true,
    hint: '填写上界，例如 100 表示必须小于 100。',
  },
  {
    key: 'multipleOf',
    label: '必须为其倍数',
    type: 'number',
    kind: 'number',
    advanced: true,
    hint: '填写大于零的数，例如 5 表示允许 0、5、10 等倍数。',
  },
  {
    key: 'minItems',
    label: '最少元素',
    type: 'array',
    kind: 'count',
    hint: '填写数组至少要有几项，例如 1。',
  },
  {
    key: 'maxItems',
    label: '最多元素',
    type: 'array',
    kind: 'count',
    hint: '填写数组最多可有几项，例如 10。',
  },
  {
    key: 'uniqueItems',
    label: '元素必须唯一',
    type: 'array',
    kind: 'flag',
    hint: '选择「是」要求各项不同，例如 [1, 1] 会校验失败。',
  },
  {
    key: 'minContains',
    label: '最少匹配元素',
    type: 'array',
    kind: 'count',
    advanced: true,
    hint: '填写至少有几项符合 contains 条件，例如 1。',
  },
  {
    key: 'maxContains',
    label: '最多匹配元素',
    type: 'array',
    kind: 'count',
    advanced: true,
    hint: '填写最多有几项符合 contains 条件，例如 3。',
  },
  {
    key: 'minProperties',
    label: '最少属性',
    type: 'object',
    kind: 'count',
    advanced: true,
    hint: '填写对象至少要有几个属性，例如 1。',
  },
  {
    key: 'maxProperties',
    label: '最多属性',
    type: 'object',
    kind: 'count',
    advanced: true,
    hint: '填写对象最多可有几个属性，例如 5。',
  },
  {
    key: 'default',
    label: '默认值',
    kind: 'literal',
    hint: '以 JSON 记录建议的默认值，例如 "启用" 或 0；引擎不会自动填入。',
  },
  {
    key: 'enum',
    label: '允许值列表',
    kind: 'list',
    advanced: true,
    hint: '填写 JSON 数组，例如 ["启用", "停用"]，字段值须等于其中一项。',
  },
  {
    key: 'const',
    label: '固定值',
    kind: 'literal',
    advanced: true,
    hint: '填写须精确匹配的 JSON 值，例如 "CN"。',
  },
  {
    key: '$comment',
    label: '模型注释',
    kind: 'text',
    advanced: true,
    hint: '填写维护者备注，例如「与投保接口字段一致」。',
  },
  {
    key: 'examples',
    label: '示例列表',
    kind: 'list',
    advanced: true,
    hint: '填写包含示例值的 JSON 数组，例如 ["012345", "654321"]。',
  },
];

function encode(property: Property, value: string) {
  if (property.kind === 'text') return JSON.stringify(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw Error(property.label + '需要有效的 JSON 值。');
  }
  if (property.kind === 'list' && !Array.isArray(parsed))
    throw Error(property.label + '需要 JSON 数组。');
  if (
    property.kind === 'count' &&
    (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 0)
  )
    throw Error(property.label + '需要非负整数。');
  if (
    property.kind === 'number' &&
    (typeof parsed !== 'number' ||
      !Number.isFinite(parsed) ||
      (property.key === 'multipleOf' && parsed <= 0))
  )
    throw Error(property.label + '需要有效数值，倍数须大于零。');
  return value;
}

function usageLabel(path: string, model: DataSchemaModel) {
  const parts = path
    .slice(1)
    .split('/')
    .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (parts[0] === 'viewTemplates' && parts[2] === 'params' && parts[4] === 'schemaRef')
    return `模板「${parts[1]}」的参数「${parts[3]}」`;
  if (parts[0] === 'validationMessages') return `第 ${Number(parts[1]) + 1} 条校验文案`;

  const item = model.nodes.find((entry) => entry.node.path === path);
  if (!item) return `模型约束「${parts.at(-1)}」`;
  const names: string[] = [];
  let ancestor = item.owner;
  while (ancestor) {
    const parent = model.nodes.find((entry) => entry.node.path === ancestor);
    if (!parent || parent.role === 'root') break;
    names.unshift(parent.label);
    ancestor = parent.owner;
  }
  if (item.node.key === 'items' && item.role === 'items')
    return names.length ? `数组「${names.join(' › ')}」的元素` : '根数组的元素';
  names.push(item.label);
  const kind =
    item.role === 'definition' ? '共享定义' : item.role === 'field' ? '字段' : '模型节点';
  return `${kind}「${names.join(' › ')}」`;
}

function refValue(name: string) {
  try {
    return '#/$defs/' + encodeURIComponent(escapeKey(name));
  } catch {
    return '';
  } // A lone UTF-16 surrogate cannot be represented in a URI.
}
function localPointer(ref: string) {
  try {
    return decodeURIComponent(ref);
  } catch {
    return undefined;
  }
}
export type SchemaNodeAction = 'field' | 'definition' | 'items' | 'insert' | 'rename' | 'delete';

export function SchemaInspector({
  text,
  node,
  model,
  apply,
  locate,
  select,
  initialAction,
}: Props & { model: DataSchemaModel; initialAction?: SchemaNodeAction }) {
  const hintPrefix = useId();
  const { beforeLeave, pendingOwner } = useSchemaNavigation();
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [action, setAction] = useState(initialAction);
  const [name, setName] = useState(initialAction === 'rename' ? (node.key ?? '') : '');
  const [newType, setNewType] = useState(initialAction === 'items' ? 'object' : 'string');
  const [error, setError] = useState('');
  function applyProperties() {
    try {
      let next = text;
      for (const [key, value] of Object.entries(changes)) {
        const current = next === text ? model : dataSchemaModel(next);
        const path = node.path + '/' + escapeKey(key);
        if (value === '') {
          if (current.byPath.has(path)) next = current.remove(path);
        } else {
          const property = properties.find((p) => p.key === key)!;
          next = current.set(node.path, key, encode(property, value));
        }
      }
      apply(next);
      setChanges({});
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法应用属性修改。');
      return false;
    }
  }
  const pending = Object.keys(changes).length > 0;
  usePendingNavigation(
    'inspector',
    pending
      ? {
          apply: applyProperties,
          discard: () => {
            setChanges({});
            setError('');
          },
        }
      : action
        ? {
            discard: () => {
              setAction(undefined);
              setError('');
            },
          }
        : null,
  );
  const lockProperties = !!action || pendingOwner === 'rules';
  const lockImmediateActions = pending || lockProperties;
  const item = model.nodes.find((n) => n.node.path === node.path);
  if (!item || !model.schema) return null;
  const rootPath = model.schema.path;
  const isField = item.role === 'field',
    isDef = item.role === 'definition';
  const definition = model.definitions.find(
    (d) => node.path === d.node.path || node.path.startsWith(d.node.path + '/'),
  );
  const impacts = model.impacts(node.path);
  const target = model.str(child(node, '$ref')) ?? '';
  const local = model.localRef(node.path);
  const options = model.definitions.filter(
    (d) => !model.ambiguous.has(d.node.path) && refValue(d.node.key!),
  );
  const targetDefinition = local
    ? options.find((d) => '#/$defs/' + escapeKey(d.node.key!) === localPointer(target))
    : undefined;
  const typeNode = child(node, 'type');
  const typeValue: unknown = typeNode ? JSON.parse(model.raw(typeNode)) : '';
  const effective = model.effectiveType(node);
  const childActions = model.childActions(node);
  const hasType = (t: string) =>
    Array.isArray(effective) ? effective.includes(t) : effective === t;
  const available = properties.filter(
    (p) =>
      !p.type ||
      !effective ||
      hasType(p.type) ||
      (p.type === 'number' && hasType('integer')) ||
      child(node, p.key),
  );
  const jump = (path: string, label: string) => (
    <button type="button" className="text-button" onClick={() => locate(path)}>
      {label}
    </button>
  );
  function run(operation: () => string, nextPath?: string) {
    try {
      const next = operation();
      if (next !== text) apply(next);
      setError('');
      setAction(undefined);
      setChanges({});
      if (nextPath) select(nextPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法修改此位置。');
    }
  }
  function start(action: SchemaNodeAction) {
    if (lockImmediateActions) return;
    setAction(action);
    setName(action === 'rename' ? node.key! : '');
    setNewType(action === 'items' ? 'object' : 'string');
    setError('');
  }
  function structural() {
    const key = name.trim();
    const schema =
      newType === 'true' || newType === 'false'
        ? newType
        : JSON.stringify(newType.startsWith('#/') ? { $ref: newType } : { type: newType });
    if (action === 'delete')
      return run(() => model.deleteNamed(node.path), item?.owner ?? rootPath);
    if (action === 'rename')
      return run(
        () => model.renameNamed(node.path, key),
        node.path.slice(0, node.path.lastIndexOf('/') + 1) + escapeKey(key),
      );
    if (action === 'definition')
      return run(() => model.addDefinition(key, schema), rootPath + '/$defs/' + escapeKey(key));
    if (action === 'insert')
      return run(
        () => model.insertSibling(node.path, key, schema),
        node.path.slice(0, node.path.lastIndexOf('/') + 1) + escapeKey(key),
      );
    if (action === 'items')
      return run(() => model.set(node.path, 'items', schema), node.path + '/items');
    run(() => model.addField(node.path, key, schema), node.path + '/properties/' + escapeKey(key));
  }
  function propertyInput(p: Property) {
    const original = child(node, p.key);
    const initial = original
      ? p.kind === 'text'
        ? (model.str(original) ?? model.raw(original))
        : model.raw(original)
      : '';
    const value = changes[p.key] ?? initial;
    function onChange(v: string) {
      setChanges((previous) => {
        const next = { ...previous };
        if (v === initial) delete next[p.key];
        else next[p.key] = v;
        return next;
      });
    }
    if (
      original &&
      (model.ambiguous.has(original.path) || (p.kind === 'text' && original.kind !== 'string'))
    ) {
      return <div key={p.key}>{jump(original.path, p.label + ' · 在 JSON 中编辑')}</div>;
    }
    if (p.key === 'pattern') {
      return (
        <RegexInput key={node.path} value={value} disabled={lockProperties} onChange={onChange} />
      );
    }
    if (p.kind === 'literal' || p.kind === 'list') {
      return (
        <div key={node.path + '/' + p.key}>
          <span>{p.label}</span>
          {p.kind === 'list' || original?.kind === 'object' || original?.kind === 'array' ? (
            <SchemaJsonValue
              label={p.label}
              text={value}
              readOnly={lockProperties}
              kind={p.kind === 'list' || original?.kind === 'array' ? 'array' : 'object'}
              onChange={onChange}
            />
          ) : (
            <JsonEditor
              label={p.label}
              initialMode="text"
              text={value}
              readOnly={lockProperties}
              onChange={onChange}
            />
          )}
          <small>{p.hint}</small>
        </div>
      );
    }
    const hintId = hintPrefix + '-' + p.key;
    return (
      <label key={p.key}>
        {p.label}
        {p.kind === 'flag' ? (
          <StudioSelect
            disabled={lockProperties}
            aria-label={p.label}
            aria-describedby={hintId}
            value={value}
            onValueChange={(selected) => onChange(selected)}
          >
            <option value="">未指定</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </StudioSelect>
        ) : (
          <input
            disabled={lockProperties}
            aria-label={p.label}
            aria-describedby={hintId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <small id={hintId}>{p.hint}</small>
      </label>
    );
  }
  const supportedType = (t: unknown) => types.some(([k]) => k === t);
  const union =
    Array.isArray(typeValue) &&
    typeValue.length > 0 &&
    typeValue.every(supportedType) &&
    new Set(typeValue).size === typeValue.length;
  const editableType = !typeNode || supportedType(typeValue) || union;
  const ownerRequired = item.owner && child(model.byPath.get(item.owner), 'required');
  const unsafeRequired =
    ownerRequired &&
    (model.ambiguous.has(ownerRequired.path) ||
      ownerRequired.kind !== 'array' ||
      ownerRequired.children?.some((entry) => entry.kind !== 'string'));
  const typeOptions = types.map(([t, label]) => (
    <option key={t} value={t}>
      {label} · {t}
    </option>
  ));
  return (
    <section className="semantic-inspector" aria-label="模型属性">
      {model.ambiguous.has(node.path) ? (
        <p role="alert">此位置包含重复属性，请在 JSON 中定位。</p>
      ) : (
        <>
          {definition && (
            <section aria-label="共享定义使用位置">
              <details>
                <summary>
                  共享定义「{definition.label}」 · 已知影响 {impacts.paths.length} 处
                </summary>
                {impacts.paths.map((path) => (
                  <div key={path}>
                    {jump(path, usageLabel(path, model))}
                    <div>
                      <small>{path}</small>
                    </div>
                  </div>
                ))}
                {!impacts.unknown && !impacts.paths.length && <p>当前配置中未找到使用位置。</p>}
              </details>
              {impacts.unknown && <p>存在无法静态确认的引用，请在 JSON 中检查其作用域。</p>}
            </section>
          )}
          {pendingOwner === 'rules' && (
            <p className="muted">保存或取消当前规则后，可以继续修改模型属性。</p>
          )}
          <div className="action-row">
            {node.kind === 'object' && (
              <>
                {childActions.field && (
                  <button
                    className="quiet"
                    disabled={lockImmediateActions}
                    onClick={() => start('field')}
                  >
                    新增字段
                  </button>
                )}
                {childActions.items && (
                  <button
                    className="quiet"
                    disabled={lockImmediateActions}
                    onClick={() => start('items')}
                  >
                    新增数组元素
                  </button>
                )}
                {item.role === 'root' && (
                  <button
                    className="quiet"
                    disabled={lockImmediateActions}
                    onClick={() => start('definition')}
                  >
                    新增共享定义
                  </button>
                )}
              </>
            )}
            {(isField || isDef) && (
              <>
                <button
                  className="quiet"
                  disabled={lockImmediateActions}
                  onClick={() => start('insert')}
                >
                  {isDef ? '插入同级定义' : '插入同级字段'}
                </button>
                <button
                  className="quiet"
                  disabled={lockImmediateActions}
                  onClick={() => start('rename')}
                >
                  {isDef ? '更改定义名' : '更改字段名'}
                </button>
              </>
            )}
            {item.role !== 'root' && (
              <button
                className="quiet"
                disabled={lockImmediateActions}
                onClick={() => start('delete')}
              >
                {isDef
                  ? '删除定义'
                  : isField
                    ? '删除字段'
                    : node.path.includes('/patternProperties/')
                      ? '删除模型节点'
                      : '删除数组元素'}
              </button>
            )}
          </div>
          {action && (
            <div className="semantic-change">
              <h4>
                {
                  {
                    field: '新增字段',
                    definition: '新增共享定义',
                    items: '新增数组元素',
                    insert: isDef ? '在此定义后插入' : '在此字段后插入',
                    rename: '更改名称',
                    delete: '删除节点',
                  }[action]
                }
              </h4>
              {action !== 'delete' && action !== 'items' && (
                <label>
                  {action === 'definition' ||
                  (isDef && (action === 'rename' || action === 'insert'))
                    ? '定义名'
                    : '字段名'}
                  <input
                    aria-label={
                      action === 'definition' ||
                      (isDef && (action === 'rename' || action === 'insert'))
                        ? '定义名'
                        : '字段名'
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <small>填写 JSON 属性名，例如 postalCode。</small>
                </label>
              )}
              {action !== 'delete' && action !== 'rename' && (
                <label>
                  节点类型
                  <StudioSelect
                    aria-label="节点类型"
                    value={newType}
                    onValueChange={(selected) => setNewType(selected)}
                  >
                    {typeOptions}
                    <option value="true">允许任意值</option>
                    <option value="false">拒绝所有值</option>
                    {local &&
                      options.map((d) => (
                        <option key={d.node.path} value={refValue(d.node.key!)}>
                          引用 · {d.node.key}
                        </option>
                      ))}
                  </StudioSelect>
                  <small>选择节点接受的值，例如「文本」用于邮政编码。</small>
                </label>
              )}
              {action === 'delete' && (
                <p>
                  删除 {node.key}
                  {isField ? '，同时移除所属对象中此字段的始终必填要求' : ''}。
                </p>
              )}
              {(action === 'rename' || action === 'delete') && (
                <>
                  {impacts.paths.map((p) => (
                    <div key={p}>{jump(p, p)}</div>
                  ))}
                  {impacts.unknown && <p>部分使用位置无法确定，请通过 JSON 核对。</p>}
                </>
              )}
              {(action === 'delete' || action === 'rename') &&
                (impacts.unknown || impacts.paths.length > 0) && (
                  <p>此操作涉及使用位置，请在 JSON 中核对后编辑。</p>
                )}
              <button
                disabled={
                  pending ||
                  (action !== 'delete' && action !== 'items' && !name.trim()) ||
                  ((action === 'delete' || action === 'rename') &&
                    (impacts.unknown || impacts.paths.length > 0))
                }
                onClick={structural}
              >
                {action === 'delete' ? '确认删除' : action === 'rename' ? '确认改名' : '确认新增'}
              </button>
              <button
                className="quiet"
                onClick={() => {
                  setAction(undefined);
                  setError('');
                }}
              >
                取消
              </button>
            </div>
          )}
          {isField &&
            (unsafeRequired ? (
              jump(ownerRequired.path, '始终必填 · 在 JSON 中修复')
            ) : (
              <label>
                始终必填
                <input
                  type="checkbox"
                  aria-label="始终必填"
                  checked={item.required}
                  disabled={lockImmediateActions}
                  onChange={(e) => run(() => model.setRequired(node.path, e.target.checked))}
                />
                <small>例如勾选后，提交时必须包含邮政编码字段。</small>
              </label>
            ))}
          {node.kind === 'boolean' ? (
            <label>
              模型规则
              <StudioSelect
                aria-label="模型规则"
                disabled={lockImmediateActions}
                value={model.raw(node)}
                onValueChange={(selected) => run(() => model.replace(node.path, selected))}
              >
                <option value="true">允许任意值</option>
                <option value="false">拒绝所有值</option>
              </StudioSelect>
              <small>例如选择「拒绝所有值」，任何输入都无法通过该节点。</small>
            </label>
          ) : node.kind === 'object' ? (
            <>
              <h4>基本配置</h4>
              {editableType && !model.ambiguous.has(node.path + '/type') ? (
                <>
                  <label>
                    数据类型
                    <StudioSelect
                      aria-label="数据类型"
                      value={union ? 'multi' : (typeValue as string)}
                      disabled={lockImmediateActions}
                      onValueChange={(selected) =>
                        run(() => {
                          const v = selected;
                          if (!v) return model.remove(node.path + '/type');
                          const first =
                            typeof typeValue === 'string' && typeValue && typeValue !== 'null'
                              ? typeValue
                              : 'string';
                          return model.set(
                            node.path,
                            'type',
                            JSON.stringify(v === 'multi' ? [first, 'null'] : v),
                          );
                        })
                      }
                    >
                      <option value="">{target ? '沿用引用定义' : '不限类型'}</option>
                      {typeOptions}
                      <option value="multi">多个类型</option>
                    </StudioSelect>
                    <small>选择字段可接收的值，例如「整数」用于件数。</small>
                  </label>
                  {union && typeNode && (
                    <fieldset>
                      <legend>允许的数据类型</legend>
                      <small>例如同时选「文本」和「空值」，可填写文本或 JSON 的 null。</small>
                      {types.map(([value, label]) => {
                        const member = typeNode.children?.find((n) => model.str(n) === value);
                        return (
                          <label key={value}>
                            <input
                              type="checkbox"
                              checked={!!member}
                              disabled={
                                lockImmediateActions ||
                                (!!member && typeNode.children?.length === 1)
                              }
                              onChange={() =>
                                run(() =>
                                  member
                                    ? model.remove(member.path)
                                    : model.append(typeNode.path, JSON.stringify(value)),
                                )
                              }
                            />
                            {label}
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                </>
              ) : (
                jump(typeNode?.path ?? node.path, '复合类型 · 在 JSON 中编辑')
              )}
              {isField && (impacts.unknown || impacts.paths.length > 0) && (
                <details>
                  <summary>字段变更影响</summary>
                  {impacts.paths.map((p) => (
                    <div key={p}>{jump(p, p)}</div>
                  ))}
                  {impacts.unknown && <p>部分使用位置无法确定，请在 JSON 中核对。</p>}
                </details>
              )}
              {local &&
                !model.ambiguous.has(node.path + '/$ref') &&
                (options.length > 0 || target) && (
                  <label>
                    引用目标
                    <StudioSelect
                      aria-label="引用目标"
                      value={targetDefinition ? refValue(targetDefinition.node.key!) : target}
                      disabled={lockImmediateActions}
                      onValueChange={(selected) =>
                        run(() =>
                          selected
                            ? model.set(node.path, '$ref', JSON.stringify(selected))
                            : model.remove(node.path + '/$ref'),
                        )
                      }
                    >
                      <option value="">无引用</option>
                      {target && !targetDefinition && <option value={target}>{target}</option>}
                      {options.map((d) => (
                        <option key={d.node.path} value={refValue(d.node.key!)}>
                          {d.label === d.node.key ? d.label : d.label + ' · ' + d.node.key}
                        </option>
                      ))}
                    </StudioSelect>
                    <small>选择要复用的共享定义，例如「邮政编码」。</small>
                  </label>
                )}
              {targetDefinition && (
                <button
                  className="text-button"
                  onClick={() => beforeLeave(() => select(targetDefinition.node.path))}
                >
                  查看共享定义 · {targetDefinition.node.key}
                </button>
              )}
              {(child(node, '$dynamicRef') || (child(node, '$ref') && !targetDefinition)) && (
                <p>
                  当前引用目标需在 JSON 中核对。
                  {jump(child(node, '$dynamicRef')?.path ?? node.path + '/$ref', '定位原始引用')}
                </p>
              )}
              {available.filter((p) => !p.advanced).map(propertyInput)}
              <details>
                <summary>高级配置</summary>
                {available.filter((p) => p.advanced).map(propertyInput)}
              </details>
              {pending && (
                <div className="semantic-change">
                  <p role="status">属性修改待应用。</p>
                  <Button onClick={applyProperties}>应用属性修改</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setChanges({});
                      setError('');
                    }}
                  >
                    取消属性修改
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p>此模型需要在 JSON 中修复。</p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
