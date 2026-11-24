'use client';

import { EditorViewSwitch } from '../components/ui/editor-view-switch';
import { StudioSelect } from '../components/ui/select';
import { createPortal } from 'react-dom';
import { JsonEditor } from '../components/json/json-editor';
import { Modal } from './modal';
import { SchemaConditionsGuide } from './schema-conditions-guide';
import { FieldPicker } from '../components/field-picker';
import { Button, IconButton } from '../components/ui/controls';
import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { JsonNode } from '../components/json/model';
import { dataSchemaModel, type DataSchemaModel } from './data-schema-model';
import { child, escapeKey } from './semantic-model';
import { usePendingNavigation, useSchemaNavigation } from './schema-navigation';
import {
  groups,
  singles,
  labels,
  RuleInputs,
  schemaRuleFields,
  SchemaConditionInput,
} from './schema-rule-inputs';

type Props = {
  model: DataSchemaModel;
  text: string;
  node: JsonNode;
  apply: (text: string) => void;
  locate: (path: string) => void;
  compact?: boolean;
  readOnly?: boolean;
  openRelated?: (path: string) => void;
};
type Draft = {
  source: string;
  text: string;
  anchor: string;
  path: string;
  title: string;
  remove?: boolean;
  jsonMode?: boolean;
  invalidJson?: string;
  jsonInput?: string;
  trigger?: HTMLElement;
};
type Operation = (model: DataSchemaModel) => string;
const branches = ['if', 'then', 'else'];
const pathFor = (parent: string, key: string) => parent + '/' + escapeKey(key);

function ruleText(model: DataSchemaModel, node: JsonNode): string {
  if (node.kind === 'boolean') return model.raw(node) === 'true' ? '允许任何值' : '拒绝所有值';
  if (node.kind !== 'object') return model.raw(node);
  const parts = node.children?.map((n) => {
    if (n.key === 'properties' && n.kind === 'object')
      return n.children?.map((f) => f.key + ' ' + ruleText(model, f)).join('、');
    if (n.key === 'required' && n.kind === 'array')
      return '必须填写 ' + n.children?.map((f) => model.str(f) ?? model.raw(f)).join('、');
    if (n.key === 'const') return '等于 ' + model.raw(n);
    if (groups.includes(n.key!) && n.kind === 'array')
      return labels[n.key!] + '（' + n.children?.map((b) => ruleText(model, b)).join(' / ') + '）';
    return (labels[n.key!] ?? n.key) + ' ' + model.raw(n);
  });
  return parts?.join('，') || '无附加约束';
}
function mentionsField(model: DataSchemaModel, node: JsonNode, field: string): boolean {
  if (
    child(node, 'properties')?.children?.some((n) => n.key === field) ||
    child(node, 'required')?.children?.some((n) => model.str(n) === field)
  )
    return true;
  return (
    [...branches, 'not'].some((k) => {
      const sub = child(node, k);
      return !!sub && mentionsField(model, sub, field);
    }) || groups.some((k) => child(node, k)?.children?.some((n) => mentionsField(model, n, field)))
  );
}
function removeBranch(m: DataSchemaModel, node: JsonNode): string {
  const parent = m.byPath.get(node.path.slice(0, node.path.lastIndexOf('/')));
  return m.remove(
    parent?.kind === 'array' && parent.children?.length === 1 ? parent.path : node.path,
  );
}
function removeRule(m: DataSchemaModel, node: JsonNode): string {
  const parent = m.byPath.get(node.path.slice(0, node.path.lastIndexOf('/')));
  if (parent?.kind === 'array' && node.children?.every((n) => branches.includes(n.key!)))
    return removeBranch(m, node);
  let text = '';
  for (const k of branches)
    if (child(node, k)) {
      const current = text ? dataSchemaModel(text) : m;
      text = current.remove(pathFor(node.path, k));
    }
  return text;
}

