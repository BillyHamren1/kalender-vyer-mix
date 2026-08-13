import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase client BEFORE importing the service.
const rangeMock = vi.fn();
const orderMock = vi.fn(() => ({ range: rangeMock }));
const lteMock = vi.fn(() => ({ order: orderMock }));
const gteMock = vi.fn(() => ({ lte: lteMock }));
const neqMock = vi.fn(() => ({ gte: gteMock }));
const selectMock = vi.fn(() => ({ neq: neqMock }));
// Sidindelade stödtabeller: varje tabell kan mata ut fler än 1000 rader.
export const secondaryRows: Record<string, any[]> = {};
const secondaryCalls: Record<string, number> = {};

const makeChainable = (table: string) => {
  const chain: any = {};
  for (const m of ['select', 'or', 'is', 'in', 'eq', 'neq', 'gte', 'lte', 'order']) {
    chain[m] = () => chain;
  }
  chain.range = (from: number, to: number) => {
    secondaryCalls[table] = (secondaryCalls[table] ?? 0) + 1;
    const rows = (secondaryRows[table] ?? []).slice(from, to + 1);
    return Promise.resolve({ data: rows, error: null });
  };
  chain.then = (res: any) => Promise.resolve({ data: secondaryRows[table] ?? [], error: null }).then(res);
  return chain;
};

const fromMock = vi.fn((table: string) => {
  if (table === 'calendar_events') {
    return { select: selectMock };
  }
  return makeChainable(table);
});


vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'test-user-1234' } } }, error: null }),
    },
    from: (table: string) => fromMock(table),
  },
}));

vi.mock('@/services/plannerCalendarDerivation', () => ({
  buildPlannerCalendarEvents: ({ realEvents }: any) => realEvents.map((r: any) => ({
    ...r,
    start: r.start_time,
    end: r.end_time,
  })),
}));

import { fetchCalendarEvents } from '@/services/eventService';

const makeRow = (i: number) => ({
  id: `row-${i}`,
  title: `Event ${i}`,
  start_time: '2026-05-05T08:00:00Z',
  end_time: '2026-05-05T09:00:00Z',
  resource_id: 'team-1',
  booking_id: `booking-${i}`,
  event_type: 'rig',
  delivery_address: null,
  booking_number: `B-${i}`,
  source_date: '2026-05-05',
});

describe('fetchCalendarEvents pagination', () => {
  beforeEach(() => {
    rangeMock.mockReset();
    selectMock.mockClear();
  });

  it('paginates through 2500 rows across 3 pages', async () => {
    const allRows = Array.from({ length: 2500 }, (_, i) => makeRow(i));
    rangeMock
      .mockResolvedValueOnce({ data: allRows.slice(0, 1000), error: null, status: 200, statusText: 'OK' })
      .mockResolvedValueOnce({ data: allRows.slice(1000, 2000), error: null, status: 200, statusText: 'OK' })
      .mockResolvedValueOnce({ data: allRows.slice(2000, 2500), error: null, status: 200, statusText: 'OK' });

    const events = await fetchCalendarEvents();

    expect(rangeMock).toHaveBeenCalledTimes(3);
    expect(rangeMock).toHaveBeenNthCalledWith(1, 0, 999);
    expect(rangeMock).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(rangeMock).toHaveBeenNthCalledWith(3, 2000, 2999);
    expect(events.length).toBe(2500);
  });

  it('stops after a single page when fewer than 1000 rows are returned', async () => {
    const rows = Array.from({ length: 42 }, (_, i) => makeRow(i));
    rangeMock.mockResolvedValueOnce({ data: rows, error: null, status: 200, statusText: 'OK' });

    const events = await fetchCalendarEvents();

    expect(rangeMock).toHaveBeenCalledTimes(1);
    expect(events.length).toBe(42);
  });

  it('paginerar stödtabellen bookings förbi 1000-radersgränsen', async () => {
    rangeMock.mockResolvedValueOnce({ data: [makeRow(0)], error: null, status: 200, statusText: 'OK' });
    secondaryRows.bookings = Array.from({ length: 1500 }, (_, i) => ({
      id: `b-${i}`,
      client: 'X',
      large_project_id: null,
      rigdaydate: '2026-05-05',
    }));

    await fetchCalendarEvents();

    // 1500 rader ⇒ två sidor (1000 + 500).
    expect(secondaryCalls.bookings).toBe(2);
    delete secondaryRows.bookings;
  });
});
