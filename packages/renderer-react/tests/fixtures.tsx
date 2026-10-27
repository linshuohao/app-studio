import type { FormDefinition, ViewNode } from '@form-engine/protocol/definition';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import { compile } from '@form-engine/compiler';
import { createRuntime, type HostCapabilities } from '@form-engine/runtime';
import { createCoreFunctions } from '@form-engine/pure-functions';
import {
  createMaterialRegistry,
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '../src/index.js';
export const artifact = {
  id: 'renderer-tests',
  platform: 'web',
  digest: `sha256:${'3'.repeat(64)}` as const,
};
export const data = (path: string, scope?: string) => ({
  source: 'data' as const,
  path,
  ...(scope ? { scope } : {}),
});
export const inputContract = defineMaterialContract<{ label?: string }, 'value'>({
  id: 'input',
  version: '1',
  propsSchema: { type: 'object', properties: { label: { type: 'string' } } },
  bindings: { value: { schema: true } },
});
export function Input() {
  const a = useMaterialAdapter(inputContract);
  const value = a.values.value;
  return (
    <label>
      {a.props.label ?? 'Name'}
      <input
        aria-label={a.props.label ?? 'Name'}
        value={value.kind === 'value' ? String(value.value ?? '') : ''}
        onChange={(e) => a.set('value', e.target.value)}
      />
      <span data-testid="status">{a.validation.value.status}</span>
    </label>
  );
}
export const boxContract = defineMaterialContract({ id: 'box', version: '1', slots: ['default'] });
export function Box() {
  return <section>{useMaterialAdapter(boxContract).slots.default}</section>;
}
export const definitions = [
  defineMaterial(inputContract, artifact, Input),
  defineMaterial(boxContract, artifact, Box),
];
export const materials = createMaterialRegistry(definitions);
export function setup(
  view: ViewNode = { material: 'input', bindings: { value: data('/name') } },
  options: {
    definition?: Partial<FormDefinition>;
    initial?: unknown;
    extraMaterials?: MaterialManifest[];
    context?: unknown;
    host?: HostCapabilities;
    profile?: string;
  } = {},
) {
  const functions = createCoreFunctions(artifact);
  const result = compile({
    target: options.profile ? { profile: options.profile } : undefined,
    definition: {
      protocolVersion: 'tests',
      id: 'renderer',
      version: '1',
      data: {
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            count: { type: 'number' },
            flag: { type: 'boolean' },
            rows: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' } } },
            },
          },
        },
      },
      views: { main: view },
      ...options.definition,
    },
    catalog: {
      id: 'tests',
      materials: Object.fromEntries(
        [...definitions.map((d) => d.contract.manifest), ...(options.extraMaterials ?? [])].map(
          (manifest) => [manifest.id, { manifest, artifact }],
        ),
      ),
      pureFunctions: Object.fromEntries(
        Object.entries(functions).map(([id, binding]) => [
          id,
          { manifest: binding.manifest, artifact: binding.artifact },
        ]),
      ),
    },
  });
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  return {
    prepared: result.prepared,
    runtime: createRuntime({
      prepared: result.prepared,
      data: options.initial ?? {
        name: 'Alice',
        count: 1,
        flag: true,
        rows: [{ name: 'A' }, { name: 'B' }],
      },
      context: options.context,
      host: options.host,
      functions,
    }),
  };
}
