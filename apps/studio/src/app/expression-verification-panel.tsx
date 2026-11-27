'use client';

import { Modal } from './modal';
import { FormAssetScope } from './form-asset-scope';
import { JsonEditor } from '../components/json/json-editor';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button, Input } from '@form-engine/studio-design-components/controls';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import type { JsonSchema } from '@form-engine/protocol/capability';
import type { FunctionDocumentation } from './function-catalog';
import type { ReactionExpressionContext } from './reaction-expression-model';
import { ExpressionDisplay } from './expression-display';
import { MissingRefError } from 'ajv';
import { validateLiteral } from './manifest-input';
import type { DataReference, Expression, ScopeBinder } from '@form-engine/protocol/definition';
import { watchIdentity, type ReactionField } from './reaction-fields';
import {
  conditionTreeDepth,
  groupOf,
  memberIndex,
  verifyExpression,
  type ExpressionTrace,
  type ExpressionVerificationContext,
} from './expression-verification';

const traceLabels: Record<ExpressionTrace, string> = {
  passed: '成立',
  failed: '不成立',
  missing: '缺少输入',
  error: '求值失败',
  value: '已求值',
  skipped: '短路跳过',
  blocked: '未能执行',
};

function ConditionTree({
  expr,
  context,
  functionDocs,
  focus,
  trace,
  path = 'root',
  depth = 0,
}: {
  expr: Expression;
  context: ReactionExpressionContext;
  functionDocs?: ReadonlyMap<string, FunctionDocumentation>;
  focus: (path: string) => void;
  trace?: Map<string, ExpressionTrace>;
  path?: string;
  depth?: number;
}) {
  const group = groupOf(expr);
  const state = trace?.get(path);
  return (
    <li>
      <button type="button" className="expression-tree-node" onClick={() => focus(path)}>
        {group && <small>{group.op === 'core.and' ? 'AND' : 'OR'}</small>}
        <span>
          {group ? (
            group.op === 'core.and' ? (
              '全部满足'
            ) : (
              '任一满足'
            )
          ) : (
            <ExpressionDisplay
              expr={expr}
              {...context}
              functionDocs={functionDocs}
              variant="compact"
            />
          )}
        </span>
        {state && <small data-expression-state={state}>{traceLabels[state]}</small>}
      </button>
      {group &&
        (depth < conditionTreeDepth ? (
          <ul>
            {group.args.map((item, index) => (
              <ConditionTree
                key={index}
                expr={item}
                context={context}
                functionDocs={functionDocs}
                focus={focus}
                trace={trace}
                depth={depth + 1}
                path={path + '.' + index}
              />
            ))}
          </ul>
        ) : (
          <p className="expression-tree-detail">{group.args.length} 项 · 在编辑区展开</p>
        ))}
    </li>
  );
}

function collectInputs(expr: Expression, named?: Record<string, Expression>) {
  const refs = new Map<string, DataReference>();
  const seen = new Set<string>();
  const unsupported = new Set<string>();
  let context = false;
  function visit(node: Expression | undefined) {
    if (!node || typeof node !== 'object') return;
    if ('op' in node && Array.isArray(node.args)) node.args.forEach(visit);
    if ('ref' in node && node.ref && typeof node.ref === 'object') {
      if (node.ref.source === 'data') refs.set(watchIdentity(node.ref), node.ref);
      else if (node.ref.source === 'context') context = true;
      else unsupported.add(node.ref.source);
    }
    if ('use' in node && !seen.has(node.use)) {
      seen.add(node.use);
      if (named && Object.hasOwn(named, node.use)) visit(named[node.use]);
    }
  }
  visit(expr);
  return { refs, context, unsupported };
}

