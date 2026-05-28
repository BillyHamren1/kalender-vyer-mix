/**
 * Regression test for the "rig-raden försvann när vi bytte datum"-bug
 * (booking 2604-8, 2026-05-27).
 *
 * Locks the contract: when savePhaseDays moves a rig/rigDown to a new date,
 * the EXISTING calendar_events row for the old date is RE-PURPOSED (UPDATE
 * source_date) instead of being left as a duplicate that the import-bookings
 * reconciler later deletes as stale.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock supabase client ──────────────────────────────────────────────────
type MockRow = {
  id: string;
  booking_id: string;
  organization_id: string;
  event_type: string;
  source_date: string;
  resource_id: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  booking_number?: string;
  delivery_address?: string | null;
};

const state: { rows: MockRow[]; bookings: any[] } = { rows: [], bookings: [] };

function buildQuery(table: string) {
  // Stage-by-stage builder so we can collect filters before terminal call.
  const filters: Array<{ kind: string; col: string; val: any }> = [];
  let limitVal: number | null = null;
  let updatePayload: any = null;
  let insertPayload: any = null;

  const applyFilters = (rows: any[]) => {
    let out = rows;
    for (const f of filters) {
      out = out.filter((r) => r[f.col] === f.val);
    }
    if (limitVal !== null) out = out.slice(0, limitVal);
    return out;
  };

  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => {
      filters.push({ kind: 'eq', col, val });
      return builder;
    },
    in: (col: string, vals: any[]) => {
      filters.push({ kind: 'in', col, val: vals });
      return builder;
    },
    neq: () => builder,
    limit: (n: number) => {
      limitVal = n;
      return builder;
    },
    single: async () => {
      const rows = applyFilters(table === 'bookings' ? state.bookings : state.rows);
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } };
    },
    update: (payload: any) => {
      updatePayload = payload;
      return builder;
    },
    insert: (payload: any) => {
      insertPayload = payload;
      // Immediate insert + return thenable
      const inserted: MockRow = { id: `row-${state.rows.length + 1}`, ...payload };
      state.rows.push(inserted);
      return Promise.resolve({ error: null }) as any;
    },
    then: (resolve: any) => {
      // Terminal for select() chains
      if (updatePayload) {
        const rows = applyFilters(state.rows);
        for (const r of rows) Object.assign(r, updatePayload);
        return resolve({ data: rows, error: null });
      }
      const rows = applyFilters(table === 'bookings' ? state.bookings : state.rows);
      return resolve({ data: rows, error: null });
    },
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => buildQuery(table),
    rpc: async () => ({ data: null, error: null }),
  },
}));

import { savePhaseDays } from '../phaseDaysWriter';

const ORG = 'org-1';
const BOOKING = 'booking-1';

beforeEach(() => {
  state.rows = [];
  state.bookings = [
    {
      id: BOOKING,
      organization_id: ORG,
      booking_number: '2604-8',
      client: 'Westmans Uthyrning',
      deliveryaddress: 'Orrspelsvägen 2b',
      delivery_city: 'Stocksund',
    },
  ];
});

describe('savePhaseDays — orphan migration', () => {
  it('moves a stale rig row to the new date instead of duplicating it', async () => {
    // Setup: existing rig row at OLD date 2026-06-04 on team-4 (sticky).
    state.rows.push({
      id: 'old-rig',
      booking_id: BOOKING,
      organization_id: ORG,
      event_type: 'rig',
      source_date: '2026-06-04',
      resource_id: 'team-4',
      start_time: '2026-06-04T08:00:00Z',
      end_time: '2026-06-04T12:00:00Z',
    });

    const result = await savePhaseDays({
      bookingId: BOOKING,
      eventType: 'rig',
      dates: ['2026-06-03'],
      startTime: '08:00',
      endTime: '12:00',
      title: 'Westmans Uthyrning',
    });

    expect(result.failures).toEqual([]);
    expect(result.successCount).toBe(1);

    const rigRows = state.rows.filter((r) => r.event_type === 'rig');
    expect(rigRows).toHaveLength(1);
    expect(rigRows[0].source_date).toBe('2026-06-03');
    expect(rigRows[0].resource_id).toBe('team-4'); // team stickiness preserved
    expect(rigRows[0].start_time).toBe('2026-06-03T08:00:00Z');
  });

  it('does not steal an orphan when the booking already has a row on the new date', async () => {
    state.rows.push({
      id: 'old-rig',
      booking_id: BOOKING,
      organization_id: ORG,
      event_type: 'rig',
      source_date: '2026-06-04',
      resource_id: 'team-4',
    });
    state.rows.push({
      id: 'existing-new',
      booking_id: BOOKING,
      organization_id: ORG,
      event_type: 'rig',
      source_date: '2026-06-03',
      resource_id: 'team-2',
    });

    const result = await savePhaseDays({
      bookingId: BOOKING,
      eventType: 'rig',
      dates: ['2026-06-03'],
      startTime: '08:00',
      endTime: '12:00',
    });

    expect(result.successCount).toBe(1);
    // The existing 2026-06-03 row is updated; the orphan at 2026-06-04 is
    // left as-is (savePhaseDays does NOT delete it — that would be
    // destructive without explicit user intent).
    const onNewDate = state.rows.filter(
      (r) => r.event_type === 'rig' && r.source_date === '2026-06-03',
    );
    expect(onNewDate).toHaveLength(1);
    expect(onNewDate[0].resource_id).toBe('team-2'); // own existing team preserved
  });

  it('falls back to insert when no orphan and no sticky team available', async () => {
    // No existing rows, no fallbackResourceId → insert is skipped and
    // failure is recorded so the UI can warn the user.
    const result = await savePhaseDays({
      bookingId: BOOKING,
      eventType: 'rig',
      dates: ['2026-06-03'],
      startTime: '08:00',
      endTime: '12:00',
    });

    expect(result.failures.length).toBe(1);
    expect(result.failures[0]).toContain('inget team');
  });

  it('uses fallbackResourceId when no orphan and no sticky team', async () => {
    const result = await savePhaseDays({
      bookingId: BOOKING,
      eventType: 'rig',
      dates: ['2026-06-03'],
      startTime: '08:00',
      endTime: '12:00',
      fallbackResourceId: 'team-1',
    });

    expect(result.failures).toEqual([]);
    expect(result.successCount).toBe(1);
    const row = state.rows.find((r) => r.event_type === 'rig');
    expect(row?.resource_id).toBe('team-1');
    expect(row?.source_date).toBe('2026-06-03');
  });
});
