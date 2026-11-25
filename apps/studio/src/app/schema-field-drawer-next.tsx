'use client';

import { EditorViewSwitch } from '@form-engine/studio-design-components/editor-view-switch';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { useMemo, useState } from 'react';
import { Button, Input } from '@form-engine/studio-design-components';
import { JsonEditor } from '../components/json/json-editor';
import { dataSchemaModel, type DataSchemaModel, type SchemaItem } from './data-schema-model';
import { child, escapeKey } from './semantic-model';
import { Modal } from './modal';
import { compactJson } from '../components/json/format';
import { SchemaRules } from './schema-rules';
import { SchemaNavigation, usePendingNavigation, useSchemaNavigation } from './schema-navigation';
import { SchemaDefinitionUses } from './schema-definition-uses';
import { SchemaTypeSelect, schemaTypes } from './schema-drawer-values';
import { RegexInput } from './regex-input';
import { LiteralValueList } from './literal-value-list';
import {
  LiteralValueEditor,
  literalSource,
  newLiteral,
  readLiteral,
  type Literal,
} from './literal-value-editor';
import './schema-field-drawer-next.css';

const annotationFlags = [
  ['readOnly', '只读注解'],
  ['writeOnly', '只写注解'],
  ['deprecated', '已弃用'],
] as const;
const countLimits = [
  ['string', 'minLength', 'maxLength', '最短长度', '最长长度'],
  ['array', 'minItems', 'maxItems', '最少项数', '最多项数'],
  ['object', 'minProperties', 'maxProperties', '最少属性数', '最多属性数'],
] as const;
type Props = {
  model: DataSchemaModel;
  item: SchemaItem;
  text: string;
  readonly?: boolean;
  breadcrumb: string;
  apply: (text: string, path: string, keepOpen?: boolean) => void;
  close: () => void;
  locate: (path: string) => void;
  openRelated: (path: string) => void;
  returnFocus?: HTMLElement;
  returnToField?: boolean;
};

function refValue(name: string) {
  try {
    return '#/$defs/' + encodeURIComponent(escapeKey(name));
  } catch {
    return '';
  }
}

export function SchemaFieldDrawerNext(props: Props) {
  const { model, item, close, returnFocus, locate } = props;
  const ambiguous = model.ambiguous.has(item.node.path);
  const supported = item.node.kind === 'object' || item.node.kind === 'boolean';
  if (ambiguous || !supported) {
    return (
      <Modal
        title={'字段配置 · ' + item.label}
        className="workbench-drawer"
        size="wide"
        onClose={close}
        returnFocus={returnFocus}
      >
        <p role="alert">
          {ambiguous ? '该位置包含重复属性，请在 JSON 原文中核对。' : '此节点需要在 JSON 中核对。'}
        </p>
        <Button variant="text" onClick={() => locate(item.node.path)}>
          在 JSON 中定位
        </Button>
        <JsonEditor label="字段配置原文" text={model.raw(item.node)} />
      </Modal>
    );
  }
  return <Editor {...props} />;
}

