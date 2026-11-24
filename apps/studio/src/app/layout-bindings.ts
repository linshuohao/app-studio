import type { DataReference } from '@form-engine/protocol/definition';
import type { JsonNode } from '../components/json/model';
import { child, escapeKey, type Model } from './semantic-model';

export type LayoutField = {
  schema: JsonNode;
  schemaPath: string;
  label: string;
  path: string;
  depth: number;
  required: boolean;
};
export type BindingCandidate = LayoutField & { ref: DataReference };
type Field = LayoutField & {
  parts: (string | null)[];
  parent?: Field;
  property?: string;
  reachable: boolean;
};
type Environment = Map<string, Field | undefined>;

// A fragment is relative to its nearest schema resource. As in Compiler projection,
// a $ref with sibling assertions cannot be treated as the target schema alone.
const refAnnotations = new Set([
  '$ref',
  '$id',
  '$schema',
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
function fragmentTarget(m: Model, schema: JsonNode, ref: string) {
  if (
    !m.schema ||
    !ref.startsWith('#/') ||
    schema.children?.some((c) => !refAnnotations.has(c.key!))
  )
    return;
  let path = schema.path;
  while (path !== m.schema.path && m.str(child(m.byPath.get(path), '$id')) === undefined)
    path = path.slice(0, path.lastIndexOf('/'));
  try {
    const target = m.byPath.get(path + decodeURIComponent(ref.slice(1)));
    if (target && !m.ambiguous.has(target.path)) return target;
  } catch {
    /* Malformed URI fragments remain available in the JSON editor. */
  }
}

const fieldCache = new WeakMap<Model, Field[]>();
const limitedFields = new WeakSet<Model>();
function allFields(m: Model) {
  const cached = fieldCache.get(m);
  if (cached) return cached;
  const result: Field[] = [];
  let pendingRoots = 0;
  function visit(schema: JsonNode, entry: Omit<Field, 'schema'>, ancestors: Set<JsonNode>) {
    // A compact DAG of shared definitions can expand exponentially. Reserve a row for
    // each remaining root field so a large earlier branch cannot hide its siblings.
    if (entry.depth > 0 && result.length >= 4000 - pendingRoots) {
      limitedFields.add(m);
      return;
    }
    const visited = new Set(ancestors);
    let shape = schema;
    while (!visited.has(shape)) {
      visited.add(shape);
      const ref = m.str(child(shape, '$ref'));
      if (!ref) break;
      const next = fragmentTarget(m, shape, ref);
      if (!next) break;
      shape = next;
    }
    const field = { ...entry, schema: shape };
    result.push(field);
    if (ancestors.has(shape)) {
      limitedFields.add(m);
      return;
    }
    const properties = child(shape, 'properties')?.children ?? [];
    const tupleItems = child(shape, 'prefixItems')?.children ?? [];
    const item = child(shape, 'items');
    const hasItem = item && (item.kind === 'object' || item.kind === 'boolean');
    if (field.depth === -1)
      pendingRoots = properties.length + tupleItems.length + Number(!!hasItem);
    function descend(n: JsonNode, key: string | null, tuple?: number) {
      if (field.depth === -1) pendingRoots--;
      if (m.ambiguous.has(n.path)) {
        limitedFields.add(m);
        return;
      }
      const parts = [...field.parts, key];
      const part =
        key === null
          ? '/items'
          : tuple === undefined
            ? '/properties/' + escapeKey(key)
            : '/prefixItems/' + key;
      visit(
        n,
        {
          parts,
          schemaPath: field.schemaPath + part,
          label:
            key === null ? '数组元素' : tuple === undefined ? key : '第 ' + (tuple + 1) + ' 项',
          path: field.path + (key === null ? '[]' : '/' + escapeKey(key)),
          parent: field,
          property: key ?? undefined,
          reachable:
            field.reachable &&
            tuple === undefined &&
            (key === null
              ? m.str(child(shape, 'type')) === 'array' && !child(shape, 'prefixItems')
              : m.str(child(shape, 'type')) === 'object') &&
            !child(shape, '$ref'),
          depth: field.depth + 1,
          required:
            key !== null && !!child(shape, 'required')?.children?.some((v) => m.str(v) === key),
        },
        visited,
      );
    }
    for (const n of properties) descend(n, n.key!);
    for (const n of tupleItems) descend(n, n.key!, Number(n.key));
    if (hasItem) descend(item, null);
  }
  if (m.schema && !m.ambiguous.has(m.schema.path))
    visit(
      m.schema,
      {
        schemaPath: m.schema.path,
        label: '根数据',
        path: '',
        depth: -1,
        reachable: true,
        required: false,
        parts: [],
      },
      new Set(),
    );
  fieldCache.set(m, result);
  return result;
}

export function layoutFieldsLimited(m: Model) {
  allFields(m);
  return limitedFields.has(m);
}
export function layoutFields(m: Model): LayoutField[] {
  return allFields(m).slice(1);
}
function reference(m: Model, n: JsonNode | undefined, env: Environment): Field | undefined {
  const path = m.str(child(n, 'path'));
  if (
    !n ||
    m.ambiguous.has(n.path) ||
    n.children?.some((v) => m.ambiguous.has(v.path)) ||
    m.str(child(n, 'source')) !== 'data' ||
    path === undefined ||
    (path !== '' && !path.startsWith('/')) ||
    /~(?:[^01]|$)/.test(path)
  )
    return;
  return project(m, path, m.str(child(n, 'scope')), env);
}
function project(m: Model, path: string, alias: string | undefined, env: Environment) {
  const fields = allFields(m);
  let f = alias === undefined ? fields[0] : env.get(alias);
  for (const raw of path.split('/').slice(1)) {
    if (!f || !f.reachable) return;
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    const parent = f;
    f = fields.find((v) => v.parent === parent && v.property === key);
    if (!f && /^(0|[1-9]\d*)$/.test(key))
      f = fields.find((v) => v.parent === parent && v.property === undefined);
  }
  return f?.reachable ? f : undefined;
}
export function ancestorBinders(m: Model, node: JsonNode): JsonNode[] {
  const result: JsonNode[] = [];
  let path = node.path;
  while (path.includes('/')) {
    const at = path.lastIndexOf('/'),
      key = path.slice(at + 1);
    path = path.slice(0, at);
    const binder = child(m.byPath.get(path), 'scope');
    if (key === 'node' && binder) result.unshift(binder);
  }
  return result;
}
function extend(m: Model, env: Environment, binder: JsonNode): Environment {
  const alias = m.str(child(binder, 'as'));
  if (alias === undefined) return env;
  if (m.ambiguous.has(binder.path) || binder.children?.some((v) => m.ambiguous.has(v.path)))
    return new Map(env).set(alias, undefined);
  let field = reference(m, child(binder, 'from'), env);
  if (m.str(child(binder, 'mode')) === 'each') {
    const array = field;
    field = array && allFields(m).find((v) => v.parent === array && v.property === undefined);
  }
  return new Map(env).set(alias, env.has(alias) || !field?.reachable ? undefined : field);
}

export function bindingCandidates(m: Model, node: JsonNode): BindingCandidate[] {
  const fields = allFields(m),
    env = ancestorBinders(m, node).reduce((env, b) => extend(m, env, b), new Map() as Environment);
  const result: BindingCandidate[] = [];
  for (const [scope, base] of [[undefined, fields[0]], ...env] as [
    string | undefined,
    Field | undefined,
  ][]) {
    if (!base) continue;
    for (const f of fields) {
      if (!f.reachable || (f !== base && !f.schemaPath.startsWith(base.schemaPath + '/'))) continue;
      const parts = f.parts.slice(base.parts.length);
      if (parts.some((v) => v === null)) continue;
      const path = parts.map((key) => '/' + escapeKey(key!)).join('');
      result.push({
        ...f,
        label: scope === undefined ? f.path || '根数据' : scope + (path || '（当前项）'),
        ref: { source: 'data', path, ...(scope !== undefined && { scope }) },
      });
    }
  }
  return result;
}

export function bindingCoverage(m: Model, root: JsonNode): Set<string> {
  const covered = new Set<string>(),
    seen = new Set<string>();
  function visit(n: JsonNode, env: Environment, active: Set<string>) {
    if (m.ambiguous.has(n.path)) return;
    const binder = child(n, 'scope'),
      body = child(n, 'node');
    if (binder && body) {
      visit(body, extend(m, env, binder), active);
      return;
    }
    const use = m.str(child(n, '$use'));
    if (use !== undefined) {
      if (active.has(use)) return;
      const t = child(child(m.root, 'viewTemplates'), use),
        body = child(t, 'node');
      if (!body) return;
      const args: Environment = new Map();
      for (const param of child(t, 'params')?.children ?? [])
        args.set(param.key!, reference(m, child(child(n, 'with'), param.key!), env));
      const key = JSON.stringify([use, ...[...args].map(([k, v]) => [k, v?.schemaPath])]);
      if (seen.has(key)) return;
      seen.add(key);
      visit(body, args, new Set(active).add(use));
      return;
    }
    if (m.str(child(n, 'material')) === undefined) return;
    for (const b of child(n, 'bindings')?.children ?? []) {
      const field = reference(m, b, env);
      if (field) covered.add(field.schemaPath);
    }
    const shorthand = m.str(child(n, 'bind'));
    if (shorthand !== undefined && (shorthand === '' || shorthand.startsWith('/'))) {
      const field = project(m, shorthand, undefined, env);
      if (field) covered.add(field.schemaPath);
    }
    child(n, 'children')?.children?.forEach((member) => visit(member, env, active));
    for (const slot of child(n, 'slots')?.children ?? [])
      if (slot.kind === 'array')
        for (const member of slot.children ?? []) visit(member, env, active);
  }
  visit(root, new Map(), new Set());
  return covered;
}
