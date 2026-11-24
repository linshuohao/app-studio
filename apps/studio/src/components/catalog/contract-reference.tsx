import type { ReactNode } from 'react';

export type Schema = boolean | { type?: string | string[]; [key: string]: unknown };
export function schemaLabel(schema: Schema): string {
  if (schema === true) return 'JSON';
  if (schema === false) return '不接受任何值';
  if (Array.isArray(schema.anyOf)) return (schema.anyOf as Schema[]).map(schemaLabel).join(' | ');
  const type = schema.type;
  return Array.isArray(type) ? type.join(' | ') : (type ?? '见完整契约');
}

export function schemaRules(schema: Schema) {
  if (typeof schema === 'boolean') return schema ? '任意 JSON' : '禁止';
  const labels: Record<string, string> = {
    enum: '可选值',
    const: '固定值',
    minimum: '最小值',
    maximum: '最大值',
    exclusiveMinimum: '大于',
    exclusiveMaximum: '小于',
    multipleOf: '倍数',
    format: '格式',
    minLength: '最短长度',
    maxLength: '最长长度',
    minItems: '最少项数',
    maxItems: '最多项数',
    pattern: '匹配模式',
  };
  return Object.entries(labels)
    .filter(([key]) => schema[key] !== undefined)
    .map(([key, label]) => `${label}：${JSON.stringify(schema[key])}`)
    .concat(schema.additionalProperties === false ? ['不接受额外字段'] : [])
    .join('；');
}

export function schemaType(schema: Schema, depth = 0): string {
  if (schema === true) return 'JsonValue';
  if (schema === false) return 'never';
  if (Array.isArray(schema.enum))
    return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (Array.isArray(schema.anyOf))
    return (schema.anyOf as Schema[]).map((value) => schemaType(value, depth)).join(' | ');
  if (schema.type === 'object' && schema.properties) {
    const indent = '    '.repeat(depth);
    return `{\n${Object.entries(schema.properties as Record<string, Schema>)
      .map(
        ([key, value]) =>
          `${indent}    ${/^[a-zA-Z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}${((schema.required ?? []) as string[]).includes(key) ? '' : '?'}: ${schemaType(value, depth + 1)};`,
      )
      .join('\n')}\n${indent}}`;
  }
  if (schema.type === 'array')
    return `Array<${schema.items ? schemaType(schema.items as Schema, depth) : 'JsonValue'}>`;
  if (schema.type === 'object') return 'Record<string, JsonValue>';
  const types = Array.isArray(schema.type) ? schema.type : [schema.type ?? 'JsonValue'];
  return types
    .map((type) =>
      type === 'integer'
        ? 'number'
        : type === 'array'
          ? 'Array<JsonValue>'
          : type === 'object'
            ? 'Record<string, JsonValue>'
            : type,
    )
    .join(' | ');
}

export function ContractTable({
  schema,
  pointer,
  annotations,
  rootLabel = '值',
  rootConstraint = '',
}: {
  rootLabel?: string;
  rootConstraint?: string;
  schema: Schema;
  pointer: string;
  annotations: Record<string, string>;
}) {
  const rows: { path: string; pointer: string; schema: Schema; required: boolean }[] = [];
  function walk(value: Schema, at: string, path: string, required: boolean) {
    if (path !== '$' || typeof value === 'boolean' || !value.properties)
      rows.push({ path, pointer: at, schema: value, required });
    if (typeof value === 'boolean') return;
    if (Array.isArray(value.anyOf)) {
      (value.anyOf as Schema[]).forEach((branch, index) => {
        if (typeof branch !== 'object') return;
        for (const [key, child] of Object.entries(
          (branch.properties ?? {}) as Record<string, Schema>,
        ))
          walk(
            child,
            `${at}/anyOf/${index}/properties/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
            path === '$' ? key : `${path}.${key}`,
            ((branch.required ?? []) as string[]).includes(key),
          );
      });
    }
    for (const [key, child] of Object.entries((value.properties ?? {}) as Record<string, Schema>)) {
      walk(
        child,
        `${at}/properties/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
        path === '$' ? key : `${path}.${key}`,
        ((value.required ?? []) as string[]).includes(key),
      );
    }
    if (value.items && !Array.isArray(value.items)) {
      const item = value.items as Schema;
      if (typeof item === 'object' && item.properties) {
        for (const [key, child] of Object.entries(item.properties as Record<string, Schema>))
          walk(
            child,
            `${at}/items/properties/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
            `${path}[].${key}`,
            ((item.required ?? []) as string[]).includes(key),
          );
      } else walk(item, `${at}/items`, `${path}[]`, true);
    }
  }
  walk(schema, pointer, '$', true);
  return (
    <div className="table-scroll">
      <p className="muted">
        数据类型：{schemaLabel(schema)}
        {typeof schema === 'object' && schema.properties ? '，包含以下字段。' : ''}
      </p>
      <table className="catalog-properties">
        <thead>
          <tr>
            <th>字段</th>
            <th>含义</th>
            <th>类型</th>
            <th>约束</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pointer}>
              <td>
                <code title={row.path === '$' ? rootLabel : row.path}>
                  {(row.path === '$' ? rootLabel : row.path).split('.').map((part, index) => (
                    <span key={index}>
                      {index > 0 && (
                        <>
                          .<wbr />
                        </>
                      )}
                      {part}
                    </span>
                  ))}
                </code>
              </td>
              <td>
                {annotations[row.pointer] ??
                  (typeof row.schema === 'object' && typeof row.schema.description === 'string'
                    ? row.schema.description
                    : row.path === '$'
                      ? '此处直接传入的值'
                      : row.path.endsWith('[]')
                        ? '数组中的单个元素'
                        : '暂未提供字段说明')}
              </td>
              <td>{schemaLabel(row.schema)}</td>
              <td>
                {[
                  row.path === '$'
                    ? rootConstraint
                    : row.required
                      ? row.pointer.includes('/anyOf/')
                        ? '对象分支内必填'
                        : '必填'
                      : '选填',
                  schemaRules(row.schema),
                ]
                  .filter(Boolean)
                  .join('；') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContractPanel({
  title,
  typeName,
  schema,
  pointer,
  annotations,
  description,
  headingAction,
  showType = true,
}: {
  title: string;
  typeName: string;
  schema: Schema;
  pointer: string;
  annotations: Record<string, string>;
  description?: string;
  headingAction?: ReactNode;
  showType?: boolean;
}) {
  return (
    <section className="contract-panel" aria-label={title}>
      {headingAction ? (
        <div className="material-title-with-info">
          <h3>{title}</h3>
          {headingAction}
        </div>
      ) : (
        <h3>{title}</h3>
      )}
      {description && <p className="muted">{description}</p>}
      {showType && (
        <pre className="contract-type">
          <code>{`type ${typeName} = ${schemaType(schema)}`}</code>
        </pre>
      )}
      <ContractTable
        schema={schema}
        pointer={pointer}
        annotations={annotations}
        rootLabel={title === '返回值' ? '返回值' : '值'}
      />
    </section>
  );
}
