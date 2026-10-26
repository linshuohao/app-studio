import { describe, expect, it } from 'vitest';
import { compile } from '@form-engine/compiler';
import { createRuntime, type ReadonlyJson } from '@form-engine/runtime';
import type { DataReference } from '@form-engine/protocol/definition';
import type { PreparedMaterialNode, PreparedExpressionValue } from '@form-engine/protocol/prepared';

const field = (path: string): DataReference => ({ source: 'data', path });
function form() {
  const result = compile({
    definition: {
      protocolVersion: 'test-protocol',
      id: 'four-scenarios',
      version: 'draft',
      data: {
        schema: {
          type: 'object',
          required: ['name', 'eligible'],
          properties: {
            name: { type: 'string', minLength: 1 },
            eligible: { type: 'boolean' },
            mirror: { type: 'string' },
          },
        },
      },
      views: {
        only: { material: 'display', props: { label: { $expr: { ref: field('/name') } } } },
      },
      reactions: [
        {
          id: 'copy-name',
          watch: [field('/name')],
          then: [
            { op: 'set', target: field('/mirror'), value: { $expr: { ref: field('/name') } } },
          ],
        },
        {
          id: 'validation-feedback',
          watch: [{ source: 'validation', field: field('/name'), observe: 'status' }],
          then: [
            {
              type: 'host.emit',
              event: 'validation.changed',
              payload: {
                $expr: { ref: { source: 'validation', field: field('/name'), observe: 'state' } },
              },
            },
          ],
        },
      ],
      constraints: [
        {
          id: 'eligible',
          kind: 'internal',
          assert: { ref: field('/eligible') },
          issue: { target: field('/name'), code: 'NOT_ELIGIBLE' },
        },
        {
          id: 'identity',
          kind: 'external',
          validator: 'identity.check',
          watch: [field('/name')],
          target: field('/name'),
          requires: [{ kind: 'field', target: field('/name'), phase: 'sync' }],
        },
      ],
    },
    catalog: {
      id: 'scenario-catalog',
      materials: {
        display: {
          manifest: {
            id: 'display',
            version: '1',
            propsSchema: { type: 'object', properties: { label: { type: 'string' } } },
          },
          artifact: { id: 'application', platform: 'web', digest: `sha256:${'2'.repeat(64)}` },
        },
      },
      pureFunctions: {},
    },
  });
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  return result.prepared;
}

describe('L1 → 真实 Compiler → Runtime → View / Host 接缝', () => {
  it('初始化、编辑、视图投影、校验结果与 Host 保存成功使用同一份业务数据', async () => {
    const prepared = form(),
      feedback: ReadonlyJson[] = [],
      saved: ReadonlyJson[] = [];
    const runtime = createRuntime({
      prepared,
      data: { name: 'Alice', eligible: true, mirror: 'host-initial' },
      host: {
        validators: { 'identity.check': () => ({ result: Promise.resolve([]) }) },
        events: {
          'validation.changed': (input) => {
            feedback.push(input.payload!);
          },
        },
      },
    });
    const view = prepared.definition.views.only as PreparedMaterialNode;
    const label = view.props!.label!;
    if (
      typeof label !== 'object' ||
      label === null ||
      Array.isArray(label) ||
      !('$expr' in label) ||
      !('watch' in label)
    )
      throw Error('Expected Prepared expression');
    const displayed: unknown[] = [runtime.evaluateValue(label).value];
    const mounted = runtime.observe((label as PreparedExpressionValue).watch, () => {
      displayed.push(runtime.evaluateValue(label).value);
    });
    await runtime.flush();
    expect(runtime.read(field('/mirror')).value).toBe('host-initial'); // default runOnActivate=false
    runtime.dispatch({ op: 'set', target: field('/name'), value: 'Bob' });
    expect(displayed).toEqual(['Alice', 'Bob']);
    await runtime.flush();
    expect(runtime.read(field('/mirror')).value).toBe('Bob');
    const proof = await runtime.validate();
    expect(proof.status).toBe('valid');
    if (proof.status === 'valid') saved.push(proof.snapshot); // Host converts / sends this exact snapshot.
    expect(saved).toEqual([{ name: 'Bob', eligible: true, mirror: 'Bob' }]);
    await runtime.flush();
    expect(
      feedback.some(
        (state) =>
          typeof state === 'object' &&
          state !== null &&
          'status' in state &&
          state.status === 'valid',
      ),
    ).toBe(true);
    mounted.dispose();
    runtime.dispose();
  });
  it('业务失败、校验执行失败与 Host 保存失败分别处理，不把技术异常当业务 Issue', async () => {
    for (const mode of ['business', 'validator', 'save'] as const) {
      const runtime = createRuntime({
        prepared: form(),
        data: { name: 'Alice', eligible: mode !== 'business' },
        host: {
          validators: {
            'identity.check': () => ({
              result: mode === 'validator' ? Promise.reject(Error('offline')) : Promise.resolve([]),
            }),
          },
        },
      });
      const proof = await runtime.validate();
      if (mode === 'business')
        expect(proof).toMatchObject({
          status: 'invalid',
          issues: expect.arrayContaining([expect.objectContaining({ code: 'NOT_ELIGIBLE' })]),
        });
      if (mode === 'validator') {
        expect(proof.status).toBe('incomplete');
        expect(proof.issues).toEqual([]);
      }
      if (mode === 'save') {
        expect(proof.status).toBe('valid');
        const save = async (_snapshot: ReadonlyJson) => {
          throw Error('save failed');
        };
        await expect(save(proof.snapshot)).rejects.toThrow('save failed');
        expect(proof.status).toBe('valid'); // Host delivery error does not rewrite completed form proof.
      }
      runtime.dispose();
    }
  });
});
