import { useMemo, useSyncExternalStore } from 'react';
import type { PreparedViewNode } from '@form-engine/protocol/prepared';
import type { ScopeBinding } from '@form-engine/runtime';
import { ScopeProjection, scopeKey } from '../../composition/scope-projection.js';
import type { RecursiveNodeProps } from './types.js';

/**
 * 实例化静态模板：在调用方 Scope 中解析 with，再只把显式形参交给模板体。
 * useMemo 返回参数位置的观察源；useSyncExternalStore 返回当前可用的模板词法绑定。
 * 参数缺失时返回空子树；全局形参也保留调用位置的 owners，删除外层成员立即撤销资格。
 * 只持有呈现位置缓存，模板声明与 Runtime 数据都不复制；观察由 Hook 清理。
 */
export function TemplateNodeView({
  environment,
  node,
  scope,
  occurrence,
  owners,
  renderNode: RenderNode,
}: Omit<RecursiveNodeProps, 'node'> & { node: Extract<PreparedViewNode, { $use: unknown }> }) {
  const template = environment.compiledForm.definition.viewTemplates?.[node.$use];
  if (!template) throw Error(`Unknown prepared template ${node.$use}`);
  const projection = useMemo(() => {
    const parameters = Object.entries(node.with ?? {});
    const store = new ScopeProjection(
      environment.runtime,
      parameters.map(([, ref]) => ref),
      () => {
        const entries = parameters.map(([name, from]) => {
          const bound = environment.runtime.bind({ from, as: name, mode: 'one' }, scope)[0];
          return bound ? ([name, bound[name]!] as const) : undefined;
        });
        return entries.some((entry) => !entry)
          ? []
          : [
              Object.freeze(
                Object.fromEntries(entries as Array<readonly [string, ScopeBinding[string]]>),
              ),
            ];
      },
    );
    return {
      getSnapshot: store.getSnapshot,
      subscribe: (listener: () => void) => store.subscribe(listener, scope),
    };
  }, [environment, node, scope]);
  const bindings = useSyncExternalStore(
    projection.subscribe,
    projection.getSnapshot,
    projection.getSnapshot,
  );
  return bindings.map((binding) => (
    <RenderNode
      key={scopeKey(binding)}
      environment={environment}
      node={template.node}
      scope={binding}
      owners={owners}
      occurrence={`${occurrence}/template/${node.$use}`}
    />
  ));
}
