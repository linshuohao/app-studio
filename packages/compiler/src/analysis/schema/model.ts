import type { JsonSchema, JsonValue } from '@form-engine/protocol';
import { at } from '../../common/pointer.js';
import { own, record } from '../../common/object.js';
import { Diagnostics } from '../../diagnostics/collector.js';
import { canonicalJson } from '../../common/json.js';
import type { SchemaDocument as Document, SchemaNode, Connection } from './types.js';
import { mapKeywords, arrayKeywords, singleKeywords } from './keywords.js';
import { connectSchemas } from './connection.js';
import { validateStaticValue } from './validation.js';

const virtualRoot = 'https://form-engine.invalid/schema/root';
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
  connection(source: SchemaNode, target: SchemaNode, depth = 0): Connection {
    return connectSchemas(
      source,
      target,
      {
        dereference: (node) => this.dereference(node),
        child: (node, key, schema) => this.child(node, key, schema),
      },
      depth,
    );
  }
  validateValue(node: SchemaNode, value: JsonValue, location: string): boolean {
    return validateStaticValue(
      node,
      value,
      location,
      {
        documents: this.documents,
        enter: (node) => this.enter(node),
        child: (node, key, schema) => this.child(node, key, schema),
      },
      this.diagnostics,
    );
  }
  resources(): Record<string, JsonSchema> {
    return Object.fromEntries(
      [...this.usedResources].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
}
