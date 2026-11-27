// @vitest-environment jsdom

import { runInThisContext } from 'node:vm';
import * as runtime from '@form-engine/runtime';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { transform } from 'sucrase';
import { afterEach, expect, it, vi } from 'vitest';
import { candidateExample } from '../../apps/studio/src/app/candidate-jsx.js';
import * as passport from '../../apps/studio/src/app/host/passport-validator.js';
import * as projection from '../../apps/studio/src/app/host/underwriting-projection.js';
import * as renderer from '@form-engine/renderer-react';
import { previewInputs } from '../../services/api/src/platform/create-form-agent.js';
import { ReleaseBuild } from '../../services/api/src/platform/release-build.js';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function mountCandidate(
  prepared: ReadonlyPreparedForm,
  example: ReturnType<typeof candidateExample>,
  props: Record<string, unknown> = {},
) {
  const builds = new ReleaseBuild();
  const materialArtifact = Object.values(prepared.capabilityLock.materials)[0]!.artifact;
  vi.stubEnv('RELEASE_MATERIAL_DIGEST', materialArtifact.digest);
  vi.stubEnv(
    'RELEASE_FUNCTION_DIGEST',
    Object.values(previewInputs(builds).catalog.pureFunctions)[0]!.artifact.digest,
  );
  const capabilities = await import('../../apps/studio/src/app/web-capabilities.js');
  const modules = new Map<string, unknown>(
    Object.entries({
      react: React,
      'react/jsx-runtime': jsxRuntime,
      '@form-engine/runtime': runtime,
      '@form-engine/renderer-react': renderer,
      '@form-engine/materials-react/styles.css': {},
      './web-capabilities': capabilities,
      './host/passport-validator': passport,
      './host/underwriting-projection': projection,
      './prepared.json': prepared,
      './sample-data.json': example.sample,
    }),
  );
  const { code } = transform(example.jsx!, {
    transforms: ['jsx', 'imports'],
    jsxRuntime: 'automatic',
    production: true,
  });
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  const initialize = runInThisContext(`(function(require, exports) {${code}\n})`);
  initialize((id: string) => {
    if (!modules.has(id)) throw new Error(`Unexpected generated import: ${id}`);
    return modules.get(id);
  }, exports);
  const Component = exports.default;
  if (!Component) throw new Error('Generated JSX must export a component');
  const mounted = render(React.createElement(Component, props));
  return (nextProps: Record<string, unknown>) =>
    mounted.rerender(React.createElement(Component, nextProps));
}

it('mounts the copied JSX with its Prepared JSON and executes the declared preview event', async () => {
  const fields = (names: string[]) =>
    Object.fromEntries(names.map((name) => [name, { type: 'string' }]));
  const identity = fields([
    'name',
    'surname',
    'givenName',
    'birthDate',
    'passportNumber',
    'passportExpiry',
  ]);
  const builds = new ReleaseBuild();
  const result = await builds.compile(
    JSON.stringify({
      protocolVersion: '1.0',
      id: 'channel-screening-guide',
      version: '1.0',
      data: {
        schema: {
          type: 'object',
          properties: {
            applicant: {
              type: 'object',
              required: ['mobile'],
              properties: { ...identity, ...fields(['email', 'mobile']) },
            },
            insureds: {
              type: 'array',
              items: { type: 'object', properties: { ...identity, ...fields(['relationship']) } },
            },
            confirmed: { type: 'boolean' },
          },
        },
      },
      views: {
        default: {
          material: 'button',
          props: { label: '模拟初核' },
          on: {
            activate: { type: 'host.emit', event: 'travel.previewUnderwritingSubmit' },
          },
        },
      },
    }),
    previewInputs(builds),
  );
  if (!result.success) throw new Error(JSON.stringify(result.diagnostics));
  const example = candidateExample(result.prepared);
  expect(example.unsupported).toEqual([]);
  expect(example.jsx).toBeDefined();
  await mountCandidate(result.prepared, example);
  fireEvent.click(screen.getByRole('button', { name: '模拟初核' }));
  expect(await screen.findByText('本地校验与投影通过，渠道核保待接入。')).toBeTruthy();
});

it('wires purchase array insertion and sends only a valid snapshot to the supplied Host', async () => {
  const builds = new ReleaseBuild();
  const root = (path: string) => ({ source: 'data', path });
  const result = await builds.compile(
    JSON.stringify({
      protocolVersion: '1.0',
      id: 'purchase-integration',
      version: '1.0',
      data: {
        schema: {
          type: 'object',
          required: ['items', 'budgetMinor'],
          properties: {
            budgetMinor: { type: 'integer' },
            items: {
              type: 'array',
              default: [],
              maxItems: 2,
              items: {
                type: 'object',
                required: ['lineId', 'quantity', 'unitPriceMinor'],
                properties: {
                  lineId: { type: 'string' },
                  quantity: { type: 'integer' },
                  unitPriceMinor: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      constraints: [
        {
          id: 'budget-within-limit',
          kind: 'internal',
          assert: { op: 'core.lte', args: [600000, { ref: root('/budgetMinor') }] },
          issue: { target: root('/budgetMinor'), code: 'OVER_BUDGET' },
        },
      ],
      views: { default: { material: 'button', props: { label: '采购表单' } } },
    }),
    previewInputs(builds),
  );
  if (!result.success) throw new Error(JSON.stringify(result.diagnostics));

  const generated = candidateExample(
    result.prepared,
    'projectPurchase(snapshot) */\u2028throw Error("model text is not executed")',
  );
  expect(generated.jsx).toContain('//   projectPurchase(snapshot) */\n//   throw');
  const first = { lineId: 'line-1', quantity: 2, unitPriceMinor: 150000 };
  const second = { lineId: 'line-2', quantity: 3, unitPriceMinor: 100000 };
  const createPurchaseLine = vi.fn(() => second);
  let resolveReceipt: ((receipt: { receiptId: string }) => void) | undefined;
  const receipt = new Promise<{ receiptId: string }>((resolve) => {
    resolveReceipt = resolve;
  });
  const submitPurchaseRequest = vi.fn(() => receipt);
  const integration = { createPurchaseLine, submitPurchaseRequest };

  const rerender = await mountCandidate(result.prepared, generated, {
    data: { items: [first], budgetMinor: 600000 },
    integration,
  });
  const add = screen.getByRole('button', { name: '新增采购明细' });
  fireEvent.click(add);
  expect(createPurchaseLine).toHaveBeenCalledWith({ items: [first], index: 1 });
  expect(add.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '送审' }));
  await waitFor(() => {
    expect(submitPurchaseRequest).toHaveBeenCalledExactlyOnceWith({
      snapshot: { items: [first, second], budgetMinor: 600000 },
    });
  });
  rerender({ data: { items: [first], budgetMinor: 600000 }, integration: { ...integration } });
  expect(add.hasAttribute('disabled')).toBe(true);
  resolveReceipt?.({ receiptId: 'T-1' });
  expect(await screen.findByText('采购回执 T-1')).toBeTruthy();

  cleanup();
  await mountCandidate(result.prepared, generated, {
    data: { items: [first, second], budgetMinor: 599999 },
    integration,
  });
  fireEvent.click(screen.getByRole('button', { name: '送审' }));
  expect(await screen.findByText('整单校验未通过。')).toBeTruthy();
  expect(submitPurchaseRequest).toHaveBeenCalledTimes(1);
});
