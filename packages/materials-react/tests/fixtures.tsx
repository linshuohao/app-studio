import { afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, act } from '@testing-library/react';
import { compile } from '@form-engine/compiler';
import { createCoreFunctions } from '@form-engine/pure-functions';
import { createRuntime } from '@form-engine/runtime';
import type { JsonSchema, JsonValue } from '@form-engine/protocol';
import type { ViewNode, FormDefinition } from '@form-engine/protocol/definition';
import {
  FormRenderer,
  createMaterialRegistry,
  type HostRequestRegistry,
} from '@form-engine/renderer-react';
import {
  createTextInput,
  createNumberInput,
  createCheckbox,
  createSelect,
  createButton,
  createField,
  createValueDisplay,
  createSection,
  createGrid,
  createCondition,
  createArrayEditor,
  createDialogEditor,
  createInsuredSummary,
  createDateRange,
  createRemoteSelect,
} from '../src/index.js';
const artifact = {
  id: 'materials-tests',
  platform: 'web',
  digest: `sha256:${'4'.repeat(64)}` as const,
};
const definitions = [
  createTextInput,
  createNumberInput,
  createCheckbox,
  createSelect,
  createButton,
  createField,
  createValueDisplay,
  createSection,
  createGrid,
  createCondition,
  createArrayEditor,
  createDialogEditor,
  createInsuredSummary,
  createDateRange,
  createRemoteSelect,
].map((create) => create(artifact));
const materials = createMaterialRegistry(definitions);
const sessions: ReturnType<typeof createRuntime>[] = [];
afterEach(() => {
  for (const runtime of sessions.splice(0)) runtime.dispose();
});
export const ref = (path = '/value', scope?: string) => ({
  source: 'data' as const,
  path,
  ...(scope ? { scope } : {}),
});
export function setup(
  view: ViewNode,
  initial: JsonValue = '',
  schema: JsonSchema = { type: ['string', 'null'] },
  present = true,
  options: {
    definition?: Partial<FormDefinition>;
    initial?: JsonValue;
    profile?: string;
    strict?: boolean;
    requests?: HostRequestRegistry;
  } = {},
) {
  const functions = createCoreFunctions(artifact);
  const prepare = (profile?: string) => {
    const compiled = compile({
      target: profile ? { profile } : undefined,
      definition: {
        protocolVersion: 'test',
        id: 'materials',
        version: 'test',
        data: { schema: { type: 'object', properties: { value: schema } } },
        views: { main: view },
        ...options.definition,
      },
      catalog: {
        id: 'materials-tests',
        materials: Object.fromEntries(
          definitions.map((d) => [
            d.contract.manifest.id,
            { manifest: d.contract.manifest, artifact },
          ]),
        ),
        pureFunctions: Object.fromEntries(
          Object.entries(functions).map(([id, binding]) => [
            id,
            { manifest: binding.manifest, artifact: binding.artifact },
          ]),
        ),
      },
    });
    if (!compiled.success) throw Error(JSON.stringify(compiled.diagnostics));
    return compiled.prepared;
  };
  const prepared = prepare(options.profile);
  const engine = createRuntime({
    prepared,
    functions,
    data: options.initial ?? (present ? { value: initial } : {}),
  });
  sessions.push(engine);
  const runtime = { ...engine, dispatch: vi.fn(engine.dispatch), interact: vi.fn(engine.interact) };
  const content = (profile?: string) => {
    const element = (
      <FormRenderer
        prepared={profile ? prepare(profile) : prepared}
        runtime={runtime}
        materials={materials}
        requests={options.requests}
      />
    );
    return options.strict ? <StrictMode>{element}</StrictMode> : element;
  };
  const rendered = render(content());
  return {
    ...rendered,
    runtime,
    switchProfile: (profile: string) => rendered.rerender(content(profile)),
    value: () => runtime.evaluate({ ref: ref() }),
    set: async (value: JsonValue) => {
      await act(async () => {
        runtime.dispatch({ op: 'set', target: ref(), value: { $literal: value } });
        await runtime.flush();
      });
    },
  };
}
export function field(material: string, props: Record<string, JsonValue> = {}): ViewNode {
  return {
    material: 'field',
    props: { label: '测试字段', help: '字段帮助', requiredMark: true },
    bindings: { value: ref() },
    slots: { default: [{ material, props, bindings: { value: ref() } }] },
  };
}
