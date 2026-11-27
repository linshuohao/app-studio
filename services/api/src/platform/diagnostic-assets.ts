import type { Expression } from '@form-engine/protocol/definition';
import type {
  LockedCapability,
  PreparedForm,
  PreparedViewNode,
} from '@form-engine/protocol/prepared';

import type { QueryExecutor } from './database.js';

export type DiagnosticAsset = {
  kind: 'material' | 'function';
  lock: LockedCapability;
};

export function diagnosticAssets(
  prepared: PreparedForm,
  event: { errorCode: string; phase: string; targetId: string | null },
): DiagnosticAsset[] {
  if (!event.targetId) return [];
  const { definition, capabilityLock } = prepared;
  if (event.errorCode === 'MATERIAL_UNAVAILABLE' && event.phase === 'render') {
    const stack: PreparedViewNode[] = [
      ...Object.values(definition.views),
      ...Object.values(definition.viewTemplates ?? {}).map(({ node }) => node),
    ];
    const matches = new Set<string>();
    while (stack.length) {
      const node = stack.pop()!;
      if ('material' in node) {
        if (node.id === event.targetId) matches.add(node.material);
        for (const children of Object.values(node.slots ?? {}))
          for (const child of children) stack.push(child);
      } else if ('node' in node) stack.push(node.node);
    }
    if (matches.size !== 1) return [];
    const [id] = matches;
    const lock = id && Object.hasOwn(capabilityLock.materials, id) && capabilityLock.materials[id];
    return lock ? [{ kind: 'material', lock }] : [];
  }

  let expression: Expression | undefined;
  if (event.errorCode === 'reaction.error' && event.phase === 'when') {
    expression = definition.reactions?.find(({ id }) => id === event.targetId)?.when;
  } else if (event.errorCode === 'validation.error') {
    const rule = definition.constraints?.find(({ id }) => id === event.targetId);
    if (event.phase === 'when') expression = rule?.when;
    if (event.phase === 'assert' && rule?.kind === 'internal') expression = rule.assert;
  }
  if (expression === undefined) return [];

  const pending = [expression];
  const names = new Set<string>();
  const found = new Set<string>();
  const named = definition.expressions ?? {};
  while (pending.length) {
    const current = pending.pop()!;
    if (!current || typeof current !== 'object') continue;
    if ('op' in current) {
      if (
        !current.op.startsWith('core.') &&
        Object.hasOwn(capabilityLock.pureFunctions, current.op)
      )
        found.add(current.op);
      for (const arg of current.args) pending.push(arg);
    } else if ('use' in current && !names.has(current.use) && Object.hasOwn(named, current.use)) {
      names.add(current.use);
      pending.push(named[current.use]!);
    }
  }
  return [...found]
    .sort()
    .map((id) => ({ kind: 'function', lock: capabilityLock.pureFunctions[id]! }));
}

export async function readDiagnosticAssets(
  db: QueryExecutor,
  event: { releaseId: string; errorCode: string; phase: string; targetId: string | null },
) {
  if (
    !event.targetId ||
    !['MATERIAL_UNAVAILABLE', 'reaction.error', 'validation.error'].includes(event.errorCode)
  )
    return [];
  const row = await db.one<{ prepared_text: string }>(
    'SELECT prepared_text FROM platform_releases WHERE release_id=$1',
    [event.releaseId],
  );
  if (!row) return [];
  return diagnosticAssets(JSON.parse(row.prepared_text) as PreparedForm, event);
}
