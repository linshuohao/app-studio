import { expect, it } from 'vitest';
import { createCoreFunctions } from '../src/index.js';
it('提供一致的规范名称、签名和同步值实现，拒绝非法算术', () => {
  const functions = createCoreFunctions({
    id: 'core',
    platform: 'web',
    digest: `sha256:${'0'.repeat(64)}`,
  });
  expect(functions['core.add']!.invoke([2, 3])).toBe(5);
  expect(functions['core.length']!.invoke(['😀A'])).toBe(2);
  expect(() => functions['core.div']!.invoke([1, 0])).toThrow();
  expect(functions['core.gte']!.manifest.returns).toEqual({ type: 'boolean' });
  expect(functions['add']).toBeUndefined();
  expect(Object.isFrozen(functions['core.add']!.manifest)).toBe(true);
  expect(Object.isFrozen(functions['core.add']!.manifest.parameters)).toBe(true);
});
