import type { CompilerInputDefinition } from '@form-engine/protocol/definition';
import type { CapabilityCatalogSnapshot } from '@form-engine/protocol/capability';

export const digest = `sha256:${'1'.repeat(64)}` as const;
export function input() {
  const definition: CompilerInputDefinition = {
    protocolVersion: 'test-protocol',
    id: 'enrollment',
    version: 'draft',
    data: {
      schema: {
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'integer' } },
        additionalProperties: false,
      },
    },
    views: { only: { material: 'input', bind: '/name', props: { label: '姓名' } } },
    metadata: { watch: { $expr: 'business-data' } },
  };
  const catalog: CapabilityCatalogSnapshot = {
    id: 'catalog-fixed',
    materials: {
      input: {
        manifest: {
          id: 'input',
          version: 'v1',
          propsSchema: {
            type: 'object',
            properties: { label: { type: 'string' } },
            additionalProperties: false,
          },
          bindings: { value: { schema: { type: 'string' } } },
          slots: ['default'],
        },
        artifact: { id: 'app-build', platform: 'web', digest },
      },
    },
    pureFunctions: {},
  };
  return { definition, catalog };
}
