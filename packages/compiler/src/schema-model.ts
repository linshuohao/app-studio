import type { JsonSchema, JsonValue } from '@form-engine/protocol';
import { at, Diagnostics, own, record } from './diagnostics.js';
import { canonicalJson } from './json.js';
import { createAjv } from './structure.js';

interface Document {
  schema: JsonSchema;
  uri: string;
  sourcePointer: string;
  sourceId?: string;
  external?: string;
}
export interface SchemaNode {
  schema: JsonSchema;
  document: Document;
  pointer: string;
}
export interface Connection {
  kind: 'compatible' | 'incompatible' | 'unproven';
  reason: string;
}
const virtualRoot = 'https://form-engine.invalid/schema/root';
const mapKeywords = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
const arrayKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const singleKeywords = [
  'items',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
  'contentSchema',
];
const supportedPointer = /^(?:\/(?:[^~/]|~[01])*)*$/;

export class SchemaModel {
  private readonly documents = new Map<string, Document>();
  private readonly indexed = new Set<string>();
  private readonly schemaLocations = new Set<string>();
  private readonly resourceAliases = new Map<string, { key: string; schema: JsonSchema }>();
  private readonly visited = new Set<string>();
  private readonly usedResources = new Map<string, JsonSchema>();
  private operations = 0;
  readonly root: SchemaNode;

  constructor(
    root: JsonSchema,
    resources: Record<string, JsonSchema>,
    private readonly diagnostics: Diagnostics,
  ) {
    this.root = this.addRoot(root, virtualRoot, '/data/schema');
    for (const [uri, schema] of Object.entries(resources).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      const resolved = this.uri(uri, this.root.document.uri, '');
      if (!resolved) continue;
      const id =
        record(schema) && typeof schema.$id === 'string'
          ? (this.uri(schema.$id, resolved, '') ?? resolved)
          : resolved;
      const document = this.register(schema, id, '', `schemaResources:${uri}`, uri);
      const alias = this.documents.get(resolved);
      if (alias && alias !== document)
        diagnostics.error('SCHEMA_ID_CONFLICT', '', `Conflicting retrieval URI ${resolved}.`);
      else this.documents.set(resolved, document);
      for (const address of [resolved, id])
        if (!this.resourceAliases.has(address))
          this.resourceAliases.set(address, { key: uri, schema });
      this.index({ schema, document, pointer: '' });
    }
    this.scan(this.root);
  }

