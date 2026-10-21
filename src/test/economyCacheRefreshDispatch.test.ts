import { describe, expect, it } from 'vitest';
import {
  dispatchEconomyCacheRefresh,
  economyRefreshBookingIds,
} from '../../supabase/functions/_shared/economyCacheRefreshDispatch';

const BOOKING_A = '8e16aa4d-d865-4b02-b648-f43cbe2b1a5a';
const BOOKING_B = '4a31f877-227c-40e2-b222-f171e401d23a';

describe('targeted economy cache refresh dispatch', () => {
  it('refreshes a single booking even when its source revision is already current', () => {
    expect(economyRefreshBookingIds({
      organizationId: 'org-1',
      isDryRun: false,
      singleBookingId: BOOKING_A,
      changedBookingIds: [],
    })).toEqual([BOOKING_A]);
  });

  it('does not dispatch in dry-run mode or without an organization', () => {
    expect(economyRefreshBookingIds({
      organizationId: 'org-1', isDryRun: true, singleBookingId: BOOKING_A,
    })).toEqual([]);
    expect(economyRefreshBookingIds({
      organizationId: null, isDryRun: false, singleBookingId: BOOKING_A,
    })).toEqual([]);
  });

  it('dispatches only unique valid affected booking IDs for the correct tenant', async () => {
    const calls: unknown[] = [];
    await dispatchEconomyCacheRefresh({
      supabaseUrl: 'https://ops.example/',
      serviceRoleKey: 'test-key',
      organizationId: 'org-1',
      bookingIds: [BOOKING_A, BOOKING_A, 'invalid'],
      fetcher: async (url, init) => {
        calls.push([String(url), init?.method, init?.headers, JSON.parse(String(init?.body))]);
        return new Response(null, { status: 202 });
      },
    });
    expect(calls).toEqual([[
      'https://ops.example/functions/v1/refresh-economy-cache',
      'POST',
      { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      { organization_id: 'org-1', booking_ids: [BOOKING_A] },
    ]]);
  });

  it('contains and logs HTTP and network failures', async () => {
    const logs: unknown[] = [];
    const logger = { warn: (...args: unknown[]) => logs.push(args) };
    await dispatchEconomyCacheRefresh({
      supabaseUrl: 'https://ops.example',
      serviceRoleKey: 'test-key',
      organizationId: 'org-1',
      bookingIds: [BOOKING_A],
      fetcher: async () => new Response(null, { status: 503 }),
      logger,
    });
    await dispatchEconomyCacheRefresh({
      supabaseUrl: 'https://ops.example',
      serviceRoleKey: 'test-key',
      organizationId: 'org-1',
      bookingIds: [BOOKING_A],
      fetcher: async () => { throw new Error('offline'); },
      logger,
    });
    expect(logs).toHaveLength(2);
  });

  it('does not dispatch when required config or a valid booking ID is missing', () => {
    const fetcher = async () => { throw new Error('must not fetch'); };
    expect(dispatchEconomyCacheRefresh({
      supabaseUrl: 'https://ops.example', serviceRoleKey: 'k', organizationId: null,
      bookingIds: [BOOKING_A], fetcher,
    })).toBeNull();
    expect(dispatchEconomyCacheRefresh({
      supabaseUrl: 'https://ops.example', serviceRoleKey: 'k', organizationId: 'org-1',
      bookingIds: ['invalid'], fetcher,
    })).toBeNull();
  });
});
