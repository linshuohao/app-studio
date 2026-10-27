import type { CompileResult } from '../src/types.js';
import type { PreparedForm } from '@form-engine/protocol/prepared';
function readonlyOutput(result: CompileResult) {
  if (!result.success) return;
  // @ts-expect-error 编译成功产物的嵌套字段只读，不只是最外层属性只读。
  result.prepared.definition.data.schema = false;
  // @ts-expect-error 能力锁的嵌套字典同样不能原地增加。
  result.prepared.capabilityLock.materials.extra = {};
  const editable = structuredClone(result.prepared) as PreparedForm;
  editable.definition.data.schema = false;
  return editable;
}
void readonlyOutput;
