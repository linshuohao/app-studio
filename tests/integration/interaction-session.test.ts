import { expect, it, vi } from 'vitest';
import { createInteractionSession } from '../../apps/playground/src/demos/interactions/session.js';
it('assembles actual request contracts and delegates country clearing to the Definition reaction', async () => {
  const session = createInteractionSession(vi.fn(), vi.fn());
  try {
    session.runtime.dispatch({
      op: 'set',
      target: { source: 'data', path: '/country' },
      value: 'US',
    });
    await session.runtime.flush();
    expect(session.runtime.read({ source: 'data', path: '/city' })).toEqual({
      kind: 'value',
      value: null,
    });
    expect((await session.runtime.validate()).status).toBe('valid');
  } finally {
    session.dispose();
  }
});
