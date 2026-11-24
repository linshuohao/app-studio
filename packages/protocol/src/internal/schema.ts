import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import type { JsonSchema } from '../index.js';
import { canonicalJson } from './json.js';

/** 与 Compiler 一致的整体 Schema 基准 URI，只作资源身份，不会发起网络请求。 */
export const DATA_SCHEMA_BASE = 'https://form-engine.invalid/schema/root';
/**
 * 建立实例内同步 Schema 编译器，注册 Prepared 的闭合资源与检索别名。
 * 返回按 schema + 基准 URI 编译的函数；拒绝身份冲突 / 异步 Schema，默认只读校验。
 * 仅初始化专用实例启用 useDefaults，调用方需传入可变的自有数据副本。
 */
function schemaCompiler(
  resources: Readonly<Record<string, JsonSchema>>,
  strictTypes: boolean,
  useDefaults = false,
) {
  const ajv = new Ajv2020({
    strict: true,
    strictTypes,
    allowUnionTypes: true,
    strictRequired: false,
    validateFormats: false,
    ownProperties: true,
    allErrors: true,
    coerceTypes: false,
    useDefaults,
    removeAdditional: false,
  });
  // 相对 $id 必须相对所在资源 URI 解析，不能把检索别名误当成另一份独立 Schema。
  const normalize = (schema: JsonSchema, uri: string): { id: string; schema: JsonSchema } => {
    const id =
      typeof schema === 'object' && typeof schema.$id === 'string'
        ? ajv.opts.uriResolver.resolve(uri, schema.$id)
        : uri;
    return { id, schema: typeof schema === 'boolean' ? schema : { ...schema, $id: id } };
  };
  // documents 按规范身份去重，aliases 保留 Prepared 中的检索 URI → 规范身份关系。
  const documents = new Map<string, JsonSchema>(),
    aliases = new Map<string, string>();
  for (const [uri, schema] of Object.entries(resources)) {
    const normalized = normalize(schema, uri);
    if (
      documents.has(normalized.id) &&
      canonicalJson(documents.get(normalized.id)) !== canonicalJson(normalized.schema)
    )
      throw Error('schema: conflicting resource identity');
    if (!documents.has(normalized.id)) documents.set(normalized.id, normalized.schema);
    aliases.set(uri, normalized.id);
  }
  // 每份规范资源只注册一次，再将检索别名指向同一对象。
  for (const [id, schema] of documents) ajv.addSchema(schema, id);
  for (const [alias, id] of aliases) if (alias !== id) ajv.addSchema(documents.get(id)!, alias);
  return (schema: JsonSchema, uri: string): ValidateFunction => {
    const document =
      typeof schema === 'boolean'
        ? schema
        : {
            ...schema,
            $id:
              typeof schema.$id === 'string' ? ajv.opts.uriResolver.resolve(uri, schema.$id) : uri,
          };
    const existing =
      typeof document === 'object' ? ajv.getSchema(document.$id as string) : undefined;
    if (existing && canonicalJson(existing.schema) !== canonicalJson(document))
      throw Error('schema: conflicting root identity');
    const validator = existing ?? ajv.compile(document);
    if ('$async' in validator && validator.$async)
      throw Error('schema: asynchronous validators are unsupported');
    return validator;
  };
}

export function createSchemaCompiler(resources: Readonly<Record<string, JsonSchema>>) {
  return schemaCompiler(resources, true);
}

/** JSON Schema applies numeric keywords only to numbers. Conditional branches can
 * refine a field whose type is already constrained elsewhere in the document. */
export function compileDataSchema(
  schema: JsonSchema,
  resources: Readonly<Record<string, JsonSchema>>,
) {
  return schemaCompiler(resources, false)(schema, DATA_SCHEMA_BASE);
}

/**
 * Fill missing data positions from JSON Schema defaults without replacing explicit values.
 * Run this against an owned mutable copy; validation results are intentionally ignored because
 * initialization must preserve temporarily invalid Working Data.
 */
export function applyDataSchemaDefaults(
  data: unknown,
  schema: JsonSchema,
  resources: Readonly<Record<string, JsonSchema>>,
): void {
  const applyDefaults = schemaCompiler(resources, false, true)(schema, DATA_SCHEMA_BASE);
  applyDefaults(data);
}
