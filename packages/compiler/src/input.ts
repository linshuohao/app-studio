import type {
  CompilerInputDefinition,
  AuthoringViewNode,
  ViewNode,
} from '@form-engine/protocol/definition';
import type { CompileInput } from './types.js';
import { at, Diagnostics, own, record } from './diagnostics.js';
import { JsonInputError, snapshot } from './json.js';
import { createAjv, structuralErrors, structure } from './structure.js';

export function receive(input: CompileInput, diagnostics: Diagnostics): CompileInput | undefined {
  try {
    // Optional SDK arguments may be omitted or explicitly undefined; protocol values may not.
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of ['target', 'schemaResources'])
      if (descriptors[key] && 'value' in descriptors[key] && descriptors[key].value === undefined)
        delete descriptors[key];
    const json = snapshot(Object.create(Object.getPrototypeOf(input), descriptors));
    if (
      !record(json) ||
      Object.keys(json).some(
        (key) => !['definition', 'catalog', 'target', 'schemaResources'].includes(key),
      ) ||
      !own(json, 'definition') ||
      !own(json, 'catalog')
    ) {
      diagnostics.error(
        'COMPILE_INPUT_INVALID',
        '',
        'Expected definition, catalog and optional target / schemaResources.',
      );
      return undefined;
    }
    if (
      json.target !== undefined &&
      (!record(json.target) ||
        Object.entries(json.target).some(
          ([key, value]) =>
            !['profile', 'platform', 'preparedFormatVersion'].includes(key) ||
            typeof value !== 'string',
        ))
    ) {
      diagnostics.error('COMPILE_INPUT_INVALID', '', 'Invalid compilation target.');
      return undefined;
    }
    if (json.schemaResources !== undefined) {
      if (!record(json.schemaResources)) {
        diagnostics.error(
          'COMPILE_INPUT_INVALID',
          '',
          'schemaResources must be a schema dictionary.',
        );
        return undefined;
      }
      const ajv = createAjv();
      for (const [name, schema] of Object.entries(json.schemaResources))
        if (!ajv.validateSchema(schema as object))
          diagnostics.error(
            'SCHEMA_RESOURCE_INVALID',
            '',
            `Invalid fixed schema resource ${name}.`,
            [{ sourceId: `schemaResources:${name}`, pointer: '' }],
          );
    }
    for (const error of structuralErrors(structure.definition, json.definition))
      diagnostics.error(
        'DEFINITION_INVALID',
        error.instancePath,
        `${error.keyword}: ${error.message}`,
      );
    for (const error of structuralErrors(structure.catalog, json.catalog))
      diagnostics.error('CATALOG_INVALID', '', `${error.keyword}: ${error.message}`, [
        {
          sourceId:
            record(json.catalog) && typeof json.catalog.id === 'string'
              ? json.catalog.id
              : 'catalog',
          pointer: error.instancePath,
        },
      ]);
    return diagnostics.failed ? undefined : (json as unknown as CompileInput);
  } catch (error) {
    if (error instanceof JsonInputError)
      diagnostics.error(
        error.code,
        error.pointer.startsWith('/definition') ? error.pointer.slice('/definition'.length) : '',
        error.message,
      );
    else if (input === null || typeof input !== 'object')
      diagnostics.error('COMPILE_INPUT_INVALID', '', 'Expected a compilation input object.');
    else throw error;
    return undefined;
  }
}

export function normalize(definition: CompilerInputDefinition, diagnostics: Diagnostics) {
  const origins = new Map<string, string>();
  function node(input: AuthoringViewNode, pointer: string, source: string): ViewNode {
    origins.set(pointer, source);
    if ('scope' in input)
      return {
        scope: { ...input.scope, mode: input.scope.mode ?? 'one' },
        node: node(input.node, at(pointer, 'node'), at(source, 'node')),
      };
    if ('$use' in input) return input;
    const { bind, children, slots, ...material } = input;
    const bindings = Object.fromEntries(Object.entries(input.bindings ?? {}));
    if (bind !== undefined) {
      if (own(bindings, 'value'))
        diagnostics.error(
          'AUTHORING_CONFLICT',
          at(source, 'bind'),
          'bind conflicts with bindings.value.',
        );
      else {
        Object.defineProperty(bindings, 'value', {
          value: { source: 'data', path: bind },
          enumerable: true,
        });
        origins.set(at(at(pointer, 'bindings'), 'value'), at(source, 'bind'));
      }
    }
    const normalizedSlots = Object.fromEntries(
      Object.entries(slots ?? {}).map(([key, children]) => [
        key,
        children.map((child, index) =>
          node(
            child,
            at(at(at(pointer, 'slots'), key), index),
            at(at(at(source, 'slots'), key), index),
          ),
        ),
      ]),
    );
    if (children !== undefined) {
      if (own(normalizedSlots, 'default'))
        diagnostics.error(
          'AUTHORING_CONFLICT',
          at(source, 'children'),
          'children conflicts with slots.default.',
        );
      else {
        origins.set(at(at(pointer, 'slots'), 'default'), at(source, 'children'));
        Object.defineProperty(normalizedSlots, 'default', {
          value: children.map((child, index) =>
            node(
              child,
              at(at(at(pointer, 'slots'), 'default'), index),
              at(at(source, 'children'), index),
            ),
          ),
          enumerable: true,
        });
      }
    }
    return {
      ...material,
      ...(bind !== undefined || input.bindings !== undefined ? { bindings } : {}),
      ...(children !== undefined || slots !== undefined ? { slots: normalizedSlots } : {}),
    };
  }
  const views = Object.fromEntries(
    Object.entries(definition.views).map(([key, value]) => [
      key,
      node(value, at('/views', key), at('/views', key)),
    ]),
  );
  const templates =
    definition.viewTemplates === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(definition.viewTemplates).map(([key, value]) => [
            key,
            {
              ...value,
              node: node(
                value.node,
                at(at('/viewTemplates', key), 'node'),
                at(at('/viewTemplates', key), 'node'),
              ),
            },
          ]),
        );
  const source = (pointer: string): string => {
    let prefix = pointer;
    while (!origins.has(prefix) && prefix) prefix = prefix.slice(0, prefix.lastIndexOf('/'));
    return (origins.get(prefix) ?? prefix) + pointer.slice(prefix.length);
  };
  return {
    definition: { ...definition, views, ...(templates ? { viewTemplates: templates } : {}) },
    source,
  };
}
