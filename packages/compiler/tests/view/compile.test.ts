import { describe, expect, it } from 'vitest';
import { compile, type CompileInput } from '../../src/index.js';
import { input } from '../fixtures.js';

const data = (path: string, scope?: string) => ({
  source: 'data' as const,
  path,
  ...(scope !== undefined ? { scope } : {}),
});
function prepared(value: CompileInput) {
  const result = compile(value);
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  expect(JSON.parse(JSON.stringify(result.prepared))).toEqual(result.prepared);
  return result.prepared;
}
function codes(value: CompileInput) {
  const result = compile(value);
  expect(result.success).toBe(false);
  expect(result).not.toHaveProperty('prepared');
  return result.diagnostics.map((d) => d.code);
}

describe('shared templates, event and request boundaries', () => {
  it('keeps one prepared template with parameter-relative watch for multiple uses', () => {
    const value = input();
    value.definition.viewTemplates = {
      field: {
        params: { person: { schemaRef: '#/properties/name' } },
        node: {
          material: 'input',
          bindings: { value: data('', 'person') },
          props: { label: { $expr: { ref: data('', 'person') } } },
        },
      },
      unused: { node: { material: 'missing-unused' } },
    };
    value.definition.views.only = {
      material: 'input',
      children: [
        { $use: 'field', with: { person: data('/name') } },
        { $use: 'field', with: { person: data('/name') } },
      ],
    };
    const result = prepared(value);
    expect(Object.keys(result.definition.viewTemplates!)).toEqual(['field']);
    expect(result.definition.viewTemplates!.field!.node).toMatchObject({
      props: { label: { watch: [data('', 'person')] } },
    });
    expect(result.definition.views.only).toMatchObject({
      slots: {
        default: [
          { $use: 'field', with: { person: data('/name') } },
          { $use: 'field', with: { person: data('/name') } },
        ],
      },
    });
  });
  it.each(['missing', 'extra', 'type', 'capture', 'cycle'] as const)(
    'rejects template %s errors',
    (kind) => {
      const value = input();
      value.definition.viewTemplates = {
        field: {
          params: { person: { schemaRef: '#/properties/name' } },
          node: { material: 'input' },
        },
      };
      value.definition.views.only = { $use: 'field', with: { person: data('/name') } };
      const expected = {
        missing: 'TEMPLATE_PARAMETER_MISSING',
        extra: 'TEMPLATE_PARAMETER_UNKNOWN',
        type: 'TEMPLATE_ARGUMENT_INCOMPATIBLE',
        capture: 'SCOPE_NOT_VISIBLE',
        cycle: 'TEMPLATE_CYCLE',
      }[kind];
      if (kind === 'missing') value.definition.views.only = { $use: 'field' };
      if (kind === 'extra') value.definition.views.only.with!.extra = data('/name');
      if (kind === 'type') value.definition.views.only.with!.person = data('/age');
      if (kind === 'capture')
        value.definition.viewTemplates.field!.node = {
          material: 'input',
          bindings: { value: data('/name', 'caller') },
        };
      if (kind === 'cycle')
        value.definition.viewTemplates.field!.node = {
          $use: 'field',
          with: { person: data('', 'person') },
        };
      expect(codes(value)).toContain(expected);
    },
  );
  it('checks Event payload expressions for commands without adding watch to on-demand values', () => {
    const value = input();
    value.catalog.materials.input!.manifest.events = {
      select: {
        payloadSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          additionalProperties: false,
        },
      },
    };
    value.definition.views.only = {
      material: 'input',
      on: {
        select: {
          type: 'form.command',
          command: {
            op: 'set',
            target: data('/name'),
            value: { $expr: { ref: { source: 'event', path: '/value' } } },
          },
        },
      },
    };
    expect(prepared(value).definition.views.only).toMatchObject({
      on: value.definition.views.only.on,
    });
    value.catalog.materials.input!.manifest.events.select = {};
    expect(codes(value)).toContain('EVENT_NOT_AVAILABLE');
  });
  it('extracts Host event requirements and checks known payload signatures', () => {
    const value = input();
    value.catalog.materials.input!.manifest.events = { select: {} };
    value.definition.views.only = {
      material: 'input',
      on: {
        select: {
          type: 'host.emit',
          event: 'selected',
          payload: { $expr: { ref: data('/name') } },
        },
      },
    };
    expect(prepared(value).hostRequirements.events).toEqual([
      { name: 'selected', optional: false },
    ]);
    value.catalog.host = {
      events: { selected: { optional: true, payloadSchema: { type: 'string' } } },
    };
    expect(prepared(value).hostRequirements.events).toEqual([{ name: 'selected', optional: true }]);
    value.catalog.host.events!.selected!.payloadSchema = { type: 'number' };
    expect(codes(value)).toContain('HOST_EVENT_PAYLOAD_INCOMPATIBLE');
  });
  it('prepares request policy and closed resources, forwards original payload and checks both Host directions', () => {
    const value = input();
    const shape = { type: 'string' };
    value.catalog.materials.input!.manifest.requests = {
      search: { payloadSchema: shape, resultSchema: shape },
    };
    value.definition.views.only = {
      material: 'input',
      requests: { search: { type: 'host.request', request: 'lookup' } },
    };
    const local = prepared(value);
    expect(local.definition.views.only).toMatchObject({
      requests: { search: { concurrency: 'latest' } },
    });
    expect(local.hostRequirements.requests).toEqual([
      { name: 'lookup', nodeIds: ['node:enrollment:/views/only'] },
    ]);
    value.catalog.host = { requests: { lookup: { payloadSchema: shape, resultSchema: shape } } };
    const output = prepared(value);
    if (!('material' in output.definition.views.only!)) throw Error('Expected material');
    const mapping = output.definition.views.only!.requests!.search!;
    for (const ref of [
      mapping.payloadSchemaRef,
      mapping.resultSchemaRef,
      mapping.hostPayloadSchemaRef!,
      mapping.hostResultSchemaRef!,
    ]) {
      const key = ref
        .slice('#/resources/requestSchemas/'.length)
        .replaceAll('~1', '/')
        .replaceAll('~0', '~');
      expect(output.resources.requestSchemas[key]).toMatchObject({
        type: 'string',
        $id: expect.any(String),
      });
    }
    value.catalog.host.requests!.lookup!.resultSchema = { type: 'number' };
    expect(codes(value)).toContain('REQUEST_RESULT_INCOMPATIBLE');
    value.catalog.host.requests!.lookup!.resultSchema = shape;
    value.catalog.host.requests!.lookup!.payloadSchema = { type: 'number' };
    expect(codes(value)).toContain('REQUEST_PAYLOAD_INCOMPATIBLE');
  });
  it('analyzes mapped request payload with Event scope and does not add automatic retransmission watch', () => {
    const value = input();
    value.catalog.materials.input!.manifest.requests = {
      search: {
        payloadSchema: { type: 'object', properties: { query: { type: 'string' } } },
        resultSchema: true,
        concurrency: 'parallel',
      },
    };
    const payload = { $expr: { ref: { source: 'event' as const, path: '/query' } } };
    value.definition.views.only = {
      material: 'input',
      requests: { search: { type: 'host.request', request: 'lookup', payload } },
    };
    value.catalog.host = {
      requests: { lookup: { payloadSchema: { type: 'string' }, resultSchema: true } },
    };
    expect(prepared(value).definition.views.only).toMatchObject({
      requests: { search: { concurrency: 'parallel', payload } },
    });
  });
  it('checks validation message references and keyword locations without generating extra rules', () => {
    const value = input();
    value.definition.validationMessages = [
      { schemaRef: '#/properties/name', keyword: 'type', message: { text: '请输入姓名' } },
    ];
    expect(prepared(value).definition.validationMessages).toEqual(
      value.definition.validationMessages,
    );
    value.definition.validationMessages[0]!.keyword = 'minimum';
    expect(codes(value)).toContain('VALIDATION_MESSAGE_KEYWORD_NOT_FOUND');
  });

  it('keeps request relative-ref bases explicit and includes fixed external resources', () => {
    const value = input();
    const schema = { $id: 'https://example.test/search/request', $ref: '../text' };
    value.catalog.materials.input!.manifest.requests = {
      search: { payloadSchema: schema, resultSchema: true },
    };
    value.definition.views.only = {
      material: 'input',
      requests: { search: { type: 'host.request', request: 'lookup' } },
    };
    const output = prepared({
      ...value,
      schemaResources: { 'https://example.test/text': { type: 'string' } },
    });
    expect(output.resources.schemas).toHaveProperty('https://example.test/text');
    expect(Object.values(output.resources.requestSchemas)).toContainEqual(schema);
  });
});
