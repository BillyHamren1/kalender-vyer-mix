import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/services/staffSnapshotApi', () => ({
  callStaffSnapshotFunction: vi.fn(),
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

describe('useStaffGpsWeekSummaryBatch', () => {
  beforeEach(() => {
    vi.mocked(callStaffSnapshotFunction).mockReset();
  });

  it('gör ETT batch-anrop med sorterade staffIds och week range', async () => {
    vi.mocked(callStaffSnapshotFunction).mockResolvedValue({
      summaries: {
        'a': { '2026-05-18': { pingsCount: 5, firstIso: '2026-05-18T08:00:00Z', lastIso: '2026-05-18T16:00:00Z', durationMin: 300, placeNames: ['X'] } },
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
    expect(result.current.summaries.a['2026-05-18'].pingsCount).toBe(5);
  });

  it('skippar anrop när staffIds är tom', () => {
    renderHook(
      () => useStaffGpsWeekSummaryBatch([], weekDays),
      { wrapper: wrapper() },
    );
    expect(callStaffSnapshotFunction).not.toHaveBeenCalled();
  });
});
