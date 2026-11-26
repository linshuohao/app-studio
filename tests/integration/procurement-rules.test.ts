import { beforeAll, expect, it, vi } from 'vitest';
import { compile } from '@form-engine/compiler';
import type { JsonValue } from '@form-engine/protocol';
import type { Expression, FormDefinition } from '@form-engine/protocol/definition';
import { webCatalog } from '../../services/api/src/platform/web-check';
import { createRuntime } from '@form-engine/runtime';

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

const root = (path: string) => ({ source: 'data' as const, path });
const row = (path: string) => ({ ...root(path), scope: 'row' });
const scope = { from: root('/items'), as: 'row', mode: 'each' as const };
const subtotal: Expression = {
  op: 'core.mul',
  args: [{ ref: row('/quantity') }, { ref: row('/unitPriceMinor') }],
};
const total: Expression = {
  op: 'array.sumProducts',
  args: [{ ref: root('/items') }, 'quantity', 'unitPriceMinor'],
};
const matches: Expression = {
  op: 'array.countNormalizedText',
  args: [{ ref: root('/items') }, 'sku', { ref: row('/sku') }],
};
const date: Expression = { ref: root('/neededBy') };
const above = row('/wasAtThreshold');
const watch = [row('/quantity'), row('/unitPriceMinor')];
const definition: FormDefinition = {
  protocolVersion: '1',
  id: 'procurement-rules',
  version: 'test',
  data: {
    schema: {
      type: 'object',
      required: ['items', 'budgetMinor', 'neededBy'],
      properties: {
        budgetMinor: { type: 'integer', minimum: 0 },
        neededBy: { type: 'string', format: 'date' },
        items: {
          type: 'array',
          default: [],
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            required: ['sku', 'quantity', 'unitPriceMinor'],
            properties: {
              sku: { type: 'string', minLength: 1 },
              quantity: { type: 'integer', minimum: 1, maximum: 1000 },
              unitPriceMinor: { type: 'integer', minimum: 1, maximum: 10000000 },
              comparisonNo: { type: 'string' },
              wasAtThreshold: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  constraints: [
    {
      id: 'unique-sku',
      kind: 'internal',
      scope,
      when: { op: 'core.exists', args: [{ ref: row('/sku') }] },
      assert: {
        op: 'core.and',
        args: [
          { op: 'core.ne', args: [matches, null] },
          { op: 'core.lte', args: [matches, 1] },
        ],
      },
      issue: { target: row('/sku'), code: 'DUPLICATE_SKU' },
    },
    {
      id: 'budget',
      kind: 'internal',
      when: {
        op: 'core.and',
        args: [
          { op: 'core.exists', args: [{ ref: root('/budgetMinor') }] },
          { op: 'core.ne', args: [total, null] },
        ],
      },
      assert: {
        op: 'core.and',
        args: [
          { op: 'core.ne', args: [total, null] },
          { op: 'core.lte', args: [total, { ref: root('/budgetMinor') }] },
        ],
      },
      issue: { target: root('/budgetMinor'), code: 'OVER_BUDGET' },
    },
    {
      id: 'date',
      kind: 'internal',
      when: { op: 'core.exists', args: [date] },
      assert: { op: 'core.ne', args: [{ op: 'date.inclusiveDays', args: [date, date] }, null] },
      issue: { target: root('/neededBy'), code: 'INVALID_DATE' },
    },
  ],
  reactions: [
    {
      id: 'record-qualifying',
      scope,
      watch,
      runOnActivate: true,
      when: {
        op: 'core.and',
        args: [
          { op: 'core.exists', args: [{ ref: row('/quantity') }] },
          { op: 'core.exists', args: [{ ref: row('/unitPriceMinor') }] },
          { op: 'core.gte', args: [subtotal, 500000] },
        ],
      },
      then: [{ op: 'set', target: above, value: true }],
    },
    {
      id: 'clear-after-crossing',
      scope,
      watch,
      when: {
        op: 'core.and',
        args: [
          { op: 'core.exists', args: [{ ref: above }] },
          { ref: above },
          { op: 'core.exists', args: [{ ref: row('/quantity') }] },
          { op: 'core.exists', args: [{ ref: row('/unitPriceMinor') }] },
          { op: 'core.lt', args: [subtotal, 500000] },
        ],
      },
      then: [
        { op: 'remove', target: row('/comparisonNo') },
        { op: 'set', target: above, value: false },
      ],
    },
  ],
  views: { default: { material: 'display' } },
};

function start(data: JsonValue) {
  const artifact = {
    id: 'procurement-test',
    platform: 'web',
    digest: `sha256:${'d'.repeat(64)}` as const,
  };
  const catalog = webCatalog(artifact.id, artifact, artifact);
  const { functions } = createWebCapabilities(artifact, artifact);
  const result = compile({
    definition,
    catalog: {
      ...catalog,
      materials: {
        ...catalog.materials,
        display: { manifest: { id: 'display', version: '1' }, artifact },
      },
    },
  });
  if (!result.success) throw new Error(JSON.stringify(result.diagnostics));
  return createRuntime({ prepared: result.prepared, data, functions });
}

it('R41 initializes a missing array from the property default and preserves explicit input', () => {
  const missing = start({});
  const supplied = start({ items: [{ sku: 'kept' }] });
  try {
    expect(missing.snapshot()).toEqual({ items: [] });
    expect(supplied.snapshot()).toEqual({ items: [{ sku: 'kept' }] });
  } finally {
    missing.dispose();
    supplied.dispose();
  }
});

it('R33, R34, R5 use full-row matching, integer amount calculation and Gregorian dates', async () => {
  const runtime = start({
    items: [
      { sku: ' B-2 ', quantity: 2, unitPriceMinor: 150000 },
      { sku: 'b-2', quantity: 3, unitPriceMinor: 100000 },
    ],
    budgetMinor: 600000,
    neededBy: '2025-02-29',
  });
  try {
    const errors = (await runtime.validate()).issues.map((issue) => issue.code).sort();
    expect(errors).toEqual(['DUPLICATE_SKU', 'DUPLICATE_SKU', 'INVALID_DATE']);
    for (const index of [0, 1]) {
      expect(
        runtime.getValidation(root(`/items/${index}/sku`)).issues.map((issue) => issue.code),
      ).toContain('DUPLICATE_SKU');
    }
    runtime.dispatch({ op: 'set', target: root('/items/1/sku'), value: 'B-20' });
    runtime.dispatch({ op: 'set', target: root('/neededBy'), value: '2024-02-29' });
    expect((await runtime.validate()).status).toBe('valid');
    runtime.dispatch({ op: 'set', target: root('/items/1/unitPriceMinor'), value: 100001 });
    expect((await runtime.validate()).issues.map((issue) => issue.code)).toEqual(['OVER_BUDGET']);
  } finally {
    runtime.dispose();
  }
});

it('leaves a missing budget to field validation even when the total is known', async () => {
  const runtime = start({
    items: [{ sku: 'A', quantity: 2, unitPriceMinor: 100000 }],
    neededBy: '2024-02-29',
  });
  try {
    const result = await runtime.validate();
    expect(result.status).toBe('invalid');
    expect(result.issues.map((issue) => issue.code)).not.toContain('OVER_BUDGET');
  } finally {
    runtime.dispose();
  }
});

it('R30 clears only a member that crosses below the threshold, including after a reorder', async () => {
  const runtime = start({
    items: [
      { sku: 'A', quantity: 5, unitPriceMinor: 100000, comparisonNo: 'R-A' },
      { sku: 'B', quantity: 2, unitPriceMinor: 100000, comparisonNo: 'R-B' },
    ],
    budgetMinor: 900000,
    neededBy: '2024-02-29',
  });
  try {
    await runtime.flush();
    runtime.dispatch({ op: 'set', target: root('/items/1/quantity'), value: 3 });
    await runtime.flush();
    expect(runtime.snapshot()).toMatchObject({
      items: [{ comparisonNo: 'R-A' }, { comparisonNo: 'R-B' }],
    });
    const [first] = runtime.bind(scope);
    expect(
      runtime.dispatch(
        {
          op: 'array.move',
          target: root('/items'),
          item: { $scope: 'row' },
          position: { kind: 'index', index: 1 },
        },
        first,
      ).ok,
    ).toBe(true);
    await runtime.flush();
    runtime.dispatch({ op: 'set', target: root('/items/1/quantity'), value: 4 });
    await runtime.flush();
    const { items } = runtime.snapshot() as { items: { comparisonNo?: string }[] };
    expect(items[0]?.comparisonNo).toBe('R-B');
    expect(items[1]).not.toHaveProperty('comparisonNo');
  } finally {
    runtime.dispose();
  }
});
