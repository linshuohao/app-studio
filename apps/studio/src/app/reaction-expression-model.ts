import Ajv2020, { MissingRefError } from 'ajv/dist/2020';
import type { JsonSchema } from '@form-engine/protocol';
import type { Expression } from '@form-engine/protocol/definition';
import type { PureFunctionManifest } from '@form-engine/protocol/capability';
import valueSchema from '@form-engine/protocol/schemas/value-spec.schema.json';
import expressionSchema from '@form-engine/protocol/schemas/expression.schema.json';
import { possibleBinding } from './possible-binding';
import type { JsonNode } from '../components/json/model';
import { watchSchema, type ReactionField } from './reaction-fields';
import { child, semanticModel } from './semantic-model';

const ajv = new Ajv2020({ strict: false, validateFormats: false, addUsedSchema: false });
export const isExpression = ajv.compile<Expression>(expressionSchema);
const valueSpec = ajv.compile(valueSchema);

export type ReactionExpressionContext = {
  manifests: PureFunctionManifest[];
  fields: ReactionField[];
  expected?: JsonSchema;
  advisory?: boolean;
  named?: Record<string, Expression>;
};

export function expressionLiteral(raw: string): string {
  const value: unknown = JSON.parse(raw);
  return value !== null && typeof value === 'object' ? '{"literal":' + raw + '}' : raw;
}

// Convert only values with an equivalent single expression; preserve composite ValueSpec wrappers.
export function valueAsExpression(raw: string): string {
  const model = semanticModel(raw);
  if (model.ambiguous.size || !valueSpec(JSON.parse(raw)))
    throw Error('请先通过值 JSON 修复此值。');
  const expr = child(model.root, '$expr');
  if (expr) return model.raw(expr);
  const literal = child(model.root, '$literal');
  if (literal) return expressionLiteral(model.raw(literal));
  function wrapped(node: JsonNode): boolean {
    return !!child(node, '$expr') || !!child(node, '$literal') || !!node.children?.some(wrapped);
  }
  if (model.root.children?.some(wrapped))
    throw Error('这个值包含嵌套表达式或字面量包装，请在值 JSON 中编辑。');
  return expressionLiteral(raw);
}

export function readExpression(raw: string): Expression {
  const value: unknown = JSON.parse(raw);
  if (semanticModel(raw).ambiguous.size) throw Error('表达式有重复属性，请通过 JSON 修复。');
  if (!isExpression(value)) throw Error('表达式结构无效，请核对 ref、use、op / args 或 literal。');
  return value;
}

function schemaName(schema: unknown): string {
  if (schema && typeof schema === 'object' && 'type' in schema) {
    return Array.isArray(schema.type) ? schema.type.join(' / ') : String(schema.type);
  }
  return schema === false ? '无可用值' : 'JSON';
}

export { schemaName as expressionSchemaName };

