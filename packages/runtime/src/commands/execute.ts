import type { Command, ArrayPosition } from '@form-engine/protocol/definition';
import { DataStore } from '../data/store.js';
import { memberIndex, resolvePath, type ScopeBinding } from '../scope/registry.js';
import type { EvaluationFrame } from '../expression/evaluator.js';
import { Evaluator } from '../expression/evaluator.js';

/**
 * 执行一个叶 Command：解析目标 / 数组锚点，求值输入，再调用 Store 提交 Data + Scope。
 * 返回修改标志及目标绝对路径，供 Runtime 处理观察失效；失败在发布前抛出，不执行 batch。
 */
export function executeCommand(
  store: DataStore,
  evaluator: Evaluator,
  command: Exclude<Command, { op: 'batch' }>,
  frame: EvaluationFrame,
): { changed: boolean; path: string } {
  const path = resolvePath(frame.view, command.target, frame.scope);
  // before / after 以成员为锚；移动时先扣除源项占位，得到删除源项后的插入下标。
  const position = (value: ArrayPosition, moving?: number) => {
    if (value.kind === 'index') return value.index;
    const anchor = memberIndex(frame.view, path, value.item.$scope, frame.scope);
    if (moving === anchor) return moving;
    const adjusted = anchor - (moving !== undefined && moving < anchor ? 1 : 0);
    return adjusted + (value.kind === 'after' ? 1 : 0);
  };
  let changed: boolean;
  switch (command.op) {
    case 'set':
      changed = store.write(path, evaluator.value(command.value, frame));
      break;
    case 'patch':
      changed = store.patch(path, evaluator.value(command.value, frame));
      break;
    case 'remove':
      changed = store.remove(path);
      break;
    case 'array.insert':
      changed = store.array(path, {
        kind: 'insert',
        to: position(command.position),
        value: evaluator.value(command.value, frame),
      });
      break;
    case 'array.remove':
      changed = store.array(path, {
        kind: 'remove',
        from: memberIndex(frame.view, path, command.item.$scope, frame.scope),
      });
      break;
    case 'array.move': {
      const from = memberIndex(frame.view, path, command.item.$scope, frame.scope);
      changed = store.array(path, { kind: 'move', from, to: position(command.position, from) });
      break;
    }
  }
  return { changed, path };
}
/** 复制并冻结 Scope 字典及定位句柄，避免调用者修改绑定影响已登记的规则 / 订阅。 */
export function ownScope(scope: ScopeBinding): ScopeBinding {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(scope).map(([key, value]) => [key, Object.freeze({ ...value })]),
    ),
  );
}
