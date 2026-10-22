import type {
  CompilerInputDefinition,
  AuthoringViewNode,
  ViewNode,
} from '@form-engine/protocol/definition';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';

/**
 * 只展开 bind / children 和 Scope 默认 mode，保留原有协议分层。
 * source 将规范位置映射回作者输入，例如 bindings.value → bind；不展开模板。
 */
export function normalize(definition: CompilerInputDefinition, diagnostics: Diagnostics) {
  const origins = new Map<string, string>();
  function node(input: AuthoringViewNode, pointer: string, source: string): ViewNode {
    origins.set(pointer, source);
    if ('scope' in input)
      return {
        scope: { ...input.scope, mode: input.scope.mode ?? 'one' },
        node: node(input.node, at(pointer, 'node'), at(source, 'node')),
      };
    if ('$use' in input) return input;
    const { bind, children, slots, ...material } = input;
    const bindings = Object.fromEntries(Object.entries(input.bindings ?? {}));
    if (bind !== undefined) {
      if (own(bindings, 'value'))
        diagnostics.error(
          'AUTHORING_CONFLICT',
          at(source, 'bind'),
          'bind conflicts with bindings.value.',
        );
      else {
        Object.defineProperty(bindings, 'value', {
          value: { source: 'data', path: bind },
          enumerable: true,
        });
        origins.set(at(at(pointer, 'bindings'), 'value'), at(source, 'bind'));
      }
    }
    const normalizedSlots = Object.fromEntries(
      Object.entries(slots ?? {}).map(([key, children]) => [
        key,
        children.map((child, index) =>
          node(
            child,
            at(at(at(pointer, 'slots'), key), index),
            at(at(at(source, 'slots'), key), index),
          ),
        ),
      ]),
    );
    if (children !== undefined) {
      if (own(normalizedSlots, 'default'))
        diagnostics.error(
          'AUTHORING_CONFLICT',
          at(source, 'children'),
          'children conflicts with slots.default.',
        );
      else {
        origins.set(at(at(pointer, 'slots'), 'default'), at(source, 'children'));
        Object.defineProperty(normalizedSlots, 'default', {
          value: children.map((child, index) =>
            node(
              child,
              at(at(at(pointer, 'slots'), 'default'), index),
              at(at(source, 'children'), index),
            ),
          ),
          enumerable: true,
        });
      }
    }
    return {
      ...material,
      ...(bind !== undefined || input.bindings !== undefined ? { bindings } : {}),
      ...(children !== undefined || slots !== undefined ? { slots: normalizedSlots } : {}),
    };
  }
  const views = Object.fromEntries(
    Object.entries(definition.views).map(([key, value]) => [
      key,
      node(value, at('/views', key), at('/views', key)),
    ]),
  );
  const templates =
    definition.viewTemplates === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(definition.viewTemplates).map(([key, value]) => [
            key,
            {
              ...value,
              node: node(
                value.node,
                at(at('/viewTemplates', key), 'node'),
                at(at('/viewTemplates', key), 'node'),
              ),
            },
          ]),
        );
  // 子路径沿用最近祖先的映射，children 内嵌套节点的诊断也能回到原位置。
  const source = (pointer: string): string => {
    let prefix = pointer;
    while (!origins.has(prefix) && prefix) prefix = prefix.slice(0, prefix.lastIndexOf('/'));
    return (origins.get(prefix) ?? prefix) + pointer.slice(prefix.length);
  };
  return {
    definition: { ...definition, views, ...(templates ? { viewTemplates: templates } : {}) },
    source,
  };
}
