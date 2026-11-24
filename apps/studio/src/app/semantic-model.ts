import { parseJson, type JsonNode } from '../components/json/model';
export type Item = {
  node: JsonNode;
  group: '数据字段' | '视图控件' | '校验与联动';
  title: string;
  subtitle: string;
  field?: string;
  required?: boolean;
  parent?: JsonNode;
};
export const child = (node: JsonNode | undefined, key: string) =>
  node?.children?.find((n) => n.key === key);
export const escapeKey = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
export function semanticModel(text: string) {
  const { root, tokens } = parseJson(text);
  const byPath = new Map<string, JsonNode>();
  const starts: number[] = [];
  let offset = 0;
  for (const token of tokens) {
    offset = text.indexOf(token, offset);
    starts.push(offset);
    offset += token.length;
  }
  const items: Item[] = [];
  const ambiguous = new Set<string>();
  const references = new Map<string, string[]>();
  function visit(node: JsonNode, unsafe = false) {
    byPath.set(node.path, node);
    if (unsafe) ambiguous.add(node.path);
    const names = new Set<string>(),
      duplicates = new Set<string>();
    for (const n of node.children ?? []) {
      if (names.has(n.key!)) duplicates.add(n.key!);
      names.add(n.key!);
    }
    for (const n of node.children ?? []) visit(n, unsafe || duplicates.has(n.key!));
  }
  visit(root);
  function raw(n: JsonNode) {
    return text.slice(starts[n.start], starts[n.end - 1] + tokens[n.end - 1].length);
  }
  function str(n?: JsonNode): string | undefined {
    return n?.kind === 'string' ? JSON.parse(tokens[n.start]) : undefined;
  }
  function track(n: JsonNode) {
    if (n.key === 'literal' || n.key === '$literal') return;
    const path = str(child(n, 'path'));
    if (str(child(n, 'source')) === 'data' && !child(n, 'scope') && path !== undefined) {
      const locations = references.get(path) ?? [];
      locations.push(n.path);
      references.set(path, locations);
    }
    for (const c of n.children ?? []) track(c);
  }
  const schema = child(child(root, 'data'), 'schema');
  function fields(s: JsonNode | undefined, base: string) {
    const props = child(s, 'properties');
    if (props?.kind !== 'object') return;
    const required = child(s, 'required')?.children?.map(str) ?? [];
    for (const node of props.children ?? []) {
      const field = base + '/' + escapeKey(node.key!);
      items.push({
        node,
        group: '数据字段',
        title: node.key!,
        subtitle: str(child(node, 'type')) ?? '复合类型',
        field,
        required: required.includes(node.key),
      });
      fields(node, field);
    }
  }
  fields(schema, '');
  function view(node: JsonNode, label: string, parent?: JsonNode) {
    const material = str(child(node, 'material'));
    items.push({
      node,
      parent,
      group: '视图控件',
      title:
        str(child(child(node, 'props'), 'label')) ??
        str(child(child(node, 'props'), 'title')) ??
        material ??
        str(child(node, '$use')) ??
        '作用域节点',
      subtitle: label,
    });
    for (const key of ['bindings', 'with', 'scope', 'on', 'requests']) {
      for (const entry of child(node, key)?.children ?? []) track(entry);
    }
    function trackProp(value: JsonNode) {
      if (child(value, '$literal')) return;
      const expression = child(value, '$expr');
      if (expression) track(expression);
      else for (const nested of value.children ?? []) trackProp(nested);
    }
    for (const prop of child(node, 'props')?.children ?? []) trackProp(prop);
    const scoped = child(node, 'node');
    if (scoped) view(scoped, label + ' / 作用域');
    const shorthand = child(node, 'children');
    if (shorthand?.kind === 'array' && !child(child(node, 'slots'), 'default'))
      shorthand.children?.forEach((n, i) => view(n, label + ' / default / ' + (i + 1)));
    for (const slot of child(node, 'slots')?.children ?? [])
      if (slot.kind === 'array')
        slot.children?.forEach((n, i) => view(n, label + ' / ' + slot.key + ' / ' + (i + 1), slot));
  }
  for (const n of child(root, 'views')?.children ?? []) {
    view(n, n.key!);
  }
  for (const t of child(root, 'viewTemplates')?.children ?? []) {
    const n = child(t, 'node');
    if (n) {
      view(n, '模板 / ' + t.key);
    }
  }
  for (const section of ['constraints', 'reactions'])
    for (const node of child(root, section)?.children ?? []) {
      items.push({
        node,
        group: '校验与联动',
        title: str(child(node, 'id')) ?? node.path,
        subtitle: section === 'constraints' ? '校验' : '联动',
      });
      track(node);
    }
  const expressions = child(root, 'expressions');
  if (expressions) track(expressions);
  function replace(n: JsonNode, value: string) {
    if (ambiguous.has(n.path)) throw Error('该路径存在重复属性，请在 JSON 中定位。');
    return (
      text.slice(0, starts[n.start]) +
      value +
      text.slice(starts[n.end - 1] + tokens[n.end - 1].length)
    );
  }
  function property(parent: JsonNode, key: string, value: string) {
    if (parent.kind !== 'object' || ambiguous.has(parent.path)) throw Error('无法唯一定位对象。');
    const n = child(parent, key);
    if (n) return replace(n, value);
    const at = starts[parent.end - 1];
    return (
      text.slice(0, at) +
      (parent.children?.length ? ',' : '') +
      JSON.stringify(key) +
      ':' +
      value +
      text.slice(at)
    );
  }
  function move(parent: JsonNode, node: JsonNode, direction: number) {
    const children = parent.children ?? [];
    const other = children[children.indexOf(node) + direction];
    if (!other || ambiguous.has(node.path)) throw Error('无法移动该控件。');
    const [a, b] = direction > 0 ? [node, other] : [other, node];
    const start = starts[a.start],
      end = starts[b.start] + raw(b).length;
    return (
      text.slice(0, start) +
      raw(b) +
      text.slice(start + raw(a).length, starts[b.start]) +
      raw(a) +
      text.slice(end)
    );
  }
  return { root, byPath, items, schema, ambiguous, references, raw, str, replace, property, move };
}
export type Model = ReturnType<typeof semanticModel>;
