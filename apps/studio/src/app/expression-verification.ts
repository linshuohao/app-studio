import type { Expression, ScopeBinder, ScopeDeclaration } from '@form-engine/protocol/definition';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { type ReadResult } from '@form-engine/runtime';
import { compactJson } from '../components/json/format';
import { child, type Model } from './semantic-model';
import { platform } from './platform-api';
import { previewWebCapabilities } from './host/available-capabilities';
import { resolveWebCapabilities } from './host/resolve-capabilities';
import type { LayoutAssetContext } from './layout-check';

export type ExpressionVerificationContext = {
  formPath: string;
  profile?: string;
  assetContext?: LayoutAssetContext;
  schema: string;
  expressions?: string;
  scopes: string[];
  ambiguity?: boolean;
  result?: 'visibility' | 'assertion' | 'condition';
};

export function verificationContext(
  formPath: string,
  m: Model,
  scope?: ScopeDeclaration | string[],
  result?: ExpressionVerificationContext['result'],
): ExpressionVerificationContext {
  const expressions = child(m.root, 'expressions');
  const scopes =
    scope === undefined
      ? []
      : Array.isArray(scope)
        ? scope.map((binder) => (typeof binder === 'string' ? binder : JSON.stringify(binder)))
        : [JSON.stringify(scope)];
  const ambiguity = [...m.ambiguous].some(
    (path) =>
      path === '/data' ||
      path === '/data/schema' ||
      path.startsWith('/data/schema/') ||
      path === '/expressions' ||
      path.startsWith('/expressions/'),
  );
  return {
    formPath,
    schema: m.schema ? m.raw(m.schema) : '{"type":"object"}',
    expressions: expressions && m.raw(expressions),
    scopes,
    ambiguity,
    result,
  };
}

export const comparisonLabels: Readonly<Record<string, string>> = {
  'core.lt': '小于',
  'core.lte': '小于或等于',
  'core.gt': '大于',
  'core.gte': '大于或等于',
  'core.eq': '等于',
  'core.ne': '不等于',
};

export const conditionTreeDepth = 2;

function callOf(expr: Expression | undefined) {
  return expr && typeof expr === 'object' && 'op' in expr ? expr : undefined;
}

export function groupOf(expr: Expression | undefined) {
  const call = callOf(expr);
  return call?.op === 'core.and' || call?.op === 'core.or' ? call : undefined;
}

export type ExpressionTrace =
  'passed' | 'failed' | 'missing' | 'error' | 'value' | 'skipped' | 'blocked';
function state(result: ReadResult): ExpressionTrace {
  return result.kind !== 'value'
    ? result.kind
    : result.value === true
      ? 'passed'
      : result.value === false
        ? 'failed'
        : 'value';
}

function traceExpression(expr: Expression, evaluate: (expr: Expression) => ReadResult) {
  const result = evaluate(expr);
  const trace = new Map<string, ExpressionTrace>();
  function visit(node: Expression, path: string, status: ExpressionTrace, depth: number) {
    trace.set(path, status);
    const group = groupOf(node);
    if (!group || depth >= conditionTreeDepth) return;
    let stop = status === 'skipped' || status === 'blocked' ? status : undefined;
    group.args.forEach((arg, index) => {
      const reached = stop ?? state(evaluate(arg));
      const next = reached === 'value' ? 'error' : reached;
      visit(arg, path + '.' + index, next, depth + 1);
      if (next === 'error' || next === 'missing') stop = 'blocked';
      if (
        (group.op === 'core.and' && next === 'failed') ||
        (group.op === 'core.or' && next === 'passed')
      )
        stop = 'skipped';
    });
  }
  visit(expr, 'root', state(result), 0);
  return { result, trace };
}

export function memberIndex(members: Record<string, number>, alias: string) {
  return Object.hasOwn(members, alias) ? members[alias]! : 0;
}

type Preview = {
  prepared?: ReadonlyPreparedForm;
  diagnostics: { severity: string; sourcePointer: string; message: string }[];
};

export async function verifyExpression(
  config: ExpressionVerificationContext,
  raw: string,
  expr: Expression,
  data: unknown,
  hostContext: unknown,
  members: Record<string, number>,
  signal: AbortSignal,
) {
  if (config.ambiguity) throw Error('请先修复表单 Schema 或具名表达式中的重复属性。');
  // The projection carries the original declarations and lexical binders. It contains no
  // business reactions, constraints, requests or host actions.
  const material = config.result ? 'condition' : 'value-display';
  const prop = config.result ? 'visible' : 'value';
  const leaf = '{"material":"' + material + '","props":{"' + prop + '":{"$expr":' + raw + '}}}';
  const view = config.scopes.reduceRight(
    (node, scope) => '{"scope":' + scope + ',"node":' + node + '}',
    leaf,
  );
  const profile = config.profile ?? 'entry';
  const definition =
    '{"protocolVersion":"1","id":"studio-expression-verification","version":"draft","data":{"schema":' +
    config.schema +
    '}' +
    (config.expressions === undefined ? '' : ',"expressions":' + config.expressions) +
    ',"views":{' +
    JSON.stringify(profile) +
    ':' +
    view +
    '}}';
  const preview = await platform<Preview>(config.formPath + '/preview', {
    body: {
      text: compactJson(definition),
      profile,
      basedOnVersionId: config.assetContext?.basedOnVersionId ?? config.assetContext?.versionId,
      assetChoices: config.assetContext?.assetChoices?.filter(
        (choice) => choice.profile === profile,
      ),
    },
    signal,
  });
  if (!preview.prepared) {
    const fault = preview.diagnostics.find((item) => item.severity === 'error');
    throw Error(
      fault ? [fault.sourcePointer, fault.message].filter(Boolean).join(' · ') : '表达式无法编译。',
    );
  }
  const { functions, runtime: engine } = await resolveWebCapabilities(
    preview.prepared.capabilityLock,
    previewWebCapabilities,
  );
  signal.throwIfAborted();
  const runtime = engine.create({
    prepared: preview.prepared,
    functions,
    data,
    context: hostContext,
    traceCapacity: 0,
  });
  try {
    let scope: Parameters<typeof runtime.evaluate>[1] = {};
    for (const source of config.scopes) {
      const binder = JSON.parse(source) as ScopeBinder;
      const mode = binder.mode ?? 'one';
      const index = mode === 'each' ? memberIndex(members, binder.as) : 0;
      scope = runtime.bind({ ...binder, mode }, scope)[index];
      if (!scope)
        throw Error(
          `样例数据中无法取得 ${binder.as} 的${mode === 'each' ? '第 ' + (index + 1) + ' 项' : '绑定值'}。`,
        );
    }
    return traceExpression(expr, (node) => runtime.evaluate(node, scope));
  } finally {
    runtime.dispose();
  }
}