export function SchemaRules(props: Props) {
  return <RuleCards key={props.node.path} {...props} />;
}
function RuleCards({ model, text, node, apply, locate, compact, readOnly, openRelated }: Props) {
  const { beforeLeave, pendingOwner } = useSchemaNavigation();
  const editingAttributes = pendingOwner === 'inspector' || !!readOnly;
  const editorId = useId();
  const [guide, setGuide] = useState<HTMLButtonElement>();
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState('');
  const [entryName, setEntryName] = useState('');
  const [category, setCategory] = useState('');
  const active = draft?.source === text ? draft : undefined;
  const working = useMemo(() => (active ? dataSchemaModel(active.text) : undefined), [active]);
  usePendingNavigation(
    'rules',
    active || category
      ? {
          discard: () => {
            setDraft(undefined);
            setCategory('');
            setEntryName('');
            setError('');
          },
        }
      : null,
  );
  if (model.ambiguous.has(node.path)) return null;
  const owner = node.path.slice(0, node.path.lastIndexOf('/'));
  const parent = owner.endsWith('/properties')
    ? model.byPath.get(owner.slice(0, -'/properties'.length))
    : undefined;
  function startDraft(
    anchor: string,
    title: string,
    path: string,
    operation?: Operation,
    remove = false,
  ) {
    if (readOnly) return;
    setError('');
    try {
      const next = operation ? operation(model) : text;
      dataSchemaModel(next);
      setDraft({
        anchor,
        title,
        path,
        text: next,
        source: text,
        remove,
        trigger: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
      });
      setCategory('');
      setEntryName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法编辑该位置');
    }
  }
  function switchRule(go: () => void) {
    if (active || category) beforeLeave(go);
    else go();
  }
  function begin(...args: Parameters<typeof startDraft>) {
    switchRule(() => startDraft(...args));
  }
  function change(operation: Operation) {
    if (!active || !working) return;
    try {
      const next = operation(working);
      dataSchemaModel(next);
      setDraft({ ...active, text: next });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改失败');
    }
  }
  function editor(anchor: string, fields?: ReactNode) {
    if (!active || active.anchor !== anchor || !working) return null;
    const target = working.byPath.get(active.path);
    const wholeCondition = anchor === 'add-rule' || anchor.endsWith(':flow:edit');
    const inModal =
      !active.remove &&
      !!target &&
      (wholeCondition || (!fields && (target.kind === 'object' || target.kind === 'boolean')));
    const ruleJson = wholeCondition
      ? '{' +
        branches
          .flatMap((key) => {
            const branch = child(target, key);
            return branch ? [JSON.stringify(key) + ': ' + working.raw(branch)] : [];
          })
          .join(',\n') +
        '}'
      : target
        ? working.raw(target)
        : '';
    function updateRuleJson(raw: string) {
      if (!active || !working) return;
      try {
        const value = JSON.parse(raw);
        if (!wholeCondition) {
          if (
            typeof value !== 'boolean' &&
            (value === null || typeof value !== 'object' || Array.isArray(value))
          )
            throw Error();
          const nextText = working.replace(active.path, raw);
          const next = dataSchemaModel(nextText);
          if (
            [...next.ambiguous].some(
              (path) => path === active.path || path.startsWith(active.path + '/'),
            )
          )
            throw Error();
          setDraft({ ...active, text: nextText, jsonInput: raw, invalidJson: undefined });
          return;
        }
        if (
          !value ||
          Array.isArray(value) ||
          typeof value !== 'object' ||
          !Object.hasOwn(value, 'if') ||
          Object.keys(value).some((key) => !branches.includes(key)) ||
          Object.values(value).some(
            (branch) =>
              typeof branch !== 'boolean' &&
              (branch === null || Array.isArray(branch) || typeof branch !== 'object'),
          )
        )
          throw Error();
        // Parse against the model's token ranges to preserve exact JSON values.
        const probe = dataSchemaModel(working.set(active.path, 'if', raw));
        const fragment = probe.byPath.get(pathFor(active.path, 'if'))!;
        if (
          [...probe.ambiguous].some(
            (path) => path === fragment.path || path.startsWith(fragment.path + '/'),
          )
        )
          throw Error();
        let nextText = active.text;
        let next = working;
        for (const key of branches) {
          const branch = child(fragment, key);
          const previous = child(next.byPath.get(active.path), key);
          if (branch) nextText = next.set(active.path, key, probe.raw(branch));
          else if (previous) nextText = next.remove(previous.path);
          else continue;
          next = dataSchemaModel(nextText);
        }
        setDraft({ ...active, text: nextText, jsonInput: raw, invalidJson: undefined });
      } catch {
        setDraft({ ...active, invalidJson: raw });
      }
    }
    function cancelEditor() {
      setDraft(undefined);
      setError('');
    }
    const form = (
      <form
        id={inModal ? editorId : undefined}
        className="semantic-change schema-rule-form"
        aria-label={active.title}
        onSubmit={(e) => {
          e.preventDefault();
          if (active.invalidJson !== undefined) return;
          const invalid = e.currentTarget.querySelector<HTMLElement>('[data-invalid-json-rule]');
          if (invalid) {
            invalid.querySelector<HTMLElement>('input, textarea, button')?.focus();
            return;
          }
          if (active.source === text) {
            if (active.text !== text) apply(active.text);
            setDraft(undefined);
            setError('');
          }
        }}
      >
        <div className="schema-rule-heading">
          {!inModal && <h5>{active.title}</h5>}
          {inModal && (
            <EditorViewSwitch
              value={active.jsonMode ? 'json' : 'form'}
              formDisabled={active.invalidJson !== undefined}
              onChange={(view) =>
                setDraft({ ...active, jsonMode: view === 'json', jsonInput: undefined })
              }
            />
          )}
          {inModal && (
            <IconButton
              icon="Info"
              aria-label="规则配置帮助"
              title="查看规则配置帮助"
              onClick={(event) => setGuide(event.currentTarget)}
            />
          )}
        </div>
        {guide &&
          createPortal(
            <Modal
              title={
                wholeCondition || target?.key === 'if' ? '条件规则配置指南' : '分支与约束配置指南'
              }
              size="wide"
              returnFocus={guide}
              onClose={() => setGuide(undefined)}
            >
              {wholeCondition || target?.key === 'if' ? (
                <SchemaConditionsGuide />
              ) : (
                <article className="schema-conditions-guide">
                  <p>
                    在表单里选择约束形式并填写字段限制。切换到 JSON 可直接修改当前分支的 Schema
                    对象或布尔值。
                  </p>
                  <p>
                    <code>allOf</code> 要求所有分支成立，<code>anyOf</code> 要求至少一个成立，
                    <code>oneOf</code> 要求恰好一个成立，<code>not</code> 要求其子模型不成立。数组的{' '}
                    <code>prefixItems</code> 按元素位置应用约束。
                  </p>
                </article>
              )}
            </Modal>,
            guide.closest('main') ?? document.body,
          )}
        {inModal && error && <p role="alert">{error}</p>}
        {inModal && active.jsonMode ? (
          <>
            <JsonEditor
              label={active.title + ' JSON'}
              initialMode="text"
              text={active.invalidJson ?? active.jsonInput ?? ruleJson}
              onChange={updateRuleJson}
              readOnly={false}
            />
            {active.invalidJson !== undefined && (
              <p role="alert">
                {wholeCondition
                  ? '请输入有效的规则 JSON。保留 if，then 和 else 可选，各分支应为对象或布尔值。'
                  : '请输入有效的 Schema 对象或布尔值。'}
              </p>
            )}
          </>
        ) : active.remove ? (
          <p>保存后移除此项，可撤销。</p>
        ) : (
          (fields ??
          (target &&
            (compact && target.key === 'if' ? (
              <SchemaConditionInput
                node={target}
                scope={node}
                editing={{ model: working, change, compact, fieldScope: node }}
              />
            ) : (
              <RuleInputs
                node={target}
                editing={{ model: working, change, compact, fieldScope: node }}
              />
            ))))
        )}
        {!inModal && (
          <div className="action-row">
            <Button type="submit">保存此项</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft(undefined);
                setError('');
              }}
            >
              取消
            </Button>
          </div>
        )}
      </form>
    );
    return inModal
      ? createPortal(
          <Modal
            title={active.title}
            className="schema-rule-dialog"
            size="wide"
            closeLabel="取消"
            onClose={cancelEditor}
            returnFocus={active.trigger}
            actions={
              <Button type="submit" form={editorId} disabled={active.invalidJson !== undefined}>
                保存规则
              </Button>
            }
          >
            {form}
          </Modal>,
          active.trigger?.closest('main') ?? document.body,
        )
      : form;
  }
  function jump(n: JsonNode) {
    return (
      <button type="button" className="text-button" onClick={() => locate(n.path)}>
        在 JSON 中定位
      </button>
    );
  }
  function branchesForm(rule: JsonNode) {
    if (!working) return null;
    return branches.map((key) => {
      const current = child(rule, key);
      return (
        <fieldset key={key} className="schema-rule-section">
          <legend>
            {key === 'if' ? '条件' : labels[key]} <code>{key}</code>
          </legend>
          {current ? (
            key === 'if' ? (
              <SchemaConditionInput
                node={current}
                scope={node}
                editing={{ model: working, change, compact, fieldScope: node }}
              />
            ) : (
              <RuleInputs
                node={current}
                editing={{ model: working, change, compact, fieldScope: node }}
              />
            )
          ) : (
            <Button variant="secondary" onClick={() => change((m) => m.set(rule.path, key, '{}'))}>
              {key === 'else' ? '添加否则分支' : '添加' + labels[key]}
            </Button>
          )}
          {current && key !== 'if' && (
            <Button variant="text" onClick={() => change((m) => m.remove(current.path))}>
              {key === 'else' ? '移除否则分支' : '移除成立分支'}
            </Button>
          )}
        </fieldset>
      );
    });
  }
  function flow(n: JsonNode, caption: string) {
    const key = n.path + ':flow';
    return (
      <section className="schema-rule-card" key={key} aria-label={caption}>
        <h5>{caption}</h5>
        <small>{n.path}</small>
        {compact && !readOnly && (
          <Button variant="text" onClick={() => begin(key + ':edit', '编辑条件规则', n.path)}>
            编辑条件规则
          </Button>
        )}
        {branches.map((k) => {
          const b = child(n, k),
            p = pathFor(n.path, k),
            title = (b ? '编辑' : '新增') + labels[k];
          return (
            <div key={k} className="schema-rule-branch">
              <strong>{labels[k]}</strong>
              <span>{b ? ruleText(model, b) : '无附加约束'}</span>
              {compact ? null : model.ambiguous.has(n.path) || model.ambiguous.has(p) ? (
                jump(b ?? n)
              ) : (
                <div className="action-row">
                  <button
                    disabled={editingAttributes}
                    type="button"
                    className="text-button"
                    onClick={() =>
                      begin(p, title, p, b ? undefined : (m) => m.set(n.path, k, '{}'))
                    }
                  >
                    {title}
                  </button>
                  {b && k !== 'if' && (
                    <button
                      disabled={editingAttributes}
                      type="button"
                      className="text-button"
                      onClick={() => begin(p, '删除' + labels[k], p, (m) => m.remove(p), true)}
                    >
                      删除{labels[k]}
                    </button>
                  )}
                </div>
              )}
              {editor(p)}
            </div>
          );
        })}
        <button
          disabled={editingAttributes}
          type="button"
          className="text-button"
          onClick={() => begin(key, '删除整条条件规则', n.path, (m) => removeRule(m, n), true)}
        >
          删除规则
        </button>
        {editor(key)}
        {compact &&
          active?.anchor === key + ':edit' &&
          working?.byPath.get(n.path) &&
          editor(key + ':edit', branchesForm(working.byPath.get(n.path)!))}
      </section>
    );
  }
  function card(n: JsonNode, title: string) {
    return (
      <section key={n.keyIndex ?? n.start} className="schema-rule-card" aria-label={title}>
        <h5>{title}</h5>
        <p>{ruleText(model, n)}</p>
        {model.ambiguous.has(n.path) ? (
          jump(n)
        ) : (
          <div className="action-row">
            <button
              disabled={editingAttributes}
              type="button"
              className="text-button"
              onClick={() => begin(n.path, '编辑' + title, n.path)}
            >
              编辑{title}
            </button>
            <button
              disabled={editingAttributes}
              type="button"
              className="text-button"
              onClick={() => begin(n.path, '删除' + title, n.path, (m) => removeBranch(m, n), true)}
            >
              删除{title}
            </button>
          </div>
        )}
        {editor(n.path)}
        {branches.some((k) => child(n, k)) && flow(n, '分支条件规则')}
      </section>
    );
  }

  function addCombination(keyword: string) {
    const group = child(node, keyword);
    if (keyword === 'not') {
      if (!group)
        startDraft('add-model', '新增取反', pathFor(node.path, keyword), (m) =>
          m.set(node.path, keyword, '{}'),
        );
      return;
    }
    startDraft(
      'add-group',
      '新增组合分支',
      pathFor(node.path, keyword) + '/' + (group?.children?.length ?? 0),
      (m) => (group ? m.append(group.path, '{}') : m.set(node.path, keyword, '[{}]')),
    );
  }
  function startDependentModel(name: string) {
    const entries = child(node, 'dependentSchemas');
    const existing = child(entries, name);
    startDraft(
      'add-entry',
      existing ? '编辑依赖模型' : '新增依赖模型',
      pathFor(pathFor(node.path, 'dependentSchemas'), name),
      existing
        ? undefined
        : (m) =>
            entries
              ? m.set(entries.path, name, '{}')
              : m.set(node.path, 'dependentSchemas', JSON.stringify({ [name]: {} })),
    );
  }

  function addRule() {
    const fields = child(node, 'properties')?.children?.map((n) => n.key!) ?? [];
    const k = fields[0],
      need = fields.at(-1);
    const rule = JSON.stringify(
      k !== undefined && need !== undefined
        ? { if: { required: [k] }, then: { required: [need] } }
        : { if: {}, then: {} },
    );
    const existing = branches.some((key) => child(node, key));
    const group = child(node, 'allOf');
    if (existing) {
      const p = pathFor(node.path, 'allOf') + '/' + (group?.children?.length ?? 0);
      startDraft('add-rule', '新增条件规则', p, (m) =>
        group ? m.append(group.path, rule) : m.set(node.path, 'allOf', '[' + rule + ']'),
      );
    } else {
      // Edit the two new branches directly in a single private transaction.
      const value = JSON.parse(rule);
      startDraft('add-rule', '新增条件规则', node.path, (m) => {
        const next = m.set(node.path, 'if', JSON.stringify(value.if));
        return dataSchemaModel(next).set(node.path, 'then', JSON.stringify(value.then));
      });
    }
  }
  function relatedRules(n: JsonNode, caption: string): ReactNode {
    return (
      <div key={n.path}>
        {branches.some((k) => {
          const branch = child(n, k);
          return !!branch && mentionsField(model, branch, node.key!);
        }) &&
          (compact && openRelated ? (
            <section className="schema-rule-card">
              <h5>{caption}</h5>
              <p>{ruleText(model, n)}</p>
              <Button variant="text" onClick={() => openRelated(parent!.path)}>
                {readOnly ? '查看所属对象' : '编辑所属对象'}
              </Button>
            </section>
          ) : (
            flow(n, caption)
          ))}
        {groups.flatMap((k) =>
          (child(n, k)?.children ?? []).map((b, i) =>
            relatedRules(b, caption + ' / ' + labels[k] + ' ' + (i + 1)),
          ),
        )}
      </div>
    );
  }
  if (node.kind !== 'object') {
    return parent ? (
      <section aria-label="所属对象条件">{relatedRules(parent, '来自所属对象的条件规则')}</section>
    ) : null;
  }
  const dep = child(node, 'dependentRequired');
  const available = singles.filter((k) => !child(node, k));
  const newRule = active?.anchor === 'add-rule' ? working?.byPath.get(active.path) : undefined;
  return (
    <section
      className={'schema-rules' + (readOnly ? ' schema-next-readonly' : '')}
      aria-label="条件与约束"
    >
      <h4>条件与约束</h4>
      {error && <p role="alert">{error}</p>}
      {branches.some((k) => child(node, k)) && flow(node, '条件规则')}
      {parent && relatedRules(parent, '来自所属对象的条件规则')}
      {groups.concat('prefixItems').map((k) => {
        const group = child(node, k);
        if (!group) return null;
        if (group.kind !== 'array' || model.ambiguous.has(group.path))
          return (
            <p key={k}>
              {labels[k]} · {jump(group)}
            </p>
          );
        return group.children?.map((b, i) =>
          card(b, labels[k] + (compact ? ' · ' + k : '') + ' · 分支 ' + (i + 1)),
        );
      })}
      {singles
        .filter((k) => k !== 'items')
        .flatMap((k) => {
          const n = child(node, k);
          return n ? [card(n, labels[k] + (compact ? ' · ' + k : ''))] : [];
        })}
      {['patternProperties', 'dependentSchemas'].map((k) => {
        const entries = child(node, k);
        if (!entries) return null;
        if (entries.kind !== 'object' || model.ambiguous.has(entries.path))
          return (
            <p key={k}>
              {labels[k]} · {jump(entries)}
            </p>
          );
        return entries.children?.map((n) => card(n, labels[k] + ' · ' + n.key));
      })}
      {dep?.children?.map((n) => {
        const anchor = 'dependency:' + n.path;
        if (
          n.kind !== 'array' ||
          model.ambiguous.has(n.path) ||
          n.children?.some((v) => v.kind !== 'string')
        )
          return (
            <p key={n.start}>
              属性依赖 · {n.key} {jump(n)}
            </p>
          );
        return (
          <section key={n.start} className="schema-rule-card">
            <h5>属性依赖 · {n.key}</h5>
            <p>
              当 {n.key} 出现时，需要 {n.children?.map((v) => model.str(v)).join('、')}
            </p>
            <button
              disabled={editingAttributes}
              type="button"
              className="text-button"
              onClick={() => begin(anchor, '编辑属性依赖', n.path)}
            >
              编辑属性依赖
            </button>
            <button
              disabled={editingAttributes}
              type="button"
              className="text-button"
              onClick={() => begin(anchor, '删除属性依赖', n.path, (m) => m.remove(n.path), true)}
            >
              删除属性依赖
            </button>
            {active?.anchor === anchor && !active.remove ? (
              <DependencyForm
                model={model}
                owner={node}
                compact={compact}
                existing={n}
                apply={(next) => {
                  apply(next);
                  setDraft(undefined);
                }}
                cancel={() => setDraft(undefined)}
              />
            ) : (
              editor(anchor)
            )}
          </section>
        );
      })}
      {!active && !readOnly && (
        <div className="action-row">
          <StudioSelect
            disabled={editingAttributes}
            aria-label="添加规则或约束"
            value={category}
            onValueChange={(selected) => {
              const choice = selected;
              switchRule(() => {
                setError('');
                setEntryName('');
                if (choice === 'condition') addRule();
                else if (choice === 'dependency')
                  startDraft('add-dependency', '新增属性依赖', node.path);
                else if (choice.startsWith('group:')) addCombination(choice.slice(6));
                else if (choice.startsWith('model:')) {
                  const key = choice.slice(6);
                  startDraft('add-model', '新增' + labels[key], pathFor(node.path, key), (m) =>
                    m.set(node.path, key, '{}'),
                  );
                } else setCategory(choice);
              });
            }}
          >
            <option value="">添加规则或约束…</option>
            <option value="condition">条件规则</option>
            {groups.concat('prefixItems').map((key) => (
              <option key={key} value={'group:' + key}>
                新增 {key} 分支
              </option>
            ))}
            {available.map((key) => (
              <option key={key} value={key === 'not' ? 'group:not' : 'model:' + key}>
                {labels[key] ?? key} · {key}
              </option>
            ))}
            <option value="entry:patternProperties">新增属性名模式约束</option>
            <option value="entry:dependentSchemas">新增依赖模型</option>
            {(!dep || (dep.kind === 'object' && !model.ambiguous.has(dep.path))) && (
              <option value="dependency">属性依赖</option>
            )}
          </StudioSelect>
        </div>
      )}
      {newRule &&
        working &&
        editor(
          'add-rule',
          compact
            ? branchesForm(newRule)
            : branches.map((k) => {
                const b = child(newRule, k);
                return (
                  b && (
                    <fieldset key={k} className="schema-rule-section">
                      <legend>
                        {labels[k]} <code>{k}</code>
                      </legend>
                      <RuleInputs
                        node={b}
                        editing={{ model: working, change, compact, fieldScope: node }}
                      />
                    </fieldset>
                  )
                );
              }),
        )}
      {editor('add-group')}
      {editor('add-entry')}
      {editor('add-model')}
      {category.startsWith('entry:') &&
        createPortal(
          <Modal
            title={category === 'entry:patternProperties' ? '新增属性名模式约束' : '新增依赖模型'}
            size="standard"
            onClose={() => {
              setCategory('');
              setError('');
            }}
          >
            <form
              className="schema-next-stack"
              onSubmit={(event) => {
                event.preventDefault();
                const key = category.slice(6);
                const entries = child(node, key);
                if (key === 'dependentSchemas') {
                  startDependentModel(entryName);
                  return;
                }
                startDraft(
                  'add-entry',
                  '新增属性名模式约束',
                  pathFor(pathFor(node.path, key), entryName),
                  (m) => {
                    new RegExp(entryName, 'u');
                    if (child(entries, entryName)) throw Error('此模式已存在。');
                    return entries
                      ? m.set(entries.path, entryName, '{}')
                      : m.set(node.path, key, JSON.stringify({ [entryName]: {} }));
                  },
                );
              }}
            >
              <label className="schema-next-field">
                {category === 'entry:patternProperties' ? '属性名模式' : '触发字段名'}
                <input
                  required
                  value={entryName}
                  onChange={(event) => setEntryName(event.target.value)}
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <Button type="submit">继续配置约束</Button>
            </form>
          </Modal>,
          document.querySelector('main') ?? document.body,
        )}
      {active?.anchor === 'add-dependency' && (
        <DependencyForm
          model={model}
          owner={node}
          compact={compact}
          apply={(next) => {
            apply(next);
            setDraft(undefined);
          }}
          cancel={() => setDraft(undefined)}
        />
      )}
    </section>
  );
}

