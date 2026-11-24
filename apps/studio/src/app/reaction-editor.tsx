import './rule-list.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactionAction, ValueSpec } from '@form-engine/protocol/definition';
import { Button, Input } from '../components/ui';
import { JsonEditor } from '../components/json/json-editor';
import { Tabs } from '../components/ui/tabs';
import { ExpressionDisplay } from './expression-display';
import { Modal } from './modal';
import { checkReaction } from './reaction-check';
import { reactionFields, scopeBinders, watchLabel, type ReactionField } from './reaction-fields';
import { appendItems, readRule, removeItem, searchableRule } from './reaction-model';
import { RuleFields } from './reaction-rule-fields';
import { SchemaNavigation, usePendingNavigation } from './schema-navigation';
import { child, semanticModel, type Model } from './semantic-model';
import type { JsonNode } from '../components/json/model';
import { useFunctionCatalog, type FunctionDocumentation } from './function-catalog';
import type { ReactionExpressionContext } from './reaction-expression-model';

type Props = {
  formPath: string;
  profile: string;
  text: string;
  readOnly?: boolean;
  apply: (next: string) => void;
  locate: (path: string) => void;
  repair: () => void;
};

type ActionDisplay = { label: string; children?: ActionDisplay[]; value?: ValueSpec };
function actionDisplay(action: ReactionAction, fields: ReactionField[]): ActionDisplay {
  if ('type' in action)
    return {
      label: '通知宿主 ' + action.event + (action.payload === undefined ? '' : '，传入'),
      value: action.payload,
    };
  if (action.op === 'batch')
    return {
      label: '批量执行',
      children: action.commands.map((entry) => actionDisplay(entry, fields)),
    };

  const field = fields.find(
    ({ ref }) => ref.path === action.target.path && ref.scope === action.target.scope,
  );
  const target = field?.title ?? watchLabel(action.target);
  switch (action.op) {
    case 'set':
      return { label: target + ' =', value: action.value };
    case 'patch':
      return { label: '更新 ' + target + ' 的属性', value: action.value };
    case 'remove':
      return { label: '删除 ' + target };
    case 'array.remove':
      return { label: '从 ' + target + ' 移除成员 ' + action.item.$scope };
    default: {
      const position = action.position;
      const where =
        position.kind === 'index'
          ? '下标 ' + position.index
          : position.item.$scope + (position.kind === 'before' ? ' 之前' : ' 之后');
      return action.op === 'array.move'
        ? { label: '将成员 ' + action.item.$scope + ' 移至 ' + target + ' 的' + where }
        : { label: '在 ' + target + ' 的' + where + '插入', value: action.value };
    }
  }
}

function ActionTree({
  node,
  context,
}: {
  node: ActionDisplay;
  context: ReactionExpressionContext & { functionDocs: ReadonlyMap<string, FunctionDocumentation> };
}) {
  return (
    <li>
      {node.value !== undefined ? (
        <div className="reaction-action-reading">
          <span>{node.label}</span>
          <ExpressionDisplay value={node.value} {...context} />
        </div>
      ) : (
        <span>{node.label}</span>
      )}
      {node.children && (
        <ol>
          {node.children.map((child, index) => (
            <ActionTree key={index} node={child} context={context} />
          ))}
        </ol>
      )}
    </li>
  );
}

export function ReactionEditor(props: Props) {
  const m = useMemo(() => {
    try {
      return semanticModel(props.text);
    } catch {
      return undefined;
    }
  }, [props.text]);
  const list = m && child(m.root, 'reactions');
  if (
    !m ||
    m.root.kind !== 'object' ||
    (list && (list.kind !== 'array' || m.ambiguous.has(list.path)))
  )
    return (
      <Button variant="secondary" onClick={props.repair}>
        {props.readOnly ? '查看 JSON 原文' : '打开文本修复'}
      </Button>
    );
  return <RuleList {...props} model={m} list={list} />;
}

