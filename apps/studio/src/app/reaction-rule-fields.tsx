import { JsonEditor } from '../components/json/json-editor';
import { Button, Input } from '@form-engine/studio-design-components';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactionWatch, ScopeBinder } from '@form-engine/protocol/definition';
import { ExpressionDisplay } from './expression-display';
import { Modal } from './modal';
import { verificationContext } from './expression-verification';
import { useFunctionCatalog } from './function-catalog';
import { child, semanticModel, type Model } from './semantic-model';
import type { JsonNode } from '../components/json/model';
import { ReactionFieldPicker } from './reaction-fields-ui';
import { ScopeEditor } from './scope-editor';
import {
  reactionFields,
  reactionReads,
  removedScopeInUse,
  watchIdentity,
  watchLabel,
} from './reaction-fields';
import { ExpressionEditorDialog, validateReactionExpression } from './expression-editor';
import { ActionEditor, actionKind, actionTypes, type ActionKind } from './reaction-action-editor';
import { usePendingNavigation, useSchemaNavigation } from './schema-navigation';
import { appendItems, readRule, removeItem, reorder } from './reaction-model';
import { checkReaction } from './reaction-check';
import './reaction-editor.css';

type Props = {
  formPath: string;
  profile: string;
  text: string;
  apply: (next: string) => void;
  pending?: boolean;
};
type Dialog = {
  source: string;
  kind: 'json' | 'condition' | 'watch';
};
const message = (e: unknown) => (e instanceof Error ? e.message : '无法应用修改。');

