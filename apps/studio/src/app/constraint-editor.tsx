'use client';

import { Button, Input } from '@form-engine/studio-design-components/controls';
import { usePendingNavigation } from './schema-navigation';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  Constraint,
  DataReference,
  Expression,
  ValidationPrerequisite,
} from '@form-engine/protocol/definition';
import { ConstraintRequirement, commonRequirement } from './constraint-requirement';
import { ConstraintPrerequisites } from './constraint-prerequisites';
import {
  addPrerequisite,
  checkConstraintChange,
  readConstraint,
  referencingRules,
  type ConstraintDiagnostic,
} from './constraint-model';
import { verificationContext } from './expression-verification';
import { useFunctionCatalog, type FunctionDocumentation } from './function-catalog';
import { travelEligibilityValidator } from './host/validator-registration';
import { ExpressionDisplay } from './expression-display';
import { Modal } from './modal';
import { ExpressionEditorDialog, validateReactionExpression } from './expression-editor';
import { reactionFields, reactionReads, watchLabel, watchIdentity } from './reaction-fields';
import { ReactionFieldPicker } from './reaction-fields-ui';
import { ScopeEditor } from './scope-editor';
import { appendItems, removeItem } from './reaction-model';
import { child, semanticModel, type Model } from './semantic-model';
import type { JsonNode } from '../components/json/model';
import type { ReactionExpressionContext } from './reaction-expression-model';
import './reaction-editor.css';
import './constraint-editor.css';
import './rule-list.css';

type Props = {
  pickingReference?: boolean;
  formPath: string;
  profile: string;
  text: string;
  readOnly?: boolean;
  apply: (text: string) => void;
  repair: () => void;
};
type Mode = 'assert' | 'when' | 'target' | 'watch' | 'field' | 'impact' | 'validator';
type Dialog = { source: string; profile: string; mode: Mode };
const rootTarget = { source: 'data', path: '' } as const;
const emptyRequires: ValidationPrerequisite[] = [];
const errorText = (error: unknown) => (error instanceof Error ? error.message : '无法应用修改。');
const isPrerequisite = ({ code }: ConstraintDiagnostic) => code.startsWith('PREREQUISITE_');
const diagnosticText = ({ code, message }: ConstraintDiagnostic) => code + ' · ' + message;

export function ConstraintEditor(props: Props) {
  const model = useMemo(() => {
    try {
      return semanticModel(props.text);
    } catch {
      return undefined;
    }
  }, [props.text]);
  const list = model && child(model.root, 'constraints');
  if (
    !model ||
    model.root.kind !== 'object' ||
    (list && (list.kind !== 'array' || model.ambiguous.has(list.path)))
  )
    return (
      <button onClick={props.repair}>{props.readOnly ? '查看 JSON 原文' : '打开文本修复'}</button>
    );
  return <RuleList {...props} model={model} list={list} />;
}

type SummaryContext = Pick<ReactionExpressionContext, 'named' | 'manifests'> & {
  functionDocs: ReadonlyMap<string, FunctionDocumentation>;
};

