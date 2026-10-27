import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import type { PreparedForm } from '../prepared/form.js';
import schema from '../../schemas/prepared-form.schema.json' with { type: 'json' };
import { captureJson } from './json.js';

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  strictRequired: false,
  validateFormats: false,
  ownProperties: true,
});
const validate = ajv.compile(schema);
/** 弱身份只存在于本模块，不写入产物，也不接受调用方自报的 trusted / frozen 标记。 */
const validated = new WeakSet<object>();

/** 保留本次结构错误；不能直接持有 Ajv 下一次调用会覆盖的 errors 属性。 */
export class PreparedStructureError extends Error {
  constructor(readonly errors: readonly ErrorObject[]) {
    super(ajv.errorsText(errors as ErrorObject[]));
  }
}
/** 仅识别此入口已成功检查并持有的不可变产物，普通深冻结或反序列化对象仍需检查。 */
export function isCapturedPreparedForm(input: unknown): input is PreparedForm {
  return input !== null && typeof input === 'object' && validated.has(input);
}
/**
 * 引擎内部的制品接收边界：复制纯 JSON、递归冻结、检查协议结构，然后登记弱身份。
 * Compiler / Runtime 共用此入口，外部原对象不被冻结；JSON 交付不携带进程内凭据。
 * 只证明结构有效，格式、实际能力与执行兼容仍由具体消费者核对。
 */
export function capturePreparedForm(input: unknown): PreparedForm {
  if (isCapturedPreparedForm(input)) return input;
  const captured = captureJson(input);
  if (!validate(captured)) throw new PreparedStructureError([...(validate.errors ?? [])]);
  validated.add(captured as object);
  return captured as unknown as PreparedForm;
}
