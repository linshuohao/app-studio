import { useContext } from 'react';
import type { JsonValue } from '@form-engine/protocol';
import { MaterialContext } from './material-context.js';

/** Resolve member identity at execution time. Optional bindings have no members or writes. */
export function useArrayBinding(name: string, options?: { allowUnbound?: boolean }) {
  const projection = useContext(MaterialContext);
  const target = projection?.node.bindings?.[name];
  if (!projection || (!target && !options?.allowUnbound))
    throw Error('Missing array binding: ' + name);
  if (!target)
    return {
      bound: false as const,
      ids: [] as string[],
      write: () => {
        throw Error('Missing array binding: ' + name);
      },
    };
  const { runtime } = projection.environment;
  let alias = 'arrayMember';
  while (Object.hasOwn(projection.scope, alias)) alias += '_';
  const members = () => runtime.bind({ from: target, mode: 'each', as: alias }, projection.scope);
  const ids = () => members().map((scope) => scope[alias]!.member!);
  function write(
    action: 'insert' | 'remove' | 'move' | 'patch',
    id: string | null,
    value: Record<string, JsonValue> = {},
    delta = 0,
  ) {
    if (!projection!.alive) throw Error('此控件已关闭');
    const rows = members(),
      index = rows.findIndex((row) => row[alias]!.member === id);
    if (action !== 'insert' && index < 0) throw Error('此成员已被移除');
    const scope = rows[index] ?? projection!.scope;
    const item = { $scope: alias };
    const run = (command: Parameters<typeof runtime.dispatch>[0]) => {
      const result = runtime.dispatch(command, scope);
      if (!result.ok) throw Error(result.errors.join('、'));
    };
    if (action === 'insert') {
      const current = runtime.read(target!, projection!.scope);
      if (current.kind === 'missing') {
        run({ op: 'set', target: target!, value: { $literal: [value] } });
        return;
      }
      run({
        op: 'array.insert',
        target: target!,
        position: { kind: 'index', index: rows.length },
        value: { $literal: value },
      });
    } else if (action === 'remove') run({ op: 'array.remove', target: target!, item });
    else if (action === 'move')
      run({
        op: 'array.move',
        target: target!,
        item,
        position: { kind: 'index', index: index + delta },
      });
    else
      run({
        op: 'patch',
        target: { source: 'data', scope: alias, path: '' },
        value: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, { $literal: v }])),
      });
  }
  return { bound: true as const, ids: ids(), write };
}
