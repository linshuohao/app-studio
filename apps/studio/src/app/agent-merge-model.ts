import { parseJson, type JsonKind, type JsonNode } from '../components/json/model';

type Entry = {
  raw: string;
  kind: JsonKind;
  keyToken?: string;
  children: Map<string, Entry>;
};
type Branch = 'current' | 'candidate';
type Status = Branch | 'both' | 'conflict';
export type MergeRow = {
  path: string;
  base?: string;
  current?: string;
  candidate?: string;
  status: Status;
};

function document(text: string) {
  const { tokens, root } = parseJson(text);
  function read(node: JsonNode): Entry {
    const children = new Map<string, Entry>();
    for (const child of node.children ?? []) {
      if (children.has(child.key!)) throw Error('配置中含有重复属性名，请先修复后再比较。');
      children.set(child.key!, read(child));
    }
    return {
      raw: tokens.slice(node.start, node.end).join(''),
      kind: node.kind,
      keyToken: node.keyIndex === undefined ? undefined : tokens[node.keyIndex],
      children,
    };
  }
  return read(root);
}

// Material wrappers frequently have no ID. Their bound descendants distinguish
// sibling field wrappers even when they share the same layout material.
function identity(node: Entry): string | undefined {
  if (node.kind !== 'object') return;
  for (const key of ['id', 'bindings', '$use', 'scope']) {
    const anchor = node.children.get(key);
    if (anchor) return JSON.stringify([key, anchor.raw]);
  }
  const material = node.children.get('material')?.raw;
  if (!material) return;
  const slots = node.children.get('slots');
  const descendants =
    slots &&
    Array.from(slots.children, ([key, list]) => [
      key,
      Array.from(list.children.values(), identity),
    ]);
  return JSON.stringify([material, descendants]);
}

function aligned(base: Entry, side: Entry) {
  if (base.raw === side.raw) return true;
  if (base.children.size !== side.children.size) return false;
  const stable = new Set<string>();
  for (const [key, original] of base.children) {
    const anchor = identity(original);
    // Singletons cannot reorder. Multiple anonymous or repeated identities
    // are ambiguous, including rows whose position happens to be unchanged.
    if (!anchor && base.children.size !== 1) return false;
    if (anchor && stable.has(anchor)) return false;
    if (anchor) stable.add(anchor);
    if (anchor !== identity(side.children.get(key)!)) return false;
  }
  return true;
}

function changedKeys(base: Entry, side: Entry) {
  const common = Array.from(base.children.keys()).filter((key) => side.children.has(key));
  return Array.from(side.children.keys())
    .filter((key) => base.children.has(key))
    .some(
      (key, i) =>
        key !== common[i] || side.children.get(key)?.keyToken !== base.children.get(key)?.keyToken,
    );
}

function orderedKeys(base: Entry, current: Entry, candidate: Entry) {
  // Insert Agent-only properties at their relative positions in the candidate.
  // The common keys are already known to have matching order.
  const before = new Map<string, string[]>();
  let additions: string[] = [];
  for (const key of candidate.children.keys()) {
    if (current.children.has(key)) {
      before.set(key, additions);
      additions = [];
    } else {
      additions.push(key);
    }
  }
  const keys = new Set<string>();
  for (const key of current.children.keys()) {
    for (const added of before.get(key) ?? []) keys.add(added);
    keys.add(key);
  }
  for (const key of additions) keys.add(key);
  for (const key of base.children.keys()) keys.add(key); // include fields deleted by both sides in review
  return keys;
}

function childPath(path: string, key: string) {
  return path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function compareAgentDraft(baseText: string, currentText: string, candidateText: string) {
  const base = document(baseText),
    current = document(currentText),
    candidate = document(candidateText);
  const rows: MergeRow[] = [];
  type Resolve = (choices: ReadonlyMap<string, Branch>) => string | undefined;

  function visit(path: string, b?: Entry, c?: Entry, a?: Entry): Resolve {
    if (b?.raw === c?.raw && c?.raw === a?.raw) return () => c?.raw;
    if (b && c && a && b.kind === c.kind && c.kind === a.kind) {
      const object =
        b.kind === 'object' && !changedKeys(b, c) && !changedKeys(b, a) && !changedKeys(c, a);
      const array = b.kind === 'array' && aligned(b, c) && aligned(b, a);
      if (object || array) {
        const keys = orderedKeys(b, c, a);
        const children = Array.from(keys, (key) => ({
          key: c.children.get(key)?.keyToken ?? a.children.get(key)?.keyToken,
          resolve: visit(
            childPath(path, key),
            b.children.get(key),
            c.children.get(key),
            a.children.get(key),
          ),
        }));
        return (choices) => {
          if (c.raw === a.raw || a.raw === b.raw) return c.raw;
          if (c.raw === b.raw) return a.raw;
          const parts: string[] = [];
          for (const child of children) {
            const value = child.resolve(choices);
            if (value !== undefined) parts.push(object ? child.key + ':' + value : value);
          }
          return object ? '{' + parts.join(',') + '}' : '[' + parts.join(',') + ']';
        };
      }
    }
    const status: Status =
      c?.raw === a?.raw
        ? 'both'
        : b?.raw === c?.raw
          ? 'candidate'
          : b?.raw === a?.raw
            ? 'current'
            : 'conflict';
    rows.push({ path, base: b?.raw, current: c?.raw, candidate: a?.raw, status });
    return (choices) => {
      const choice = status === 'conflict' ? choices.get(path) : status;
      if (!choice) throw Error('请先处理全部冲突。');
      return choice === 'candidate' ? a?.raw : c?.raw;
    };
  }

  const resolve = visit('', base, current, candidate);
  return {
    rows,
    apply(choices: ReadonlyMap<string, Branch>) {
      const merged = resolve(choices)!;
      if (merged === current.raw) return currentText;
      if (merged === candidate.raw) return candidateText;
      return merged;
    },
  };
}
