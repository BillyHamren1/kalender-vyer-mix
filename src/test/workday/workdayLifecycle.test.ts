/**
 * Workday lifecycle contract — start/end/current sync helpers.
 *
 * Verifies the fire-and-forget glue:
 *   - syncWorkDayStart calls workdayApi.start with the provided startedAtIso
 *   - it debounces bursts of calls (single in-flight)
 *   - syncWorkDayEnd calls workdayApi.end
 *   - failures don't throw to the caller (soft-fail)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/workdayApi', () => ({
  workdayApi: {
    start: vi.fn().mockResolvedValue({ workday: { id: 'w1' } }),
    end: vi.fn().mockResolvedValue({ workday: null }),
    current: vi.fn().mockResolvedValue({ workday: null }),
  },
}));

import { workdayApi } from '@/services/workdayApi';
import { syncWorkDayStart, syncWorkDayEnd } from '@/services/workdayServerSync';

describe('workday lifecycle sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncWorkDayStart calls workdayApi.start with startedAtIso', async () => {
    syncWorkDayStart('2026-04-22T08:00:00Z');
    await new Promise((r) => setTimeout(r, 0));
    expect(workdayApi.start).toHaveBeenCalledWith({ startedAtIso: '2026-04-22T08:00:00Z' });
  });

  it('syncWorkDayStart debounces bursts (only one in-flight)', async () => {
    syncWorkDayStart('2026-04-22T08:00:00Z');
    syncWorkDayStart('2026-04-22T08:00:01Z');
    syncWorkDayStart('2026-04-22T08:00:02Z');
    await new Promise((r) => setTimeout(r, 0));
    expect(workdayApi.start).toHaveBeenCalledTimes(1);
  });

  it('syncWorkDayEnd calls workdayApi.end', async () => {
    syncWorkDayEnd('2026-04-22T17:00:00Z');
    await new Promise((r) => setTimeout(r, 0));
    expect(workdayApi.end).toHaveBeenCalledWith({ endedAtIso: '2026-04-22T17:00:00Z' });
  });

  it('soft-fails — start error does not throw', async () => {
    (workdayApi.start as any).mockRejectedValueOnce(new Error('network'));
    expect(() => syncWorkDayStart()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('soft-fails — end error does not throw', async () => {
    (workdayApi.end as any).mockRejectedValueOnce(new Error('network'));
    expect(() => syncWorkDayEnd()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
