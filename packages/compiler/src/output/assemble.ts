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
  PreparedForm,
  PreparedViewNode,
} from '@form-engine/protocol/prepared';
import packageInfo from '../../package.json';
import { PREPARED_FORMAT_VERSION } from '../types.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { structure, structuralErrors } from '../validation/structure.js';

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
export function assemblePrepared(input: OutputInput, diagnostics: Diagnostics): PreparedForm {
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
  // 输入检查报告作者配置问题；这里报告编译器内部装配错误。
  for (const error of structuralErrors(structure.prepared, prepared))
    diagnostics.error(
      'COMPILER_OUTPUT_INVALID',
      '',
      `Internal Prepared structure error at ${error.instancePath}: ${error.message}`,
    );
  return prepared;
}
