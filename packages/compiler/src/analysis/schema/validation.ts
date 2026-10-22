import type { JsonSchema, JsonValue } from '@form-engine/protocol';
import { at } from '../../common/pointer.js';
import { record } from '../../common/object.js';
import { Diagnostics } from '../../diagnostics/collector.js';
import { createAjv } from '../../validation/structure.js';
import type { SchemaDocument as Document, SchemaNode } from './types.js';
import { mapKeywords, arrayKeywords, singleKeywords } from './keywords.js';

interface SchemaValidationContext {
  documents: ReadonlyMap<string, Document>;
  enter: (node: SchemaNode) => SchemaNode;
  child: (node: SchemaNode, key: string, schema: JsonSchema) => SchemaNode;
}

/**
 * 静态 Props 的值校验：委托 Ajv 执行 Schema 规则，不自行实现数值 / 长度等校验器。
 * 资源模型可能有嵌套 $id 和检索别名，先构造共享的临时资源视图再注册到 Ajv。
 * 临时视图仅供校验，不改写调用者 Schema 或最终 Prepared 中的资源。
 */
export function validateStaticValue(
  node: SchemaNode,
  value: JsonValue,
  location: string,
  context: SchemaValidationContext,
  diagnostics: Diagnostics,
): boolean {
  // 每个规范资源位置只复制一次，内联资源和单独注册的资源复用同一对象身份。
  function validatorSchema(
    input: SchemaNode,
    cache: Map<string, JsonSchema>,
    order: Document[],
  ): JsonSchema {
    const node = context.enter(input),
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
            validatorSchema(
              context.child(context.child(node, keyword, map), name, child as JsonSchema),
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
          validatorSchema(
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
        schema[keyword] = validatorSchema(
          context.child(node, keyword, child as JsonSchema),
          cache,
          order,
        );
    }
    // 子资源先注册；嵌套声明、外部传入和别名检索均复用相同的规范对象，避免重复 $id。
    if (!node.pointer) order.push(node.document);
    return schema;
  }

  const ajv = createAjv();
  try {
    const canonicalSchemas = new Map<string, JsonSchema>(),
      order: Document[] = [];
    for (const document of new Set(context.documents.values()))
      validatorSchema({ schema: document.schema, document, pointer: '' }, canonicalSchemas, order);
    for (const document of order)
      ajv.addSchema(canonicalSchemas.get(document.uri + '#')!, document.uri);
    // 检索地址与 $id 不同也必须可查，但不能改变该资源内部相对 $ref 的基址。
    for (const [alias, document] of context.documents)
      if (alias !== document.uri) ajv.addSchema(canonicalSchemas.get(document.uri + '#')!, alias);
    const validator = ajv.getSchema(node.document.uri + (node.pointer ? '#' + node.pointer : ''));
    if (!validator) throw new Error('Schema validator not found.');
    if (!validator(value)) {
      diagnostics.error('PROPS_INVALID', location, ajv.errorsText(validator.errors));
      return false;
    }
    return true;
  } catch (error) {
    diagnostics.error(
      'SCHEMA_CHECK_UNPROVEN',
      location,
      `Cannot validate static value: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}
