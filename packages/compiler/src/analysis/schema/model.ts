import type { JsonSchema, JsonValue } from '@form-engine/protocol';
import { at } from '../../common/pointer.js';
import { own, record } from '../../common/object.js';
import { Diagnostics } from '../../diagnostics/collector.js';
import { canonicalJson } from '../../common/json.js';
import type { SchemaDocument as Document, SchemaNode, Connection } from './types.js';
import { mapKeywords, arrayKeywords, singleKeywords } from './keywords.js';
import { connectSchemas } from './connection.js';
import { validateStaticValue } from './validation.js';

// 无 $id 的根模型也需要稳定基址解析相对引用；这个 URI 仅作身份，绝不发起请求。
const virtualRoot = 'https://form-engine.invalid/schema/root';
const supportedPointer = /^(?:\/(?:[^~/]|~[01])*)*$/;

/**
 * 单次编译的 Schema 资源 / 引用环境，供 Binding 连接和静态 Props 校验共用。
 * 这里处理的是 JSON Schema 的 $ref，不是运行时数据订阅或 Scope 实例绑定。
 * 资源索引、形状证明和 Ajv 值校验分别负责不同问题，后两者委托独立模块。
 */
export class SchemaModel {
  // 检索 URI 与声明 $id 可指向同一资源；不能将同一资源误当成两份注册。
  private readonly documents = new Map<string, Document>();
  // 声明索引与引用扫描分开去重：先让前向 $id 可见，再沿 $ref 检查完整性。
  private readonly indexed = new Set<string>();
  private readonly schemaLocations = new Set<string>();
  private readonly resourceAliases = new Map<string, { key: string; schema: JsonSchema }>();
  private readonly visited = new Set<string>();
  // 只记录扫描实际引用到的外部资源，输出时不复制整个输入资源字典。
  private readonly usedResources = new Map<string, JsonSchema>();
  private operations = 0;
  private localFieldChecks?: boolean;
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
  /** 同一 URI 可重复声明相同内容；内容冲突必须报告，不能按遍历顺序覆盖。 */
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
  /** 为数据模型 / 物料端口建立资源根，pointer 保留其在源配置中的位置。 */
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
  /** 嵌套 $id 开启新的资源基址；后续相对 $ref 必须从这里重新解析。 */
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
  /** 按 Schema 声明位置取子模型，保留资源基址；不要求父容器只能有一个 type。 */
  child(node: SchemaNode, key: string, schema: JsonSchema): SchemaNode {
    return { schema, document: node.document, pointer: at(node.pointer, key) };
  }
  /** 只走 Schema 关键字，default / examples 内的普通业务对象不当作子 Schema。 */
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
    // 先收集全部资源声明，后续 scan 才跟随引用，允许引用写在目标 $id 之前。
    for (const child of this.children(node)) this.index(child);
  }
  /** 从固定内存资源解析 URI + JSON Pointer；缺失即诊断，不联网补齐。 */
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
    // 引用即使落到外部资源的嵌套 $id，也要把包含它的原资源带入输出闭包。
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
      // Pointer 途中只有真实 Schema 位置才切换 $id 基址，字典容器里的同名键不切换。
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
  /** 检查引用完整性并收集外部资源闭包；允许递归资源，用身份去重避免无限展开。 */
  scan(input: SchemaNode, depth = 0): void {
    if (++this.operations > 20_000 || depth > 128) {
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
      if (next) this.scan(next, depth + 1);
    }
    for (const child of this.children(node)) this.scan(child, depth + 1);
  }
  /** 为形状分析跟随纯引用；递归链或带兄弟断言的组合返回无法证明。 */
  dereference(input: SchemaNode): SchemaNode | undefined {
    let node = this.enter(input);
    const seen = new Set<string>();
    while (record(node.schema) && typeof node.schema.$ref === 'string') {
      const key = node.document.uri + '#' + node.pointer;
      if (seen.has(key)) return undefined;
      seen.add(key);
      // 如 {$ref: '...', type: 'string'} 不能只看 $ref，否则会丢失兄弟断言。
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
  /**
   * 例如数据路径 /user/name → 数据 Schema 的 properties.user.properties.name。
   * 这里只投影声明形状，不读取运行时数据、不把数组索引绑定成真实 Scope ID。
   */
  dataReference(path: string, location: string): SchemaNode | undefined {
    return this.project(this.root, path, location);
  }
  /** 在任意声明模型上复用同一条路径投影逻辑，供 Scope、Event 和根数据共用。 */
  project(root: SchemaNode, path: string, location: string): SchemaNode | undefined {
    let node: SchemaNode | undefined = root;
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
        // 开放对象允许这个键出现，但未声明其形状，不能据此放行有类型要求的连接。
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
  /** 模板 schemaRef 指向声明模型，不是运行时数据路径。 */
  schemaReference(reference: string, location: string): SchemaNode | undefined {
    const node = this.resolveRef(this.root, reference);
    if (!node)
      this.diagnostics.error(
        'SCHEMA_REFERENCE_NOT_FOUND',
        location,
        `Unknown schema ${reference}.`,
      );
    return node;
  }
  arrayItem(input: SchemaNode, location: string): SchemaNode | undefined {
    const node = this.dereference(input);
    if (!node || !record(node.schema) || node.schema.type !== 'array' || node.schema.prefixItems) {
      this.diagnostics.error(
        'ARRAY_MODEL_UNPROVEN',
        location,
        'Expected a definite homogeneous array model.',
      );
      return undefined;
    }
    return this.child(node, 'items', (node.schema.items ?? true) as JsonSchema);
  }
  /** 组合模型引用原资源位置，保留相对 $ref 的原基址，不复制未知模型内容。 */
  referenceSchema(node: SchemaNode): JsonSchema {
    return { $ref: node.document.uri + (node.pointer ? '#' + node.pointer : '') };
  }
  /**
   * 仅在根模型全部为字段局部断言时缩小字段资格的观察范围。
   * 条件 / 组合 / 集合数量等无法局部证明的规则保守回退根域，不拆分根 Schema 校验器。
   */
  fieldChecksAreLocal(): boolean {
    if (this.localFieldChecks !== undefined) return this.localFieldChecks;
    const seen = new Set<string>();
    const local = new Set([
      '$id',
      '$ref',
      '$schema',
      '$comment',
      '$defs',
      'definitions',
      'title',
      'description',
      'default',
      'examples',
      'deprecated',
      'readOnly',
      'writeOnly',
      'type',
      'properties',
      'required',
      'additionalProperties',
      'items',
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'multipleOf',
      'minLength',
      'maxLength',
      'pattern',
      'format',
      'const',
      'enum',
    ]);
    const visit = (input: SchemaNode, depth = 0): boolean => {
      if (depth > 128) return false;
      const node = this.enter(input);
      const key = node.document.uri + '#' + node.pointer;
      if (seen.has(key)) return true;
      seen.add(key);
      if (!record(node.schema)) return true;
      if (Object.keys(node.schema).some((keyword) => !local.has(keyword))) return false;
      const constants = Object.prototype.hasOwnProperty.call(node.schema, 'const')
        ? [node.schema.const]
        : node.schema.enum;
      if (
        Array.isArray(constants) &&
        constants.some((value) => value !== null && typeof value === 'object')
      )
        return false;
      if (typeof node.schema.$ref === 'string') {
        const target = this.resolveRef(node, node.schema.$ref);
        if (!target || !visit(target, depth + 1)) return false;
      }
      return this.children(node).every((child) => visit(child, depth + 1));
    };
    return (this.localFieldChecks = visit(this.root));
  }
  /** 检查来源形状能否连接到目标端口；不是检查某次输入值是否满足业务规则。 */
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
  /** 已知静态 Props 有具体值，可直接按 Manifest Schema 和当前 Ajv 配置做值校验。 */
  validateValue(
    node: SchemaNode,
    value: JsonValue,
    location: string,
    code = 'PROPS_INVALID',
    diagnostics = this.diagnostics,
  ): boolean {
    return validateStaticValue(
      node,
      value,
      location,
      {
        documents: this.documents,
        enter: (node) => this.enter(node),
        child: (node, key, schema) => this.child(node, key, schema),
      },
      diagnostics,
      code,
    );
  }
  /** 稳定输出已引用外部资源；根数据 Schema 和物料声明仍保留各自原有归属。 */
  resources(): Record<string, JsonSchema> {
    return Object.fromEntries(
      [...this.usedResources].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
}
