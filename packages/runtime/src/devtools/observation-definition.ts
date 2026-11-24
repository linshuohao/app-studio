import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import type { MetadataValue } from './observation-protocol.js';
import { DATA_SCHEMA_BASE } from '../validation/schema.js';

export interface DefinitionBudget {
  readonly maxRows: number;
  readonly maxVisits: number;
  readonly maxDepth: number;
  readonly maxTextBytes: number;
}
export interface DefinitionNode {
  readonly id: string;
  readonly kind:
    'schema' | 'reaction' | 'constraint' | 'view' | 'material' | 'scope' | 'template-use';
  readonly pointer: string;
  readonly ruleId?: string;
  readonly constraintKind?: string;
  readonly schemaType?: MetadataValue;
  readonly nodeId?: string;
  readonly material?: string;
  readonly scope?: MetadataValue;
  readonly applicability?: 'not-evaluated';
}
export type DefinitionTarget =
  | { readonly kind: 'definition'; readonly id: string }
  | { readonly kind: 'reference'; readonly reference: MetadataValue }
  | { readonly kind: 'unresolved'; readonly reference: string; readonly reason: string };
export interface DefinitionRelation {
  readonly id: string;
  readonly subject: string;
  readonly object: DefinitionTarget;
  readonly kind:
    | 'contains'
    | 'schemaRef'
    | 'watches'
    | 'invalidatedBy'
    | 'mayRead'
    | 'mayWrite'
    | 'requires'
    | 'reportsTo'
    | 'bindsTo'
    | 'uses';
  readonly level: 'definition';
  readonly provenance: 'declared' | 'compiler-derived';
  readonly resolution: 'resolved' | 'unresolved';
}
export interface DefinitionCatalog {
  readonly preparedId: string;
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly level: 'definition';
  readonly nodes: readonly DefinitionNode[];
  readonly relations: readonly DefinitionRelation[];
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const escape = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
const preparedIds = new WeakMap<object, string>();
let preparedSequence = 0;
const preparedNamespace = Math.random().toString(36).slice(2);
export function observedPreparedId(prepared: object): string {
  let id = preparedIds.get(prepared);
  if (!id) {
    id = `prepared:${preparedNamespace}:${++preparedSequence}`;
    preparedIds.set(prepared, id);
  }
  return id;
}
const catalogs = new WeakMap<object, Map<string, DefinitionCatalog>>();
export function sharedPreparedCatalog(
  prepared: ReadonlyPreparedForm,
  budget: DefinitionBudget,
): DefinitionCatalog {
  let entries = catalogs.get(prepared);
  if (!entries) {
    entries = new Map();
    catalogs.set(prepared, entries);
  }
  const key = JSON.stringify(budget);
  let catalog = entries.get(key);
  if (!catalog) {
    catalog = describePrepared(prepared, observedPreparedId(prepared), budget);
    entries.set(key, catalog);
    while (entries.size > 8) entries.delete(entries.keys().next().value!);
  }
  return catalog;
}
let resolver: Ajv2020['opts']['uriResolver'] | undefined;
/** Prepared 静态适配；不求值、不读取 Working Data、不构造实际运行实例或执行事实。 */
export function describePrepared(
  prepared: ReadonlyPreparedForm,
  preparedId: string,
  budget: DefinitionBudget,
): DefinitionCatalog {
  if (
    !preparedId ||
    (['maxRows', 'maxVisits', 'maxDepth', 'maxTextBytes'] as const).some(
      (key) => !Number.isSafeInteger(budget[key]) || budget[key] < 1,
    )
  )
    throw Error('observation: invalid definition budget');
  const uri = (resolver ??= new Ajv2020().opts.uriResolver);
  let visits = 0,
    textBytes = 0;
  const nodes: DefinitionNode[] = [],
    relations: DefinitionRelation[] = [];
  const visit = (depth: number) => {
    if (++visits > budget.maxVisits || depth > budget.maxDepth) throw Error('budget');
  };
  // 只复制显式选择的元数据，字面量和业务值不进入目录。计费早于复制字符串/子容器。
  const copy = (input: unknown, depth = 0): MetadataValue => {
    visit(depth);
    if (typeof input === 'string') {
      if (input.length > budget.maxTextBytes - textBytes) throw Error('budget');
      for (const char of input) {
        const code = char.codePointAt(0)!;
        textBytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
      }
      if (textBytes > budget.maxTextBytes) throw Error('budget');
      return input;
    }
    if (
      input === null ||
      typeof input === 'boolean' ||
      (typeof input === 'number' && Number.isFinite(input))
    )
      return input;
    if (Array.isArray(input)) {
      const output: MetadataValue[] = [];
      for (const child of input) output.push(copy(child, depth + 1));
      return Object.freeze(output);
    }
    if (object(input)) {
      const output: Record<string, MetadataValue> = Object.create(null) as Record<
        string,
        MetadataValue
      >;
      for (const key in input)
        if (Object.hasOwn(input, key)) {
          copy(key, depth + 1);
          output[key] = copy(input[key], depth + 1);
        }
      return Object.freeze(output);
    }
    throw Error('observation: invalid metadata');
  };
  const node = (input: DefinitionNode) => {
    if (nodes.length + relations.length >= budget.maxRows) throw Error('budget');
    const owned = copy(input) as unknown as DefinitionNode;
    nodes.push(owned);
    return owned.id;
  };
  const edge = (
    subject: string,
    kind: DefinitionRelation['kind'],
    target: DefinitionTarget,
    provenance: DefinitionRelation['provenance'] = 'declared',
  ) => {
    if (nodes.length + relations.length >= budget.maxRows) throw Error('budget');
    relations.push(
      copy({
        id: `relation:${relations.length}`,
        subject,
        object: target,
        kind,
        level: 'definition',
        provenance,
        resolution: target.kind === 'unresolved' ? 'unresolved' : 'resolved',
      }) as unknown as DefinitionRelation,
    );
  };
  const ref = (value: unknown): DefinitionTarget => ({ kind: 'reference', reference: copy(value) });
  if (
    (prepared.definition.constraints?.length ?? 0) + (prepared.definition.reactions?.length ?? 0) >
    budget.maxRows
  )
    throw Error('budget');
  const ruleIds = new Map<string, string>();
  for (const [index, rule] of (prepared.definition.constraints ?? []).entries()) {
    visit(0);
    ruleIds.set(copy(rule.id) as string, `constraint:${index}`);
  }
  const named = prepared.definition.expressions ?? {};
  const expression = (subject: string, input: unknown, depth = 0, names = new Set<string>()) => {
    visit(depth);
    if (!object(input) || 'literal' in input) return;
    if ('ref' in input) {
      edge(subject, 'mayRead', ref(input.ref));
      return;
    }
    if (typeof input.use === 'string') {
      if (names.has(input.use) || !Object.hasOwn(named, input.use)) {
        edge(subject, 'mayRead', {
          kind: 'unresolved',
          reference: input.use,
          reason: names.has(input.use) ? 'expression-cycle' : 'expression-not-found',
        });
        return;
      }
      names.add(input.use);
      expression(subject, named[input.use], depth + 1, names);
      names.delete(input.use);
      return;
    }
    if (Array.isArray(input.args))
      for (const argument of input.args) expression(subject, argument, depth + 1, names);
  };
  const valueSpec = (subject: string, input: unknown, depth = 0) => {
    visit(depth);
    if (Array.isArray(input)) {
      for (const child of input) valueSpec(subject, child, depth + 1);
      return;
    }
    if (!object(input) || '$literal' in input) return;
    if ('$expr' in input) {
      expression(subject, input.$expr, depth + 1);
      return;
    }
    for (const key in input)
      if (Object.hasOwn(input, key)) valueSpec(subject, input[key], depth + 1);
  };
  const action = (subject: string, input: unknown, depth = 0) => {
    visit(depth);
    if (!object(input)) return;
    if (input.op === 'batch' && Array.isArray(input.commands)) {
      for (const command of input.commands) action(subject, command, depth + 1);
      return;
    }
    if (input.type === 'host.emit') {
      valueSpec(subject, input.payload, depth + 1);
      return;
    }
    if ('target' in input) edge(subject, 'mayWrite', ref(input.target));
    if ('value' in input) valueSpec(subject, input.value, depth + 1);
  };
  for (const [index, rule] of (prepared.definition.reactions ?? []).entries()) {
    const id = node({
      id: `reaction:${index}`,
      kind: 'reaction',
      pointer: `/definition/reactions/${index}`,
      ruleId: rule.id,
      ...(rule.scope ? { scope: copy(rule.scope) } : {}),
    });
    for (const watch of rule.watch) edge(id, 'watches', ref(watch));
    expression(id, rule.when);
    for (const command of rule.then) action(id, command);
  }
  for (const [index, rule] of (prepared.definition.constraints ?? []).entries()) {
    const id = node({
      id: `constraint:${index}`,
      kind: 'constraint',
      pointer: `/definition/constraints/${index}`,
      ruleId: rule.id,
      constraintKind: rule.kind,
      ...(rule.scope ? { scope: copy(rule.scope) } : {}),
    });
    for (const watch of rule.watch) edge(id, 'invalidatedBy', ref(watch), 'compiler-derived');
    expression(id, rule.when);
    if (rule.kind === 'internal') expression(id, rule.assert);
    edge(id, 'reportsTo', ref(rule.kind === 'internal' ? rule.issue.target : rule.target));
    for (const requirement of rule.requires ?? []) {
      if (requirement.kind === 'field') {
        edge(id, 'requires', ref(requirement.target));
        for (const constraintId of requirement.constraintIds) {
          const target = ruleIds.get(constraintId);
          edge(
            id,
            'requires',
            target
              ? { kind: 'definition', id: target }
              : { kind: 'unresolved', reference: constraintId, reason: 'constraint-not-found' },
            'compiler-derived',
          );
        }
      } else {
        const target = ruleIds.get(requirement.constraintId);
        edge(
          id,
          'requires',
          target
            ? { kind: 'definition', id: target }
            : {
                kind: 'unresolved',
                reference: requirement.constraintId,
                reason: 'constraint-not-found',
              },
        );
      }
    }
  }
  const aliases = new Map<string, string>();
  const references: Array<{ subject: string; base: string; reference: string }> = [];
  interface Root {
    uri: string;
    pointer: string;
  }
  const schema = (
    input: unknown,
    pointer: string,
    base: string,
    roots: readonly Root[],
    parent?: string,
    depth = 0,
  ) => {
    visit(depth);
    if (typeof input !== 'boolean' && !object(input)) return;
    const resource =
      object(input) && typeof input.$id === 'string'
        ? uri.resolve(base, copy(input.$id) as string)
        : base;
    const scopes = resource !== base ? [...roots, { uri: resource, pointer }] : roots;
    const id = node({
      id: `schema:${pointer}`,
      kind: 'schema',
      pointer,
      applicability: 'not-evaluated',
      ...(object(input) && input.type !== undefined ? { schemaType: copy(input.type) } : {}),
    });
    if (parent) edge(parent, 'contains', { kind: 'definition', id });
    for (const root of scopes)
      aliases.set(copy(root.uri + '#' + pointer.slice(root.pointer.length)) as string, id);
    if (!object(input)) return;
    if (typeof input.$anchor === 'string')
      aliases.set(copy(resource + '#' + (copy(input.$anchor) as string)) as string, id);
    if (typeof input.$ref === 'string')
      references.push({ subject: id, base: resource, reference: copy(input.$ref) as string });
    if (typeof input.$dynamicRef === 'string')
      edge(id, 'schemaRef', {
        kind: 'unresolved',
        reference: input.$dynamicRef,
        reason: 'dynamic-schema-reference',
      });
    for (const keyword of [
      'properties',
      'patternProperties',
      '$defs',
      'definitions',
      'dependentSchemas',
    ]) {
      const children = input[keyword];
      if (object(children))
        for (const key in children)
          if (Object.hasOwn(children, key))
            schema(
              children[key],
              `${pointer}/${keyword}/${escape(key)}`,
              resource,
              scopes,
              id,
              depth + 1,
            );
    }
    for (const keyword of [
      'items',
      'additionalProperties',
      'unevaluatedProperties',
      'unevaluatedItems',
      'contains',
      'propertyNames',
      'contentSchema',
      'not',
      'if',
      'then',
      'else',
    ]) {
      if (keyword in input)
        schema(input[keyword], `${pointer}/${keyword}`, resource, scopes, id, depth + 1);
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      const children = input[keyword];
      if (Array.isArray(children))
        for (const [index, child] of children.entries())
          schema(child, `${pointer}/${keyword}/${index}`, resource, scopes, id, depth + 1);
    }
  };
  schema(prepared.definition.data.schema, '/definition/data/schema', DATA_SCHEMA_BASE, [
    { uri: DATA_SCHEMA_BASE, pointer: '/definition/data/schema' },
  ]);
  for (const key in prepared.resources.schemas)
    if (Object.hasOwn(prepared.resources.schemas, key)) {
      copy(key);
      const pointer = `/resources/schemas/${escape(key)}`;
      schema(prepared.resources.schemas[key], pointer, key, [{ uri: key, pointer }]);
    }
  for (const reference of references) {
    const resolved = uri.resolve(reference.base, reference.reference);
    // URI fragment 的百分号编码先解码为 JSON Pointer；不展开递归目标。
    const hash = resolved.indexOf('#');
    let canonical =
      hash < 0
        ? resolved + '#'
        : resolved.slice(0, hash + 1) + decodeURIComponent(resolved.slice(hash + 1));
    if (!canonical.includes('#')) canonical += '#';
    const target = aliases.get(canonical);
    edge(
      reference.subject,
      'schemaRef',
      target
        ? { kind: 'definition', id: target }
        : {
            kind: 'unresolved',
            reference: reference.reference,
            reason: 'schema-reference-not-found',
          },
    );
  }
  const view = (input: unknown, pointer: string, parent?: string, depth = 0) => {
    visit(depth);
    if (!object(input)) return;
    const kind =
      typeof input.$use === 'string'
        ? 'template-use'
        : 'scope' in input
          ? 'scope'
          : typeof input.material === 'string'
            ? 'material'
            : 'view';
    const id = node({
      id: `view:${pointer}`,
      kind,
      pointer,
      ...(typeof input.id === 'string' ? { nodeId: input.id } : {}),
      ...(typeof input.material === 'string' ? { material: input.material } : {}),
      ...(input.scope ? { scope: copy(input.scope) } : {}),
    });
    if (parent) edge(parent, 'contains', { kind: 'definition', id });
    if (typeof input.$use === 'string') {
      const found = prepared.definition.viewTemplates?.[input.$use];
      edge(
        id,
        'uses',
        found
          ? { kind: 'definition', id: `view:/definition/viewTemplates/${escape(input.$use)}/node` }
          : { kind: 'unresolved', reference: input.$use, reason: 'template-not-found' },
      );
    }
    if (object(input.bindings))
      for (const target of Object.values(input.bindings)) edge(id, 'bindsTo', ref(target));
    valueSpec(id, input.props);
    if (input.node) view(input.node, pointer + '/node', id, depth + 1);
    if (object(input.slots))
      for (const [name, children] of Object.entries(input.slots))
        if (Array.isArray(children))
          children.forEach((child, index) =>
            view(child, `${pointer}/slots/${escape(name)}/${index}`, id, depth + 1),
          );
  };
  for (const [name, root] of Object.entries(prepared.definition.views))
    view(root, `/definition/views/${escape(name)}`);
  for (const [name, template] of Object.entries(prepared.definition.viewTemplates ?? {}))
    view(template.node, `/definition/viewTemplates/${escape(name)}/node`);
  return Object.freeze({
    preparedId: copy(preparedId) as string,
    definitionId: copy(prepared.definition.id) as string,
    definitionVersion: copy(prepared.definition.version) as string,
    level: 'definition',
    nodes: Object.freeze(nodes),
    relations: Object.freeze(relations),
  });
}
