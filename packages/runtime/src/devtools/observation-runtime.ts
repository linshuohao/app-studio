import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { readAt } from '../data/json.js';
import { resolveLocation, type ReadView, type ScopeLocation } from '../scope/registry.js';
import {
  sharedPreparedCatalog,
  type DefinitionBudget,
  type DefinitionCatalog,
} from './observation-definition.js';
import { describeTopology, type TopologyBudget } from './observation-topology.js';
import type { MetadataValue, ObservationProducer, ProducerRef } from './observation-protocol.js';
export interface RuntimeMetadataState {
  readonly view: ReadView;
  readonly contextRevision: number;
  /** 由状态所有者推进，必须覆盖 Data / 目录变化，不能只使用 Data revision。 */
  readonly metadataRevision: number;
  readonly coordinating: boolean;
  readonly instances?: readonly MetadataValue[];
  readonly validation?: readonly MetadataValue[];
}
/**
 * Runtime 的只读生产者接缝。capture 由状态所有者提供协调后的切点，不注册业务观察。
 * 提供定义与当前位置；实例及校验目录由状态所有者注入，尚未覆盖的类别在头部声明。
 */
export function createRuntimeMetadataProducer(
  ref: ProducerRef,
  prepared: ReadonlyPreparedForm,
  preparedId: string,
  budget: { readonly definition: DefinitionBudget; readonly topology: TopologyBudget },
  capture: () => RuntimeMetadataState,
): ObservationProducer {
  let definitions: DefinitionCatalog | undefined;
  const version = (state: RuntimeMetadataState) =>
    Object.freeze({ dataRevision: state.view.revision, contextRevision: state.contextRevision });
  return Object.freeze({
    ref: Object.freeze({ ...ref }),
    revision: () => capture().metadataRevision,
    inputVersion: () => version(capture()),
    snapshot() {
      const state = capture();
      if (state.coordinating) return { status: 'busy' as const };
      // Prepared 由 Runtime 接管为不可变对象；同一生产者只建立一次静态目录。
      definitions ??= sharedPreparedCatalog(prepared, budget.definition);
      const locations = describeTopology(state.view, budget.topology);
      const rows: MetadataValue[] = [
        {
          record: 'header',
          preparedId,
          definitionId: definitions.definitionId,
          definitionVersion: definitions.definitionVersion,
          inputVersion: version(state),
          coverage: {
            definitions: 'complete',
            ruleTemplates: 'complete',
            schemaStructure: 'complete',
            viewTemplates: 'complete',
            topology: 'complete',
            instances: state.instances ? 'complete' : 'not-collected',
            updates: 'versioned-delta',
            references: definitions.relations.some(
              (relation) => relation.resolution === 'unresolved',
            )
              ? 'partial'
              : 'complete',
            validation: state.validation ? 'current-directory' : 'not-collected',
            renderer: 'not-collected',
          },
        },
      ];
      for (const node of definitions.nodes)
        rows.push({ record: 'definition', ...node } as unknown as MetadataValue);
      for (const relation of definitions.relations)
        rows.push({ record: 'relation', ...relation } as unknown as MetadataValue);
      for (const location of locations)
        rows.push({ record: 'location', ...location } as unknown as MetadataValue);
      rows.push(...(state.instances ?? []), ...(state.validation ?? []));
      return Object.freeze({ revision: state.metadataRevision, rows: Object.freeze(rows) });
    },
    inspect(location: ScopeLocation) {
      const state = capture();
      if (state.coordinating) return { status: 'busy' as const };
      let path: string;
      try {
        path = resolveLocation(state.view, location);
      } catch {
        return { status: 'missing' as const, version: version(state) };
      }
      const result = readAt(state.view.root, path);
      return result.kind === 'missing'
        ? { status: 'missing' as const, version: version(state) }
        : { status: 'ok' as const, version: version(state), value: result.value as MetadataValue };
    },
  });
}
