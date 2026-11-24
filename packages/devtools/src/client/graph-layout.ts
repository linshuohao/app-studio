import type { GraphNode, GraphEdge } from './observation-store.js';
/** 仅对可见子图布局。强连通组共享层级；顺序和坐标不依赖状态或高亮。 */
export function layoutGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  execution: boolean,
) {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges)
    if (ids.has(edge.from) && ids.has(edge.to) && edge.kind !== 'contains')
      outgoing.get(edge.from)!.push(edge.to);
  let serial = 0;
  const indexes = new Map<string, number>(),
    low = new Map<string, number>(),
    stack: string[] = [],
    active = new Set<string>(),
    groups: string[][] = [];
  const visit = (id: string) => {
    indexes.set(id, serial);
    low.set(id, serial++);
    stack.push(id);
    active.add(id);
    for (const next of outgoing.get(id)!) {
      if (!indexes.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (active.has(next)) low.set(id, Math.min(low.get(id)!, indexes.get(next)!));
    }
    if (low.get(id) === indexes.get(id)) {
      const group: string[] = [];
      let next: string;
      do {
        next = stack.pop()!;
        active.delete(next);
        group.push(next);
      } while (next !== id);
      groups.push(group);
    }
  };
  for (const node of nodes) if (!indexes.has(node.id)) visit(node.id);
  const groupOf = new Map(
    groups.flatMap((group, index) => group.map((id) => [id, index] as const)),
  );
  const rank = new Map<number, number>();
  const predecessors = new Map(groups.map((_, index) => [index, new Set<number>()]));
  for (const edge of edges) {
    const from = groupOf.get(edge.from),
      to = groupOf.get(edge.to);
    if (from !== undefined && to !== undefined && from !== to && edge.kind !== 'contains')
      predecessors.get(to)!.add(from);
  }
  const level = (id: number): number => {
    if (rank.has(id)) return rank.get(id)!;
    const result = Math.max(0, ...[...predecessors.get(id)!].map((parent) => level(parent) + 1));
    rank.set(id, result);
    return result;
  };
  const positions = new Map<string, { x: number; y: number }>();
  const lanes = new Map<string, number>();
  const occupied = new Map<string, number>();
  for (const node of nodes) {
    const column = level(groupOf.get(node.id)!);
    const lane = execution ? (node.lane ?? '窗口外 / 未知') : (node.parent ?? '根 / 跨对象');
    if (!lanes.has(lane)) lanes.set(lane, lanes.size);
    const rowKey = `${lane}:${column}`;
    const within = occupied.get(rowKey) ?? 0;
    occupied.set(rowKey, within + 1);
    positions.set(node.id, {
      x: 30 + column * 280,
      y: 50 + lanes.get(lane)! * 100 + within * (execution ? 96 : 76),
    });
  }
  // 每条泳道按实际高度排布，避免同一列多个节点侵入下一泳道。
  let offset = 0;
  const laneHeaders: Array<{ label: string; y: number }> = [];
  for (const [lane, laneIndex] of lanes) {
    const laneNodes = nodes.filter(
      (node) =>
        (execution ? (node.lane ?? '窗口外 / 未知') : (node.parent ?? '根 / 跨对象')) === lane,
    );
    laneHeaders.push({ label: lane, y: offset + 20 });
    let height = 100;
    for (const node of laneNodes) {
      const position = positions.get(node.id)!;
      position.y = position.y - laneIndex * 100 + offset;
      height = Math.max(height, position.y - offset + (execution ? 94 : 70));
    }
    offset += height;
  }
  return {
    positions,
    lanes: laneHeaders,
    cycles: groups.filter((group) => group.length > 1),
    width: Math.max(900, ...[...positions.values()].map((p) => p.x + 270)),
    height: Math.max(240, offset),
  };
}
