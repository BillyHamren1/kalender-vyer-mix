import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase client BEFORE importing the service.
const rangeMock = vi.fn();
const orderMock = vi.fn(() => ({ range: rangeMock }));
const lteMock = vi.fn(() => ({ order: orderMock }));
const gteMock = vi.fn(() => ({ lte: lteMock }));
const neqMock = vi.fn(() => ({ gte: gteMock }));
const selectMock = vi.fn(() => ({ neq: neqMock }));
const fromMock = vi.fn((table: string) => {
  if (table === 'calendar_events') {
    return { select: selectMock };
  }
  // For all the follow-up tables (bookings, large_projects, etc.) return empty.
  return {
    select: () => ({
      or: () => Promise.resolve({ data: [], error: null }),
      is: () => Promise.resolve({ data: [], error: null }),
      in: () => Promise.resolve({ data: [], error: null }),
    }),
  };
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
});