function RuleSummary({
  rule,
  schema,
  context,
}: {
  rule: Constraint;
  schema: unknown;
  context: SummaryContext;
}) {
  const fields = reactionFields(schema, rule.scope);
  const target = rule.kind === 'internal' ? rule.issue.target : rule.target;
  const field = (ref: DataReference) => {
    const match = fields.find((f) => watchIdentity(f.ref) === watchIdentity(ref));
    return match?.title ? match.title + '（' + watchLabel(ref) + '）' : watchLabel(ref);
  };
  const scopes = !rule.scope ? [] : Array.isArray(rule.scope) ? rule.scope : [rule.scope];
  const message = rule.kind === 'internal' && rule.issue.message;
  return (
    <dl className="constraint-summary">
      {scopes.length > 0 && (
        <>
          <dt>范围</dt>
          <dd>
            {scopes
              .map(
                (s) =>
                  (s.mode === 'each' ? '逐项' : '绑定') + ' ' + field(s.from) + '（' + s.as + '）',
              )
              .join(' → ')}
          </dd>
        </>
      )}
      {rule.when !== undefined && (
        <>
          <dt>当</dt>
          <dd>
            <ExpressionDisplay expr={rule.when} fields={fields} {...context} />
          </dd>
        </>
      )}
      <dt>要求</dt>
      <dd>
        {rule.kind === 'internal' ? (
          <ExpressionDisplay expr={rule.assert} fields={fields} {...context} />
        ) : (
          '调用 ' + rule.validator
        )}
      </dd>
      {rule.kind === 'external' && rule.watch.length > 0 && (
        <>
          <dt>读取</dt>
          <dd>{rule.watch.map(field).join('、')}</dd>
        </>
      )}
      {!!rule.requires?.length && (
        <>
          <dt>前置</dt>
          <dd>
            {rule.requires
              .map((r) => (r.kind === 'field' ? field(r.target) : '规则 ' + r.constraintId))
              .join('、')}
          </dd>
        </>
      )}
      <dt>提示</dt>
      <dd>
        {field(target)} ·{' '}
        {rule.kind === 'external'
          ? '由 Host 返回'
          : message
            ? 'text' in message
              ? message.text
              : '消息键 ' + message.key
            : rule.issue.code}
      </dd>
    </dl>
  );
}

type EditSession = { base: string; initial: string; index: number; creating: boolean };
function RuleList({ model, list, ...props }: Props & { model: Model; list?: JsonNode }) {
  const nodes = list?.children ?? [];
  const { manifests, functionDocs } = useFunctionCatalog();
  const expressions = child(model.root, 'expressions');
  const named = expressions && JSON.parse(model.raw(expressions));
  const context = { manifests, functionDocs, named };
  const [session, setSession] = useState<EditSession>();
  const outline = useRef<HTMLElement>(null);
  const schema = model.schema && JSON.parse(model.raw(model.schema));
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const cards = useMemo(() => {
    const fieldSchema = model.schema && JSON.parse(model.raw(model.schema));
    const definitions = expressions && JSON.parse(model.raw(expressions));
    return (list?.children ?? []).map((node, index) => {
      const raw = model.raw(node);
      const id = model.str(child(node, 'id')) ?? node.path;
      let rule: Constraint;
      try {
        rule = readConstraint(raw);
      } catch {
        return { index, id, terms: (id + ' ' + raw).toLocaleLowerCase() };
      }
      const scopes = rule.scope ? [rule.scope].flat() : [];
      const refs = [
        ...scopes.map((scope) => scope.from),
        ...(rule.requires ?? []).flatMap((entry) => (entry.kind === 'field' ? [entry.target] : [])),
        ...reactionReads(rule.when, 'expression', definitions),
        ...(rule.kind === 'external'
          ? [rule.target, ...rule.watch]
          : [rule.issue.target, ...reactionReads(rule.assert, 'expression', definitions)]),
      ];
      const used = new Set(refs.map(watchIdentity));
      const names = reactionFields(fieldSchema, rule.scope)
        .filter((field) => used.has(watchIdentity(field.ref)))
        .map((field) => [field.title, watchLabel(field.ref)].join(' '));
      return { index, id, rule, terms: [raw, ...names].join(' ').toLocaleLowerCase() };
    });
  }, [model, list, expressions]);
  const visible = cards.filter((card) => card.terms.includes(query));
  function start(index: number) {
    const creating = index === nodes.length;
    let initial = props.text;
    if (creating) {
      const ids = new Set(
        [...nodes, ...(child(model.root, 'reactions')?.children ?? [])].map((n) =>
          model.str(child(n, 'id')),
        ),
      );
      let number = nodes.length + 1;
      while (ids.has('rule-' + number)) number++;
      const id = 'rule-' + number;
      const firstText = reactionFields(schema).find(
        (f) =>
          f.schema &&
          typeof f.schema === 'object' &&
          'type' in f.schema &&
          f.schema.type === 'string',
      );
      const raw = JSON.stringify({
        id,
        kind: 'internal',
        assert: firstText ? { op: 'text.isNonBlank', args: [{ ref: firstText.ref }] } : true,
        issue: { code: id, target: firstText?.ref ?? rootTarget },
      });
      initial = list
        ? appendItems(model, list, [raw])
        : model.property(model.root, 'constraints', '[' + raw + ']');
    }
    setSession({ base: props.text, initial, index, creating });
  }
  function end(index: number) {
    setSession(undefined);
    requestAnimationFrame(() => {
      (
        outline.current?.querySelector<HTMLButtonElement>('[data-rule-index="' + index + '"]') ??
        outline.current?.querySelector<HTMLButtonElement>('[data-add-rule]')
      )?.focus();
    });
  }
  return (
    <section ref={outline} className="rule-list constraint-list" aria-label="自定义校验">
      <header>
        <h2>校验规则</h2>
        <span>{nodes.length} 条</span>
        <Input
          type="search"
          aria-label="搜索校验规则"
          placeholder="搜索规则或字段"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>
      {!nodes.length && <p>尚未配置校验规则。</p>}
      {!!nodes.length && !visible.length && <p>没有匹配的校验规则。</p>}
      {visible.map(({ index: i, id, rule }) => {
        return (
          <article
            key={i}
            tabIndex={props.pickingReference ? 0 : undefined}
            data-reference-path={'/constraints/' + i}
            data-reference-label={'校验规则 · ' + id}
          >
            <header>
              <h3>{id}</h3>
              <div className="action-row">
                {!props.readOnly && rule && (
                  <Button
                    variant="text"
                    data-rule-index={i}
                    aria-label={'编辑 ' + id}
                    onClick={() => start(i)}
                  >
                    编辑
                  </Button>
                )}
              </div>
            </header>
            {rule ? (
              <RuleSummary rule={rule} schema={schema} context={context} />
            ) : (
              <p>规则结构需要修复，请核对 JSON 原文。</p>
            )}
          </article>
        );
      })}
      {!props.readOnly && (
        <Button variant="secondary" data-add-rule="" onClick={() => start(nodes.length)}>
          添加校验
        </Button>
      )}
      {session && !props.readOnly && <RuleDrawer {...props} session={session} end={end} />}
    </section>
  );
}

