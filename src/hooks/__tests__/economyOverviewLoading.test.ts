import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  org: 'org-a' as string | null,
  reads: [] as { table: string; filters: [string, unknown][]; ids: string[] }[],
  bookingCount: 401,
  datesError: null as Error | null,
}));
const economy = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => options }));
vi.mock('../useCurrentOrg', () => ({ useCurrentOrg: () => ({ organizationId: state.org }) }));
vi.mock('@/services/planningApiService', () => ({ fetchAllEconomyDataMulti: economy }));
vi.mock('@/services/projectEconomyService', () => ({ calculateEconomySummary: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => {
    const read = { table, filters: [] as [string, unknown][], ids: [] as string[] };
    state.reads.push(read);
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { read.filters.push([key, value]); return builder; },
      order: () => builder,
      in: (_key: string, ids: string[]) => { read.ids = ids; return builder; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: table === 'projects' ? Array.from({ length: state.bookingCount }, (_, i) => ({
          id: `p-${i}`, booking_id: `b-${i}`, name: 'project', status: 'planning',
        })) : [],
        error: table === 'bookings' ? state.datesError : null,
      })),
    };
    return builder;
  } },
}));
import { useEconomyOverviewData } from '../useEconomyOverviewData';

function options(enabled = true) {
  return useEconomyOverviewData(enabled) as unknown as {
    queryKey: unknown[]; enabled: boolean; queryFn: () => Promise<unknown[]>;
  };
}

describe('economy overview loading', () => {
  beforeEach(() => { state.org = 'org-a'; state.reads = []; state.datesError = null; economy.mockClear(); });
  it('isolates query keys across organizations', () => {
    const a = options().queryKey;
    state.org = 'org-b';
    expect(options().queryKey).not.toEqual(a);
    expect(options().queryKey).toEqual(['economy-overview', 'org-b']);
  });
  it('disables redundant fetches for externally supplied projects', () => {
    expect(options(false).enabled).toBe(false);
    expect(state.reads).toHaveLength(0);
    expect(economy).not.toHaveBeenCalled();
  });
  it('does not enable fetching without an organization', async () => {
    state.org = null;
    expect(options().enabled).toBe(false);
    expect(await options().queryFn()).toEqual([]);
    expect(state.reads).toHaveLength(0);
  });
  it('loads 401 dates in bounded tenant-scoped batches and economy only once', async () => {
    const result = await options().queryFn();
    expect(result).toHaveLength(401);
    expect(state.reads.filter(r => r.table === 'bookings').map(r => r.ids.length)).toEqual([200, 200, 1]);
    expect(state.reads.every(r => r.filters.some(([k, v]) => k === 'organization_id' && v === 'org-a'))).toBe(true);
    expect(economy).toHaveBeenCalledTimes(1);
    expect(economy.mock.calls[0]?.[0]).toHaveLength(401);
  });
  it('fails truthfully when Booking dates cannot be read', async () => {
    state.datesError = new Error('dates unavailable');
    await expect(options().queryFn()).rejects.toThrow('dates unavailable');
  });
});