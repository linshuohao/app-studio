import { getParameterHelp, parameterMeaning, parameterTitle } from './expression-function-help';
import { functionTitle, type FunctionDocumentation } from './function-catalog';
import { isExpression, type ReactionExpressionContext } from './reaction-expression-model';
import type { Expression, ValueSpec } from '@form-engine/protocol/definition';
import { groupOf } from './expression-verification';
import { watchLabel, type ReactionField } from './reaction-fields';
import './expression-display.css';

const groupLabel = (op: string) => (op === 'core.and' ? '全部满足' : '任一满足');

function expressionSentence(
  expr: Expression,
  fields: ReactionField[],
  docs?: ReadonlyMap<string, FunctionDocumentation>,
): string {
  if (expr === true) return '真';
  if (expr === false) return '假';
  if (expr === null || typeof expr !== 'object') return JSON.stringify(expr);
  if ('use' in expr) return '具名表达式 · ' + expr.use;
  if ('literal' in expr) return '常量 · ' + JSON.stringify(expr.literal);
  if ('ref' in expr) {
    const { ref } = expr;
    if (ref.source === 'validation') return watchLabel(ref);
    if (ref.source !== 'data')
      return (ref.source === 'context' ? '上下文' : '事件载荷') + ' · ' + (ref.path || '（自身）');
    const title = fields.find((f) => f.ref.path === ref.path && f.ref.scope === ref.scope)?.title;
    return title ? title + '（' + watchLabel(ref) + '）' : watchLabel(ref);
  }

  return functionTitle(expr.op, docs?.get(expr.op));
}

function optionalField(expr: Expression) {
  if (
    !expr ||
    typeof expr !== 'object' ||
    !('op' in expr) ||
    expr.op !== 'core.if' ||
    expr.args.length !== 3 ||
    expr.args[2] !== null
  )
    return;
  const [condition, value] = expr.args;
  if (
    !condition ||
    typeof condition !== 'object' ||
    !('op' in condition) ||
    condition.op !== 'core.exists' ||
    condition.args.length !== 1 ||
    !value ||
    typeof value !== 'object' ||
    !('ref' in value) ||
    value.ref.source !== 'data'
  )
    return;
  const [input] = condition.args;
  if (
    input &&
    typeof input === 'object' &&
    'ref' in input &&
    input.ref.source === 'data' &&
    input.ref.path === value.ref.path &&
    input.ref.scope === value.ref.scope
  )
    return value;
}

export function expressionLabel(
  expr: Expression,
  context: ReactionExpressionContext,
  docs?: ReadonlyMap<string, FunctionDocumentation>,
): string {
  let remaining = 150;
  function phrase(node: Expression, ancestors: string[], nested = false): string {
    if (--remaining < 0) return '…';
    if (node === null || typeof node !== 'object') return expressionSentence(node, context.fields);
    if ('use' in node) {
      const name = node.use;
      const body =
        context.named && Object.hasOwn(context.named, name) ? context.named[name] : undefined;
      if (/[\p{Script=Han}\s]/u.test(name) || ancestors.includes(name) || !isExpression(body))
        return name;
      return phrase(body, [...ancestors, name], nested);
    }
    if ('ref' in node && (node.ref.source === 'data' || node.ref.source === 'validation')) {
      const ref = node.ref.source === 'data' ? node.ref : node.ref.field;
      const field = context.fields.find(
        (f) => f.ref.scope === ref.scope && f.ref.path === ref.path,
      );
      const label =
        field?.description || field?.title || (ref.scope ? watchLabel(ref) : ref.path || '表单根');
      return node.ref.source === 'validation' ? label + '的校验 ' + node.ref.observe : label;
    }
    if (!('op' in node)) return expressionSentence(node, context.fields);
    const optional = optionalField(node);
    if (optional) return phrase(optional, ancestors) + '（缺失时取空值）';
    const args = node.args.map((arg) => phrase(arg, ancestors, true));
    const doc = docs?.get(node.op);
    const fn = context.manifests.find((f) => f.id === node.op);
    if (doc?.displayTemplate && fn && fn.parameters.length === args.length) {
      const values = new Map(fn.parameters.map((param, i) => [param.name, args[i]!]));
      const text = doc.displayTemplate.replace(
        /\{([^{}]+)\}/g,
        (slot, name: string) => values.get(name) ?? slot,
      );
      return nested && node.op.startsWith('core.') ? '（' + text + '）' : text;
    }
    const name = groupOf(node) ? groupLabel(node.op) : functionTitle(node.op, doc);
    return name + '（' + args.join('，') + '）';
  }
  return phrase(expr, []);
}

type DisplayContext = ReactionExpressionContext & {
  functionDocs?: ReadonlyMap<string, FunctionDocumentation>;
};

type DisplayProps = DisplayContext & {
  variant?: 'compact' | 'structured';
} & ({ expr: Expression; value?: never } | { value: ValueSpec; expr?: never });

export function ExpressionDisplay({ variant = 'structured', ...props }: DisplayProps) {
  const wrapped =
    props.value && typeof props.value === 'object' && '$expr' in props.value
      ? props.value.$expr
      : undefined;
  const expr = props.expr === undefined ? wrapped : props.expr;
  if (variant === 'compact' && expr !== undefined)
    return <span>{expressionLabel(expr, props, props.functionDocs)}</span>;

  const node =
    props.expr === undefined
      ? valueReading(props.value, props)
      : expressionReading(props.expr, props, props.functionDocs);
  if (variant === 'compact') return <span>{node.short ?? node.label}</span>;
  return <ReadingView node={node} />;
}

