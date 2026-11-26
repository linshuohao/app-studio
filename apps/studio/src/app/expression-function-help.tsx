import { CodeBlock } from '../components/code-block';
import type { FunctionParameter, PureFunctionManifest } from '@form-engine/protocol/capability';
import { ContractTable, schemaLabel, schemaRules } from '../components/catalog/contract-reference';
import type { FunctionDocumentation } from './function-catalog';

export function FunctionHelp({
  manifest,
  documentation,
}: {
  manifest: PureFunctionManifest;
  documentation?: FunctionDocumentation;
}) {
  const summary = documentation?.summary || documentation?.description;
  const result = documentation?.annotations?.['/returns'];
  const examples = documentation?.callExamples ?? [];
  const description = documentation?.description;
  return (
    <aside className="expression-function-help" aria-label="函数说明">
      {documentation?.title && <strong>{documentation.title}</strong>}
      {summary && <p>{summary}</p>}
      {(manifest.parameters.length > 0 || manifest.restParameter) && (
        <p className="expression-helper">
          随表单变化的值可选择字段或表达式。固定阈值和规则可用常量。
        </p>
      )}
      <p>
        <span>返回 </span>
        <code>{schemaLabel(manifest.returns)}</code>
        {result && result !== summary && ' · ' + result}
      </p>
      {((description && description !== summary) || examples.length > 0) && (
        <details>
          <summary>{examples.length > 0 ? '查看函数详情与调用示例' : '查看函数详情'}</summary>
          {description && description !== summary && <p>{description}</p>}
          {examples.map(({ args, result, description }, index) => (
            <div className="expression-function-example" key={index}>
              <p>{description}</p>
              <CodeBlock language="json" source={JSON.stringify(args, null, 2)} />
              <p>
                返回 <code>{JSON.stringify(result)}</code>
              </p>
            </div>
          ))}
        </details>
      )}
    </aside>
  );
}

export type ParameterHelp = {
  parameter: FunctionParameter;
  pointer: string;
  annotations: Record<string, string> | undefined;
};

export function getParameterHelp(
  manifest: PureFunctionManifest | undefined,
  doc: FunctionDocumentation | undefined,
  index: number,
): ParameterHelp | undefined {
  if (!manifest) return;
  const parameter = manifest.parameters[index] ?? manifest.restParameter;
  if (parameter)
    return {
      parameter,
      pointer: index < manifest.parameters.length ? '/parameters/' + index : '/restParameter',
      annotations: doc?.annotations,
    };
}

export function parameterTitle(
  help: ParameterHelp | undefined,
  documentation?: FunctionDocumentation,
) {
  const name = help?.parameter.name;
  if (!name) return undefined;
  const label = documentation?.parameterLabels?.[name]?.trim();
  if (label) return label;
  if (/^arg\d+$/.test(name)) return undefined;
  const words = name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function parameterMeaning({ parameter, pointer, annotations }: ParameterHelp) {
  return (
    annotations?.[pointer] ??
    (typeof parameter.schema === 'object' && typeof parameter.schema.description === 'string'
      ? parameter.schema.description
      : undefined)
  );
}

export function ArgumentHelp({ help }: { help: ParameterHelp }) {
  const { parameter, pointer, annotations } = help;
  const { schema } = parameter;
  const rules = schemaRules(schema);
  const meaning = parameterMeaning(help);
  const structured =
    typeof schema === 'object' &&
    (schema.type === 'array' ||
      schema.type === 'object' ||
      Array.isArray(schema.anyOf) ||
      schema.properties !== undefined ||
      schema.items !== undefined ||
      schema.$ref !== undefined ||
      schema.oneOf !== undefined ||
      schema.allOf !== undefined);
  return (
    <div className="expression-argument-help" aria-label={parameter.name + ' 参数说明'}>
      <p>
        {pointer === '/restParameter' ? '变长参数' : parameter.optional ? '选填' : '必填'}
        {' · '}
        <code>{schemaLabel(schema)}</code>
        {rules && typeof schema !== 'boolean' && ' · ' + rules}
      </p>
      {meaning && <p>{meaning}</p>}
      {structured && (
        <details>
          <summary>查看值结构与约束</summary>
          <ContractTable
            schema={schema}
            pointer={pointer + '/schema'}
            annotations={annotations ?? {}}
            rootLabel={parameter.name}
          />
          <details>
            <summary>查看 Schema JSON</summary>
            <CodeBlock language="json" source={JSON.stringify(schema, null, 2)} />
          </details>
        </details>
      )}
    </div>
  );
}
