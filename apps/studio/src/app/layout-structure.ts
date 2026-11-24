import { jsonTokens } from '../components/json/format';
import type { JsonNode } from '../components/json/model';
import { ancestorBinders } from './layout-bindings';
import { child, escapeKey, type Model } from './semantic-model';

export {
  bindingCandidates,
  bindingCoverage,
  layoutFields,
  layoutFieldsLimited,
  type BindingCandidate,
  type LayoutField,
} from './layout-bindings';
export type LayoutPosition = { parent: string; slot: string; index: number };
type Slots = ReadonlyMap<string, readonly string[]>;
const inside = (node: string, parent: string) => node === parent || node.startsWith(parent + '/');
function viewRoot(m: Model, path: string) {
  return child(m.root, 'views')?.children?.find((root) => inside(path, root.path));
}
function viewOwner(m: Model, path: string) {
  return m.items.find((i) => i.group === '视图控件' && i.node.path === path);
}
function legalSlot(m: Model, parent: JsonNode, slot: string, slots: Slots) {
  const material = m.str(child(parent, 'material')),
    container = child(parent, 'slots');
  if (
    !material ||
    !slots.get(material)?.includes(slot) ||
    m.ambiguous.has(parent.path) ||
    m.ambiguous.has(parent.path + '/material')
  )
    return false;
  if (container && (container.kind !== 'object' || m.ambiguous.has(container.path))) return false;
  if (slot === 'default' && child(parent, 'children')) return false;
  const list = child(container, slot);
  return !list || (list.kind === 'array' && !m.ambiguous.has(list.path));
}
export function layoutPositions(m: Model, root: JsonNode, slots: Slots): LayoutPosition[] {
  const positions: LayoutPosition[] = [];
  for (const { node, group } of m.items) {
    if (group !== '视图控件' || !inside(node.path, root.path)) continue;
    for (const slot of slots.get(m.str(child(node, 'material')) ?? '') ?? []) {
      if (!legalSlot(m, node, slot, slots)) continue;
      const length = child(child(node, 'slots'), slot)?.children?.length ?? 0;
      for (let index = 0; index <= length; index++)
        positions.push({ parent: node.path, slot, index });
    }
  }
  return positions;
}
function target(m: Model, p: LayoutPosition, slots: Slots) {
  const parent = viewOwner(m, p.parent)?.node;
  if (!parent || !viewRoot(m, parent.path) || !legalSlot(m, parent, p.slot, slots))
    throw Error('目标容器没有可写的已声明插槽。');
  const container = child(parent, 'slots'),
    list = child(container, p.slot);
  if (!Number.isInteger(p.index) || p.index < 0 || p.index > (list?.children?.length ?? 0))
    throw Error('插入位置已变化，请重新选择。');
  return { parent, container, list };
}

type Lexical = Map<string, string>;
function environment(m: Model, node: JsonNode) {
  const env: Lexical = new Map();
  for (const binder of ancestorBinders(m, node)) {
    const name = m.str(child(binder, 'as'));
    if (
      name === undefined ||
      env.has(name) ||
      [...m.ambiguous].some((path) => inside(path, binder.path))
    )
      throw Error('无法唯一解析该位置的作用域。');
    env.set(name, binder.path);
  }
  return env;
}

// Compare the actual binding declarations, not just their names or the types of their arrays.
// Template bodies start a fresh environment. Only their caller-side arguments can capture here.
function checkCaptures(m: Model, n: JsonNode, before: Lexical, after: Lexical) {
  function check(name: string | undefined, source: JsonNode, path = '') {
    if (name === undefined || (before.has(name) && before.get(name) === after.get(name))) return;
    const reason = after.has(name) ? '目标使用另一处同名声明' : '目标没有此作用域';
    throw Error(
      '作用域 ' +
        name +
        ' · 字段 ' +
        (path || '（当前项）') +
        ' · ' +
        reason +
        '（' +
        source.path +
        '）',
    );
  }
  function ref(r: JsonNode | undefined) {
    if (r && m.str(child(r, 'source')) === 'data')
      check(m.str(child(r, 'scope')), r, m.str(child(r, 'path')));
    if (m.str(child(r, 'source')) === 'validation') ref(child(r, 'field'));
  }
  function expr(e: JsonNode | undefined) {
    if (!e || child(e, 'literal')) return;
    ref(child(e, 'ref'));
    child(e, 'args')?.children?.forEach(expr);
  }
  function value(v: JsonNode | undefined) {
    if (!v || child(v, '$literal')) return;
    const expression = child(v, '$expr');
    if (expression) expr(expression);
    else v.children?.forEach(value);
  }
  function command(c: JsonNode | undefined) {
    if (!c) return;
    ref(child(c, 'target'));
    const val = child(c, 'value');
    if (m.str(child(c, 'op')) === 'patch') val?.children?.forEach(value);
    else value(val);
    for (const h of [child(c, 'item'), child(child(c, 'position'), 'item')])
      if (h) check(m.str(child(h, '$scope')), h);
    child(c, 'commands')?.children?.forEach(command);
  }
  if (m.ambiguous.has(n.path)) throw Error('节点路径含重复属性，请在 JSON 中核对。');
  const bind = child(n, 'scope'),
    body = child(n, 'node');
  if (bind && body) {
    ref(child(bind, 'from'));
    const name = m.str(child(bind, 'as'));
    if (name === undefined || after.has(name)) throw Error('目标已有同名作用域，无法移入。');
    checkCaptures(
      m,
      body,
      new Map(before).set(name, bind.path),
      new Map(after).set(name, bind.path),
    );
    return;
  }
  child(n, 'with')?.children?.forEach(ref);
  child(n, 'bindings')?.children?.forEach(ref);
  child(n, 'props')?.children?.forEach(value);
  for (const key of ['on', 'requests'])
    for (const mapping of child(n, key)?.children ?? []) {
      value(child(mapping, 'payload'));
      command(child(mapping, 'command'));
    }
  for (const member of child(n, 'children')?.children ?? [])
    checkCaptures(m, member, before, after);
  for (const slot of child(n, 'slots')?.children ?? [])
    for (const member of slot.children ?? []) checkCaptures(m, member, before, after);
}
export function assertScopeCanChange(m: Model, body: JsonNode, alias: string) {
  if ([...m.ambiguous].some((path) => inside(path, body.path)))
    throw Error('重复区含重复属性，无法可靠检查字段引用。');
  const before = environment(m, body);
  const after = new Map(before);
  after.delete(alias);
  checkCaptures(m, body, before, after);
}

