import type { JsonSchema, JsonValue } from '@form-engine/protocol';
import { at } from '../../common/pointer.js';
import { own, record } from '../../common/object.js';
import { canonicalJson } from '../../common/json.js';
import type { SchemaNode, Connection } from './types.js';

interface SchemaConnectionContext {
  dereference: (node: SchemaNode) => SchemaNode | undefined;
  child: (node: SchemaNode, key: string, schema: JsonSchema) => SchemaNode;
}

/**
 * 保守证明来源结构能否交给目标端口：string → string 可证明，number → string 不兼容。
 * compatible / incompatible / unproven 分开，复杂组合不猜测放行。
 * 只处理当前结构子集，不是完整 JSON Schema 包含关系求解器；业务范围由运行时校验。
 */
export function connectSchemas(
  sourceInput: SchemaNode,
  targetInput: SchemaNode,
  context: SchemaConnectionContext,
  depth = 0,
): Connection {
  const result = (kind: Connection['kind'], reason: string): Connection => ({ kind, reason });
  if (depth > 64) return result('unproven', 'Type proof depth exceeded.');
  // 同一资源内同一位置无需重复推导；递归资源也不会因无限展开失去这个身份。
  if (
    sourceInput.document.uri === targetInput.document.uri &&
    sourceInput.pointer === targetInput.pointer
  )
    return result('compatible', 'Same schema identity.');
  const source = context.dereference(sourceInput),
    target = context.dereference(targetInput);
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
    !srcTypes.every((t) => dstTypes.includes(t) || (t === 'integer' && dstTypes.includes('number')))
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
      const next = connectSchemas(
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
        context,
        depth + 1,
      );
      if (next.kind !== 'compatible') return next;
    }
    // 来源未声明目标属性时，还要检查开放字典可能提供的值，不能直接跳过该属性。
    for (const [key, schema] of Object.entries(bp)) {
      if (own(ap, key) || a.additionalProperties === false) continue;
      const next = connectSchemas(
        context.child(
          source,
          'additionalProperties',
          (a.additionalProperties ?? true) as JsonSchema,
        ),
        {
          schema: schema as JsonSchema,
          document: target.document,
          pointer: at(at(target.pointer, 'properties'), key),
        },
        context,
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
    return connectSchemas(
      context.child(source, 'items', (a.items ?? true) as JsonSchema),
      context.child(target, 'items', (b.items ?? true) as JsonSchema),
      context,
      depth + 1,
    );
  }
  return result(
    'compatible',
    'Structural types are compatible; business value restrictions are not write gates.',
  );
}
