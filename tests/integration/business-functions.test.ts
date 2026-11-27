import { beforeAll, expect, it, vi } from 'vitest';
import { compile } from '@form-engine/compiler';
import { createRuntime } from '@form-engine/runtime';
import { createTextIsNonBlank } from '@form-engine/pure-functions';
import { webCatalog } from '../../services/api/src/platform/web-check';

let createWebCapabilities: typeof import('../../apps/studio/src/app/web-capabilities').createWebCapabilities;
beforeAll(async () => {
  vi.stubEnv('RELEASE_MATERIAL_DIGEST', `sha256:${'a'.repeat(64)}`);
  vi.stubEnv('RELEASE_FUNCTION_DIGEST', `sha256:${'b'.repeat(64)}`);
  try {
    ({ createWebCapabilities } = await import('../../apps/studio/src/app/web-capabilities'));
  } finally {
    vi.unstubAllEnvs();
  }
});

it('uses the generated business function through a real prepared constraint and full validation', async () => {
  const artifact = {
    id: 'business-function-test',
    platform: 'ts',
    digest: `sha256:${'b'.repeat(64)}` as const,
  };
  const binding = createTextIsNonBlank(artifact);
  const result = compile({
    definition: {
      protocolVersion: '1',
      id: 'nonblank',
      version: 'test',
      data: {
        schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      },
      constraints: [
        {
          id: 'name-nonblank',
          kind: 'internal',
          assert: { op: 'text.isNonBlank', args: [{ ref: { source: 'data', path: '/name' } }] },
          issue: { target: { source: 'data', path: '/name' }, code: 'NAME_REQUIRED' },
        },
      ],
      views: { only: { material: 'display' } },
    },
    catalog: {
      id: 'business-function-test',
      materials: { display: { manifest: { id: 'display', version: '1' }, artifact } },
      pureFunctions: { 'text.isNonBlank': { manifest: binding.manifest, artifact } },
    },
  });
  expect(result.success).toBe(true);
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  const runtime = createRuntime({
    prepared: result.prepared,
    data: { name: ' \t\u3000 ' },
    functions: { 'text.isNonBlank': binding },
  });
  try {
    expect((await runtime.validate()).status).toBe('invalid');
    runtime.dispatch({ op: 'set', target: { source: 'data', path: '/name' }, value: ' 张三 ' });
    await runtime.flush();
    const proof = await runtime.validate();
    expect(proof.status).toBe('valid');
    expect(proof.snapshot).toEqual({ name: ' 张三 ' });
  } finally {
    runtime.dispose();
  }
});

it('provides the expense functions advertised by the API in the Studio Web host', () => {
  const artifact = {
    id: 'expense-functions-test',
    platform: 'web',
    digest: `sha256:${'e'.repeat(64)}` as const,
  };
  const catalog = webCatalog(artifact.id, artifact, artifact);
  const { functions } = createWebCapabilities(artifact, artifact);
  for (const id of ['expense.countInvoiceMatches', 'expense.hotelStandardStatus']) {
    expect(catalog.pureFunctions?.[id]?.manifest.id).toBe(id);
    expect(functions[id]).toMatchObject(catalog.pureFunctions?.[id] ?? {});
  }
});
