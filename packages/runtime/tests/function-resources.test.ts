import { expect, it } from 'vitest';
import { compile } from '@form-engine/compiler';
import type { PureFunctionManifest } from '@form-engine/protocol/capability';
import { createRuntime } from '../src/index.js';
import { artifact, data } from './fixtures.js';

it('参数 / rest / 返回签名共享 Prepared 闭合资源，并保留 Compiler 的相对引用基址', async () => {
  const manifest: PureFunctionManifest = {
    id: 'app.ok',
    version: '1',
    parameters: [{ name: 'age', schema: { $ref: 'https://example.test/age' } }],
    restParameter: { name: 'more', schema: { $ref: 'argument' } },
    returns: { $ref: 'https://example.test/boolean' },
  };
  const result = compile({
    definition: {
      protocolVersion: 'test',
      id: 'resources',
      version: 'draft',
      data: { schema: { type: 'object', properties: { age: { type: 'number' } } } },
      views: { main: { material: 'display' } },
      constraints: [
        {
          id: 'ok',
          kind: 'internal',
          assert: { op: 'app.ok', args: [{ ref: data('/age') }, 3] },
          issue: { target: data('/age'), code: 'BAD' },
        },
      ],
    },
    catalog: {
      id: 'fixed',
      materials: { display: { manifest: { id: 'display', version: '1' }, artifact } },
      pureFunctions: { 'app.ok': { manifest, artifact } },
    },
    schemaResources: {
      'https://example.test/age': { type: 'number' },
      'https://example.test/boolean': { type: 'boolean' },
      'https://form-engine.invalid/function/app.ok/parameter/argument': { type: 'number' },
    },
  });
  expect(result.success).toBe(true);
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  const runtime = createRuntime({
    prepared: result.prepared,
    data: { age: 20 },
    functions: { 'app.ok': { manifest, artifact, invoke: () => true } },
  });
  expect((await runtime.validate()).status).toBe('valid');
  runtime.dispose();
});

it('无 $id 的业务根 Schema 也沿用 Compiler 基址解析相对资源', async () => {
  const result = compile({
    definition: {
      protocolVersion: 'test',
      id: 'root-resources',
      version: 'draft',
      data: { schema: { $ref: 'model' } },
      views: { only: { material: 'display' } },
    },
    catalog: {
      id: 'fixed',
      materials: { display: { manifest: { id: 'display', version: '1' }, artifact } },
      pureFunctions: {},
    },
    schemaResources: {
      'https://form-engine.invalid/schema/model': {
        type: 'object',
        properties: { age: { type: 'number' } },
      },
    },
  });
  expect(result.success).toBe(true);
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  const runtime = createRuntime({ prepared: result.prepared, data: { age: '-' } });
  expect((await runtime.validate()).status).toBe('invalid');
  runtime.dispose();
});

it('外部资源相对 $id 保留检索基址，资源内部相对 $ref 正确解析', async () => {
  const result = compile({
    definition: {
      protocolVersion: 'test',
      id: 'nested-resources',
      version: 'draft',
      data: { schema: { $ref: 'https://example.test/retrieved' } },
      views: { only: { material: 'display' } },
    },
    catalog: {
      id: 'fixed',
      materials: { display: { manifest: { id: 'display', version: '1' }, artifact } },
      pureFunctions: {},
    },
    schemaResources: {
      'https://example.test/retrieved': {
        $id: './model',
        type: 'object',
        properties: { age: { $ref: './number' } },
      },
      'https://example.test/number': { type: 'number' },
    },
  });
  expect(result.success).toBe(true);
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  const runtime = createRuntime({ prepared: result.prepared, data: { age: 20 } });
  expect((await runtime.validate()).status).toBe('valid');
  runtime.dispose();
});
