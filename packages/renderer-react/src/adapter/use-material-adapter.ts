import { useContext, useSyncExternalStore } from 'react';
import type { AnyMaterialContract } from '../material/types.js';
import { MaterialContext } from './material-context.js';
import type { AdapterFor } from './types.js';
import { matchesMaterialContract } from '../material/registry.js';
/**
 * 当前物料唯一的 React 接入 Hook，只能在 MaterialMount 提供的 Context 内调用。
 * @param contract 物料的声明与类型凭据，用摘要核对其是否匹配当前挂载节点。
 * @returns 当前只读 props / Binding 值 / 校验投影、Slots，以及 set / command / emit / request。
 *
 * 状态：Hook 不保存业务值；useContext 找到本挂载的 Projection，useSyncExternalStore
 * 读取其稳定 Snapshot 并管理订阅。返回的聚合对象每次渲染重新组织，操作函数属于该关联。
 * 失效：读取 / 求值错误抛给物料错误边界；卸载或改绑释放旧订阅，旧操作返回 inactive。
 */
export function useMaterialAdapter<C extends AnyMaterialContract>(contract: C): AdapterFor<C> {
  const projection = useContext(MaterialContext);
  if (!projection) throw Error('useMaterialAdapter requires FormRenderer material context');
  if (!matchesMaterialContract(contract, projection.material.contract))
    throw Error('Material contract does not match mounted material');
  const snapshot = useSyncExternalStore(
    projection.subscribe,
    projection.getSnapshot,
    projection.getSnapshot,
  );
  if (snapshot.error) throw snapshot.error;
  return {
    ...snapshot,
    slots: projection.slots,
    set: projection.set,
    command: projection.command,
    emit: projection.emit,
    request: projection.request,
  } as AdapterFor<C>;
}
