import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/services/staffSnapshotApi', () => ({
  callStaffSnapshotFunction: vi.fn(),
}));

vi.mock('@/hooks/useOrganizationLocations', () => ({
  useOrganizationLocations: () => ({ data: [] }),
}));

import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useStaffGpsWeekSummaryBatch } from '@/hooks/staff/useStaffGpsWeekSummaryBatch';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const weekDays = [
  new Date('2026-05-18T00:00:00Z'),
  new Date('2026-05-19T00:00:00Z'),
  new Date('2026-05-20T00:00:00Z'),
];

function snap(staffId: string, date: string, visits: any[], pings: any[] = []) {
  return {
    staffId,
    date,
    pings,
    geofences: [],
    visits,
    hasGps: pings.length > 0,
    lastUpdatedAt: `${date}T10:00:00Z`,
    generatedAt: `${date}T10:00:00Z`,
  };
}

describe('useStaffGpsWeekSummaryBatch', () => {
  beforeEach(() => {
    vi.mocked(callStaffSnapshotFunction).mockReset();
  });

  it('summerar från snapshot-batchen via samma logik som detaljvyn', async () => {
    vi.mocked(callStaffSnapshotFunction).mockResolvedValue({
      snapshots: {
        a: {
          '2026-05-18': snap('a', '2026-05-18', [
            {
              placeKey: 'project:alpha',
              knownSite: { id: 'project:alpha', name: 'Handelsbanken · Tavet' },
              centre: { lat: 1, lng: 2 },
              start: '2026-05-18T08:00:00Z',
              end: '2026-05-18T13:00:00Z',
              durationMin: 300,
              pingCount: 5,
              pings: [],
            },
          ], [{ id: 'p', recorded_at: '2026-05-18T08:00:00Z', lat: 1, lng: 2, accuracy: 5 }]),
        },
      },
      generatedAt: '2026-05-24T00:00:00Z',
    });

    const { result } = renderHook(
      () => useStaffGpsWeekSummaryBatch(['b', 'a', 'c'], weekDays),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(callStaffSnapshotFunction).toHaveBeenCalledTimes(1);
    expect(callStaffSnapshotFunction).toHaveBeenCalledWith(
      'get-staff-gps-week-summary',
      { staffIds: ['a', 'b', 'c'], fromDate: '2026-05-18', toDate: '2026-05-20' },
    );
    const dayA = result.current.summaries.a['2026-05-18'];
    expect(dayA.pingsCount).toBe(1);
    expect(dayA.durationMin).toBe(300);
    expect(dayA.placeNames).toEqual(['Handelsbanken · Tavet']);
    expect(dayA.visits?.[0]?.name).toBe('Handelsbanken · Tavet');
    // tomma dagar i intervallet finns med, utan visits
    expect(result.current.summaries.a['2026-05-19'].visits).toEqual([]);
  });

  it('skippar anrop när staffIds är tom', () => {
    renderHook(
      () => useStaffGpsWeekSummaryBatch([], weekDays),
      { wrapper: wrapper() },
    );
    expect(callStaffSnapshotFunction).not.toHaveBeenCalled();
  });

  it('faller tillbaka till dags-snapshots när batch-anropet misslyckas', async () => {
    vi.mocked(callStaffSnapshotFunction)
      .mockRejectedValueOnce(new Error('snapshot_failed'))
      .mockResolvedValueOnce(snap('a', '2026-05-18', [
        {
          placeKey: 'project:alpha',
          knownSite: { id: 'project:alpha', name: 'Alpha' },
          centre: { lat: 1, lng: 2 },
          start: '2026-05-18T08:00:00Z',
          end: '2026-05-18T10:00:00Z',
          durationMin: 120,
          pingCount: 5,
          pings: [],
        },
      ]) as any)
      .mockResolvedValueOnce(snap('a', '2026-05-19', []) as any)
      .mockResolvedValueOnce(snap('a', '2026-05-20', []) as any);

    const { result } = renderHook(
      () => useStaffGpsWeekSummaryBatch(['a'], weekDays),
      { wrapper: wrapper() },
    );

    await waitFor(() => {
      expect(result.current.summaries.a?.['2026-05-18']?.durationMin).toBe(120);
    });

    expect(callStaffSnapshotFunction).toHaveBeenNthCalledWith(
      1,
      'get-staff-gps-week-summary',
      { staffIds: ['a'], fromDate: '2026-05-18', toDate: '2026-05-20' },
    );
    expect(callStaffSnapshotFunction).toHaveBeenNthCalledWith(
      2,
      'get-mobile-staff-day-pings',
      { staffId: 'a', date: '2026-05-18' },
    );
  });
});
