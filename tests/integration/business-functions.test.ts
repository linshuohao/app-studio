import { expect, it } from 'vitest';
import { compile } from '@form-engine/compiler';
import { createRuntime } from '@form-engine/runtime';
import { createTextIsNonBlank } from '@form-engine/pure-functions';

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
