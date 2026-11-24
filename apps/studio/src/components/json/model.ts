import { compactJson, jsonTokens } from './format';
export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
export type JsonNode = {
  start: number;
  end: number;
  key?: string;
  keyIndex?: number;
  path: string;
  kind: JsonKind;
  children?: JsonNode[];
};
export function parseJson(text: string) {
  const tokens = jsonTokens(text);
  let index = 0,
    count = 0;
  function node(depth: number, path: string, key?: string, keyIndex?: number): JsonNode {
    if (++count > 4000 || depth > 128)
      throw new RangeError('结构过大或层级过深，请使用文本模式查看。');
    const start = index,
      token = tokens[index++];
    const kind: JsonKind =
      token === '{'
        ? 'object'
        : token === '['
          ? 'array'
          : token.startsWith('"')
            ? 'string'
            : token === 'null'
              ? 'null'
              : ['true', 'false'].includes(token)
                ? 'boolean'
                : 'number';
    const result: JsonNode = { start, end: index, kind, key, keyIndex, path };
    if (kind === 'object' || kind === 'array') {
      result.children = [];
      while (tokens[index] !== (kind === 'object' ? '}' : ']')) {
        const keyIndex = kind === 'object' ? index : undefined;
        const key =
          kind === 'object'
            ? (JSON.parse(tokens[index++]) as string)
            : String(result.children.length);
        if (kind === 'object') index++;
        result.children.push(
          node(
            depth + 1,
            path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'),
            key,
            keyIndex,
          ),
        );
        if (tokens[index] === ',') index++;
      }
      index++;
      result.end = index;
    }
    return result;
  }
  return { tokens, root: node(0, '') };
}
export function valueToken(kind: JsonKind, value: string) {
  if (kind === 'string') return JSON.stringify(value);
  if (kind === 'object' || kind === 'array') {
    const text = compactJson(value);
    const parsed = JSON.parse(text);
    if (
      kind === 'array'
        ? !Array.isArray(parsed)
        : parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
    )
      throw new Error(kind === 'array' ? '请输入 JSON 数组。' : '请输入 JSON 对象。');
    return text;
  }
  if (kind === 'null') return 'null';
  if (kind === 'boolean' && ['true', 'false'].includes(value)) return value;
  if (kind === 'number' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))
    return value;
  throw new Error(
    kind === 'number' ? '请输入有效 JSON 数字，例如 12、-0 或 1.5e3。' : '请选择 true 或 false。',
  );
}
export function editNode(tokens: string[], node: JsonNode, value: string, key?: string) {
  const next = [...tokens];
  next.splice(node.start, node.end - node.start, value);
  if (node.keyIndex !== undefined && key !== undefined && key !== node.key)
    next[node.keyIndex] = JSON.stringify(key);
  const text = next.join('');
  JSON.parse(text);
  return text;
}
export function removeNode(tokens: string[], parent: JsonNode, node: JsonNode) {
  const next = [...tokens];
  let start = node.keyIndex ?? node.start,
    end = node.end;
  if (next[end] === ',') end++;
  else if (next[start - 1] === ',') start--;
  if (!parent.children?.includes(node)) throw new Error('节点已变化，请重试。');
  next.splice(start, end - start);
  return next.join('');
}
export function addNode(tokens: string[], parent: JsonNode, value: string, key: string) {
  if (!parent.children) throw new Error('请选择对象或数组。');
  if (parent.kind === 'object' && parent.children.some((child) => child.key === key))
    throw new Error('同名属性已存在。');
  const next = [...tokens];
  next.splice(
    parent.end - 1,
    0,
    (parent.children.length ? ',' : '') +
      (parent.kind === 'object' ? JSON.stringify(key) + ':' : '') +
      value,
  );
  const text = next.join('');
  JSON.parse(text);
  return text;
}