// The real Compiler also resolves referenced schemas, named expressions and location-specific
// capabilities. These local checks give feedback while constructing a call, before that request.
export function checkReactionExpression(
  raw: string,
  context: ReactionExpressionContext,
): string | undefined {
  const ast = readExpression(raw);
  let warning: string | undefined;
  const activeNames = new Set<string>();
  let operations = 0;
  function check(value: Expression, expected: JsonSchema, label: string, advisory = false) {
    if (++operations > 20000 || activeNames.size > 128)
      throw Error('表达式依赖过深或过大，请使用工作台检查。');
    let source: unknown = true;
    if (value === null || typeof value !== 'object' || 'literal' in value) {
      const literal = value && typeof value === 'object' ? value.literal : value;
      if (!advisory) {
        try {
          if (!ajv.validate(expected, literal))
            throw Error(label + '的常量不符合参数或结果要求：' + ajv.errorsText(ajv.errors));
        } catch (error) {
          // A sub-schema can depend on the enclosing data document. The form check owns resolution.
          if (!(error instanceof MissingRefError)) throw error;
        }
        return;
      }
      source = {
        type:
          literal === null
            ? 'null'
            : Array.isArray(literal)
              ? 'array'
              : Number.isInteger(literal)
                ? 'integer'
                : typeof literal,
      };
    } else if ('ref' in value) {
      if (value.ref.source === 'event') throw Error(label + '在定义级联动中没有事件上下文。');
      if (
        activeNames.size &&
        (value.ref.source === 'validation' ||
          (value.ref.source === 'data' && value.ref.scope !== undefined))
      )
        throw Error('具名表达式不能引用成员或校验投影。');
      if (value.ref.source !== 'context') source = watchSchema(context.fields, value.ref);
    } else if ('use' in value) {
      if (context.named && !Object.hasOwn(context.named, value.use))
        throw Error('未定义的具名表达式：' + value.use);
      if (context.named) {
        if (activeNames.has(value.use)) throw Error('具名表达式循环引用：' + value.use);
        const body = context.named[value.use];
        if (!isExpression(body)) throw Error('具名表达式结构无效：' + value.use);
        activeNames.add(value.use);
        check(body, expected, label, advisory);
        activeNames.delete(value.use);
      }
      return;
    } else {
      const manifest = context.manifests.find((f) => f.id === value.op);
      if (!manifest) throw Error('当前目录没有函数 ' + value.op + '。');
      const required = manifest.parameters.filter((p) => !p.optional).length;
      if (
        value.args.length < required ||
        (!manifest.restParameter && value.args.length > manifest.parameters.length)
      ) {
        throw Error(value.op + ' 的参数数量与目录签名不符。');
      }
      value.args.forEach((arg, index) => {
        const parameter = manifest.parameters[index] ?? manifest.restParameter!;
        check(arg, parameter.schema, value.op + ' · ' + parameter.name);
      });
      source = manifest.returns;
    }
    // Complex or untyped branches may admit additional types; let Compiler prove those.
    if (
      expected === false ||
      (source !== null &&
        typeof source === 'object' &&
        'type' in source &&
        typeof expected === 'object' &&
        'type' in expected &&
        !possibleBinding({ type: expected.type }, { type: source.type }))
    ) {
      const message =
        label + '需要 ' + schemaName(expected) + '，当前结果为 ' + schemaName(source) + '。';
      if (!advisory) throw Error(message);
      warning = message;
    }
  }
  check(ast, context.expected ?? true, '此位置', context.advisory);
  return warning;
}

export function validateReactionExpression(raw: string, context: ReactionExpressionContext): void {
  checkReactionExpression(raw, context);
}

// ValueSpec recurses only at protocol-defined positions. Treat $literal as opaque even if its
// contents resemble a call, reference or nested $expr.
export function checkReactionValue(
  raw: string,
  context: ReactionExpressionContext,
): string | undefined {
  const model = semanticModel(raw);
  if (model.ambiguous.size) throw Error('值有重复属性，请通过 JSON 修复。');
  if (!valueSpec(JSON.parse(raw))) throw Error('值结构无效，请核对 $expr 或 $literal 包装。');
  let warning: string | undefined;
  function visit(node: JsonNode, expected: JsonSchema) {
    const expressionNode = child(node, '$expr');
    if (expressionNode) {
      const result = checkReactionExpression(model.raw(expressionNode), { ...context, expected });
      warning ??= result;
      return;
    }
    const literal = child(node, '$literal');
    const actual = literal ?? node;
    const type =
      actual.kind === 'number' && Number.isInteger(JSON.parse(model.raw(actual)))
        ? 'integer'
        : actual.kind;
    if (
      expected === false ||
      (typeof expected === 'object' &&
        expected.type &&
        !possibleBinding({ type: expected.type }, { type }))
    ) {
      warning ??=
        (node.path || '此位置') + '需要 ' + schemaName(expected) + '，当前结果为 ' + type + '。';
    }
    if (literal) return;
    const schema = typeof expected === 'object' ? expected : {};
    for (const nested of node.children ?? []) {
      const properties = schema.properties;
      const next =
        node.kind === 'array'
          ? schema.items
          : properties && typeof properties === 'object' && Object.hasOwn(properties, nested.key!)
            ? (properties as Record<string, JsonSchema>)[nested.key!]
            : undefined;
      visit(nested, (next as JsonSchema) ?? true);
    }
  }
  visit(model.root, context.expected ?? true);
  return warning;
}
