import { expect, it, vi } from 'vitest';
import { createMemberSession } from '../../apps/playground/src/demos/members/session.js';
it('assembles both real member Profiles with one execution model and Runtime', async () => {
  const session = createMemberSession(vi.fn(), vi.fn());
  try {
    expect(session.runtime.checkView(session.profiles.compact)).toEqual({ compatible: true });
    expect((await session.runtime.validate()).status).toBe('valid');
    const scope = session.runtime.bind({
      from: { source: 'data', path: '/insureds' },
      as: 'row',
      mode: 'each',
    })[1]!;
    session.runtime.dispatch(
      {
        op: 'array.move',
        target: { source: 'data', path: '/insureds' },
        item: { $scope: 'row' },
        position: { kind: 'index', index: 0 },
      },
      scope,
    );
    expect(session.runtime.read({ source: 'data', path: '/insureds/0/name' })).toEqual({
      kind: 'value',
      value: '儿童 B',
    });
  } finally {
    session.dispose();
  }
});
