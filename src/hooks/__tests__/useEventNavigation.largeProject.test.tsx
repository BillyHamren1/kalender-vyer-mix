import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React, { createContext } from 'react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/App', () => ({
  CalendarContext: createContext({ setLastViewedDate: () => {}, setLastPath: () => {} }),
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
