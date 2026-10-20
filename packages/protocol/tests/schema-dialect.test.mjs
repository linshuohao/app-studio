import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { toDraft2020 } from '../scripts/schema-dialect.mjs';

describe('generator dialect bridge', () => {
  it('preserves tuple/rest and recursive reference validation across dialects', () => {
    const before = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/definitions/Chain',
      definitions: {
        Chain: {
          anyOf: [
            { type: 'null' },
            {
              type: 'array',
              minItems: 1,
              items: [{ type: 'string' }],
              additionalItems: { $ref: '#/definitions/Chain' },
            },
          ],
        },
      },
    };
    const validateBefore = new Ajv({ strict: false }).compile(before);
    const after = toDraft2020(before);
    const validateAfter = new Ajv2020({ strict: false }).compile(after);
    for (const value of [null, ['x'], ['x', null, ['y', null]], [], [1], ['x', 1]]) {
      expect(validateAfter(value)).toBe(validateBefore(value));
    }
    expect(after.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(after.$ref).toBe('#/$defs/Chain');
    expect(before.definitions).toBeDefined();
  });
  it('never rewrites literal data in enum/const/default/examples', () => {
    const literal = {
      items: [{ type: 'string' }],
      definitions: { x: 1 },
      $ref: '#/definitions/raw',
    };
    const schema = { const: literal, default: literal, examples: [literal], enum: [literal] };
    const after = toDraft2020(schema);
    expect(after.const).toEqual(literal);
    expect(after.default).toEqual(literal);
    expect(after.examples).toEqual([literal]);
    expect(after.enum).toEqual([literal]);
  });
});
