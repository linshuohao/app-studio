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

export function assemblePrepared(input: OutputInput, diagnostics: Diagnostics): PreparedForm {
  // Nonempty rules/expressions were rejected above. Shared unused templates are intentionally omitted.
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
    resources: { schemas: input.schemas, requestSchemas: {} },
    capabilityLock: {
      materials: input.materials,
      pureFunctions: {},
    },
    hostRequirements: { validators: [], events: [], requests: [] },
  };
  for (const error of structuralErrors(structure.prepared, prepared))
    diagnostics.error(
      'COMPILER_OUTPUT_INVALID',
      '',
      `Internal Prepared structure error at ${error.instancePath}: ${error.message}`,
    );
  return prepared;
}