  private uri(ref: string, base: string, pointer: string): string | undefined {
    try {
      const uri = new URL(ref, base).href;
      return uri.endsWith('#') ? uri.slice(0, -1) : uri;
    } catch {
      this.diagnostics.error('SCHEMA_URI_INVALID', pointer, `Cannot resolve schema URI ${ref}.`);
      return undefined;
    }
  }
  private register(
    schema: JsonSchema,
    uri: string,
    pointer: string,
    sourceId?: string,
    external?: string,
  ): Document {
    const existing = this.documents.get(uri);
    if (existing) {
      if (canonicalJson(existing.schema) !== canonicalJson(schema))
        this.diagnostics.error(
          'SCHEMA_ID_CONFLICT',
          pointer,
          `Conflicting schema identity ${uri}.`,
        );
      return existing;
    }
    const document = { schema, uri, sourcePointer: pointer, sourceId, external };
    this.documents.set(uri, document);
    return document;
  }
  addRoot(schema: JsonSchema, fallback: string, pointer: string): SchemaNode {
    const id =
      record(schema) && typeof schema.$id === 'string'
        ? (this.uri(schema.$id, fallback, pointer) ?? fallback)
        : fallback;
    const document = this.register(schema, id, pointer);
    const node = { schema, document, pointer: '' };
    this.index(node);
    return node;
  }
  private location(node: SchemaNode): string {
    return node.document.sourceId ? '' : node.document.sourcePointer + node.pointer;
  }
  private enter(node: SchemaNode): SchemaNode {
    if (node.pointer && record(node.schema) && typeof node.schema.$id === 'string') {
      const id = this.uri(node.schema.$id, node.document.uri, this.location(node));
      if (id)
        return {
          schema: node.schema,
          document: this.register(
            node.schema,
            id,
            this.location(node),
            node.document.sourceId,
            node.document.external,
          ),
          pointer: '',
        };
    }
    return node;
  }
  private child(node: SchemaNode, key: string, schema: JsonSchema): SchemaNode {
    return { schema, document: node.document, pointer: at(node.pointer, key) };
  }
  private children(node: SchemaNode): SchemaNode[] {
    if (!record(node.schema)) return [];
    const children: SchemaNode[] = [];
    for (const keyword of mapKeywords) {
      const map = node.schema[keyword];
      if (record(map))
        for (const [name, schema] of Object.entries(map))
          children.push(this.child(this.child(node, keyword, map), name, schema as JsonSchema));
    }
    for (const keyword of arrayKeywords) {
      const schemas = node.schema[keyword];
      if (Array.isArray(schemas))
        schemas.forEach((schema, index) =>
          children.push({
            schema: schema as JsonSchema,
            document: node.document,
            pointer: at(at(node.pointer, keyword), index),
          }),
        );
    }
    for (const keyword of singleKeywords) {
      const schema = node.schema[keyword];
      if (typeof schema === 'boolean' || record(schema))
        children.push(this.child(node, keyword, schema as JsonSchema));
    }
    return children;
  }
  private index(input: SchemaNode): void {
    this.schemaLocations.add(input.document.uri + '#' + input.pointer);
    const node = this.enter(input),
      key = node.document.uri + '#' + node.pointer;
    if (this.indexed.has(key)) return;
    this.indexed.add(key);
    // Schema resource declarations are indexed before following any forward refs.
    for (const child of this.children(node)) this.index(child);
  }
  private resolveRef(input: SchemaNode, ref: string): SchemaNode | undefined {
    const node = this.enter(input);
    const resolved = this.uri(ref, node.document.uri, at(this.location(node), '$ref'));
    if (!resolved) return undefined;
    const separator = resolved.indexOf('#');
    const uri = separator < 0 ? resolved : resolved.slice(0, separator);
    const document = this.documents.get(uri);
    if (!document) {
      this.diagnostics.error(
        'SCHEMA_RESOURCE_MISSING',
        at(this.location(node), '$ref'),
        `Missing fixed schema resource ${uri}.`,
        [
          {
            sourceId: node.document.sourceId ?? 'definition',
            pointer: node.document.sourcePointer + at(node.pointer, '$ref'),
          },
        ],
      );
      return undefined;
    }
    const resource = this.resourceAliases.get(uri);
    if (resource) this.usedResources.set(resource.key, resource.schema);
    else if (document.external) {
      const root = [...this.resourceAliases.values()].find(
        (resource) => resource.key === document.external,
      );
      if (root) this.usedResources.set(root.key, root.schema);
    }
    let pointer: string;
    try {
      pointer = separator < 0 ? '' : decodeURIComponent(resolved.slice(separator + 1));
    } catch {
      this.diagnostics.error(
        'SCHEMA_REFERENCE_INVALID',
        this.location(node),
        'Invalid escaped schema fragment.',
      );
      return undefined;
    }
    if (!supportedPointer.test(pointer)) {
      this.diagnostics.error(
        'SCHEMA_REFERENCE_UNSUPPORTED',
        this.location(node),
        'This implementation supports schema JSON Pointer fragments; named anchors are not implemented yet.',
      );
      return undefined;
    }
    let target: SchemaNode = { schema: document.schema, document, pointer: '' };
    for (const part of pointer.split('/').slice(1)) {
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      if (this.schemaLocations.has(target.document.uri + '#' + target.pointer))
        target = this.enter(target);
      const schema: unknown = target.schema;
      if (!(record(schema) || Array.isArray(schema)) || !own(schema, key)) {
        this.diagnostics.error(
          'SCHEMA_REFERENCE_NOT_FOUND',
          at(this.location(node), '$ref'),
          `Schema reference ${ref} does not identify a schema.`,
        );
        return undefined;
      }
      target = {
        schema: (schema as Record<string, unknown>)[key] as JsonSchema,
        document: target.document,
        pointer: at(target.pointer, key),
      };
    }
    if (typeof target.schema !== 'boolean' && !record(target.schema)) {
      this.diagnostics.error(
        'SCHEMA_REFERENCE_NOT_FOUND',
        at(this.location(node), '$ref'),
        `Schema reference ${ref} does not identify a schema.`,
      );
      return undefined;
    }
    return this.enter(target);
  }
  scan(input: SchemaNode): void {
    if (++this.operations > 20_000) {
      this.diagnostics.error(
        'SCHEMA_BUDGET_EXCEEDED',
        this.location(input),
        'Schema analysis budget exceeded.',
      );
      return;
    }
    const node = this.enter(input);
    const key = node.document.uri + '#' + node.pointer;
    if (this.visited.has(key)) return;
    this.visited.add(key);
    if (!record(node.schema)) return;
    if (typeof node.schema.$dynamicRef === 'string')
      this.diagnostics.error(
        'SCHEMA_REFERENCE_UNSUPPORTED',
        this.location(node),
        'Dynamic schema references are not implemented in this slice.',
      );
    if (typeof node.schema.$ref === 'string') {
      const next = this.resolveRef(node, node.schema.$ref);
      if (next) this.scan(next);
    }
    for (const child of this.children(node)) this.scan(child);
  }
  dereference(input: SchemaNode): SchemaNode | undefined {
    let node = this.enter(input);
    const seen = new Set<string>();
    while (record(node.schema) && typeof node.schema.$ref === 'string') {
      const key = node.document.uri + '#' + node.pointer;
      if (seen.has(key)) return undefined;
      seen.add(key);
      // Sibling assertions must never be discarded while following a reference.
      if (
        Object.keys(node.schema).some(
          (key) =>
            ![
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
            ].includes(key),
        )
      )
        return undefined;
      const next = this.resolveRef(node, node.schema.$ref);
      if (!next) return undefined;
      node = this.enter(next);
    }
    return node;
  }
  dataReference(path: string, location: string): SchemaNode | undefined {
    let node: SchemaNode | undefined = this.root;
    for (const part of path.split('/').slice(1)) {
      node = this.dereference(node);
      if (!node || !record(node.schema)) {
        this.diagnostics.error(
          'REFERENCE_UNPROVEN',
          location,
          'Cannot prove data reference shape.',
        );
        return undefined;
      }
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      const schema = node.schema;
      if (schema.type === 'object') {
        if (record(schema.properties) && own(schema.properties, key))
          node = {
            schema: schema.properties[key] as JsonSchema,
            document: node.document,
            pointer: at(at(node.pointer, 'properties'), key),
          };
        else if (schema.additionalProperties === false && !schema.patternProperties) {
          this.diagnostics.error('REFERENCE_NOT_FOUND', location, `No data property ${key}.`);
          return undefined;
        } else if (
          !schema.patternProperties &&
          (schema.additionalProperties === undefined ||
            typeof schema.additionalProperties === 'boolean' ||
            record(schema.additionalProperties))
        )
          node = this.child(
            node,
            'additionalProperties',
            (schema.additionalProperties ?? true) as JsonSchema,
          );
        else {
          this.diagnostics.error('REFERENCE_UNPROVEN', location, `Cannot prove property ${key}.`);
          return undefined;
        }
        // A declared property is absent from a closed dictionary, or from the declared simple model.
        if (
          node.schema === true &&
          schema.additionalProperties === undefined &&
          record(schema.properties) &&
          !own(schema.properties, key)
        ) {
          this.diagnostics.error(
            'REFERENCE_UNPROVEN',
            location,
            `Property ${key} is not declared and has an unconstrained shape.`,
          );
          return undefined;
        }
      } else if (schema.type === 'array' && /^(0|[1-9]\d*)$/.test(key) && !schema.prefixItems) {
        node = this.child(node, 'items', (schema.items ?? true) as JsonSchema);
      } else {
        this.diagnostics.error(
          'REFERENCE_UNPROVEN',
          location,
          `Cannot project data path segment ${key}.`,
        );
        return undefined;
      }
    }
    return node;
  }
  connection(sourceInput: SchemaNode, targetInput: SchemaNode, depth = 0): Connection {
    const result = (kind: Connection['kind'], reason: string): Connection => ({ kind, reason });
    if (depth > 64) return result('unproven', 'Type proof depth exceeded.');
    if (
      sourceInput.document.uri === targetInput.document.uri &&
      sourceInput.pointer === targetInput.pointer
    )
      return result('compatible', 'Same schema identity.');
    const source = this.dereference(sourceInput),
      target = this.dereference(targetInput);
    if (!source || !target)
      return result('unproven', 'Cannot prove recursive or combined reference.');
    if (source.document.uri === target.document.uri && source.pointer === target.pointer)
      return result('compatible', 'Same schema identity.');
    const a = source.schema,
      b = target.schema;
    if (b === true) return result('compatible', 'Unconstrained destination.');
    if (a === false || b === false || a === true)
      return result('unproven', 'No provable value shape.');
    if (
      [
        'allOf',
        'anyOf',
        'oneOf',
        'not',
        'if',
        'then',
        'else',
        '$dynamicRef',
        'patternProperties',
        'dependentSchemas',
        'dependentRequired',
        'propertyNames',
        'contains',
        'unevaluatedProperties',
        'unevaluatedItems',
      ].some((key) => own(a, key) || own(b, key))
    )
      return result('unproven', 'Schema composition is outside this slice of the proof subset.');
    const types = (schema: Exclude<JsonSchema, boolean>) =>
      typeof schema.type === 'string'
        ? [schema.type]
        : Array.isArray(schema.type)
          ? schema.type.filter((v): v is string => typeof v === 'string')
          : [];
    const srcTypes = types(a),
      dstTypes = types(b);
    if (
      !dstTypes.length &&
      !own(b, 'enum') &&
      !own(b, 'const') &&
      Object.keys(b).every((key) =>
        [
          '$id',
          '$schema',
          'title',
          'description',
          '$comment',
          '$defs',
          'definitions',
          'default',
          'examples',
        ].includes(key),
      )
    )
      return result('compatible', 'No structural destination constraints.');
    if (!srcTypes.length || !dstTypes.length) return result('unproven', 'Missing definite type.');
    if (
      !srcTypes.every(
        (t) => dstTypes.includes(t) || (t === 'integer' && dstTypes.includes('number')),
      )
    )
      return result('incompatible', 'Source types are not accepted by destination.');
    const values = (schema: Exclude<JsonSchema, boolean>): JsonValue[] | undefined =>
      own(schema, 'const') ? [schema.const!] : Array.isArray(schema.enum) ? schema.enum : undefined;
    const av = values(a),
      bv = values(b);
    if (
      bv &&
      (!av ||
        !av.every((value) => bv.some((target) => canonicalJson(value) === canonicalJson(target))))
    )
      return result('incompatible', 'Destination const/enum is not guaranteed.');
    if (srcTypes.includes('object') && dstTypes.includes('object')) {
      const ap = record(a.properties) ? a.properties : {},
        bp = record(b.properties) ? b.properties : {};
      const ar = Array.isArray(a.required) ? a.required : [],
        br = Array.isArray(b.required) ? b.required : [];
      if (!br.every((key) => ar.includes(key)))
        return result('incompatible', 'Destination required properties are not guaranteed.');
      for (const [key, schema] of Object.entries(ap)) {
        const targetSchema = own(bp, key) ? bp[key] : (b.additionalProperties ?? true);
        if (targetSchema === false)
          return result('incompatible', `Destination rejects property ${key}.`);
        const next = this.connection(
          {
            schema: schema as JsonSchema,
            document: source.document,
            pointer: at(at(source.pointer, 'properties'), key),
          },
          {
            schema: targetSchema as JsonSchema,
            document: target.document,
            pointer: own(bp, key)
              ? at(at(target.pointer, 'properties'), key)
              : at(target.pointer, 'additionalProperties'),
          },
          depth + 1,
        );
        if (next.kind !== 'compatible') return next;
      }
      for (const [key, schema] of Object.entries(bp)) {
        if (own(ap, key) || a.additionalProperties === false) continue;
        const next = this.connection(
          this.child(
            source,
            'additionalProperties',
            (a.additionalProperties ?? true) as JsonSchema,
          ),
          {
            schema: schema as JsonSchema,
            document: target.document,
            pointer: at(at(target.pointer, 'properties'), key),
          },
          depth + 1,
        );
        if (next.kind !== 'compatible')
          return result(
            'unproven',
            `Open source property ${key} does not have a provable destination shape.`,
          );
      }
      if (
        a.additionalProperties !== false &&
        b.additionalProperties !== undefined &&
        b.additionalProperties !== true
      )
        return result('unproven', 'Cannot prove additional properties.');
    }
    if (srcTypes.includes('array') && dstTypes.includes('array')) {
      if (a.prefixItems || b.prefixItems)
        return result('unproven', 'Tuple projection is not implemented.');
      return this.connection(
        this.child(source, 'items', (a.items ?? true) as JsonSchema),
        this.child(target, 'items', (b.items ?? true) as JsonSchema),
        depth + 1,
      );
    }
    return result(
      'compatible',
      'Structural types are compatible; business value restrictions are not write gates.',
    );
  }
  private validatorSchema(
    input: SchemaNode,
    cache: Map<string, JsonSchema>,
    order: Document[],
  ): JsonSchema {
    const node = this.enter(input),
      key = node.document.uri + '#' + node.pointer;
    const previous = cache.get(key);
    if (previous !== undefined) return previous;
    if (!record(node.schema)) {
      cache.set(key, node.schema);
      if (!node.pointer) order.push(node.document);
      return node.schema;
    }
    const schema = { ...node.schema };
    if (!node.pointer) schema.$id = node.document.uri;
    cache.set(key, schema);
    for (const keyword of mapKeywords) {
      const map = node.schema[keyword];
      if (record(map))
        schema[keyword] = Object.fromEntries(
          Object.entries(map).map(([name, child]) => [
            name,
            this.validatorSchema(
              this.child(this.child(node, keyword, map), name, child as JsonSchema),
              cache,
              order,
            ),
          ]),
        );
    }
    for (const keyword of arrayKeywords) {
      const array = node.schema[keyword];
      if (Array.isArray(array))
        schema[keyword] = array.map((child, index) =>
          this.validatorSchema(
            {
              schema: child as JsonSchema,
              document: node.document,
              pointer: at(at(node.pointer, keyword), index),
            },
            cache,
            order,
          ),
        );
    }
    for (const keyword of singleKeywords) {
      const child = node.schema[keyword];
      if (typeof child === 'boolean' || record(child))
        schema[keyword] = this.validatorSchema(
          this.child(node, keyword, child as JsonSchema),
          cache,
          order,
        );
    }
    // Register resource children first. Shared canonical objects preserve Ajv cache identity
    // whether a resource was declared inline, supplied externally, or retrieved via aliases.
    if (!node.pointer) order.push(node.document);
    return schema;
  }
  validateValue(node: SchemaNode, value: JsonValue, location: string): boolean {
    const ajv = createAjv();
    try {
      const canonicalSchemas = new Map<string, JsonSchema>(),
        order: Document[] = [];
      for (const document of new Set(this.documents.values()))
        this.validatorSchema(
          { schema: document.schema, document, pointer: '' },
          canonicalSchemas,
          order,
        );
      for (const document of order)
        ajv.addSchema(canonicalSchemas.get(document.uri + '#')!, document.uri);
      for (const [alias, document] of this.documents)
        if (alias !== document.uri) ajv.addSchema(canonicalSchemas.get(document.uri + '#')!, alias);
      const validator = ajv.getSchema(node.document.uri + (node.pointer ? '#' + node.pointer : ''));
      if (!validator) throw new Error('Schema validator not found.');
      if (!validator(value)) {
        this.diagnostics.error('PROPS_INVALID', location, ajv.errorsText(validator.errors));
        return false;
      }
      return true;
    } catch (error) {
      this.diagnostics.error(
        'SCHEMA_CHECK_UNPROVEN',
        location,
        `Cannot validate static value: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
  resources(): Record<string, JsonSchema> {
    return Object.fromEntries(
      [...this.usedResources].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
}
