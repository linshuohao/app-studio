import { expect, it, vi } from 'vitest';
import { createTravelSession } from '../../apps/playground/src/demos/travel/session.js';
import { ref } from '../../apps/playground/src/demos/travel/definition.js';
it('computes golden totals, clears invalid estimates and validates the same Runtime across Profiles', async () => {
  const session = createTravelSession(vi.fn(), vi.fn(), vi.fn());
  try {
    await session.runtime.flush();
    expect(session.runtime.read(ref('/estimatedTotalMinor'))).toEqual({
      kind: 'value',
      value: 500,
    });
    expect(session.runtime.checkView(session.profiles.compact)).toEqual({ compatible: true });
    expect((await session.runtime.validate()).status).toBe('valid');
    session.runtime.dispatch({ op: 'set', target: ref('/insureds/1/age'), value: '-' });
    await session.runtime.flush();
    expect(session.runtime.read(ref('/estimatedTotalMinor'))).toEqual({
      kind: 'value',
      value: null,
    });
    expect((await session.runtime.validate()).status).toBe('invalid');
    session.runtime.dispatch({ op: 'set', target: ref('/insureds/1/age'), value: 0 });
    await session.runtime.flush();
    expect(session.runtime.read(ref('/estimatedTotalMinor'))).toEqual({
      kind: 'value',
      value: 500,
    });
    session.runtime.dispatch({ op: 'set', target: ref('/insureds/1/guardianName'), value: '  ' });
    expect(
      (await session.runtime.validate()).issues.some((i) => i.code === 'GUARDIAN_REQUIRED'),
    ).toBe(true);
    session.runtime.dispatch({ op: 'set', target: ref('/insureds/1/age'), value: 18 });
    await session.runtime.flush();
    expect((await session.runtime.validate()).status).toBe('valid');
  } finally {
    session.dispose();
  }
});
it('catches an overwritten saved total without silently recalculating it and saves invalid drafts', async () => {
  const delivery = vi.fn(),
    session = createTravelSession(vi.fn(), delivery, vi.fn());
  try {
    await session.runtime.flush();
    session.runtime.dispatch({ op: 'set', target: ref('/estimatedTotalMinor'), value: 999 });
    const proof = await session.runtime.validate();
    expect(proof.status).toBe('invalid');
    expect(proof.issues.some((i) => i.code === 'ESTIMATE_MISMATCH')).toBe(true);
    session.runtime.interact({ type: 'host.emit', event: 'travel.submit' });
    await vi.waitFor(() =>
      expect(delivery).toHaveBeenLastCalledWith(
        expect.objectContaining({ submitStatus: 'invalid', submission: null }),
      ),
    );
    session.runtime.interact({ type: 'host.emit', event: 'travel.blank' });
    session.runtime.interact({ type: 'host.emit', event: 'travel.saveDraft' });
    await vi.waitFor(() =>
      expect(delivery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({ estimatedTotalMinor: null, acknowledged: false }),
        }),
      ),
    );
  } finally {
    session.dispose();
  }
});
it('refuses stale and technically incomplete external results; successful submission uses the proof snapshot', async () => {
  const delivery = vi.fn(),
    calls = vi.fn(),
    session = createTravelSession(vi.fn(), delivery, calls);
  try {
    await session.runtime.flush();
    session.setValidationMode('manual');
    session.runtime.interact({ type: 'host.emit', event: 'travel.submit' });
    await vi.waitFor(() =>
      expect(calls.mock.lastCall?.[0].some((c: { settled: boolean }) => !c.settled)).toBe(true),
    );
    session.runtime.dispatch({ op: 'set', target: ref('/applicant/name'), value: '已编辑' });
    await vi.waitFor(() =>
      expect(delivery).toHaveBeenLastCalledWith(
        expect.objectContaining({ submitStatus: 'stale', submission: null }),
      ),
    );
    session.completeValidations('pass');
    session.setValidationMode('failure');
    session.runtime.interact({ type: 'host.emit', event: 'travel.submit' });
    await vi.waitFor(() =>
      expect(delivery).toHaveBeenLastCalledWith(
        expect.objectContaining({ submitStatus: 'incomplete', submission: null }),
      ),
    );
    session.setValidationMode('reject');
    session.runtime.interact({ type: 'host.emit', event: 'travel.submit' });
    await vi.waitFor(() =>
      expect(delivery).toHaveBeenLastCalledWith(
        expect.objectContaining({ submitStatus: 'invalid', submission: null }),
      ),
    );
    session.setValidationMode('pass');
    session.runtime.interact({ type: 'host.emit', event: 'travel.submit' });
    await vi.waitFor(() =>
      expect(delivery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          submitStatus: 'valid',
          submission: expect.objectContaining({
            estimatedTotalMinor: 500,
            applicant: expect.objectContaining({ name: '已编辑' }),
          }),
        }),
      ),
    );
  } finally {
    session.dispose();
  }
});
it('cancels removed member validation and never delivers after disposal', async () => {
  const delivery = vi.fn(),
    calls = vi.fn(),
    session = createTravelSession(vi.fn(), delivery, calls);
  await session.runtime.flush();
  session.setValidationMode('manual');
  session.runtime.interact({ type: 'host.emit', event: 'travel.submit' });
  await vi.waitFor(() =>
    expect(calls.mock.lastCall?.[0].some((c: { settled: boolean }) => !c.settled)).toBe(true),
  );
  const pendingIds: number[] = calls.mock
    .lastCall![0].filter((c: { settled: boolean }) => !c.settled)
    .map((c: { id: number }) => c.id);
  session.runtime.dispatch({
    op: 'set',
    target: ref('/insureds'),
    value: [{ name: '替换成员', age: 30, idNumber: 'NEW', guardianName: '' }],
  });
  await session.runtime.flush();
  session.dispose();
  delivery.mockClear();
  session.completeValidations('pass');
  await Promise.resolve();
  await Promise.resolve();
  expect(delivery).not.toHaveBeenCalled();
  expect(
    calls.mock.lastCall?.[0]
      .filter((c: { id: number }) => pendingIds.includes(c.id))
      .every((c: { cancelled: boolean }) => c.cancelled),
  ).toBe(true);
});
it('handles missing fields, reversed or excessive dates and too many members without stale estimates', async () => {
  const session = createTravelSession(vi.fn(), vi.fn(), vi.fn());
  try {
    await session.runtime.flush();
    session.runtime.dispatch({ op: 'remove', target: ref('/insureds/0/age') });
    await session.runtime.flush();
    expect(session.runtime.read(ref('/estimatedTotalMinor'))).toEqual({
      kind: 'value',
      value: null,
    });
    expect((await session.runtime.validate()).status).toBe('invalid');
    session.runtime.dispatch({ op: 'set', target: ref('/insureds/0/age'), value: 30 });
    for (const end of ['2028-02-27', '2028-04-01', '2027-02-29']) {
      session.runtime.dispatch({ op: 'set', target: ref('/travel/endDate'), value: end });
      await session.runtime.flush();
      expect(session.runtime.read(ref('/estimatedTotalMinor'))).toEqual({
        kind: 'value',
        value: null,
      });
      expect((await session.runtime.validate()).issues.some((i) => i.code === 'TRIP_RANGE')).toBe(
        true,
      );
    }
    session.runtime.dispatch({ op: 'set', target: ref('/travel/endDate'), value: '2028-02-29' });
    session.runtime.dispatch({
      op: 'set',
      target: ref('/insureds'),
      value: Array.from({ length: 6 }, () => ({
        name: '示例',
        age: 30,
        idNumber: 'TEST',
        guardianName: '',
      })),
    });
    await session.runtime.flush();
    expect(session.runtime.read(ref('/estimatedTotalMinor'))).toEqual({
      kind: 'value',
      value: null,
    });
    expect((await session.runtime.validate()).status).toBe('invalid');
  } finally {
    session.dispose();
  }
});
it('only the latest submit intent can deliver while validators share pending work', async () => {
  const delivery = vi.fn(),
    calls = vi.fn(),
    session = createTravelSession(vi.fn(), delivery, calls);
  try {
    await session.runtime.flush();
    session.setValidationMode('manual');
    session.runtime.interact({ type: 'host.emit', event: 'travel.submit' });
    await vi.waitFor(() =>
      expect(calls.mock.lastCall?.[0].some((c: { settled: boolean }) => !c.settled)).toBe(true),
    );
    session.runtime.interact({ type: 'host.emit', event: 'travel.submit' });
    await session.runtime.flush();
    session.completeValidations('pass');
    await vi.waitFor(() =>
      expect(delivery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          submitStatus: 'valid',
          submission: expect.objectContaining({ estimatedTotalMinor: 500 }),
        }),
      ),
    );
    expect(delivery.mock.calls.some(([d]) => d.submitStatus === 'stale')).toBe(false);
  } finally {
    session.dispose();
  }
});
