import type {
  Command,
  ScopeHandleReference,
  DataReference,
} from '@form-engine/protocol/definition';
import type { LexicalEnvironment } from '../analysis/reference/environment.js';
import { ValueCompiler } from '../analysis/value/compile.js';
import { at } from '../common/pointer.js';

/** 命令值仅在调用时求值；共用表达式分析检查引用 / 签名，绝不补 Reaction.watch。 */
export function checkCommand(
  command: Command,
  env: LexicalEnvironment,
  pointer: string,
  values: ValueCompiler,
): void {
  const { expressions } = values;
  const { references, diagnostics, source, models } = expressions;
  if (command.op === 'batch') {
    command.commands.forEach((child, index) =>
      checkCommand(child, env, at(at(pointer, 'commands'), index), values),
    );
    return;
  }
  const target = references.resolve(command.target, env, at(pointer, 'target'));
  // 工作值允许暂时违反业务 Schema；这里只证明容器操作和句柄配置，不限制 set 的值类型。
  if (command.op === 'patch' && target) {
    const node = models.dereference(target);
    if (!node || typeof node.schema !== 'object' || node.schema.type !== 'object')
      diagnostics.error(
        'COMMAND_TARGET_UNPROVEN',
        source(at(pointer, 'target')),
        'patch requires an object model.',
      );
  }
  if (command.op.startsWith('array.') && target)
    models.arrayItem(target, source(at(pointer, 'target')));
  if ('value' in command) values.compile(command.value, env, at(pointer, 'value'), false);
  function handle(item: ScopeHandleReference, targetRef: DataReference, location: string) {
    const binding = env.scopes.get(item.$scope);
    if (!binding?.member || binding.collection !== references.identity(targetRef, env))
      diagnostics.error(
        'SCOPE_HANDLE_INVALID',
        source(location),
        'Expected a visible member of the target array.',
      );
  }
  if ('item' in command) handle(command.item, command.target, at(pointer, 'item'));
  if ('position' in command && command.position.kind !== 'index')
    handle(command.position.item, command.target, at(at(pointer, 'position'), 'item'));
}
