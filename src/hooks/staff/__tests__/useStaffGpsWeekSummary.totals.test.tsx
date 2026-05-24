import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { StaffGpsDaySnapshot } from '@/types/staffGpsSnapshot';

// Mock snapshot API
vi.mock('@/services/staffSnapshotApi', () => ({
  callStaffSnapshotFunction: vi.fn(),
}));

vi.mock('@/hooks/useOrganizationLocations', () => ({
  useOrganizationLocations: () => ({ data: [] }),
}));

import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useStaffGpsWeekSummary } from '@/hooks/staff/useStaffGpsWeekSummary';

const mockedSnap = callStaffSnapshotFunction as unknown as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useStaffGpsWeekSummary — total = summa av besök', () => {
  beforeEach(() => {
    mockedSnap.mockReset();
  });

  it('summerar 1h17 + 1h0 + 14h23 → 16h 40m', async () => {
    const date = '2026-05-21';
    const snap: StaffGpsDaySnapshot = {
      staffId: 'staff-1',
      date,
      pings: [{ id: 'p1', recorded_at: `${date}T06:29:00Z`, lat: 0, lng: 0, accuracy: 10 }],
      geofences: [],
      visits: [
        {
          placeKey: 'fa-1',
          knownSite: { id: 'loc:fa', name: 'FA Warehouse' },
          centre: { lat: 0, lng: 0 },
          start: `${date}T06:29:38Z`,
          end: `${date}T07:46:50Z`,
          durationMin: 77,
          pingCount: 6,
          pings: [],
        },
        {
          placeKey: 'fa-2',
          knownSite: { id: 'loc:fa', name: 'FA Warehouse' },
          centre: { lat: 0, lng: 0 },
          start: `${date}T07:50:31Z`,
          end: `${date}T08:50:39Z`,
          durationMin: 60,
          pingCount: 261,
          pings: [],
        },
        {
          placeKey: 'westmans',
          knownSite: { id: 'project:westmans', name: 'Westmans Uthyrning - 23 maj 2026' },
          centre: { lat: 0, lng: 0 },
          start: `${date}T08:50:39Z`,
          end: `${date}T23:13:48Z`,
          durationMin: 863,
          pingCount: 263,
          pings: [],
        },
      ],
      hasGps: true,
      lastUpdatedAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
    };

    // Returnera samma snapshot för varje dag (vi tittar bara på dag 0)
    mockedSnap.mockResolvedValue(snap);

    const weekDates = [new Date(`${date}T12:00:00Z`)];
    const { result } = renderHook(() => useStaffGpsWeekSummary('staff-1', weekDates), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current[0]?.visits.length).toBe(3);
    });

    const day = result.current[0];
    expect(day.durationMin).toBe(77 + 60 + 863); // 1000m = 16h 40m
    // Namnen ska speglas
    expect(day.placeNames).toContain('FA Warehouse');
    expect(day.placeNames).toContain('Westmans Uthyrning - 23 maj 2026');
    // Westmans ska ha 14h 23m
    const westmans = day.places.find((p) => p.name.startsWith('Westmans'));
    expect(westmans?.minutes).toBe(863);
  });
});
