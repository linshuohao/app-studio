import { Ajv2020 } from 'ajv/dist/2020.js';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import type { FunctionRegistry } from '@form-engine/pure-functions';
import preparedSchema from '@form-engine/protocol/schemas/prepared-form.schema.json' with { type: 'json' };
import commandSchema from '@form-engine/protocol/schemas/command.schema.json' with { type: 'json' };
import { ownJson, canonicalJson as canonical } from '../data/json.js';

/** 当前 Runtime 可装载的编译产物格式；不是业务定义版本或引擎发布版本。 */
export const SUPPORTED_PREPARED_FORMAT = 'form-engine.prepared/2';
/** 模块级复用协议结构校验器；这里只验证输入形状，不执行表单业务 Schema。 */
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  strictRequired: false,
  validateFormats: false,
  ownProperties: true,
});
/** 在读取能力锁等结构前验证 Prepared 的正式协议形状。 */
const validPrepared = ajv.compile(preparedSchema);
/** 每个叶 Command 执行前的结构门禁，batch 的递归与顺序由 Runtime 负责。 */
export const validCommand = ajv.compile(commandSchema);
/** 对纯 JSON 契约计算与 Compiler 一致的稳定摘要，核对函数签名是否匹配能力锁。 */
export function manifestDigest(value: unknown) {
  return `sha256:${bytesToHex(sha256(canonical(value)))}`;
}
/** 接管并冻结 Prepared，检查格式及所需函数的版本 / 契约摘要 / 制品身份，不执行规则。 */
export function loadPrepared(input: PreparedForm, functions: FunctionRegistry): PreparedForm {
  const prepared = ownJson(input) as unknown as PreparedForm;
  if (!validPrepared(prepared))
    throw Error(`load: invalid Prepared (${ajv.errorsText(validPrepared.errors)})`);
  if (prepared.preparedFormatVersion !== SUPPORTED_PREPARED_FORMAT)
    throw Error('load: unsupported Prepared format');
  for (const [id, lock] of Object.entries(prepared.capabilityLock.pureFunctions)) {
    const binding = functions[id];
    if (
      !binding ||
      binding.manifest.id !== id ||
      binding.manifest.version !== lock.version ||
      manifestDigest(binding.manifest) !== lock.manifestDigest ||
      canonical(binding.artifact) !== canonical(lock.artifact)
    )
      throw Error(`load: incompatible function ${id}`);
  }
  return prepared;
}
