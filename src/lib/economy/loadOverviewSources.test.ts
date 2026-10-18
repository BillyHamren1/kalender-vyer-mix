import { describe, expect, it, vi } from 'vitest';
import { loadOverviewSources } from './loadOverviewSources';

describe('overview owner reads', () => {
  it('starts economy before dates finish, preserving both results', async () => {
    let finishDates: ((value: string[]) => void) | undefined;
    const dates = new Promise<string[]>(resolve => { finishDates = resolve; });
    const economy = vi.fn(async () => ({ booking: { productRevenue: 480 } }));
    const result = loadOverviewSources(() => dates, economy);
    expect(economy).toHaveBeenCalledTimes(1);
    finishDates?.(['2026-10-18']);
    expect(await result).toEqual([['2026-10-18'], { booking: { productRevenue: 480 } }]);
  });

  it('propagates date errors instead of returning a successful empty date list', async () => {
    await expect(loadOverviewSources(
      async () => { throw new Error('booking dates unavailable'); },
      async () => ({ booking: 480 }),
    )).rejects.toThrow('booking dates unavailable');
  });

  it('preserves genuine null dates and missing economy without generating values', async () => {
    expect(await loadOverviewSources(async () => [{ eventdate: null }], async () => ({})))
      .toEqual([[{ eventdate: null }], {}]);
  });
});