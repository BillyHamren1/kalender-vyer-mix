import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React, { createContext } from 'react';

const { dateMock } = vi.hoisted(() => ({ dateMock: vi.fn() }));
const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/App', () => ({
  CalendarContext: createContext({ setLastViewedDate: dateMock, setLastPath: () => {} }),
}));

// Tabelldriven supabase-mock: rows per tabell, loggar alla writes.
let rows: Record<string, any[]> = {};
const writes: Array<{ table: string; op: string; payload: any }> = [];
function q(table: string) {
  const filters: Array<(r: any) => boolean> = [];
  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => { filters.push(r => r[c] === v); return api; },
    is: (c: string, v: any) => { filters.push(r => (r[c] ?? null) === v); return api; },
    not: () => api,
    update: (p: any) => { writes.push({ table, op: 'update', payload: p }); return api; },
    delete: () => { writes.push({ table, op: 'delete', payload: null }); return api; },
    maybeSingle: async () => ({ data: (rows[table] || []).filter(r => filters.every(f => f(r)))[0] ?? null, error: null }),
    single: async () => ({ data: (rows[table] || []).filter(r => filters.every(f => f(r)))[0] ?? null, error: null }),
    then: (res: any) => res({ data: null, error: null }),
  };
  return api;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => q(t) } }));

import { useEventNavigation } from '../useEventNavigation';

const info = (props: any) => ({ event: { id: 'e', title: 't', start: new Date(), extendedProps: props }, el: null });

describe('kalenderklick – stora projekt', () => {
  beforeEach(() => { navigateMock.mockReset(); writes.length = 0; });

  it('öppnar det aktiva stora projektet', async () => {
    rows = { large_projects: [{ id: 'lp1', deleted_at: null }], bookings: [{ id: 'b1', large_project_id: 'lp1' }], projects: [] };
    const { result } = renderHook(() => useEventNavigation());
    await result.current.handleEventClick(info({ bookingId: 'b1', largeProjectId: 'lp1' }));
    expect(navigateMock).toHaveBeenCalledWith('/large-project/lp1');
  });

  it('hittar projektet via bokningens koppling även utan largeProjectId på händelsen', async () => {
    rows = { large_projects: [{ id: 'lp1', deleted_at: null }], bookings: [{ id: 'b1', large_project_id: 'lp1' }], projects: [] };
    const { result } = renderHook(() => useEventNavigation());
    await result.current.handleEventClick(info({ bookingId: 'b1' }));
    expect(navigateMock).toHaveBeenCalledWith('/large-project/lp1');
  });

  it('mjukraderat projekt: öppnar bokningen och rör ALDRIG bokningens projektkoppling', async () => {
    rows = { large_projects: [{ id: 'lp1', deleted_at: '2026-09-01' }], bookings: [{ id: 'b1', large_project_id: 'lp1' }], projects: [] };
    const { result } = renderHook(() => useEventNavigation());
    await result.current.handleEventClick(info({ bookingId: 'b1', largeProjectId: 'lp1' }));
    expect(navigateMock).toHaveBeenCalledWith('/booking/b1');
    expect(writes.filter(w => w.table === 'bookings' && 'large_project_id' in (w.payload || {}))).toEqual([]);
  });

  it('forceBookingDetail öppnar den enskilda bokningen', async () => {
    rows = { large_projects: [{ id: 'lp1', deleted_at: null }], bookings: [], projects: [] };
    const { result } = renderHook(() => useEventNavigation());
    await result.current.handleEventClick(info({ bookingId: 'b2', largeProjectId: 'lp1', forceBookingDetail: true }));
    expect(navigateMock).toHaveBeenCalledWith('/booking/b2');
  });
});

describe('personalkalenderns samlade projektpost – handleProjectEventClick', () => {
  beforeEach(() => { navigateMock.mockReset(); writes.length = 0; });

  it('klick på projektposten leder till /large-project/:id', async () => {
    rows = { large_projects: [{ id: 'lp1', deleted_at: null }], bookings: [{ id: 'b1', large_project_id: 'lp1' }], projects: [] };
    const { result } = renderHook(() => useEventNavigation());
    await result.current.handleProjectEventClick(info({ bookingId: 'b1', largeProjectId: 'lp1' }));
    expect(navigateMock).toHaveBeenCalledWith('/large-project/lp1');
    expect(writes).toEqual([]);
  });

  it('sekundär medlemsbokning (legacy-fält) leder till samma projekt', async () => {
    rows = { large_projects: [{ id: 'lp1', deleted_at: null }], bookings: [{ id: 'b2', large_project_id: 'lp1' }], projects: [] };
    const { result } = renderHook(() => useEventNavigation());
    await result.current.handleProjectEventClick(info({ bookingId: 'b2' }));
    expect(navigateMock).toHaveBeenCalledWith('/large-project/lp1');
  });

  it('raderat projekt: öppnar aldrig bokningsvyn och ändrar ingen koppling', async () => {
    rows = { large_projects: [{ id: 'lp1', deleted_at: '2026-09-01' }], bookings: [{ id: 'b1', large_project_id: 'lp1' }], projects: [] };
    const { result } = renderHook(() => useEventNavigation());
    await result.current.handleProjectEventClick(info({ bookingId: 'b1', largeProjectId: 'lp1' }));
    expect(navigateMock).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});


describe('project navigation date safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = { large_projects: [{ id: 'lp1', deleted_at: null }] };
  });

  it.each(['handleEventClick', 'handleProjectEventClick'] as const)(
    '%s converts serialized event dates before saving calendar context', async (handler) => {
      const { result } = renderHook(() => useEventNavigation());
      const click = info({ bookingId: 'b1', largeProjectId: 'lp1' });
      click.event.start = '2026-10-13T12:00:00Z' as any;
      await result.current[handler](click);
      expect(dateMock).toHaveBeenCalledWith(new Date('2026-10-13T12:00:00Z'));
      expect(navigateMock).toHaveBeenCalledWith('/large-project/lp1');
    },
  );

  it.each([null, undefined, '', 'invalid', new Date(NaN), {}])(
    'keeps the previous calendar date for invalid input %s', async (start) => {
      const { result } = renderHook(() => useEventNavigation());
      for (const handler of ['handleEventClick', 'handleProjectEventClick'] as const) {
        const click = info({ bookingId: 'b1', largeProjectId: 'lp1' });
        click.event.start = start as any;
        await result.current[handler](click);
      }
      expect(dateMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledTimes(2);
    },
  );
});
