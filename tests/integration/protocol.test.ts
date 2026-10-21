import { describe, expect, it } from 'vitest';
import definitionSchema from '@form-engine/protocol/schemas/form-definition.schema.json' with { type: 'json' };
import preparedSchema from '@form-engine/protocol/schemas/prepared-form.schema.json' with { type: 'json' };
import type {
  CompilerInputDefinition,
  FormDefinition,
  SetCommand,
} from '@form-engine/protocol/definition';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import type {
  DataWatch,
  PreparedForm,
  PreparedOnDemandValueSpec,
  PreparedValueSpec,
} from '@form-engine/protocol/prepared';

describe('protocol public consumption', () => {
  it('exposes domain types and JSON resources through package exports', () => {
    const definition: FormDefinition = {
      protocolVersion: 'test',
      id: 'consumer',
      version: 'draft',
      data: { schema: { type: 'object' } },
      views: { web: { material: 'input' } },
    };
    const command: SetCommand = {
      op: 'set',
      target: { source: 'data', path: '/name' },
      value: 'Ada',
    };
    const manifest: MaterialManifest = {
      id: 'input',
      version: 'test',
      bindings: { value: { schema: { type: 'string' } } },
    };
    const format: PreparedForm['preparedFormatVersion'] = 'test';
    // The default Compiler input also accepts canonical definitions, without a syntax selector.
    const compilerInput: CompilerInputDefinition = definition;
    const dependency: DataWatch = { source: 'data', path: '/name' };
    const reactive = {
      $expr: { ref: { source: 'data', path: '/name' } },
      watch: [dependency],
    } satisfies PreparedValueSpec;
    const payload: PreparedOnDemandValueSpec = {
      $expr: { ref: { source: 'event', path: '' } },
    };
    // @ts-expect-error reactive expressions must carry their compiled watch, even if it is empty
    const missingWatch: PreparedValueSpec = { $expr: true };
    // @ts-expect-error invocation-time expressions cannot silently acquire a subscription
    const watchedPayload: PreparedOnDemandValueSpec = { $expr: true, watch: [] };
    void missingWatch;
    void watchedPayload;
    expect(definition.views.web).toEqual({ material: 'input' });
    expect(command.value).toBe('Ada');
    expect(manifest.bindings?.value?.schema).toEqual({ type: 'string' });
    expect(format).toBe('test');
    expect(compilerInput.views.web).toEqual({ material: 'input' });
    expect(reactive.watch).toEqual([{ source: 'data', path: '/name' }]);
    expect(payload).toEqual({ $expr: { ref: { source: 'event', path: '' } } });
    expect(definitionSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(preparedSchema.$defs.PreparedForm).toBeDefined();
  });
});
