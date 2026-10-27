import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import type { JsonSchema } from '@form-engine/protocol';
import { canonical } from '../material/json.js';
/** 每个视图装配一次闭合资源；调用只运行已编译检查器，不联网补引用。 */
export class RequestContracts {
  /** 资源键到同步检查器的只读装配结果，随所属视图环境释放，不记录校验调用状态。 */
  readonly #validators = new Map<string, ValidateFunction>();
  constructor(compiledForm: PreparedForm) {
    if (!Object.keys(compiledForm.resources.requestSchemas).length) return;
    const ajv = new Ajv2020({
      strict: true,
      allowUnionTypes: true,
      strictRequired: false,
      validateFormats: false,
      ownProperties: true,
      allErrors: true,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    });
    const documents = new Map<string, JsonSchema>();
    const aliases = new Map<string, string>();
    const resources = { ...compiledForm.resources.schemas };
    for (const [key, schema] of Object.entries(compiledForm.resources.requestSchemas)) {
      resources[`https://form-engine.invalid/renderer/request/${encodeURIComponent(key)}`] = schema;
    }
    for (const [uri, schema] of Object.entries(resources)) {
      const id =
        typeof schema === 'object' && typeof schema.$id === 'string'
          ? ajv.opts.uriResolver.resolve(uri, schema.$id)
          : uri;
      const normalized = typeof schema === 'boolean' ? schema : { ...schema, $id: id };
      if (documents.has(id) && canonical(documents.get(id)) !== canonical(normalized))
        throw Error('Request resource identity conflict');
      documents.set(id, normalized);
      aliases.set(uri, id);
    }
    for (const [id, schema] of documents) ajv.addSchema(schema, id);
    for (const [alias, id] of aliases) if (alias !== id) ajv.addSchema(documents.get(id)!, alias);
    for (const key of Object.keys(compiledForm.resources.requestSchemas)) {
      const validate = ajv.getSchema(
        `https://form-engine.invalid/renderer/request/${encodeURIComponent(key)}`,
      )!;
      if (!validate || ('$async' in validate && validate.$async))
        throw Error('Invalid or asynchronous request Schema');
      this.#validators.set(key, validate);
    }
  }
  /** 检查一次请求边界值；reference 指向 requestSchemas，不是 Working Data Pointer。 */
  valid(reference: string, value: unknown): boolean {
    const prefix = '/resources/requestSchemas/';
    const pointer = decodeURIComponent(reference.slice(1));
    if (!reference.startsWith('#/') || !pointer.startsWith(prefix))
      throw Error('Invalid request Schema reference');
    const key = pointer.slice(prefix.length).replace(/~1/g, '/').replace(/~0/g, '~');
    const validate = this.#validators.get(key);
    if (!validate) throw Error('Missing request Schema');
    return validate(value) === true;
  }
}
