import { describe, expect, it } from 'vitest';
import { invoke, createTextIsNonBlank } from '../../src/text-is-non-blank/implementation.js';

describe('text.isNonBlank', () => {
  it.each(['Alice', '  Alice  ', '张三', '0', '\u200b'])('accepts nonblank text %j', (value) => {
    expect(invoke([value])).toBe(true);
  });
  it.each(['', ' \t\n', '\u00a0\u3000', null, false, 0, [], {}].map((value) => ({ value })))(
    'rejects blank or invalid working value $value',
    ({ value }) => {
      expect(invoke([value])).toBe(false);
    },
  );
  it('does not normalize or mutate the caller input', () => {
    const args = Object.freeze(['  Alice  ']);
    expect(invoke(args)).toBe(true);
    expect(args).toEqual(['  Alice  ']);
  });
  it('rejects direct calls with the wrong number of arguments', () => {
    expect(() => invoke([])).toThrow();
    expect(() => invoke(['A', 'B'])).toThrow();
  });
  it('registers a deterministic implementation with the supplied artifact identity', () => {
    const artifact = { id: 'test', platform: 'ts', digest: `sha256:${'a'.repeat(64)}` as const };
    const binding = createTextIsNonBlank(artifact);
    expect(binding.manifest.id).toBe('text.isNonBlank');
    expect(binding.manifest.parameters).toEqual([{ name: 'value', schema: true }]);
    expect(binding.manifest.returns).toEqual({ type: 'boolean' });
    expect(binding.invoke(['x'])).toBe(true);
    expect(binding.artifact).toEqual(artifact);
  });
});