function valueReading(value: ValueSpec, context: DisplayContext): ReadingNode {
  if (value === null || typeof value !== 'object') return { label: JSON.stringify(value) };
  if ('$literal' in value && value.$literal !== undefined)
    return expressionReading({ literal: value.$literal }, context, context.functionDocs);
  if ('$expr' in value && value.$expr !== undefined)
    return expressionReading(value.$expr, context, context.functionDocs);
  const entries = Array.isArray(value)
    ? value.map((item, i) => ['成员 ' + (i + 1), item] as const)
    : Object.entries(value);
  return {
    label: Array.isArray(value) ? '列表值' : '对象值',
    parameters: entries.map(([label, item]) => ({ label, value: valueReading(item, context) })),
  };
}

type ReadingNode = {
  label: string;
  short?: string;
  path?: string;
  constant?: string;
  definition?: ReadingNode;
  fallback?: ReadingNode;
  call?: boolean;
  parameters?: { label: string; note?: string; value: ReadingNode }[];
  lines?: (string | ReadingNode)[][];
};

function expressionReading(
  expr: Expression,
  context: ReactionExpressionContext,
  docs?: ReadonlyMap<string, FunctionDocumentation>,
): ReadingNode {
  let remaining = 150;
  function read(node: Expression, ancestors: readonly string[]): ReadingNode {
    if (--remaining < 0) return { label: '更多内容见 JSON' };
    if (node !== null && typeof node === 'object') {
      if ('use' in node) {
        const body =
          context.named && Object.hasOwn(context.named, node.use)
            ? context.named[node.use]
            : undefined;
        const problem = ancestors.includes(node.use)
          ? '循环引用'
          : body === undefined
            ? '未找到定义'
            : !isExpression(body)
              ? '定义格式无效'
              : undefined;
        return {
          label: '引用具名表达式 ' + node.use + (problem ? '（' + problem + '）' : ''),
          definition:
            !problem && body !== undefined ? read(body, [...ancestors, node.use]) : undefined,
        };
      }
      if ('literal' in node && node.literal !== null && typeof node.literal === 'object')
        return { label: '查看固定值', constant: JSON.stringify(node.literal, null, 2) };
      if ('ref' in node && node.ref.source === 'data') {
        const { path, scope } = node.ref;
        const field = context.fields.find(
          (item) => item.ref.path === path && item.ref.scope === scope,
        );
        const location = (scope ?? 'root') + (path || '（自身）');
        return { label: field?.title ?? location, short: field?.title, path: location };
      }
      if ('op' in node) {
        const doc = docs?.get(node.op);
        const manifest = context.manifests.find((item) => item.id === node.op);
        const parameters = node.args.map((arg, i) => {
          const help = getParameterHelp(manifest, doc, i);
          return {
            label: parameterTitle(help, doc) ?? '参数 ' + (i + 1),
            note: help && parameterMeaning(help),
            value: read(arg, ancestors),
          };
        });
        const slots = new Map(
          manifest?.parameters.map(({ name }, i) => [name, parameters[i]?.value]),
        );
        const lines =
          doc?.displayLines && manifest?.parameters.length === parameters.length
            ? doc.displayLines.map((line) =>
                line
                  .split(/(\{[^{}]+\})/)
                  .filter(Boolean)
                  .map((part) => (part.startsWith('{') ? slots.get(part.slice(1, -1)) : part)),
              )
            : undefined;
        const call: ReadingNode = {
          label: functionTitle(node.op, doc),
          call: true,
          parameters,
          lines: lines?.every((line) => line.every((part) => part !== undefined))
            ? (lines as ReadingNode['lines'])
            : undefined,
        };
        const source = optionalField(node) && parameters[1]?.value;
        if (source?.path) return { ...source, fallback: call };
        return call;
      }
    }
    const label = expressionSentence(node, context.fields, docs);
    return { label, short: label };
  }
  return read(expr, []);
}

function ReadingView({ node }: { node: ReadingNode }) {
  if (node.path)
    return (
      <div className="expression-reading-source">
        读取 {node.label === node.path ? null : node.label + ' · '}
        <code>{node.path}</code>
        {node.fallback && (
          <>
            ，缺失时取 null
            <details>
              <summary>查看取值条件</summary>
              <ReadingView node={node.fallback} />
            </details>
          </>
        )}
      </div>
    );
  if (node.constant)
    return (
      <details>
        <summary>{node.label}</summary>
        <pre>{node.constant}</pre>
      </details>
    );
  if (node.definition)
    return (
      <details>
        <summary>{node.label}</summary>
        <ReadingView node={node.definition} />
      </details>
    );
  if (node.lines)
    return (
      <div className="expression-reading-lines">
        {node.lines.map((line, i) => (
          <div className="expression-reading-line" key={i}>
            {line.map((part, j) =>
              typeof part === 'string' ? (
                <span key={j}>{part}</span>
              ) : part.path && !part.fallback ? (
                <code key={j}>{part.path}</code>
              ) : part.short && !part.fallback ? (
                <span key={j}>{part.short}</span>
              ) : (
                <div className="expression-reading-slot" key={j}>
                  <ReadingView node={part} />
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    );
  if (!node.parameters) return <span>{node.label}</span>;
  return (
    <div className="expression-reading-call" data-call={node.call || undefined}>
      <span className="expression-reading-call-name">
        {node.label}
        {node.call && '（'}
      </span>
      {node.parameters.map(({ label, note, value }, index) => (
        <details key={index} className="expression-reading-argument">
          <summary aria-label={label + '的取值'}>
            {value.short ?? label}
            {node.call && index < node.parameters!.length - 1 && '，'}
          </summary>
          <div className="expression-reading-argument-body">
            <strong>{label}</strong>
            {note && <p>{note}</p>}
            <ReadingView node={value} />
          </div>
        </details>
      ))}
      {node.call && <span className="expression-reading-close">）</span>}
    </div>
  );
}
