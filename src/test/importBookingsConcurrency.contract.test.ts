import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contract test: simultaneous calls to importBookings() with the same
 * (org, syncMode) tuple must coalesce into a single edge-function invocation.
 *
 * Background: at login the web app fired 2 parallel "incremental sync" jobs
 * (visible in console as duplicate "Incremental sync: fetching bookings…"
 * log lines). The fix in src/services/importService.ts adds an in-flight
 * Map that deduplicates concurrent identical invocations.
 */

// Mock chain BEFORE imports that consume it
const invokeSpy = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { organization_id: 'org-1' }, error: null })),
          single: vi.fn(async () => ({ data: { organization_id: 'org-1' }, error: null })),
        })),
      })),
      upsert: vi.fn(async () => ({ data: [{}], error: null })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [{}], error: null })) })),
      insert: vi.fn(async () => ({ data: [{}], error: null })),
    })),
    functions: {
      invoke: invokeSpy,
    },
  },
}));

vi.mock('@/config/appMode', () => ({ isScannerApp: false }));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/services/syncStateService', () => ({
  getSyncState: vi.fn(async () => null),
  updateSyncState: vi.fn(async () => true),
  getRecommendedSyncMode: vi.fn(async () => 'incremental'),
  initializeSyncState: vi.fn(async () => true),
}));

beforeEach(() => {
  invokeSpy.mockReset();
  invokeSpy.mockImplementation(async () => {
    // Simulate a slow edge function so concurrent callers actually overlap
    await new Promise((r) => setTimeout(r, 30));
    return { data: { results: { total: 0, imported: 0, failed: 0, calendar_events_created: 0 } }, error: null };
  });
});

describe('importBookings concurrency coalescing', () => {
  it('two simultaneous incremental calls produce ONE edge-function invocation', async () => {
    const { importBookings } = await import('@/services/importService');

    const [a, b] = await Promise.all([
      importBookings({ syncMode: 'incremental' }, true),
      importBookings({ syncMode: 'incremental' }, true),
    ]);

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });

  it('after the first import settles a new call is allowed', async () => {
    const { importBookings } = await import('@/services/importService');

    await importBookings({ syncMode: 'incremental' }, true);
    await importBookings({ syncMode: 'incremental' }, true);

    expect(invokeSpy).toHaveBeenCalledTimes(2);
  });
});
