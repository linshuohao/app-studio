import { Ajv2020 } from 'ajv/dist/2020.js';
import type { JsonSchema } from '@form-engine/protocol';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import { equalJson } from '../data/json.js';
import { DATA_SCHEMA_BASE } from '../validation/schema.js';
export interface SchemaRoot {
  readonly schema: JsonSchema;
  readonly uri: string;
}
const uriResolver = new Ajv2020().opts.uriResolver;
const resolveUri = (base: string, ref: string) => uriResolver.resolve(base, ref);
const mapKeywords = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
const singleKeywords = [
  'additionalProperties',
  'additionalItems',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contains',
  'propertyNames',
  'contentSchema',
  'not',
  'if',
  'then',
  'else',
  'items',
];
const arrayKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
function schemaChildren(schema: Exclude<JsonSchema, boolean>): JsonSchema[] {
  const children: JsonSchema[] = [];
  for (const key of mapKeywords) {
    const value = schema[key];
    if (value && typeof value === 'object' && !Array.isArray(value))
      children.push(...(Object.values(value) as JsonSchema[]));
  }
  for (const key of singleKeywords) {
    const value = schema[key];
    if (typeof value === 'boolean' || (value && typeof value === 'object' && !Array.isArray(value)))
      children.push(value as JsonSchema);
  }
  for (const key of arrayKeywords)
    if (Array.isArray(schema[key])) children.push(...(schema[key] as JsonSchema[]));
  return children;
}
/** 只按 Schema 位置走引用闭包，const / default / examples 内的业务 $ref 不参与。 */
function resourceClosure(
  roots: readonly SchemaRoot[],
  resources: Readonly<Record<string, JsonSchema>>,
) {
  interface Document {
    readonly schema: JsonSchema;
    readonly uri: string;
    readonly external: boolean;
    readonly id: string;
  }
  const documents = new Map<string, Document>();
  const resourceDocuments: Document[] = Object.entries(resources).map(([uri, schema]) => ({
    schema,
    uri,
    external: true,
    id:
      typeof schema === 'object' && typeof schema.$id === 'string'
        ? resolveUri(uri, schema.$id)
        : uri,
  }));
  const rootDocuments: Document[] = roots.map(({ schema, uri }) => ({
    schema,
    uri,
    external: false,
    id:
      typeof schema === 'object' && typeof schema.$id === 'string'
        ? resolveUri(uri, schema.$id)
        : uri,
  }));
  const register = (document: Document) => {
    const add = (uri: string) => {
      const key = uri.split('#')[0]!;
      const existing = documents.get(key);
      if (existing && !equalJson(existing.schema, document.schema) && existing.id === key)
        throw Error('view: conflicting Schema identity');
      if (!existing) documents.set(key, document);
    };
    add(document.uri);
    add(document.id);
    const nested = (schema: JsonSchema, base: string) => {
      if (typeof schema === 'boolean') return;
      const id = typeof schema.$id === 'string' ? resolveUri(base, schema.$id) : base;
      if (!documents.has(id.split('#')[0]!)) documents.set(id.split('#')[0]!, document);
      schemaChildren(schema).forEach((child) => nested(child, id));
    };
    nested(document.schema, document.uri);
  };
  [...resourceDocuments, ...rootDocuments].forEach(register);
  const selected = new Map<string, JsonSchema>(),
    visited = new Set<Document>();
  const visit = (document: Document) => {
    if (visited.has(document)) return;
    visited.add(document);
    if (document.external) selected.set(document.id, document.schema);
    const walk = (schema: JsonSchema, base: string) => {
      if (typeof schema === 'boolean') return;
      const id = typeof schema.$id === 'string' ? resolveUri(base, schema.$id) : base;
      for (const keyword of ['$ref', '$dynamicRef']) {
        const ref = schema[keyword];
        if (typeof ref === 'string') {
          const target = resolveUri(id, ref).split('#')[0]!;
          const dependency = documents.get(target);
          if (!dependency) throw Error(`view: missing execution Schema ${target}`);
          visit(dependency);
        }
      }
      schemaChildren(schema).forEach((child) => walk(child, id));
    };
    walk(document.schema, document.uri);
  };
  rootDocuments.forEach(visit);
  return Object.fromEntries([...selected].sort(([a], [b]) => a.localeCompare(b)));
}
export function checkExecution(
  base: PreparedForm,
  candidate: PreparedForm,
  functions: Readonly<Record<string, readonly SchemaRoot[]>>,
) {
  if (base === candidate) return;
  const definition = (form: PreparedForm) =>
    Object.fromEntries(
      Object.entries(form.definition).filter(
        ([key]) => !['views', 'viewTemplates', 'metadata'].includes(key),
      ),
    );
  if (!equalJson(definition(base), definition(candidate)))
    throw Error('view: incompatible execution contract');
  for (const [id, lock] of Object.entries(candidate.capabilityLock.pureFunctions)) {
    if (
      !base.capabilityLock.pureFunctions[id] ||
      !equalJson(base.capabilityLock.pureFunctions[id], lock)
    )
      throw Error(`view: function is not loaded ${id}`);
  }
  const roots = [
    { schema: base.definition.data.schema, uri: DATA_SCHEMA_BASE },
    ...Object.keys(candidate.capabilityLock.pureFunctions).flatMap((id) => functions[id] ?? []),
  ];
  if (
    !equalJson(
      resourceClosure(roots, base.resources.schemas),
      resourceClosure(roots, candidate.resources.schemas),
    )
  )
    throw Error('view: incompatible execution Schema resources');
}