function checkMove(m: Model, sourcePath: string, p: LayoutPosition, slots: Slots) {
  const { parent, list } = target(m, p, slots);
  const item = viewOwner(m, sourcePath),
    siblings = item?.parent;
  if (
    !item ||
    !siblings ||
    !viewRoot(m, sourcePath) ||
    viewRoot(m, sourcePath) !== viewRoot(m, p.parent)
  )
    throw Error('只能移动当前布局插槽中的节点。');
  if (inside(parent.path, sourcePath)) throw Error('不能移入自身或后代。');
  if (m.ambiguous.has(siblings.path)) throw Error('来源插槽含重复属性。');
  const index = siblings.children!.indexOf(item.node);
  if (list === siblings && (p.index === index || p.index === index + 1))
    throw Error('节点已在此位置。');
  const before = environment(m, item.node),
    after = environment(m, parent);
  const changed =
    before.size !== after.size ||
    [...before].some(([alias, binder]) => after.get(alias) !== binder);
  if (changed && [...m.ambiguous].some((path) => inside(path, sourcePath)))
    throw Error('子树含重复属性，无法可靠核对跨作用域移动。');
  checkCaptures(m, item.node, before, after);
  return { node: item.node, siblings, index };
}
export function moveProblem(
  m: Model,
  sourcePath: string,
  p: LayoutPosition,
  slots: Slots,
): string | undefined {
  try {
    checkMove(m, sourcePath, p, slots);
  } catch (e) {
    return e instanceof Error ? e.message : '无法移动节点。';
  }
}

// Half-open token ranges refer to the original document, including when the destination is
// a sibling that will be renumbered by the removal. Apply both changes as a single draft edit.
type Splice = { start: number; end: number; value: string };
function edit(m: Model, edits: Splice[]) {
  let raw = m.raw(m.root);
  const tokens = jsonTokens(raw),
    offsets: number[] = [];
  let cursor = 0;
  for (const token of tokens) {
    cursor = raw.indexOf(token, cursor);
    offsets.push(cursor);
    cursor += token.length;
  }
  for (const { start, end, value } of edits.sort((a, b) => b.start - a.start)) {
    const from = offsets[start]!,
      to = end === start ? from : offsets[end - 1]! + tokens[end - 1]!.length;
    raw = raw.slice(0, from) + value + raw.slice(to);
  }
  return m.replace(m.root, raw);
}
function insertion(m: Model, p: LayoutPosition, raw: string, slots: Slots): Splice {
  const { parent, container, list } = target(m, p, slots);
  if (!list) {
    const owner = container ?? parent,
      key = container ? p.slot : 'slots';
    const entry = JSON.stringify(p.slot) + ':[' + raw + ']';
    const val = container ? '[' + raw + ']' : '{' + entry + '}';
    return {
      start: owner.end - 1,
      end: owner.end - 1,
      value: (owner.children?.length ? ',' : '') + JSON.stringify(key) + ':' + val,
    };
  }
  const next = list.children?.[p.index],
    at = next?.start ?? list.end - 1;
  return { start: at, end: at, value: next ? raw + ',' : (list.children?.length ? ',' : '') + raw };
}
export function insertLayoutNode(m: Model, p: LayoutPosition, raw: string, slots: Slots): string {
  JSON.parse(raw);
  return edit(m, [insertion(m, p, raw, slots)]);
}
/** The destination is chosen in the original tree. Removing a preceding sibling may
 * renumber either the slot position itself or an ancestor of the destination container. */
export function movedLayoutPath(sourcePath: string, position: LayoutPosition): string {
  const sourceSlot = sourcePath.slice(0, sourcePath.lastIndexOf('/'));
  const removed = Number(sourcePath.slice(sourceSlot.length + 1));
  const dest = position.parent + '/slots/' + escapeKey(position.slot) + '/' + position.index;
  if (!dest.startsWith(sourceSlot + '/')) return dest;
  const segments = dest.slice(sourceSlot.length + 1).split('/');
  const sibling = Number(segments[0]);
  if (sibling > removed) segments[0] = String(sibling - 1);
  return sourceSlot + '/' + segments.join('/');
}
export function moveLayoutNode(
  m: Model,
  sourcePath: string,
  p: LayoutPosition,
  slots: Slots,
): string {
  const { node, siblings, index } = checkMove(m, sourcePath, p, slots);
  const previous = siblings.children![index - 1],
    next = siblings.children![index + 1];
  const remove: Splice = {
    start: !next && previous ? node.start - 1 : node.start,
    end: next ? node.end + 1 : node.end,
    value: '',
  };
  return edit(m, [remove, insertion(m, p, m.raw(node), slots)]);
}