function DependencyForm({
  model,
  owner,
  existing,
  compact,
  apply,
  cancel,
}: {
  model: DataSchemaModel;
  owner: JsonNode;
  existing?: JsonNode;
  compact?: boolean;
  apply: (s: string) => void;
  cancel: () => void;
}) {
  const [name, setName] = useState(existing?.key ?? ''),
    [list, setList] = useState(existing?.children?.map((n) => model.str(n)).join('\n') ?? ''),
    [error, setError] = useState('');
  const options = schemaRuleFields(model, owner);
  const keyOf = (path: string) => path.slice(1).replaceAll('~1', '/').replaceAll('~0', '~');
  const optionFor = (key: string) => options.find((option) => keyOf(option.ref.path) === key);
  const listed = list.split(/\r?\n/).filter(Boolean);
  const selected = listed.flatMap((key) => optionFor(key)?.ref ?? []);
  const usePickers =
    compact &&
    options.length > 0 &&
    (!name || optionFor(name)) &&
    selected.length === listed.length;
  const formId = useId();
  const form = (
    <form
      id={formId}
      className="schema-rule-form schema-next-stack"
      aria-label={existing ? '编辑属性依赖' : '新增属性依赖'}
      onSubmit={(e) => {
        e.preventDefault();
        const values = list
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean);
        const key = name.trim(),
          dep = child(owner, 'dependentRequired');
        try {
          if (!key || !values.length || new Set(values).size !== values.length)
            throw Error('请填写触发字段和不重复的依赖字段。');
          if (!dep) {
            apply(model.set(owner.path, 'dependentRequired', JSON.stringify({ [key]: values })));
            return;
          }
          if (key !== existing?.key && child(dep, key)) throw Error('该字段已有依赖。');
          // Retain escapes on unchanged field names, even when another dependency changes.
          const tokens = values.map((v) => {
            const n = existing?.children?.find((item) => model.str(item) === v);
            return n ? model.raw(n) : JSON.stringify(v);
          });
          const raw =
            existing &&
            values.length === existing.children?.length &&
            values.every((v, i) => v === model.str(existing.children?.[i]))
              ? model.raw(existing)
              : '[' + tokens.join(',') + ']';
          const next = model.set(dep.path, key, raw);
          apply(
            existing && key !== existing.key ? dataSchemaModel(next).remove(existing.path) : next,
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : '修改失败');
        }
      }}
    >
      {usePickers ? (
        <>
          <FieldPicker
            label="选择触发字段"
            fields={options}
            value={optionFor(name)?.ref ?? null}
            onChange={(ref) => setName(keyOf(ref.path))}
          />
          {name && <small>当 {name} 出现时</small>}
          <FieldPicker
            label="选择依赖字段"
            fields={options}
            multiple
            value={selected}
            onChange={(refs) => setList(refs.map((ref) => keyOf(ref.path)).join('\n'))}
          />
          {listed.length > 0 && <small>需要 {listed.join('、')}</small>}
        </>
      ) : (
        <>
          <label>
            当属性出现
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            需要的字段（每行一个）
            <textarea required value={list} onChange={(e) => setList(e.target.value)} />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
  return createPortal(
    <Modal
      title={existing ? '编辑属性依赖' : '新增属性依赖'}
      className="schema-rule-dialog"
      size="wide"
      closeLabel="取消"
      onClose={cancel}
      actions={
        <Button type="submit" form={formId}>
          保存依赖
        </Button>
      }
    >
      {form}
    </Modal>,
    document.querySelector('main') ?? document.body,
  );
}
