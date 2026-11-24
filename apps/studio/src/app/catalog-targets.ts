import { parseJson, type JsonNode } from '../components/json/model';
export type CatalogKind = 'materials' | 'functions';
export type Target = {
  node: JsonNode;
  append: boolean;
  named?: boolean;
  wrap?: boolean;
  label: string;
};
export function insertionContext(text: string, kind: CatalogKind) {
  const { tokens, root } = parseJson(text);
  if (root.kind !== 'object') throw Error('配置根节点应为对象。');
  const prop = (n: JsonNode | undefined, k: string) => n?.children?.find((c) => c.key === k);
  const targets: Target[] = [];
  const fields: { path: string; title?: string; type?: string }[] = [];
  function unambiguous(n: JsonNode) {
    if (n.kind === 'object' && new Set(n.children?.map((c) => c.key)).size !== n.children?.length)
      throw Error('配置含重复属性，请先消除歧义。');
    n.children?.forEach(unambiguous);
  }
  unambiguous(root);
  function schema(n: JsonNode | undefined, path: string) {
    for (const field of prop(n, 'properties')?.children ?? []) {
      const next = path + '/' + field.key!.replaceAll('~', '~0').replaceAll('/', '~1');
      const type = prop(field, 'type');
      const title = prop(field, 'title');
      const readString = (node?: JsonNode): string | undefined =>
        node?.kind === 'string' ? JSON.parse(tokens[node.start]) : undefined;
      fields.push({
        path: next,
        title: readString(title),
        type:
          type?.kind === 'array'
            ? type.children?.map(readString).filter(Boolean).join(' | ')
            : readString(type),
      });
      schema(field, next);
    }
  }
  schema(prop(prop(root, 'data'), 'schema'), '');
  function view(node: JsonNode, title: string) {
    if (node.kind !== 'object') return;
    if (kind === 'materials') targets.push({ node, append: false, label: '替换 · ' + title });
    if (prop(node, 'material')?.kind === 'string') {
      if (kind === 'functions')
        for (const p of prop(node, 'props')?.children ?? [])
          targets.push({
            node: p,
            append: false,
            wrap: true,
            label: '替换属性 · ' + title + ' / ' + p.key,
          });
      for (const slot of prop(node, 'slots')?.children ?? []) {
        if (slot.kind !== 'array') continue;
        const label = title + ' / ' + slot.key;
        if (kind === 'materials')
          targets.push({ node: slot, append: true, label: '追加到插槽 · ' + label });
        slot.children?.forEach((child, i) => view(child, label + ' / ' + (i + 1)));
      }
    } else if (prop(node, 'scope') && prop(node, 'node'))
      view(prop(node, 'node')!, title + ' / 作用域');
  }
  for (const node of prop(root, 'views')?.children ?? []) view(node, node.key!);
  if (kind === 'functions') {
    const expressions = prop(root, 'expressions');
    if (!expressions || expressions.kind === 'object')
      targets.push({
        node: expressions ?? root,
        named: true,
        append: true,
        label: '新增具名表达式',
      });
    for (const node of expressions?.kind === 'object' ? (expressions.children ?? []) : [])
      targets.push({ node, append: false, label: '替换表达式 · ' + node.key });
    for (const c of prop(root, 'constraints')?.children ?? []) {
      const assertion = prop(c, 'assert');
      if (assertion)
        targets.push({ node: assertion, append: false, label: '替换校验 · ' + assertion.path });
    }
  }
  return { fields, targets, tokens };
}