function readJson(text: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

function parts(path: string) {
  return path
    .split('/')
    .slice(1)
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

type SamplePath = (string | number)[];
function samplePath(ref: DataReference, scopes: Map<string, SamplePath>) {
  const parent = ref.scope === undefined ? [] : scopes.get(ref.scope);
  return parent && [...parent, ...parts(ref.path)];
}

function memberBinders(config: ExpressionVerificationContext) {
  return config.scopes.flatMap((raw) => {
    const binder = readJson(raw)?.value as ScopeBinder | undefined;
    return binder?.from?.source === 'data' && typeof binder.from.path === 'string' ? [binder] : [];
  });
}

function readAt(data: unknown, path: SamplePath) {
  for (const part of path) {
    if (data === null || typeof data !== 'object' || !Object.hasOwn(data, part)) return;
    data = (data as Record<string, unknown>)[part];
  }
  return data;
}

function writeAt(data: unknown, [key, ...tail]: SamplePath, value: unknown): unknown {
  if (key === undefined) return value;
  const copy: Record<string, unknown> | unknown[] = Array.isArray(data)
    ? [...data]
    : data && typeof data === 'object'
      ? { ...data }
      : typeof key === 'number'
        ? []
        : {};
  Object.defineProperty(copy, key, {
    value: writeAt(readAt(data, [key]), tail, value),
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return copy;
}

function SampleField({
  field,
  value,
  set,
}: {
  field: ReactionField;
  value: unknown;
  set: (value: unknown) => void;
}) {
  const schema = field.schema;
  if (!schema || typeof schema !== 'object' || !('type' in schema)) return null;
  const title = field.title ?? field.label;
  const label = '样例 · ' + title;
  if (schema.type === 'boolean')
    return (
      <label>
        <span>{title}</span>
        <StudioSelect
          aria-label={label}
          value={typeof value === 'boolean' ? String(value) : ''}
          onValueChange={(next) => set(next === 'true')}
        >
          <option value="" disabled>
            未提供
          </option>
          <option value="true">true</option>
          <option value="false">false</option>
        </StudioSelect>
      </label>
    );
  if (schema.type === 'string')
    return (
      <label>
        <span>{title}</span>
        <Input
          aria-label={label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => set(e.target.value)}
        />
      </label>
    );
  if (schema.type === 'number' || schema.type === 'integer')
    return (
      <label>
        <span>{title}</span>
        <Input
          aria-label={label}
          type="number"
          step={schema.type === 'number' ? 'any' : '1'}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => {
            const next = e.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) set(next);
            else if (e.currentTarget.value === '' && !e.currentTarget.validity.badInput)
              set(undefined);
          }}
        />
      </label>
    );
  return null;
}

type Answer = Awaited<ReturnType<typeof verifyExpression>>;
function outcome(
  { result }: Answer,
  use: ExpressionVerificationContext['result'],
  expected: JsonSchema,
) {
  if (result.kind === 'missing') return '缺少输入，无法得出结果。';
  if (result.kind === 'error') return '求值失败 · ' + result.error;
  try {
    validateLiteral(expected, result.value);
  } catch (error) {
    if (!(error instanceof MissingRefError))
      return '结果与当前位置的类型不匹配 · ' + JSON.stringify(result.value);
  }
  if (result.value === true)
    return use === 'visibility'
      ? '条件成立 · 显示'
      : use === 'assertion'
        ? '断言通过'
        : '结果 · true';
  if (result.value === false)
    return use === 'visibility'
      ? '条件不成立 · 隐藏'
      : use === 'assertion'
        ? '断言失败'
        : '结果 · false';
  if (use) return '当前表达式未返回布尔值。';
  return '结果 · ' + JSON.stringify(result.value);
}

export function ExpressionVerificationPanel({
  config,
  expected,
  raw,
  expr,
  fields,
  manifests,
  functionDocs,
  named,
  dialog,
  focus,
}: {
  config: ExpressionVerificationContext;
  expected: JsonSchema;
  raw: string;
  expr: Expression | undefined;
  fields: ReactionField[];
  manifests: ReactionExpressionContext['manifests'];
  functionDocs?: ReadonlyMap<string, FunctionDocumentation>;
  named?: Record<string, Expression>;
  dialog?: { title: string; returnFocus: HTMLElement; onClose: () => void };
  focus?: (path: string) => void;
}) {
  const assets = useContext(FormAssetScope);
  const [sample, setSample] = useState('{}');
  const [context, setContext] = useState('{}');
  const [members, setMembers] = useState<Record<string, number>>({});
  const [answer, setAnswer] = useState<{
    key: string;
    value?: Answer;
    error?: string;
    busy?: true;
  }>();
  const pending = useRef<AbortController | null>(null);
  const key = JSON.stringify([
    raw,
    config,
    assets?.profile,
    assets?.choices,
    sample,
    context,
    members,
  ]);
  const [inputKey, setInputKey] = useState(key);
  if (inputKey !== key) {
    setInputKey(key);
    setAnswer(undefined);
  }
  useEffect(() => () => pending.current?.abort(), [key]);
  const current = answer?.key === key ? answer : undefined;
  const parsed = readJson(sample);
  const sampleData =
    focus ||
    (parsed?.value !== null && typeof parsed?.value === 'object' && !Array.isArray(parsed.value))
      ? parsed
      : undefined;
  const sampleEditor = (
    <JsonEditor
      size={focus ? 'compact' : 'regular'}
      readOnly={false}
      initialMode="text"
      label="表单数据 JSON"
      text={sample}
      onChange={setSample}
    />
  );
  const input = expr !== undefined && collectInputs(expr, named);
  const hostContext = input && input.context ? readJson(context) : { value: {} };
  const binders = memberBinders(config);
  const aliases = new Map<string, SamplePath>();
  for (const binder of binders) {
    const path = samplePath(binder.from, aliases);
    if (path)
      aliases.set(
        binder.as,
        binder.mode === 'each' ? [...path, memberIndex(members, binder.as)] : path,
      );
  }
  const used = input ? fields.filter((f) => input.refs.has(watchIdentity(f.ref))) : [];
  const unsupported =
    input &&
    (input.unsupported.has('validation')
      ? '此表达式依赖运行时校验状态，请在表单预览中验证。'
      : input.unsupported.has('event')
        ? '此表达式依赖事件载荷，请从相应控件预览中验证。'
        : '');
  async function run() {
    if (expr === undefined || !sampleData || !hostContext || unsupported) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setAnswer({ key, busy: true });
    try {
      const value = await verifyExpression(
        { ...config, profile: assets?.profile, assetContext: assets?.choices },
        raw,
        expr,
        sampleData.value,
        hostContext.value,
        members,
        controller.signal,
      );
      if (!controller.signal.aborted) setAnswer({ key, value });
    } catch (error) {
      if (!controller.signal.aborted)
        setAnswer({ key, error: error instanceof Error ? error.message : '无法验证表达式。' });
    }
  }
  const runButton = (
    <Button
      disabled={expr === undefined || !sampleData || !hostContext || !!unsupported || current?.busy}
      onClick={() => void run()}
    >
      运行验证
    </Button>
  );
  const body = (
    <aside className="expression-sidebar">
      {focus && (
        <section aria-label="条件树">
          <h3>条件树</h3>
          {expr === undefined ? (
            <p>修复 JSON 后可查看条件结构。</p>
          ) : (
            <ul className="expression-tree">
              <ConditionTree
                expr={expr}
                context={{ fields, manifests, named }}
                functionDocs={functionDocs}
                focus={focus}
                trace={current?.value?.trace}
              />
            </ul>
          )}
        </section>
      )}
      <section aria-label="给定值验证">
        <h3>{focus ? '给定值验证' : '表单数据 JSON'}</h3>
        {!focus && sampleEditor}
        <div className="expression-samples">
          {binders
            .filter((b) => b.mode === 'each')
            .map((binder) => (
              <label key={binder.as}>
                <span>{binder.as} · 样例成员</span>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  aria-label={binder.as + '样例成员'}
                  value={memberIndex(members, binder.as) + 1}
                  onChange={(event) => {
                    const next = event.currentTarget.valueAsNumber;
                    if (Number.isSafeInteger(next) && next > 0 && next <= 1000)
                      setMembers((previous) => ({ ...previous, [binder.as]: next - 1 }));
                  }}
                />
              </label>
            ))}
          {focus &&
            sampleData &&
            used.map((field) => {
              const path = samplePath(field.ref, aliases);
              return (
                path && (
                  <SampleField
                    key={watchIdentity(field.ref)}
                    field={field}
                    value={readAt(sampleData.value, path)}
                    set={(value) => {
                      setSample(JSON.stringify(writeAt(sampleData.value, path, value), null, 2));
                    }}
                  />
                )
              );
            })}
        </div>
        {focus && (
          <details open={!sampleData || undefined}>
            <summary>表单数据 JSON</summary>
            {sampleEditor}
          </details>
        )}
        {input && input.context && (
          <div className="expression-context-input">
            Host 上下文 JSON
            <JsonEditor
              size={focus ? 'compact' : 'regular'}
              readOnly={false}
              initialMode="text"
              label="Host 上下文 JSON"
              text={context}
              onChange={setContext}
            />
          </div>
        )}
        {unsupported && <p>{unsupported}</p>}
        {!sampleData && (
          <p role="alert">{focus ? '请输入完整的样例 JSON。' : '请输入有效的表单 JSON 对象。'}</p>
        )}
        {!hostContext && <p role="alert">请输入有效的 Host 上下文 JSON。</p>}
        {!dialog && runButton}
        {current?.busy && <p role="status">正在运行…</p>}
        {current?.error && <p role="alert">{current.error}</p>}
        {current?.value && <output>{outcome(current.value, config.result, expected)}</output>}
        <p className="expression-helper">样例值只用于本次验证。</p>
      </section>
    </aside>
  );
  return dialog ? (
    <Modal
      {...dialog}
      size="wide"
      className={
        focus
          ? 'expression-verification-dialog expression-verification-conditions'
          : 'expression-verification-dialog'
      }
      actions={runButton}
    >
      {body}
    </Modal>
  ) : (
    body
  );
}
