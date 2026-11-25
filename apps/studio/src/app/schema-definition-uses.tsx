import { Button } from '@form-engine/studio-design-components';
import type { DataSchemaModel } from './data-schema-model';

function usageLabel(path: string, model: DataSchemaModel) {
  const parts = path
    .slice(1)
    .split('/')
    .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (parts[0] === 'viewTemplates' && parts[2] === 'params' && parts[4] === 'schemaRef')
    return `模板「${parts[1]}」的参数「${parts[3]}」`;
  if (parts[0] === 'validationMessages') return `第 ${Number(parts[1]) + 1} 条校验文案`;

  const item = model.nodes.find((entry) => entry.node.path === path);
  if (!item) return `模型约束「${parts.at(-1)}」`;
  const names: string[] = [];
  let ancestor = item.owner;
  while (ancestor) {
    const parent = model.nodes.find((entry) => entry.node.path === ancestor);
    if (!parent || parent.role === 'root') break;
    names.unshift(parent.label);
    ancestor = parent.owner;
  }
  if (item.node.key === 'items' && item.role === 'items')
    return names.length ? `数组「${names.join(' › ')}」的元素` : '根数组的元素';
  names.push(item.label);
  const kind =
    item.role === 'definition' ? '共享定义' : item.role === 'field' ? '字段' : '模型节点';
  return `${kind}「${names.join(' › ')}」`;
}

export function SchemaDefinitionUses({
  model,
  path,
  locate,
}: {
  model: DataSchemaModel;
  path: string;
  locate: (path: string) => void;
}) {
  const definition = model.definitions.find(
    ({ node }) => path === node.path || path.startsWith(node.path + '/'),
  );
  if (!definition) return null;
  const { paths, unknown } = model.impacts(path);
  return (
    <section aria-label="共享定义使用位置">
      <details>
        <summary>
          共享定义「{definition.label}」 · 已知影响 {paths.length} 处
        </summary>
        {paths.map((usage) => (
          <div key={usage}>
            <Button variant="text" onClick={() => locate(usage)}>
              {usageLabel(usage, model)}
            </Button>
            <div>
              <small>{usage}</small>
            </div>
          </div>
        ))}
        {!unknown && !paths.length && <p>当前配置中未找到使用位置。</p>}
      </details>
      {unknown && <p>存在无法静态确认的引用，请在 JSON 中检查其作用域。</p>}
    </section>
  );
}