export function RuleFields({
  text,
  formPath,
  profile,
  pending = false,
  model: m,
  list,
  node,
  apply,
}: Props & { model: Model; list: JsonNode; node: JsonNode }) {
  const [dialog, setDialog] = useState<Dialog>(),
    [draft, setDraft] = useState(''),
    [error, setError] = useState('');
  const [drag, setDrag] = useState<{ index: number; source: string; rule: string }>();
  const { beforeLeave } = useSchemaNavigation();
  const [activeAction, setActiveAction] = useState(-1);
  const [newAction, setNewAction] = useState<ActionKind>();
  const [actionDirty, setActionDirty] = useState(false);
  const [actionTrigger, setActionTrigger] = useState<HTMLButtonElement>();
  const { manifests, functionDocs, error: catalogError, reload } = useFunctionCatalog();
  const rules = list?.children ?? [];

  const id = (n: JsonNode) => m.str(child(n, 'id')) ?? n.path;
  const ruleInfo = useMemo(() => {
    if (!node) return {};
    try {
      return { rule: readRule(m.raw(node)) };
    } catch (e) {
      return { problem: message(e) };
    }
  }, [m, node]);
  const rule = ruleInfo.rule;
  const ambiguousShared = [...m.ambiguous].some(
    (path) =>
      path === '/data' ||
      path === '/data/schema' ||
      path.startsWith('/data/schema/') ||
      path === '/expressions' ||
      path.startsWith('/expressions/'),
  );
  const schema = m.schema && JSON.parse(m.raw(m.schema));
  const expressions = child(m.root, 'expressions');
  const named = expressions && JSON.parse(m.raw(expressions));
  const fields = reactionFields(schema, rule?.scope);
  const context = { fields, manifests, functionDocs, named };
  const when = child(node, 'when'),
    then = child(node, 'then'),
    watch = child(node, 'watch');
  const modal = dialog?.source === text ? dialog : undefined;
  const activePath = node?.path;
  const latest = useRef<{ modal?: Dialog; text: string; path?: string } | undefined>(undefined);
  useLayoutEffect(() => {
    latest.current = { modal, text, path: activePath };
    return () => {
      latest.current = undefined;
    };
  }, [modal, text, activePath]);
  const [checking, setChecking] = useState(false);
  async function checkedApply(next: string, isCurrent = () => true) {
    if (next === text || !node) return;
    await checkReaction(formPath, profile, next, node.path);
    if (
      !isCurrent() ||
      latest.current?.text !== text ||
      latest.current?.modal !== modal ||
      latest.current?.path !== node.path
    )
      throw Error('草稿已变化，请重新编辑。');
    apply(next);
  }
  function scopeSource(target: JsonNode, scope: ScopeBinder | undefined) {
    const current = child(target, 'scope');
    if (!scope) return current ? removeItem(text, current) : text;
    if (!current) return m.property(target, 'scope', JSON.stringify(scope));
    const from = child(current, 'from');
    let next =
      m.str(child(current, 'as')) === scope.as
        ? text
        : m.property(current, 'as', JSON.stringify(scope.as));
    if (m.str(child(from, 'path')) !== scope.from.path) {
      const updated = semanticModel(next);
      next = updated.property(
        updated.byPath.get(current.path + '/from')!,
        'path',
        JSON.stringify(scope.from.path),
      );
    }
    return next;
  }
  const observed = new Set(rule?.watch.map(watchIdentity));
  function close() {
    setDialog(undefined);
    setError('');
  }
  function open(kind: Dialog['kind'], value = '') {
    setDialog({ kind, source: text });
    setDraft(value);
    setError('');
  }
  async function attempt(fn: () => Promise<void>) {
    setChecking(true);
    try {
      await fn();
      setError('');
    } catch (e) {
      setError(message(e));
    } finally {
      setChecking(false);
    }
  }
  function uniqueId(value: string, except?: JsonNode) {
    const constraints = child(m.root, 'constraints')?.children ?? [];
    if (!value.trim() || [...rules, ...constraints].some((n) => n !== except && id(n) === value))
      throw Error('请填写唯一的规则名称。');
  }
  function put(key: string, raw: string) {
    if (node) apply(m.property(node, key, raw));
  }
  function addWatch(refs: ReactionWatch[]) {
    const seen = new Set(observed);
    const added = refs.filter((ref) => {
      const key = watchIdentity(ref);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (watch && added.length)
      apply(
        appendItems(
          m,
          watch,
          added.map((ref) => JSON.stringify(ref)),
        ),
      );
    close();
  }
  function hints(value: unknown, kind: 'expression' | 'action') {
    return reactionReads(value, kind, named)
      .filter((ref) => !observed.has(watchIdentity(ref)))
      .map((ref) => (
        <div className="reaction-hint" key={watchIdentity(ref)}>
          <span>读取但未观察 · {watchLabel(ref)}</span>
          <button onClick={() => addWatch([ref])} aria-label={'加入观察 ' + watchLabel(ref)}>
            加入观察
          </button>
        </div>
      ));
  }
  async function submit() {
    if (!modal) return;
    if (node && rule) {
      if (modal.kind === 'json') {
        const next = readRule(draft);
        uniqueId(next.id, node);
        const used = removedScopeInUse(rule.scope, next.scope, next);
        if (used !== undefined) throw Error('仍在使用作用域 ' + used);
        await checkedApply(m.replace(node, draft));
      } else if (modal.kind === 'condition') {
        validateReactionExpression(draft, { ...context, expected: { type: 'boolean' } });
        await checkedApply(m.property(node, 'when', draft));
      }
    }
    close();
  }
  const actionNodes = then?.children ?? [];
  const actionIndex = Math.min(activeAction, Math.max(0, actionNodes.length - 1));
  const action = rule?.then[actionIndex];
  const selectedKind = newAction ?? (action && actionKind(action));
  const actionKey = JSON.stringify([activePath, actionIndex, newAction, text]);
  function discardAction() {
    setNewAction(undefined);
    setActionDirty(false);
    setActiveAction(-1);
  }
  usePendingNavigation('inspector', actionDirty ? { discard: discardAction } : null);
  async function applyAction(raw: string, isCurrent: () => boolean) {
    if (!node || !then) throw Error('规则已变化，请重新选择动作。');
    const selected = newAction ? undefined : actionNodes[actionIndex];
    const next = selected ? m.replace(selected, raw) : appendItems(m, then, [raw]);
    const candidate = semanticModel(next);
    readRule(candidate.raw(candidate.byPath.get(node.path)!));
    await checkedApply(next, isCurrent);
    setActiveAction(-1);
    setNewAction(undefined);
    setActionDirty(false);
  }
  function move(from: number, to: number) {
    if (then && from !== to && to >= 0 && to < actionNodes.length)
      beforeLeave(() => {
        apply(reorder(m, then, from, to));
        setActiveAction(-1);
      });
    setDrag(undefined);
  }
  const title = modal?.kind === 'json' ? '规则 JSON' : '成立条件';
  return (
    <section className="reaction-workspace reaction-rule-fields" aria-label="规则配置">
      <section className="reaction-details">
        {!rule || ambiguousShared ? (
          <>
            <p>{ruleInfo.problem ?? '字段或表达式声明含重复属性。'}</p>
          </>
        ) : (
          <>
            {catalogError && (
              <p role="alert">
                {catalogError}
                <button onClick={reload}>重新加载函数目录</button>
              </p>
            )}
            <section className="reaction-execution" inert={actionDirty}>
              <label className="reaction-rule-name">
                规则名称
                <Input
                  disabled={pending}
                  value={rule.id}
                  onChange={(event) => put('id', JSON.stringify(event.target.value))}
                />
              </label>
              <ScopeEditor
                key={node.path + '\n' + text}
                schema={schema}
                rule={rule}
                compactSummary
                scopeJson={child(node, 'scope') ? m.raw(child(node, 'scope')!) : undefined}
                onApplyJson={async (raw) => {
                  const next = JSON.parse(raw);
                  if (next !== null && typeof next !== 'object')
                    throw Error('作用域必须是对象、数组或 null。');
                  const used = removedScopeInUse(rule.scope, next, {
                    ...rule,
                    scope: next ?? undefined,
                  });
                  if (used !== undefined) throw Error('仍在使用作用域 ' + used);
                  const current = child(node, 'scope');
                  const after =
                    next === null
                      ? current
                        ? removeItem(text, current)
                        : text
                      : m.property(node, 'scope', raw);
                  const updated = semanticModel(after);
                  readRule(updated.raw(updated.byPath.get(node.path)!));
                  await checkedApply(after);
                }}
                validate={async (scope) =>
                  checkReaction(formPath, profile, scopeSource(node, scope), node.path)
                }
                onChange={(scope) => checkedApply(scopeSource(node, scope))}
              />
              <div className="reaction-activation">
                <span>触发设置</span>
                <label>
                  <input
                    type="checkbox"
                    disabled={pending}
                    checked={rule.runOnActivate ?? false}
                    onChange={(e) => put('runOnActivate', String(e.target.checked))}
                  />
                  首次激活时执行
                </label>
              </div>
            </section>
            <section inert={actionDirty}>
              <div className="toolbar">
                <h3>
                  <span className="reaction-section-index" aria-hidden="true">
                    1
                  </span>
                  观察来源
                </h3>
                <button onClick={() => open('watch')}>添加观察</button>
              </div>
              <div className="reaction-watch-list">
                {rule.watch.map((ref, i) => (
                  <div className="reaction-watch-item" key={i}>
                    <span className="reaction-watch-kind">
                      {ref.source === 'validation' ? '校验变化' : '字段变化'}
                    </span>
                    <span className="reaction-watch-label">{watchLabel(ref)}</span>
                    <button
                      type="button"
                      className="reaction-watch-remove"
                      aria-label={'移除观察 ' + watchLabel(ref)}
                      onClick={() => apply(removeItem(text, watch!.children![i]!))}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section inert={actionDirty}>
              <div className="toolbar">
                <h3>
                  <span className="reaction-section-index" aria-hidden="true">
                    2
                  </span>
                  成立条件
                </h3>
                {when && (
                  <div className="reaction-section-actions">
                    <button type="button" onClick={() => open('condition', m.raw(when))}>
                      编辑条件
                    </button>
                    <button type="button" onClick={() => apply(removeItem(text, when))}>
                      移除条件
                    </button>
                  </div>
                )}
              </div>
              {rule.when !== undefined ? (
                <>
                  <ExpressionDisplay expr={rule.when} {...context} />
                  {hints(rule.when, 'expression')}
                </>
              ) : (
                <div className="reaction-condition-empty">
                  <p>未添加条件。观察值变化后直接执行动作。</p>
                  <button type="button" onClick={() => open('condition', 'true')}>
                    添加条件
                  </button>
                </div>
              )}
            </section>
            <section aria-label="有序动作">
              <div className="toolbar">
                <h3>
                  <span className="reaction-section-index" aria-hidden="true">
                    3
                  </span>
                  有序动作
                </h3>
              </div>
              <div className="reaction-action-layout">
                <div className="reaction-action-rail">
                  <Button
                    variant="secondary"
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      const trigger = event.currentTarget;
                      beforeLeave(() => {
                        setActionTrigger(trigger);
                        setNewAction('set');
                      });
                    }}
                  >
                    <span aria-hidden="true">＋</span> <span>添加动作</span>
                  </Button>
                  <ol className="reaction-actions" aria-label="动作执行顺序">
                    {rule.then.map((entry, i) => {
                      const kind = actionKind(entry);
                      return (
                        <li
                          key={i}
                          draggable={!actionDirty}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(i));
                            setDrag({ index: i, source: text, rule: node.path });
                          }}
                          onDragEnd={() => setDrag(undefined)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (drag?.source === text && drag.rule === node.path)
                              move(drag.index, i);
                          }}
                        >
                          <Button
                            variant="text"
                            className="reaction-action-tab"
                            aria-haspopup="dialog"
                            onClick={(event) => {
                              const trigger = event.currentTarget;
                              beforeLeave(() => {
                                setActionTrigger(trigger);
                                setNewAction(undefined);
                                setActiveAction(i);
                              });
                            }}
                          >
                            <span className="reaction-step">{i + 1}</span>
                            <span>
                              <strong>{actionTypes[kind][0]}</strong>
                              {'type' in entry ? (
                                <small>{' · ' + entry.event}</small>
                              ) : (
                                'target' in entry && <small>{watchLabel(entry.target)}</small>
                              )}
                            </span>
                          </Button>
                          <div className="reaction-order-tools">
                            <button
                              type="button"
                              title="动作上移"
                              aria-label="动作上移"
                              disabled={i === 0}
                              onClick={() => move(i, i - 1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              title="动作下移"
                              aria-label="动作下移"
                              disabled={i === rule.then.length - 1}
                              onClick={() => move(i, i + 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              aria-label="删除动作"
                              className="reaction-remove"
                              onClick={() =>
                                beforeLeave(() => {
                                  apply(removeItem(text, actionNodes[i]!));
                                  setActiveAction(-1);
                                })
                              }
                            >
                              删除
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                {selectedKind && (
                  <ActionEditor
                    key={actionKey}
                    {...context}
                    kind={selectedKind}
                    scope={rule.scope}
                    verification={verificationContext(formPath, m, rule.scope)}
                    initial={newAction ? undefined : m.raw(actionNodes[actionIndex]!)}
                    onApply={applyAction}
                    onPending={setActionDirty}
                    discard={discardAction}
                    returnFocus={actionTrigger}
                  >
                    {action && hints(action, 'action')}
                  </ActionEditor>
                )}
              </div>
            </section>
          </>
        )}
      </section>
      {modal?.kind === 'watch' && (
        <ReactionFieldPicker
          fields={fields}
          title="添加观察"
          allowValidation
          multiple
          onApply={addWatch}
          onClose={close}
        />
      )}
      {modal?.kind === 'condition' && (
        <ExpressionEditorDialog
          title="成立条件"
          onClose={close}
          busy={checking}
          error={error}
          action={checking ? '正在检查…' : '应用修改'}
          onApply={() => void attempt(submit)}
          {...context}
          label="条件"

          raw={draft}
          onChange={(next) => {
            setDraft(next);
            setError('');
          }}
          expected={{ type: 'boolean' }}
          verification={verificationContext(formPath, m, rule?.scope, 'condition')}
        />
      )}
      {modal?.kind === 'json' && (
        <Modal
          title={title}
          onClose={close}
          closeDisabled={checking}
          className="reaction-edit-dialog"
        >
          <fieldset className="reaction-edit-form" disabled={checking}>
            <div className="reaction-edit-body">
              <JsonEditor
                size="compact"
                readOnly={false}
                initialMode="text"
                label={title}
                text={draft}
                onChange={setDraft}
              />
            </div>
            <footer className="reaction-edit-footer">
              {error && <p role="alert">{error}</p>}
              <button type="button" className="reaction-edit-apply" onClick={() => attempt(submit)}>
                应用修改
              </button>
            </footer>
          </fieldset>
        </Modal>
      )}
    </section>
  );
}