type Session = { index: number; base: string; initial: string; isNew: boolean };
function RuleList({ model: m, list, ...props }: Props & { model: Model; list?: JsonNode }) {
  const { manifests, functionDocs } = useFunctionCatalog();
  const [search, setSearch] = useState('');
  const [session, setSession] = useState<Session>();
  const listRef = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const rules = list?.children ?? [];
  const active = session?.base === props.text && !props.readOnly ? session : undefined;
  usePendingNavigation('rules', active ? { discard: () => setSession(undefined) } : null);
  const cards = useMemo(() => {
    const expr = child(m.root, 'expressions');
    const named = expr && JSON.parse(m.raw(expr));
    const schema = m.schema && JSON.parse(m.raw(m.schema));
    return (list?.children ?? []).map((n) => {
      try {
        const r = readRule(m.raw(n));
        const fields = reactionFields(schema, r.scope);
        const context = { fields, named, manifests, functionDocs };
        return {
          id: r.id,
          terms: searchableRule(r, named),
          watch: r.watch.map(watchLabel).join('、'),
          activate: r.runOnActivate,
          scope:
            scopeBinders(r.scope)
              .map(
                (b) =>
                  (b.mode === 'each' ? '逐项' : '绑定') +
                  ' ' +
                  watchLabel(b.from) +
                  '（' +
                  b.as +
                  '）',
              )
              .join(' → ') || '整张表单',
          when: r.when,
          context,
          actions: r.then.map((a) => actionDisplay(a, fields)),
        };
      } catch (err) {
        return {
          id: m.str(child(n, 'id')) ?? n.path,
          terms: m.raw(n).toLocaleLowerCase(),
          error: err instanceof Error ? err.message : '规则结构无效',
        };
      }
    });
  }, [list, m, manifests, functionDocs]);
  function open(index: number, button: HTMLButtonElement) {
    trigger.current = button;
    let initial = props.text;
    if (index === rules.length) {
      const names = new Set([
        ...cards.map((c) => c.id),
        ...(child(m.root, 'constraints')?.children ?? []).map((n) => m.str(child(n, 'id'))),
      ]);
      let suffix = rules.length + 1;
      while (names.has('联动规则' + suffix)) suffix++;
      const raw = JSON.stringify({ id: '联动规则' + suffix, watch: [], then: [] });
      initial = list
        ? appendItems(m, list, [raw])
        : m.property(m.root, 'reactions', '[' + raw + ']');
    }
    setSession({ index, base: props.text, initial, isNew: index === rules.length });
  }
  const focusAfterClose = useRef<{ index?: number } | null>(null);
  function close(index?: number) {
    focusAfterClose.current = { index };
    setSession(undefined);
    if (index !== undefined) setSearch('');
  }
  useEffect(() => {
    const requested = focusAfterClose.current;
    if (session || !requested) return;
    focusAfterClose.current = null;
    const target =
      requested.index !== undefined
        ? listRef.current?.querySelector<HTMLButtonElement>(
            '[data-rule-index="' + requested.index + '"]',
          )
        : trigger.current;
    (target?.isConnected
      ? target
      : listRef.current?.querySelector<HTMLButtonElement>('[data-add-rule]')
    )?.focus();
  }, [session]);
  const query = search.trim().toLocaleLowerCase();
  return (
    <section className="rule-list reaction-list" aria-label="联动规则列表" ref={listRef}>
      <header>
        <h2>联动规则</h2>
        <span>{cards.length} 条</span>
        <Input
          type="search"
          aria-label="搜索联动规则"
          placeholder="搜索规则或字段"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>
      {cards.map(
        (c, i) =>
          c.terms.includes(query) && (
            <article key={i}>
              <header>
                <h3>{c.id}</h3>
                {!props.readOnly && (
                  <div className="action-row">
                    {!c.error && (
                      <Button
                        data-rule-index={i}
                        variant="text"
                        aria-label={'编辑 ' + c.id}
                        onClick={(e) => open(i, e.currentTarget)}
                      >
                        编辑
                      </Button>
                    )}
                    <Button
                      variant="text"
                      className="reaction-list-delete"
                      aria-label={'删除 ' + c.id}
                      onClick={() => {
                        if (window.confirm('删除规则 ' + c.id + '？'))
                          props.apply(removeItem(props.text, rules[i]!));
                      }}
                    >
                      删除
                    </Button>
                  </div>
                )}
              </header>
              {c.error ? (
                <>
                  <p>{c.error}</p>
                  <Button variant="text" onClick={() => props.locate(rules[i]!.path)}>
                    在 JSON 中定位
                  </Button>
                </>
              ) : (
                <dl>
                  <dt>执行范围</dt>
                  <dd>{c.scope}</dd>
                  <dt>触发时机</dt>
                  <dd>
                    {[c.activate ? '首次激活' : null, c.watch ? c.watch + ' 变化' : null]
                      .filter(Boolean)
                      .join('；') || '未配置触发来源'}
                  </dd>
                  <dt>成立条件</dt>
                  <dd>
                    {c.when !== undefined && c.context ? (
                      <ExpressionDisplay expr={c.when} {...c.context} />
                    ) : (
                      '每次触发都执行'
                    )}
                  </dd>
                  <dt>依次执行</dt>
                  <dd>
                    {c.actions?.length && c.context ? (
                      <ol className="reaction-tree reaction-action-tree">
                        {c.actions.map((a, j) => (
                          <ActionTree key={j} node={a} context={c.context!} />
                        ))}
                      </ol>
                    ) : (
                      '尚未配置动作'
                    )}
                  </dd>
                </dl>
              )}
            </article>
          ),
      )}
      {!cards.length ? (
        <p>尚未配置联动规则。</p>
      ) : (
        !cards.some((c) => c.terms.includes(query)) && <p>没有匹配的联动规则。</p>
      )}
      {!props.readOnly && (
        <Button
          data-add-rule
          variant="secondary"
          onClick={(e) => open(rules.length, e.currentTarget)}
        >
          添加联动
        </Button>
      )}
      {active && <RuleDrawer {...props} session={active} close={close} />}
    </section>
  );
}
function RuleDrawer({
  session,
  close,
  apply,
  formPath,
  profile,
}: Props & { session: Session; close: (index?: number) => void }) {
  const [text, setText] = useState(session.initial);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonBaseline, setJsonBaseline] = useState('');
  const [jsonDirty, setJsonDirty] = useState(false);
  const parsed = useMemo(() => {
    try {
      return { model: semanticModel(text) };
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : 'JSON 语法无效。' };
    }
  }, [text]);
  const model = parsed.model;
  const list = model && child(model.root, 'reactions');
  const node = list?.children?.[session.index];
  const live = useRef(false);
  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function finish() {
    if (busy || pending) return;
    setBusy(true);
    setError('');
    try {
      if (!model || !list || !node)
        throw Error(parsed.error ?? '规则结构无效，请在 JSON 编辑中修复。');
      const source = mode === 'json' ? model.replace(node, jsonDraft) : text;
      const candidate = semanticModel(source);
      const candidateList = child(candidate.root, 'reactions');
      const candidateNode = candidateList?.children?.[session.index];
      if (!candidateList || !candidateNode) throw Error('规则结构无效。');
      const rule = readRule(candidate.raw(candidateNode));
      if (
        [
          ...(candidateList.children ?? []),
          ...(child(candidate.root, 'constraints')?.children ?? []),
        ].some((n) => n !== candidateNode && candidate.str(child(n, 'id')) === rule.id)
      )
        throw Error('请填写唯一的规则名称。');
      if (session.isNew && !rule.then.length) throw Error('请至少添加一个动作。');
      await checkReaction(formPath, profile, source, candidateNode.path);
      if (live.current) {
        apply(source);
        close(session.index);
      }
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : '检查失败，请重试。');
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <Modal
      title={session.isNew ? '添加联动' : '编辑联动'}
      className="reaction-drawer"
      size="wide"
      closeDisabled={busy}
      onClose={() => {
        if (
          (text === session.initial && !jsonDirty && !pending) ||
          window.confirm('放弃本条规则尚未完成的修改？')
        )
          close();
      }}
      actions={
        <div className="reaction-drawer-actions">
          {(error || pending) && (
            <div className="reaction-drawer-status">
              {error && <span role="alert">{error}</span>}
              {pending && <span>请先应用或取消当前动作。</span>}
            </div>
          )}
          <div className="reaction-drawer-buttons">
            <Button variant="secondary" disabled={busy} onClick={() => close()}>
              取消
            </Button>
            <Button disabled={busy || pending} onClick={() => void finish()}>
              {busy ? '正在检查…' : '完成规则'}
            </Button>
          </div>
        </div>
      }
    >
      <fieldset disabled={busy} inert={busy} className="reaction-drawer-content">
        <Tabs.Root
          className="reaction-drawer-tabs"
          value={mode}
          onValueChange={(value) => {
            const next = value as 'form' | 'json';
            if (next === 'json') {
              if (!model || !node) {
                setError(parsed.error ?? '规则结构无效。');
                return;
              }
              const raw = model.raw(node);
              setJsonDraft(raw);
              setJsonBaseline(raw);
              setJsonDirty(false);
            } else {
              try {
                if (!list || !node || model!.root.kind !== 'object') throw Error('规则结构无效。');
                readRule(jsonDraft);
                const merged = model!.replace(node, jsonDraft);
                const candidate = semanticModel(merged);
                const candidateRule = child(candidate.root, 'reactions')?.children?.[session.index];
                if (!candidateRule) throw Error('找不到正在编辑的联动规则。');
                readRule(candidate.raw(candidateRule));
                setText(merged);
                setJsonDirty(false);
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : '规则结构无效，请先在 JSON 编辑中修复。',
                );
                return;
              }
            }
            setError('');
            setMode(next);
          }}
        >
          <Tabs.List aria-label="编辑方式">
            <Tabs.Tab value="form">表单编辑</Tabs.Tab>
            <Tabs.Tab value="json">JSON 编辑</Tabs.Tab>
          </Tabs.List>
          {mode === 'json' ? (
            <section className="reaction-drawer-json" aria-label="规则 JSON 编辑">
              <JsonEditor
                label="规则 JSON"
                text={jsonDraft}
                readOnly={false}
                initialMode="text"
                onChange={(next) => {
                  setJsonDraft(next);
                  setJsonDirty(next !== jsonBaseline);
                  try {
                    if (!model || !node) throw Error(parsed.error ?? '规则结构无效。');
                    readRule(next);
                    const merged = model.replace(node, next);
                    const candidate = semanticModel(merged);
                    const candidateRule = child(candidate.root, 'reactions')?.children?.[
                      session.index
                    ];
                    if (!candidateRule) throw Error('找不到正在编辑的联动规则。');
                    readRule(candidate.raw(candidateRule));
                    setText(merged);
                    setError('');
                  } catch (reason) {
                    setError(
                      reason instanceof Error ? reason.message : '规则 JSON 无效，已保留原文。',
                    );
                  }
                }}
              />
            </section>
          ) : model && list && node ? (
            <SchemaNavigation text={text} onPendingChange={setPending}>
              <RuleFields
                model={model}
                list={list}
                node={node}
                pending={pending}
                text={text}
                apply={setText}
                formPath={formPath}
                profile={profile}
              />
            </SchemaNavigation>
          ) : (
            <div className="reaction-drawer-json-error" role="alert">
              {parsed.error}
            </div>
          )}
        </Tabs.Root>
      </fieldset>
    </Modal>
  );
}
