import { expect, it, vi } from 'vitest';
import { createMaterialSession } from '../../apps/playground/src/demos/basic/session.js';
it('assembles the actual Playground material Catalog, Runtime and local Host', async () => {
  const snapshot = vi.fn(),
    result = vi.fn();
  const session = createMaterialSession(snapshot, result);
  try {
    expect(session.runtime.snapshot()).toMatchObject({ name: 'Alice', age: 18, plan: 'legacy' });
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect((await session.runtime.validate()).status).toBe('invalid');
  } finally {
    session.dispose();
  }
});
