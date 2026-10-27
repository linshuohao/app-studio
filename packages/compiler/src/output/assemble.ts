import type { JsonSchema } from '@form-engine/protocol';
import type { FormDefinition } from '@form-engine/protocol/definition';
import type {
  CapabilityLock,
  HostValidatorRequirement,
  PreparedConstraint,
  PreparedReaction,
  PreparedViewTemplate,
  HostEventRequirement,
  HostRequestRequirement,
  PreparedDefinition,
  ReadonlyPreparedForm,
  PreparedViewNode,
} from '@form-engine/protocol/prepared';
import packageInfo from '../../package.json';
import { PREPARED_FORMAT_VERSION } from '../types.js';
import { Diagnostics } from '../diagnostics/collector.js';
import {
  capturePreparedForm,
  PreparedStructureError,
} from '@form-engine/protocol/internal/prepared';

interface OutputInput {
  definition: FormDefinition;
  profile: string;
  platform?: string;
  catalogSnapshotId: string;
  view: PreparedViewNode;
  schemas: Record<string, JsonSchema>;
  capabilityLock: CapabilityLock;
  constraints: PreparedConstraint[];
  reactions: PreparedReaction[];
  validators: HostValidatorRequirement[];
  templates: Record<string, PreparedViewTemplate>;
  interactions: {
    events: HostEventRequirement[];
    requests: HostRequestRequirement[];
    schemas: Record<string, JsonSchema>;
  };
}

/** 装配已检查的静态片段并做 Prepared 结构自检；失败仍由入口统一阻止交付。 */
export function assemblePrepared(
  input: OutputInput,
  diagnostics: Diagnostics,
): ReadonlyPreparedForm {
  // 共享声明保留原结构，模板只交付所选视图的传递闭包，不展开复制到各调用点。
  const shared = { ...input.definition };
  delete shared.viewTemplates;
  const prepared = {
    preparedFormatVersion: PREPARED_FORMAT_VERSION,
    build: {
      compilerVersion: packageInfo.version,
      catalogSnapshotId: input.catalogSnapshotId,
      profile: input.profile,
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
    },
    definition: {
      ...shared,
      ...(input.definition.constraints !== undefined ? { constraints: input.constraints } : {}),
      ...(input.definition.reactions !== undefined ? { reactions: input.reactions } : {}),
      ...(Object.keys(input.templates).length ? { viewTemplates: input.templates } : {}),
      views: Object.fromEntries([[input.profile, input.view]]),
    } as PreparedDefinition,
    resources: { schemas: input.schemas, requestSchemas: input.interactions.schemas },
    capabilityLock: input.capabilityLock,
    hostRequirements: {
      validators: input.validators,
      events: input.interactions.events,
      requests: input.interactions.requests,
    },
  };
  // 交付已检查、深度只读的产物；同进程 Runtime / Renderer 可复用验证结果。
  try {
    return capturePreparedForm(prepared) as unknown as ReadonlyPreparedForm;
  } catch (error) {
    if (!(error instanceof PreparedStructureError)) throw error;
    for (const item of error.errors)
      diagnostics.error(
        'COMPILER_OUTPUT_INVALID',
        '',
        `Internal Prepared structure error at ${item.instancePath}: ${item.message}`,
      );
    return prepared as unknown as ReadonlyPreparedForm;
  }
}
