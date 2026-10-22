import type { JsonSchema } from '@form-engine/protocol';
import type { FormDefinition } from '@form-engine/protocol/definition';
import type {
  LockedCapability,
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
  materials: Record<string, LockedCapability>;
}

/** 装配已检查的静态片段并做 Prepared 结构自检；失败仍由入口统一阻止交付。 */
export function assemblePrepared(input: OutputInput, diagnostics: Diagnostics): PreparedForm {
  // 入口 / 视图模块已拒绝未实现语义。模板使用尚不支持，未使用模板不进入产物。
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
      views: Object.fromEntries([[input.profile, input.view]]),
    } as PreparedDefinition,
    // 固定协议要求这些字段；空集合表示本批次没有对应使用，不是占位执行计划。
    resources: { schemas: input.schemas, requestSchemas: {} },
    capabilityLock: {
      materials: input.materials,
      pureFunctions: {},
    },
    hostRequirements: { validators: [], events: [], requests: [] },
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
