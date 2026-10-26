import { compile } from '@form-engine/compiler';
import { createCoreFunctions } from '@form-engine/pure-functions';
import type { FormDefinition, DataReference } from '@form-engine/protocol/definition';
export const data = (path: string, scope?: string): DataReference => ({
  source: 'data',
  path,
  ...(scope ? { scope } : {}),
});
export const artifact = {
  id: 'app-build',
  platform: 'web',
  digest: `sha256:${'1'.repeat(64)}` as const,
};
export const functions = createCoreFunctions(artifact);
export function prepared(extra: Partial<FormDefinition> = {}) {
  const result = compile({
    definition: {
      protocolVersion: 'test-protocol',
      id: 'runtime-cases',
      version: 'draft',
      data: {
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            age: { type: 'number' },
            total: { type: 'number' },
            flag: { type: 'boolean' },
            absent: { type: 'object', properties: { child: { type: 'number' } } },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  age: { type: 'number' },
                  total: { type: 'number' },
                },
              },
            },
          },
        },
      },
      views: { only: { material: 'input', bind: '/name' } },
      ...extra,
    },
    catalog: {
      id: 'fixed',
      materials: {
        input: {
          manifest: {
            id: 'input',
            version: '1',
            propsSchema: { type: 'object' },
            bindings: { value: { schema: { type: 'string' } } },
          },
          artifact,
        },
      },
      pureFunctions: Object.fromEntries(
        Object.entries(functions).map(([id, binding]) => [
          id,
          { manifest: binding.manifest, artifact: binding.artifact },
        ]),
      ),
    },
  });
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  return result.prepared;
}
