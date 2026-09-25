import { describe, it, expect, vi } from 'vitest';
import React, { createContext } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Kedja: kalenderklick (riktig handleProjectEventClick) -> /large-project/:id
// -> riktig LargeProjectLayout + useLargeProjectDetail + fetchLargeProjectCore
// mot en fixture-supabase. Medlemmar: en join-rad (grundbokning) + en
// legacy-only-medlem.
vi.mock('@/App', () => ({
  CalendarContext: createContext({ setLastViewedDate: () => {}, setLastPath: () => {} }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));

const LP = 'lp1';
const tables: Record<string, any[]> = {
  large_projects: [{
    id: LP, name: 'Mässan 2026', status: 'planning', organization_id: 'org', deleted_at: null,
    primary_booking_id: 'uuid-a', start_date: [], end_date: [],
    large_project_bookings: [{ id: 'lpb-1', large_project_id: LP, booking_id: 'uuid-a', display_name: null, sort_order: 1, created_at: '' }],
  }],
  bookings: [
    { id: 'uuid-a', client: 'Kund Alfa', booking_number: '2512-7', large_project_id: LP, status: 'CONFIRMED' },
    { id: 'uuid-b', client: 'Kund Beta', booking_number: '2601-44', large_project_id: LP, status: 'CONFIRMED' },
  ],
};
vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const filters: Array<(r: any) => boolean> = [];
    const data = () => (tables[table] || []).filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: () => api, order: () => api, limit: () => api, neq: () => api, not: () => api, or: () => api,
      gte: () => api, lte: () => api, range: () => api, update: () => api, insert: () => api, upsert: () => api, delete: () => api,
      eq: (c: string, v: any) => { filters.push((r) => r[c] === undefined || r[c] === v); return api; },
      is: (c: string, v: any) => { filters.push((r) => (r[c] ?? null) === v); return api; },
      in: (c: string, v: any[]) => { filters.push((r) => r[c] === undefined || v.includes(r[c])); return api; },
      single: async () => ({ data: data()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: data()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: data(), error: null }).then(res, rej),
    };
    return api;
  };
  const channel = () => ({ on: function () { return this; }, subscribe: function () { return this; } });
  return { supabase: { from, rpc: async () => ({ data: null, error: null }), channel, removeChannel: () => {},
    functions: { invoke: async () => ({ data: null, error: null }) },
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }), getSession: async () => ({ data: { session: null } }) } } };
});

import { useEventNavigation } from '@/hooks/useEventNavigation';
import LargeProjectLayout from '../LargeProjectLayout';

const CalendarTile = () => {
  const { handleProjectEventClick } = useEventNavigation();
  return (
    <button onClick={() => handleProjectEventClick({
      event: { id: 'lp-tile', title: 'Mässan 2026', start: new Date(), extendedProps: { bookingId: 'uuid-b', largeProjectId: LP } },
      el: null,
    })}>Projektpost i kalendern</button>
  );
};

describe('Kalenderklick -> projektets detaljvy visar medlemmarna', () => {
  it('navigerar till /large-project/:id och renderar båda medlemsbokningarna', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/calendar']}>
          <Routes>
            <Route path="/calendar" element={<CalendarTile />} />
            <Route path="/large-project/:id/*" element={<LargeProjectLayout />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText('Projektpost i kalendern'));
    expect(await screen.findByText('2 kopplade till projektet', {}, { timeout: 4000 })).toBeTruthy();
    expect(await screen.findByText('Kund Alfa (#2512-7)')).toBeTruthy();
    expect(screen.getByText('Kund Beta (#2601-44)')).toBeTruthy();
    expect(screen.getAllByTestId('primary-booking-badge')).toHaveLength(1);
  });
});
