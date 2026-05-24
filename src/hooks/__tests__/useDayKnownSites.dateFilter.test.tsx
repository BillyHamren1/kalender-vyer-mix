import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Regressionstest: useDayKnownSites får ALDRIG plocka in ett projekt vars
 * eventdate/rigdaydate/rigdowndate inte matchar `date` (och som inte är
 * is_internal). Annars matchar GPS-pings ett gammalt testprojekt och tid
 * "reggas" på fel datum.
 */

const STAFF = 'staff-1';
const DATE = '2026-05-24';

const mkBookingId = 'booking-active-today';
const mkOldProjectId = 'project-2222-test-feb';

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const state: any = { table, filters: {} as Record<string, any>, isFilter: null as string | null, orFilter: null as string | null };
    const api: any = {
      select: () => api,
      in: (col: string, vals: any[]) => { state.filters[col] = { in: vals }; return api; },
      eq: (col: string, val: any) => { state.filters[col] = val; return api; },
      is: (col: string, val: any) => { state.isFilter = `${col}=${val}`; return api; },
      or: (expr: string) => { state.orFilter = expr; return api; },
      then: (resolve: any) => resolve(runQuery(state)),
    };
    return api;
  };
  return { supabase: { from: builder } };
});

vi.mock('@/hooks/useOrganizationLocations', () => ({
  useOrganizationLocations: () => ({ data: [], isLoading: false }),
}));

function runQuery(state: any): { data: any[]; error: null } {
  const { table, filters } = state;
  if (table === 'staff_assignments') return { data: [], error: null };
  if (table === 'booking_staff_assignments') {
    return filters.staff_id === STAFF && filters.assignment_date === DATE
      ? { data: [{ booking_id: mkBookingId }], error: null }
      : { data: [], error: null };
  }
  if (table === 'time_reports') return { data: [], error: null };
  if (table === 'location_time_entries') return { data: [], error: null };
  if (table === 'calendar_events') return { data: [], error: null };
  if (table === 'large_project_bookings') return { data: [], error: null };
  if (table === 'large_projects') return { data: [], error: null };
  if (table === 'bookings') {
    return {
      data: [{
        id: mkBookingId,
        client: 'Active Kund',
        booking_number: 'BK-100',
        deliveryaddress: 'Aktuell adress',
        delivery_latitude: 59.0,
        delivery_longitude: 18.0,
        large_project_id: null,
        assigned_project_id: mkOldProjectId,
      }],
      error: null,
    };
  }
  if (table === 'projects') {
    // Returnera det gamla projektet oavsett om vi söker via booking_id eller id
    return {
      data: [{
        id: mkOldProjectId,
        name: '2222 TEST """" - 22 februari 2026',
        delivery_latitude: 59.5,
        delivery_longitude: 18.5,
        address_radius_meters: 150,
        status: 'active',
        planning_status: 'active',
        deleted_at: null,
        booking_id: mkBookingId,
        eventdate: '2026-02-22',
        rigdaydate: '2026-02-22',
        rigdowndate: '2026-02-22',
        is_internal: false,
      }],
      error: null,
    };
  }
  return { data: [], error: null };
}

beforeEach(() => { /* state is per-query call */ });

import { useDayKnownSites } from '../useDayKnownSites';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useDayKnownSites — datumfilter på projekt', () => {
  it('Plockar INTE in projekt vars datum inte matchar dagens datum', async () => {
    const { result } = renderHook(() => useDayKnownSites(STAFF, DATE, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const sites = result.current.knownSites;
    const projectSite = sites.find(s => s.id === `project:${mkOldProjectId}`);
    expect(projectSite, 'Gammalt projekt (22 feb) får inte vara known site idag').toBeUndefined();
  });

  it('Använder bokningens egen pin istället när projektet filtreras bort', async () => {
    const { result } = renderHook(() => useDayKnownSites(STAFF, DATE, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const sites = result.current.knownSites;
    const bookingSite = sites.find(s => s.id === `booking:${mkBookingId}`);
    expect(bookingSite, 'Bokningens egen koordinat ska användas när projektet filtreras bort').toBeDefined();
    expect(bookingSite?.lat).toBe(59.0);
    expect(bookingSite?.lng).toBe(18.0);
  });
});
