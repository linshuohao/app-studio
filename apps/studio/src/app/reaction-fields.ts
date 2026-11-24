import type { DataReference, ReactionWatch, ScopeBinder } from '@form-engine/protocol/definition';
import { escapeKey } from './semantic-model';

function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function dataRef(v: unknown): v is DataReference {
  return (
    record(v) &&
    v.source === 'data' &&
    typeof v.path === 'string' &&
    /^(?:\/(?:[^~/]|~[01])*)*$/.test(v.path) &&
    (v.scope === undefined || typeof v.scope === 'string')
  );
}
export function isReactionWatch(v: unknown): v is ReactionWatch {
  return (
    dataRef(v) ||
    (record(v) &&
      v.source === 'validation' &&
      dataRef(v.field) &&
      (v.observe === 'issues' || v.observe === 'status' || v.observe === 'state'))
  );
}
export function watchIdentity(ref: ReactionWatch): string {
  const data = ref.source === 'data' ? ref : ref.field;
  return JSON.stringify([
    ref.source,
    data.scope ?? null,
    data.path,
    ref.source === 'validation' ? ref.observe : null,
  ]);
}
export function watchLabel(ref: ReactionWatch): string {
  const data = ref.source === 'data' ? ref : ref.field;
  return (
    (data.scope ?? '表单根') +
    ' · ' +
    (data.path || '（自身）') +
    (ref.source === 'validation' ? ' · 校验 ' + ref.observe : '')
  );
}
export type ReactionField = {
  ref: DataReference;
  schema: unknown;
  depth: number;
  label: string;
  title?: string;
  description?: string;
};
export function watchSchema(fields: ReactionField[], ref: ReactionWatch): unknown {
  if (ref.source === 'validation') {
    const status = { type: 'string' },
      issues = { type: 'array', items: true };
    return ref.observe === 'status'
      ? status
      : ref.observe === 'issues'
        ? issues
        : {
            type: 'object',
            properties: { status, issues },
            required: ['issues', 'status'],
            additionalProperties: true,
          };
  }
  return fields.find(({ ref: r }) => r.scope === ref.scope && r.path === ref.path)?.schema;
}
export function schemaTypeLabel(schema: unknown) {
  if (schema === false) return '不允许任何值';
  if (!record(schema)) return '未限定类型';
  return Array.isArray(schema.type)
    ? schema.type.join(' | ')
    : typeof schema.type === 'string'
      ? schema.type
      : '未限定类型';
}
function splitPointer(path: string) {
  return path
    .split('/')
    .slice(1)
    .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
}
type Shape = { node: unknown; resource: unknown };
const annotations = new Set([
  '$ref',
  '$schema',
  '$id',
  '$defs',
  'definitions',
  'title',
  'description',
  '$comment',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
]);
function shape(node: unknown, resource: unknown): Shape {
  return { node, resource: record(node) && typeof node.$id === 'string' ? node : resource };
}
// Only expand provable in-document fragments. Recursive or external resources retain their raw editor.
function resolve(input: Shape) {
  let current = input;
  const seen = new Set<unknown>();
  while (record(current.node) && typeof current.node.$ref === 'string') {
    const ref = current.node.$ref;
    if (
      seen.has(current.node) ||
      !ref.startsWith('#') ||
      Object.keys(current.node).some((k) => !annotations.has(k))
    )
      return shape(undefined, current.resource);
    seen.add(current.node);
    let pointer: string;
    try {
      pointer = decodeURIComponent(ref.slice(1));
    } catch {
      return shape(undefined, current.resource);
    }
    if (!/^(?:\/(?:[^~/]|~[01])*)*$/.test(pointer)) return shape(undefined, current.resource);
    let target = shape(current.resource, current.resource);
    for (const key of splitPointer(pointer)) {
      if ((!record(target.node) && !Array.isArray(target.node)) || !Object.hasOwn(target.node, key))
        return shape(undefined, current.resource);
      target = shape(Reflect.get(target.node, key), target.resource);
    }
    current = target;
  }
  return current;
}
function itemOf(input: Shape): Shape | undefined {
  const { node, resource } = resolve(input);
  if (record(node) && node.type === 'array' && !('prefixItems' in node))
    return shape(node.items ?? true, resource);
}
export function scopeBinders(scope: unknown): ScopeBinder[] {
  return (scope === undefined ? [] : Array.isArray(scope) ? scope : [scope]).filter(
    (b): b is ScopeBinder =>
      record(b) &&
      typeof b.as === 'string' &&
      dataRef(b.from) &&
      (b.mode === undefined || b.mode === 'one' || b.mode === 'each'),
  );
}
function project(base: Shape | undefined, path: string) {
  for (const key of splitPointer(path)) {
    if (!base) return;
    const { node, resource } = resolve(base);
    if (
      record(node) &&
      node.type === 'object' &&
      record(node.properties) &&
      Object.hasOwn(node.properties, key)
    )
      base = shape(node.properties[key], resource);
    else if (/^(0|[1-9]\d*)$/.test(key)) base = itemOf(base);
    else return;
  }
  return base;
}
export function reactionFields(schema: unknown, scope?: unknown): ReactionField[] {
  if (schema === undefined) return [];
  const root = shape(schema, schema),
    env = new Map<string, Shape | undefined>();
  for (const binder of scopeBinders(scope)) {
    const base = binder.from.scope === undefined ? root : env.get(binder.from.scope);
    const from = project(base, binder.from.path);
    env.set(
      binder.as,
      env.has(binder.as) ? undefined : from && binder.mode === 'each' ? itemOf(from) : from,
    );
  }
  const fields: ReactionField[] = [];
  function addGroup(scope: string | undefined, base: Shape | undefined) {
    if (!base) return;
    let count = 0;
    function visit(input: Shape, path: string, depth: number, ancestors: Set<unknown>) {
      const { node, resource } = resolve(input);
      const ref: DataReference = { source: 'data', path, ...(scope !== undefined && { scope }) };
      function annotation(key: 'description' | 'title') {
        for (const source of [input.node, node]) {
          const value = record(source) && source[key];
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
      }
      fields.push({
        ref,
        schema: node,
        depth,
        label: watchLabel(ref),
        title: annotation('title'),
        description: annotation('description'),
      });
      count++;
      if (
        !record(node) ||
        node.type !== 'object' ||
        !record(node.properties) ||
        ancestors.has(node)
      )
        return;
      const next = new Set(ancestors).add(node);
      for (const [key, child] of Object.entries(node.properties)) {
        if (count >= 4000 && depth > 0) break;
        visit(shape(child, resource), path + '/' + escapeKey(key), depth + 1, next);
      }
    }
    visit(base, '', 0, new Set());
  }
  for (const [alias, base] of env) addGroup(alias, base);
  addGroup(undefined, root);
  return fields;
}

function visits(
  node: unknown,
  kind: 'expression' | 'action',
  expressions: unknown,
  read: (ref: ReactionWatch) => void,
  handle?: (alias: string) => void,
  names = new Set<string>(),
) {
  function expr(v: unknown) {
    if (!record(v) || 'literal' in v) return;
    if (isReactionWatch(v.ref)) read(v.ref);
    if (Array.isArray(v.args)) v.args.forEach(expr);
    if (
      typeof v.use === 'string' &&
      record(expressions) &&
      Object.hasOwn(expressions, v.use) &&
      !names.has(v.use)
    ) {
      names.add(v.use);
      expr(expressions[v.use]);
    }
  }
  function value(v: unknown) {
    if (Array.isArray(v)) v.forEach(value);
    else if (record(v) && !('$literal' in v)) {
      if ('$expr' in v) expr(v.$expr);
      else Object.values(v).forEach(value);
    }
  }
  function scopeHandle(v: unknown) {
    if (record(v) && typeof v.$scope === 'string') handle?.(v.$scope);
  }
  function action(v: unknown) {
    if (!record(v)) return;
    if (dataRef(v.target) && v.target.scope !== undefined) handle?.(v.target.scope);
    scopeHandle(v.item);
    if (record(v.position)) scopeHandle(v.position.item);
    if (v.op === 'patch' && record(v.value)) Object.values(v.value).forEach(value);
    else value(v.value);
    value(v.payload);
    if (Array.isArray(v.commands)) v.commands.forEach(action);
  }
  if (kind === 'expression') expr(node);
  else action(node);
}
export function reactionReads(
  node: unknown,
  kind: 'expression' | 'action',
  expressions?: unknown,
): ReactionWatch[] {
  const refs = new Map<string, ReactionWatch>();
  visits(node, kind, expressions, (ref) => refs.set(watchIdentity(ref), ref));
  return [...refs.values()];
}
// Return the transitive named environment for this rule, following expression positions only.
export function reactionNames(rule: { when?: unknown; then: unknown[] }, expressions: unknown) {
  const names = new Set<string>();
  const ignoreRead = () => {};
  visits(rule.when, 'expression', expressions, ignoreRead, undefined, names);
  for (const action of rule.then)
    visits(action, 'action', expressions, ignoreRead, undefined, names);
  return names;
}
// A replacement of the whole rule can remove a binder and its references in one edit.
// Only consider references surviving in the candidate body and the remaining binder chain.
export function removedScopeInUse(
  previous: unknown,
  next: unknown,
  rule: unknown,
): string | undefined {
  if (!record(rule)) return;
  const remaining = scopeBinders(next),
    retained = new Set(remaining.map((b) => b.as));
  const removed = scopeBinders(previous)
    .map((b) => b.as)
    .filter((as) => !retained.has(as));
  const uses = new Set<string>();
  function use(ref: ReactionWatch) {
    const data = ref.source === 'validation' ? ref.field : ref;
    if (data.scope !== undefined) uses.add(data.scope);
  }
  remaining.forEach((b) => use(b.from));
  if (Array.isArray(rule.watch)) rule.watch.filter(isReactionWatch).forEach(use);
  visits(rule.when, 'expression', undefined, use);
  if (Array.isArray(rule.then))
    rule.then.forEach((a) => visits(a, 'action', undefined, use, (s) => uses.add(s)));
  return removed.find((alias) => uses.has(alias));
}

export function scopeUsageLabels(rule: unknown, alias: string): string[] {
  if (!record(rule)) return [];
  const labels: string[] = [];
  const local = (ref: ReactionWatch) =>
    (ref.source === 'validation' ? ref.field : ref).scope === alias;
  function reads(value: unknown, kind: 'expression' | 'action') {
    let used = false;
    visits(
      value,
      kind,
      undefined,
      (ref) => {
        used ||= local(ref);
      },
      (name) => {
        used ||= name === alias;
      },
    );
    return used;
  }
  if (Array.isArray(rule.watch))
    rule.watch.forEach((ref, index) => {
      if (isReactionWatch(ref) && local(ref)) labels.push('观察来源 ' + (index + 1));
    });
  if (reads(rule.when, 'expression')) labels.push('成立条件');
  if (Array.isArray(rule.then))
    rule.then.forEach((action, index) => {
      if (reads(action, 'action')) labels.push('执行动作 ' + (index + 1));
    });
  return labels;
}