function Editor({
  model: published,
  item,
  text,
  readonly = false,
  breadcrumb,
  apply,
  close,
  locate,
  openRelated,
  returnFocus,
  returnToField,
}: Props) {
  const { beforeLeave } = useSchemaNavigation();
  const [staged, setStaged] = useState(text);
  const working = useMemo(() => dataSchemaModel(staged), [staged]);
  const path = item.node.path;
  const node = working.byPath.get(path)!;
  const savedType = child(node, 'type');
  const activeTypes =
    savedType?.kind === 'array'
      ? (savedType.children?.map((n) => working.str(n) ?? '') ?? [])
      : [working.str(savedType) ?? ''].filter(Boolean);
  const effective = working.effectiveType(node);
  const typeList: string[] = Array.isArray(effective)
    ? effective.filter((value): value is string => typeof value === 'string')
    : typeof effective === 'string'
      ? [effective]
      : [];
  const [error, setError] = useState('');
  const [rulePending, setRulePending] = useState(false);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState(item.node.key ?? '');
  const [view, setView] = useState<'form' | 'json'>('form');
  const [jsonInput, setJsonInput] = useState<string>();
  const [invalidJson, setInvalidJson] = useState(false);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [overrides, setOverrides] = useState(false);
  const [literals, setLiterals] = useState<
    Partial<Record<'default' | 'const' | 'enum' | 'examples', Literal | Literal[] | null>>
  >({});
  const impacts = useMemo(
    () => (rename ? published.impacts(item.node.path) : undefined),
    [published, item.node.path, rename],
  );
  const named = item.role === 'field' || item.role === 'definition';
  const dirty =
    invalidJson ||
    staged !== text ||
    (!!rename && name !== item.node.key) ||
    Object.keys(literals).length > 0;

  function update(operation: (m: DataSchemaModel) => string) {
    if (readonly) return;
    try {
      setStaged(operation(working));
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法修改此位置。');
    }
  }
  function property(m: DataSchemaModel, key: string, value?: string) {
    const target = child(m.byPath.get(path), key);
    if (value === undefined) return target ? m.remove(target.path) : m.raw(m.byPath.get('')!);
    return target && m.raw(target) === value ? m.raw(m.byPath.get('')!) : m.set(path, key, value);
  }
  function set(key: string, value?: string) {
    if (value === undefined && !child(node, key)) return;
    if (value !== undefined && child(node, key) && working.raw(child(node, key)!) === value) return;
    update((m) => property(m, key, value));
  }
  function withLiterals() {
    let next = staged;
    for (const [key, value] of Object.entries(literals)) {
      const m = dataSchemaModel(next);
      const raw = Array.isArray(value)
        ? value.length
          ? '[' + value.map(literalSource).join(',') + ']'
          : undefined
        : value
          ? literalSource(value)
          : undefined;
      const existing = child(m.byPath.get(path), key);
      if (raw === undefined ? !existing : existing && raw === m.raw(existing)) continue;
      next = property(m, key, raw);
    }
    return next;
  }
  function output() {
    if (invalidJson) throw Error('请先修正字段 JSON。');
    let next = withLiterals();
    let target = path;
    const result = dataSchemaModel(next);
    const candidate = result.byPath.get(path);
    const enumValues = child(candidate, 'enum');
    const previousEnum = child(item.node, 'enum');
    if (
      enumValues?.kind === 'array' &&
      (!previousEnum || result.raw(enumValues) !== published.raw(previousEnum))
    ) {
      const entries = (enumValues.children ?? []).map((entry) => compactJson(result.raw(entry)));
      if (new Set(entries).size !== entries.length) throw Error('允许值存在重复项。');
    }
    function reads(model: DataSchemaModel, key: string, scope = path) {
      const value = child(model.byPath.get(scope), key);
      return value?.kind === 'number' ? model.raw(value) : undefined;
    }
    for (const [, min, max, lo, hi] of countLimits) {
      const lower = reads(result, min),
        upper = reads(result, max);
      if (
        lower !== undefined &&
        upper !== undefined &&
        Number(lower) > Number(upper) &&
        (lower !== reads(published, min) || upper !== reads(published, max))
      )
        throw Error(lo + '不能大于' + hi + '。');
    }
    const lowerContains = reads(result, 'minContains'),
      upperContains = reads(result, 'maxContains');
    if (
      child(candidate, 'contains') &&
      upperContains !== undefined &&
      Number(lowerContains ?? 1) > Number(upperContains) &&
      (lowerContains !== reads(published, 'minContains') ||
        upperContains !== reads(published, 'maxContains'))
    )
      throw Error('最少匹配项不能大于最多匹配项。');
    if (rename && name !== item.node.key) {
      next = dataSchemaModel(next).renameNamed(path, name);
      target = path.slice(0, path.lastIndexOf('/') + 1) + escapeKey(name);
    }
    return { next, target };
  }
  function applyStaged(keepOpen = false) {
    if (readonly || rulePending) return false;
    try {
      const { next, target } = output();
      if (next !== text) apply(next, target, keepOpen);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法应用修改。');
      return false;
    }
  }
  usePendingNavigation(
    'inspector',
    !readonly && (dirty || rulePending)
      ? {
          apply: rulePending ? undefined : () => applyStaged(true),
          discard: () => {
            setStaged(text);
            setJsonInput(undefined);
            setInvalidJson(false);
            setView('form');
            setLiterals({});
            setRename(false);
            setName(item.node.key ?? '');
            setRulePending(false);
          },
        }
      : null,
  );

  function leaveField(related?: string) {
    beforeLeave(() => {
      if (related) openRelated(related);
      else close();
    });
  }

  function openSource() {
    if (rulePending) return;
    try {
      const next = withLiterals();
      setStaged(next);
      setLiterals({});
      setJsonInput(undefined);
      setView('json');
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法读取节点。');
    }
  }
  function editSource(raw: string) {
    setJsonInput(raw);
    try {
      const candidate: unknown = JSON.parse(raw);
      if (
        typeof candidate !== 'boolean' &&
        (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      )
        throw Error('字段 JSON 必须是 Schema 对象或布尔值。');
      const next = working.replace(path, raw);
      const model = dataSchemaModel(next);
      if ([...model.ambiguous].some((key) => key === path || key.startsWith(path + '/')))
        throw Error('字段 JSON 包含重复属性。');
      setStaged(next);
      setInvalidJson(false);
      setError('');
    } catch (error) {
      setInvalidJson(true);
      setError(
        error instanceof Error && !(error instanceof SyntaxError)
          ? error.message
          : '请输入有效的字段 JSON。',
      );
    }
  }
  const targetRef = working.str(child(node, '$ref')) ?? '';
  const references = working.definitions
    .filter((d) => !working.ambiguous.has(d.node.path))
    .map((d) => ({
      ...d,
      ref: refValue(d.node.key!),
    }))
    .filter((d) => d.ref);
  const local = working.localRef(path);
  const resolved = references.find(
    (d) => local && (decodeURIComponent(d.ref) === targetRef || d.ref === targetRef),
  );
  const reference = Boolean(targetRef || child(node, '$dynamicRef'));
  const canChooseRef = local;
  const hasOverrides = Boolean(
    node.children?.some((n) => !['title', '$ref', '$dynamicRef'].includes(n.key!)) ||
    working.nodes.find((n) => n.node.path === path)?.required,
  );
  const showFields = !reference || overrides;

  function fieldText(key: string, label: string, wide = false, multiline = false) {
    const control = child(node, key);
    if (control && control.kind !== 'string') return null;
    const value = working.str(control) ?? '';
    const change = (input: string) => set(key, input === '' ? undefined : JSON.stringify(input));
    return (
      <label className={'schema-next-field' + (wide ? ' schema-next-wide' : '')} key={key}>
        {label}
        {multiline ? (
          <textarea
            className="schema-field-textarea"
            rows={2}
            value={value}
            onChange={(e) => change(e.target.value)}
          />
        ) : (
          <Input
            aria-describedby={key === 'format' ? 'schema-next-format-hint' : undefined}
            list={key === 'format' ? 'schema-next-formats' : undefined}
            value={value}
            onChange={(e) => change(e.target.value)}
          />
        )}
        {key === 'format' && (
          <datalist id="schema-next-formats">
            {['date', 'date-time', 'email', 'uri', 'uuid'].map((format) => (
              <option value={format} key={format} />
            ))}
          </datalist>
        )}
      </label>
    );
  }
  function numeric(key: string, label: string, count = false) {
    const n = child(working.byPath.get(path), key);
    if (n && n.kind !== 'number') return null;
    return (
      <label className="schema-next-field" key={key}>
        {label}
        <Input
          type="number"
          min={count ? 0 : undefined}
          step={count ? 1 : 'any'}
          value={n ? working.raw(n) : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (
              v === '' ||
              (!e.target.validity.badInput &&
                !e.target.validity.rangeUnderflow &&
                !e.target.validity.stepMismatch)
            ) {
              if (key === 'multipleOf' && v !== '' && Number(v) <= 0) {
                setError('倍数须大于 0。');
                return;
              }
              set(key, v === '' ? undefined : v);
            }
          }}
        />
      </label>
    );
  }
  function bound(label: string, inclusive: string, exclusive: string, operators: string[]) {
    const first = child(node, inclusive),
      second = child(node, exclusive);
    if (first && second)
      return (
        <div className="schema-next-grid schema-next-wide">
          {numeric(inclusive, label + '（含边界）')}
          {numeric(exclusive, label + '（不含边界）')}
        </div>
      );
    return (
      <Boundary
        key={label}
        {...{ working, path, label, inclusive, exclusive, operators, update }}
      />
    );
  }
  function literal(key: 'default' | 'const', label: string) {
    const old = child(node, key);
    const value = (
      key in literals ? literals[key] : old ? readLiteral(working.raw(old)) : null
    ) as Literal | null;
    return (
      <div className="schema-next-wide schema-next-stack">
        <label className="schema-next-check">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) =>
              setLiterals((current) => ({
                ...current,
                [key]: e.target.checked ? newLiteral(typeList[0]) : null,
              }))
            }
          />
          设置{label}
        </label>
        {value && (
          <LiteralValueEditor
            allowTypeChange
            label={label}
            value={value}
            onChange={(next) => setLiterals((current) => ({ ...current, [key]: next }))}
          />
        )}
      </div>
    );
  }
  function list(key: 'enum' | 'examples', label: string) {
    const old = child(node, key);
    if (old && old.kind !== 'array') return null;
    const value = (literals[key] ??
      old?.children?.map((n) => readLiteral(working.raw(n))) ??
      []) as Literal[];
    return (
      <details className="schema-next-wide">
        <summary>
          {label}
          {value.length ? ' · ' + value.length + ' 项' : ''}
        </summary>
        <LiteralValueList
          label={label}
          type={typeList[0]}
          value={value}
          onChange={(next) => setLiterals((current) => ({ ...current, [key]: next }))}
        />
      </details>
    );
  }
  function flag(key: string, label: string) {
    const old = child(node, key);
    return (
      <label className="schema-next-field" key={key}>
        {label}
        <StudioSelect
          value={old ? working.raw(old) : ''}
          onValueChange={(selected) => set(key, selected || undefined)}
        >
          <option value="">未设置</option>
          <option value="true">是</option>
          <option value="false">否</option>
        </StudioSelect>
      </label>
    );
  }
  const requested = typeList.length === 0;
  const fits = (t: string, ...keys: string[]) =>
    typeList.includes(t) || keys.some((key) => child(node, key));
  const showNumber =
    fits('number', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf') ||
    typeList.includes('integer');
  const configured = [
    'format',
    'examples',
    '$comment',
    'readOnly',
    'writeOnly',
    'deprecated',
    'contentEncoding',
    'contentMediaType',
    'contentSchema',
    '$schema',
    '$id',
    '$anchor',
    '$dynamicAnchor',
    '$dynamicRef',
  ].filter((key) =>
    key === 'examples' && literals.examples
      ? (literals.examples as Literal[]).length
      : child(node, key),
  ).length;
  const advancedCount = [
    'pattern',
    'multipleOf',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'contains',
    'minContains',
    'maxContains',
    'additionalProperties',
    'patternProperties',
    'propertyNames',
    'unevaluatedProperties',
    'prefixItems',
    'unevaluatedItems',
    'const',
  ].filter((key) =>
    key === 'const' && key in literals ? literals.const : child(node, key),
  ).length;
  const validType =
    (!savedType ||
      savedType.kind === 'string' ||
      (savedType.kind === 'array' && savedType.children?.length === activeTypes.length)) &&
    activeTypes.every((t) => schemaTypes.some(([key]) => key === t));

  return (
    <Modal
      title={'字段配置 · ' + item.label}
      className="workbench-drawer schema-next-drawer"
      size="wide"
      returnFocus={returnFocus}
      onClose={() => leaveField()}
      actions={
        <>
          <small role="status">
            {readonly
              ? '只读查看'
              : rulePending
                ? '当前规则编辑中'
                : dirty
                  ? '修改尚未应用到工作台'
                  : '已与工作台草稿同步'}
          </small>
          <Button variant="secondary" onClick={() => leaveField()}>
            {returnToField ? '返回字段' : '关闭'}
          </Button>
          {!readonly && (
            <Button disabled={!dirty || rulePending || invalidJson} onClick={() => applyStaged()}>
              应用到工作台
            </Button>
          )}
        </>
      }
      toolbar={
        <div className="toolbar schema-next-tools">
          <small title={path}>{breadcrumb}</small>
          <Button variant="text" onClick={() => locate(path)}>
            在 JSON 中定位
          </Button>
          <EditorViewSwitch
            value={view}
            formDisabled={invalidJson}
            jsonDisabled={rulePending}
            onChange={(next) => (next === 'json' ? openSource() : setView('form'))}
          />
        </div>
      }
    >
      <div ref={setPortal} className="schema-next-stack">
        {error && (
          <p role="alert" className="schema-next-error">
            {error}
          </p>
        )}
        <SchemaDefinitionUses model={working} path={path} locate={locate} />
        {view === 'json' ? (
          <>
            <p>
              此处编辑当前字段的 Schema。字段标识和「始终必填」由外层模型配置，可在表单视图调整。
            </p>
            <JsonEditor
              label="字段配置 JSON"
              initialMode="text"
              text={jsonInput ?? working.raw(node)}
              readOnly={readonly}
              onChange={editSource}
            />
          </>
        ) : node.kind === 'boolean' ? (
          <fieldset disabled={readonly}>
            <label className="schema-next-field">
              模型规则
              <StudioSelect
                value={working.raw(node)}
                onValueChange={(selected) => update((m) => m.replace(path, selected))}
              >
                <option value="true">允许任意值</option>
                <option value="false">拒绝所有值</option>
              </StudioSelect>
            </label>
          </fieldset>
        ) : (
          <>
            <section className="schema-next-section" aria-label="基础属性">
              <h3>基础属性</h3>
              <fieldset disabled={readonly || rulePending} className="schema-next-grid">
                {named && (
                  <label className="schema-next-field">
                    <span className="schema-next-label">
                      字段标识
                      {!readonly && (
                        <Button variant="text" onClick={() => setRename(!rename)}>
                          {rename ? '结束改名' : '改名'}
                        </Button>
                      )}
                    </span>
                    <Input
                      aria-label="字段标识"
                      value={rename ? name : item.node.key}
                      readOnly={!rename}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                )}
                {fieldText('title', '显示名称', !named)}
                {rename && impacts && (impacts.paths.length > 0 || impacts.unknown) && (
                  <p className="schema-next-wide">
                    发现使用位置或无法确定的引用。请先核对原文。
                    {impacts.paths.map((p) => (
                      <Button key={p} variant="text" onClick={() => locate(p)}>
                        {p}
                      </Button>
                    ))}
                  </p>
                )}
                {(reference || references.length > 0) && (
                  <label className="schema-next-field schema-next-wide">
                    引用目标
                    <StudioSelect
                      disabled={!canChooseRef}
                      value={resolved?.ref ?? targetRef}
                      onValueChange={(selected) =>
                        set('$ref', selected ? JSON.stringify(selected) : undefined)
                      }
                    >
                      <option value="">无引用</option>
                      {targetRef && !resolved && <option value={targetRef}>{targetRef}</option>}
                      {references.map((d) => (
                        <option key={d.ref} value={d.ref}>
                          {d.label} · {d.ref}
                        </option>
                      ))}
                    </StudioSelect>
                  </label>
                )}
                {showFields && (
                  <>
                    <div className="schema-next-wide">
                      {validType ? (
                        <SchemaTypeSelect
                          portal={portal}
                          value={activeTypes}
                          onChange={(next) =>
                            set(
                              'type',
                              next.length
                                ? JSON.stringify(next.length === 1 ? next[0] : next)
                                : undefined,
                            )
                          }
                        />
                      ) : (
                        <Button variant="text" onClick={() => locate(path + '/type')}>
                          在 JSON 中核对数据类型
                        </Button>
                      )}
                    </div>
                    {fieldText('description', '字段说明', true, true)}
                    {literal('default', '默认值')}
                  </>
                )}
              </fieldset>
              {resolved && (
                <Button variant="text" onClick={() => leaveField(resolved.node.path)}>
                  查看共享定义 · {resolved.label}
                </Button>
              )}
              {reference && (
                <Button
                  variant="secondary"
                  aria-expanded={overrides}
                  onClick={() => setOverrides(!overrides)}
                >
                  {overrides ? '收起' : '展开'}本字段覆盖{hasOverrides ? ' · 已配置' : ''}
                </Button>
              )}
            </section>
            {showFields && (
              <>
                <section className="schema-next-section" aria-label="校验属性">
                  <h3>校验属性</h3>
                  <fieldset disabled={readonly || rulePending} className="schema-next-grid">
                    {item.role === 'field' && (
                      <label className="schema-next-wide schema-next-check">
                        <input
                          type="checkbox"
                          checked={!!working.nodes.find((n) => n.node.path === path)?.required}
                          onChange={(e) => update((m) => m.setRequired(path, e.target.checked))}
                        />
                        始终必填
                      </label>
                    )}
                    {countLimits
                      .filter(([type, min, max]) => type !== 'object' && fits(type, min, max))
                      .map(([, min, max, lo, hi]) => (
                        <div className="schema-next-grid schema-next-wide" key={min}>
                          {numeric(min, lo, true)}
                          {numeric(max, hi, true)}
                        </div>
                      ))}
                    {showNumber && (
                      <>
                        {bound('下限', 'minimum', 'exclusiveMinimum', ['≥', '>'])}
                        {bound('上限', 'maximum', 'exclusiveMaximum', ['≤', '<'])}
                      </>
                    )}
                    {list('enum', '允许值')}
                    <details className="schema-next-wide">
                      <summary>
                        更多校验{advancedCount ? ' · 已配置 ' + advancedCount + ' 项' : ''}
                      </summary>
                      <div className="schema-next-grid">
                        {(requested || fits('string', 'pattern')) && (
                          <div className="schema-next-wide">
                            <RegexInput
                              disabled={readonly || rulePending}
                              value={working.str(child(node, 'pattern')) ?? ''}
                              onChange={(value) =>
                                set('pattern', value ? JSON.stringify(value) : undefined)
                              }
                            />
                          </div>
                        )}
                        {showNumber && numeric('multipleOf', '倍数')}
                        {fits('object', 'minProperties', 'maxProperties') && (
                          <>
                            {numeric('minProperties', '最少属性数', true)}
                            {numeric('maxProperties', '最多属性数', true)}
                          </>
                        )}
                        {fits('array', 'uniqueItems') && flag('uniqueItems', '元素唯一')}
                        {child(node, 'contains') && (
                          <>
                            {numeric('minContains', '最少匹配项', true)}
                            {numeric('maxContains', '最多匹配项', true)}
                          </>
                        )}
                        {literal('const', '固定值')}
                      </div>
                    </details>
                  </fieldset>
                </section>
                <section className="schema-next-section" aria-label="JSON Schema 联动校验">
                  <h3>JSON Schema 联动校验</h3>
                  <SchemaNavigation text={staged} onPendingChange={setRulePending}>
                    <SchemaRules
                      model={working}
                      node={node}
                      text={staged}
                      apply={setStaged}
                      locate={locate}
                      compact
                      readOnly={readonly}
                      openRelated={leaveField}
                    />
                  </SchemaNavigation>
                </section>
                <details className="schema-next-section">
                  <summary>高级属性{configured ? ' · 已配置 ' + configured + ' 项' : ''}</summary>
                  <fieldset disabled={readonly || rulePending} className="schema-next-grid">
                    {(requested || fits('string', 'format')) &&
                      fieldText('format', '格式名称', true)}
                    {(requested || fits('string', 'format')) && (
                      <small id="schema-next-format-hint" className="schema-next-wide">
                        格式名称作为注解记录，当前引擎不会用它校验字段值。
                      </small>
                    )}
                    {list('examples', '示例值')}
                    {fieldText('$comment', '维护注释', true, true)}
                    {annotationFlags.map(([key, label]) => flag(key, label))}
                    <small className="schema-next-wide">
                      只读和只写是 Schema 注解，工作台权限单独管理。
                    </small>
                    {(requested ||
                      fits('string', 'contentEncoding', 'contentMediaType', 'contentSchema')) && (
                      <details className="schema-next-wide">
                        <summary>内容描述</summary>
                        <div className="schema-next-grid">
                          {fieldText('contentEncoding', '内容编码')}
                          {fieldText('contentMediaType', '媒体类型')}
                        </div>
                      </details>
                    )}
                    {(item.role === 'root' || child(node, '$id') || child(node, '$schema')) && (
                      <details className="schema-next-wide">
                        <summary>Schema 资源设置</summary>
                        <div className="schema-next-grid">
                          {fieldText('$schema', 'Schema 方言', true)}
                          {fieldText('$id', '资源标识', true)}
                        </div>
                      </details>
                    )}
                    <details className="schema-next-wide">
                      <summary>锚点与动态引用</summary>
                      <div className="schema-next-grid">
                        {fieldText('$anchor', '静态锚点')}
                        {fieldText('$dynamicAnchor', '动态锚点')}
                        {fieldText('$dynamicRef', '动态引用', true)}
                      </div>
                    </details>
                  </fieldset>
                </details>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Boundary({
  working,
  path,
  label,
  inclusive,
  exclusive,
  operators,
  update,
}: {
  working: DataSchemaModel;
  path: string;
  label: string;
  inclusive: string;
  exclusive: string;
  operators: string[];
  update: (operation: (m: DataSchemaModel) => string) => void;
}) {
  const node = working.byPath.get(path);
  const [preferred, setPreferred] = useState(inclusive);
  const key = child(node, exclusive) ? exclusive : child(node, inclusive) ? inclusive : preferred;
  const current = child(node, key);
  const raw = current ? working.raw(current) : '';
  return (
    <div className="schema-next-field">
      <span>{label}</span>
      <div className="schema-next-bound">
        <StudioSelect
          aria-label={label + '运算符'}
          value={key}
          onValueChange={(selected) => {
            const next = selected;
            setPreferred(next);
            if (current)
              update((m) => dataSchemaModel(m.remove(current.path)).set(path, next, raw));
          }}
        >
          <option value={inclusive}>{operators[0]}</option>
          <option value={exclusive}>{operators[1]}</option>
        </StudioSelect>
        <Input
          aria-label={label}
          type="number"
          step="any"
          value={raw}
          onChange={(e) => {
            const value = e.target.value;
            if (value) update((m) => m.set(path, key, value));
            else if (current) update((m) => m.remove(current.path));
          }}
        />
      </div>
    </div>
  );
}