function RuleDrawer({
  text: currentText,
  apply,
  session,
  end,
  formPath,
  profile,
}: Props & {
  session: EditSession;
  end: (index: number) => void;
}) {
  const [text, setText] = useState(session.initial);
  const model = useMemo(() => semanticModel(text), [text]);
  const list = child(model.root, 'constraints');
  const selection = session.index;
  const [discarding, setDiscarding] = useState(false);
  const currentName = model.str(child(list?.children?.[selection], 'id')) ?? '';
  const [editedName, setEditedName] = useState<string>();
  const name = editedName ?? currentName;
  const [emptyCode, setEmptyCode] = useState(false);
  const dirty = emptyCode || text !== session.initial || name !== currentName;
  function cancel() {
    if (dirty) setDiscarding(true);
    else end(selection);
  }
  usePendingNavigation('rules', dirty ? { discard: () => end(selection) } : null);
  const [dialog, setDialog] = useState<Dialog>();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<{
    label: string;
    next: string;
    references: { path: string; id: string }[];
    nextRule?: string;
    path: string;
    diagnostics: ConstraintDiagnostic[];
  }>();
  const active = dialog?.source === text && dialog.profile === profile ? dialog : undefined;
  const { manifests, functionDocs, error: catalogError, reload } = useFunctionCatalog();
  const nodes = list?.children ?? [];
  const index = Math.min(selection, nodes.length - 1);
  const node = nodes[index];
  const parsed = useMemo(() => {
    if (!node) return {};
    try {
      return { rule: readConstraint(model.raw(node)) };
    } catch (e) {
      return { problem: errorText(e) };
    }
  }, [model, node]);
  const { rule } = parsed;
  const schema = model.schema && JSON.parse(model.raw(model.schema));
  const fields = reactionFields(schema, rule?.scope);
  const expressions = child(model.root, 'expressions');
  const namedSource: unknown = expressions && JSON.parse(model.raw(expressions));
  const named =
    namedSource && typeof namedSource === 'object' && !Array.isArray(namedSource)
      ? (namedSource as Record<string, Expression>)
      : undefined;
  const context = {
    fields,
    manifests,
    functionDocs,
    named,
    expected: { type: 'boolean' } as const,
  };
  const requires = rule?.requires ?? emptyRequires;
  const issue = rule?.kind === 'internal' && child(node, 'issue');
  const issueMessage = rule?.kind === 'internal' ? rule.issue.message : undefined;
  const messageText = issueMessage && 'text' in issueMessage ? issueMessage.text : '';
  const target = rule?.kind === 'internal' ? rule.issue.target : rule?.target;

  function close() {
    setDialog(undefined);
    setError('');
  }
  function open(mode: Mode, value = '') {
    setRaw(value);
    setError('');
    setDialog({ mode, source: text, profile });
  }
  function commit(next: string) {
    setText(next);
    close();
  }
  function put(key: string, value: string) {
    if (node) commit(model.property(node, key, value));
  }
  function remove(parent: JsonNode | undefined, key: string) {
    const item = child(parent, key);
    if (item) commit(removeItem(text, item));
  }
  async function attempt(work: () => void | Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const sourceRef = useRef(currentText);
  const draftRef = useRef(text);
  const checks = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    const controller = new AbortController();
    checks.current = controller;
    return () => controller.abort();
  }, [formPath, profile]);
  useLayoutEffect(() => {
    sourceRef.current = currentText;
    draftRef.current = text;
  }, [currentText, text]);
  async function checkChange(
    next: string,
    accepts: (item: ConstraintDiagnostic) => boolean,
    baseline = text,
  ) {
    const signal = checks.current?.signal;
    const diagnostics = await checkConstraintChange(
      formPath,
      profile,
      baseline,
      next,
      accepts,
      signal,
    );
    signal?.throwIfAborted();
    if (draftRef.current !== text || sourceRef.current !== session.base)
      throw Error('规则草稿已更改，请重新核验。');
    return diagnostics;
  }
  async function commitChecked(next: string, accepts = isPrerequisite) {
    const diagnostics = await checkChange(next, accepts);
    if (diagnostics.length) throw Error(diagnostics.map(diagnosticText).join('；'));
    commit(next);
  }
  function finish(next: string) {
    if (sourceRef.current !== session.base) throw Error('工作草稿已更新，请取消后重新打开规则。');
    apply(next);
    end(selection);
  }
  async function complete() {
    if (!session.creating && !dirty) return end(selection);
    if (!rule) throw Error(parsed.problem ?? '规则结构需要修复。');
    if (rule.kind === 'internal' && emptyCode) throw Error('请输入错误码。');
    if (!name.trim()) throw Error('请输入规则名称。');
    if (nodes.some((other) => other !== node && model.str(child(other, 'id')) === name))
      throw Error('规则名称已存在。');
    let next = text;
    if (node && name !== currentName) {
      const paths = referencingRules(model, currentName).map((ref) => ref.path);
      next = model.property(node, 'id', JSON.stringify(name));
      for (const path of paths) {
        const updated = semanticModel(next);
        next = updated.property(updated.byPath.get(path)!, 'constraintId', JSON.stringify(name));
      }
    }
    finish(next);
  }
  async function stageImpact(label: string, next: string) {
    if (!node || !rule) return;
    if (next === text) return close();
    const references = referencingRules(model, rule.id);
    const updated = semanticModel(next);
    const nextNode = label === '删除校验规则' ? undefined : updated.byPath.get(node.path);
    const diagnostics = await checkChange(
      next,
      isPrerequisite,
      label === '删除校验规则' ? session.base : text,
    );
    setImpact({
      next,
      label,
      references,
      path: node.path,
      nextRule: nextNode && updated.raw(nextNode),
      diagnostics,
    });
    open('impact');
  }
  function changeKind() {
    if (!node || !rule) return;
    // Keep the original raw shared members, including scope binders and expressions.
    const local = semanticModel(model.raw(node));
    const keys = rule.kind === 'internal' ? ['assert', 'issue'] : ['validator', 'watch', 'target'];
    let source = local.raw(local.root);
    for (const key of keys) {
      const current = semanticModel(source);
      source = removeItem(source, child(current.root, key)!);
    }
    const newKind = rule.kind === 'internal' ? 'external' : 'internal';
    const additions =
      newKind === 'external'
        ? { validator: travelEligibilityValidator, watch: [], target }
        : { assert: true, issue: { code: rule.id, target } };
    for (const [key, value] of Object.entries({ kind: newKind, ...additions })) {
      const current = semanticModel(source);
      source = current.property(current.root, key, JSON.stringify(value));
    }
    return stageImpact('切换校验方式', model.replace(node, source));
  }
  function pick(refs: DataReference[]) {
    if (!node || !rule || !refs.length) return;
    if (active?.mode === 'target') {
      if (issue) commit(model.property(issue, 'target', JSON.stringify(refs[0])));
      else put('target', JSON.stringify(refs[0]));
    } else if (active?.mode === 'watch' && rule.kind === 'external') {
      const observed = new Set(rule.watch.map(watchIdentity));
      const added = refs.filter((ref) => !observed.has(watchIdentity(ref)));
      const watch = child(node, 'watch')!;
      if (added.length)
        commit(
          appendItems(
            model,
            watch,
            added.map((ref) => JSON.stringify(ref)),
          ),
        );
      else close();
    } else if (active?.mode === 'field') {
      void attempt(() =>
        commitChecked(
          addPrerequisite(model, node, { kind: 'field', phase: 'sync', target: refs[0]! }),
        ),
      );
    }
  }

  return (
    <Modal
      title={session.creating ? '新增校验' : '编辑校验'}
      onClose={cancel}
      closeDisabled={busy}
      size="wide"
      className="constraint-drawer"
      actions={
        <>
          {!session.creating && rule && node && (
            <Button
              variant="text"
              className="constraint-delete"
              disabled={busy}
              onClick={() =>
                void attempt(() =>
                  stageImpact(
                    '删除校验规则',
                    removeItem(session.base, semanticModel(session.base).byPath.get(node.path)!),
                  ),
                )
              }
            >
              删除校验
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={cancel}>
            取消
          </Button>
          <Button disabled={busy} onClick={() => void attempt(complete)}>
            完成
          </Button>
        </>
      }
    >
      <div className="constraint-fields">
        {parsed.problem && <p role="alert">{parsed.problem}</p>}
        {catalogError && (
          <p role="alert">
            {catalogError}{' '}
            <Button variant="secondary" onClick={reload}>
              重载函数目录
            </Button>
          </p>
        )}
        {error && !['assert', 'when'].includes(active?.mode ?? '') && <p role="alert">{error}</p>}
        {node && rule && (
          <>
            <dl className="constraint-settings" aria-label="规则设置">
              <dt>
                <label htmlFor="constraint-rule-name">规则名称</label>
              </dt>
              <dd>
                <Input
                  id="constraint-rule-name"
                  value={name}
                  disabled={busy}
                  onChange={(event) => setEditedName(event.target.value)}
                />
              </dd>
              <dt>执行范围</dt>
              <dd>
                <ScopeEditor
                  key={text}
                  schema={schema}
                  rule={rule}
                  checkRemovedScope={false}
                  onChange={(scope) => {
                    const current = child(node, 'scope');
                    return stageImpact(
                      '变更执行范围',
                      scope
                        ? model.property(node, 'scope', JSON.stringify(scope))
                        : current
                          ? removeItem(text, current)
                          : text,
                    );
                  }}
                />
              </dd>
              <dt>错误提示位置</dt>
              <dd className="constraint-target">
                <span>{target && watchLabel(target)}</span>
                <Button variant="secondary" onClick={() => open('target')}>
                  选择字段
                </Button>
              </dd>
              {rule.kind === 'internal' && issue && (
                <>
                  <dt>
                    <label htmlFor="constraint-error-code">错误码</label>
                  </dt>
                  <dd>
                    <Input
                      id="constraint-error-code"
                      value={emptyCode ? '' : rule.issue.code}
                      onChange={({ target }) => {
                        setEmptyCode(!target.value.trim());
                        if (target.value.trim())
                          setText(model.property(issue, 'code', JSON.stringify(target.value)));
                      }}
                    />
                  </dd>
                  <dt>
                    <label htmlFor="constraint-error-message">
                      {issueMessage && 'key' in issueMessage ? '消息键' : '提示文案'}
                    </label>
                  </dt>
                  <dd>
                    <Input
                      id="constraint-error-message"
                      value={issueMessage && 'key' in issueMessage ? issueMessage.key : messageText}
                      placeholder="使用默认错误提示"
                      onChange={({ target }) => {
                        const existing = child(issue, 'message');
                        if (!target.value && existing) setText(removeItem(text, existing));
                        else if (target.value)
                          setText(
                            model.property(
                              issue,
                              'message',
                              JSON.stringify(
                                issueMessage && 'key' in issueMessage
                                  ? { ...issueMessage, key: target.value }
                                  : { text: target.value },
                              ),
                            ),
                          );
                      }}
                    />
                  </dd>
                </>
              )}
              <dt>前置检查</dt>
              <dd>
                <p id="constraint-prerequisite-help" className="constraint-prerequisite-help">
                  所选字段的同步校验和所选内部规则全部通过后，才会执行本规则。
                </p>
                {requires.map((entry, i) => (
                  <div className="reaction-row" key={i}>
                    {entry.kind === 'field'
                      ? '字段 · ' + watchLabel(entry.target)
                      : '规则 · ' + entry.constraintId}
                    <Button
                      variant="secondary"
                      onClick={() =>
                        commit(removeItem(text, child(node, 'requires')!.children![i]!))
                      }
                    >
                      移除前置
                    </Button>
                  </div>
                ))}
                <div className="constraint-actions">
                  <Button variant="secondary" disabled={busy} onClick={() => open('field')}>
                    添加字段检查
                  </Button>
                  <ConstraintPrerequisites
                    model={model}
                    node={node}
                    current={requires}
                    disabled={busy}
                    apply={(next) => void attempt(() => commitChecked(next))}
                  />
                </div>
              </dd>
            </dl>
            <section>
              <div className="constraint-section-heading">
                <h3>适用条件</h3>
                <Button
                  variant="secondary"
                  onClick={() =>
                    open('when', child(node, 'when') ? model.raw(child(node, 'when')!) : 'true')
                  }
                >
                  编辑适用条件
                </Button>
              </div>
              {rule.when !== undefined ? (
                <ExpressionDisplay expr={rule.when} {...context} />
              ) : (
                <p>始终适用</p>
              )}
              {child(node, 'when') && (
                <Button variant="secondary" onClick={() => remove(node, 'when')}>
                  移除适用条件
                </Button>
              )}
            </section>
            <section>
              <div className="constraint-section-heading">
                <h3>{rule.kind === 'internal' ? '校验通过条件' : '外部校验器'}</h3>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void attempt(changeKind)}
                >
                  切换校验方式
                </Button>
              </div>
              {rule.kind === 'internal' ? (
                <>
                  <ConstraintRequirement
                    expr={rule.assert}
                    fields={fields}
                    change={(value) => put('assert', JSON.stringify(value))}
                    custom={() => open('assert', model.raw(child(node, 'assert')!))}
                  />
                  {!commonRequirement(rule.assert, fields) && (
                    <ExpressionDisplay expr={rule.assert} {...context} />
                  )}
                  {!commonRequirement(rule.assert, fields) && (
                    <Button
                      variant="secondary"
                      onClick={() => open('assert', model.raw(child(node, 'assert')!))}
                    >
                      编辑判断表达式
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <p>
                    <code>{rule.validator}</code>
                    {rule.validator !== travelEligibilityValidator && ' · 当前 Studio Host 未注册'}
                  </p>
                  <Button variant="secondary" onClick={() => open('validator')}>
                    选择 Host 校验器
                  </Button>
                  <h4>Host 读取字段</h4>
                  {rule.watch.map((ref, i) => (
                    <div className="reaction-row" key={i}>
                      {watchLabel(ref)}
                      <Button
                        variant="secondary"
                        onClick={() =>
                          commit(removeItem(text, child(node, 'watch')!.children![i]!))
                        }
                      >
                        移除读取
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" onClick={() => open('watch')}>
                    添加 Host 读取
                  </Button>
                </>
              )}
            </section>
          </>
        )}
        {rule && (
          <section className="constraint-preview">
            <h3>收起后的显示效果</h3>
            <RuleSummary rule={rule} schema={schema} context={context} />
          </section>
        )}
      </div>
      {discarding && (
        <Modal title="放弃本条修改？" onClose={() => setDiscarding(false)} closeLabel="继续编辑">
          <p>规则清单将保留打开抽屉前的内容。</p>
          <Button onClick={() => end(selection)}>放弃修改</Button>
        </Modal>
      )}
      {active && ['field', 'target', 'watch'].includes(active.mode) && (
        <ReactionFieldPicker
          fields={
            active.mode === 'field'
              ? fields.filter(
                  ({ ref }) =>
                    !requires.some(
                      (entry) =>
                        entry.kind === 'field' &&
                        watchIdentity(ref) === watchIdentity(entry.target),
                    ),
                )
              : fields
          }
          title={
            active.mode === 'field'
              ? '选择需先通过校验的字段'
              : active.mode === 'target'
                ? '选择错误提示位置'
                : '添加 Host 读取'
          }
          closeOnApply={active.mode !== 'field' && !(active.mode === 'target' && issue)}
          busy={busy}
          feedback={error}
          initial={active.mode === 'target' && target ? [target] : undefined}
          multiple={active.mode === 'watch'}
          onApply={(refs) => pick(refs.filter((ref) => ref.source === 'data'))}
          onClose={close}
        />
      )}
      {active && node && (active.mode === 'when' || active.mode === 'assert') && (
        <ExpressionEditorDialog
          title={active.mode === 'when' ? '编辑适用条件' : '编辑判断表达式'}
          onClose={close}
          busy={busy}
          error={error}
          onApply={() =>
            void attempt(() => {
              validateReactionExpression(raw, context);
              return commitChecked(
                model.property(node, active.mode, raw),
                ({ code }) => code === 'VALIDATION_NOT_AVAILABLE',
              );
            })
          }
          {...context}

          allowValidation={false}
          verification={verificationContext(
            formPath,
            model,
            rule?.scope,
            active.mode === 'assert' ? 'assertion' : 'condition',
          )}
          raw={raw}
          onChange={setRaw}
          label={active.mode === 'when' ? '适用条件' : '判断表达式'}
        />
      )}
      {active?.mode === 'validator' && (
        <Modal title="选择 Host 校验器" onClose={close}>
          <button onClick={() => put('validator', JSON.stringify(travelEligibilityValidator))}>
            {travelEligibilityValidator}
          </button>
        </Modal>
      )}
      {active?.mode === 'impact' && impact && (
        <Modal title={impact.label} onClose={close} wide>
          <p>
            修改位置 <code>{impact.path}</code>
          </p>
          {node && (
            <details>
              <summary>当前规则与引用</summary>
              <pre>{model.raw(node)}</pre>
            </details>
          )}
          {impact.nextRule && (
            <details>
              <summary>修改后规则</summary>
              <pre>{impact.nextRule}</pre>
            </details>
          )}
          {impact.references.map((item) => (
            <p key={item.path}>
              引用规则 {item.id} · <code>{item.path}</code>
            </p>
          ))}
          {impact.diagnostics.length > 0 && (
            <ul role="alert">
              {impact.diagnostics.map((item, i) => (
                <li key={i}>{diagnosticText(item)}</li>
              ))}
            </ul>
          )}
          <button
            disabled={busy || impact.diagnostics.length > 0}
            onClick={() =>
              void attempt(() =>
                impact.label === '删除校验规则' ? finish(impact.next) : commit(impact.next),
              )
            }
          >
            确认{impact.label}
          </button>
        </Modal>
      )}
    </Modal>
  );
}
