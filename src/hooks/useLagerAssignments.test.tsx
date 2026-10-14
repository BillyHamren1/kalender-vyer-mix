// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
const getAssignments = vi.hoisted(() => vi.fn());
vi.mock('@/services/mobileApiService', () => ({ mobileApi: { getLagerAssignments: getAssignments } }));
import { useLagerAssignments, warehouseAssignmentOnDate } from './useLagerAssignments';

describe('warehouse assignment day filter', () => {
  it('includes overnight work and untimed work returned by the day API', async () => {
    const items = [
      { id: 'overnight', date: '2026-10-13', start_time: '2026-10-13T22:00:00+02:00', end_time: '2026-10-14T03:00:00+02:00' },
      { id: 'untimed', date: '2026-10-14', start_time: null, end_time: null },
      { id: 'legacy', date: '2026-10-14', start_time: '08:00:00', end_time: '10:00:00' },
      { id: 'other-day', date: '2026-10-15', start_time: null, end_time: null },
    ];
    getAssignments.mockResolvedValue({ assignments: items });
    const { result } = renderHook(() => useLagerAssignments({ date: '2026-10-14' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getAssignments).toHaveBeenCalledWith({ date_from: '2026-10-14', date_to: '2026-10-14' });
    expect(result.current.assignments.map(item => item.id)).toEqual(['overnight', 'untimed', 'legacy']);
  });
  it('excludes work ending exactly at the start of the selected day', () => {
    expect(warehouseAssignmentOnDate({ date: '2026-10-13', start_time: '2026-10-13T22:00:00+02:00', end_time: '2026-10-14T00:00:00+02:00' }, '2026-10-14')).toBe(false);
  });
  it('uses Stockholm boundaries on a DST day', () => {
    expect(warehouseAssignmentOnDate({ date: '2026-03-28', start_time: '2026-03-28T23:30:00Z', end_time: '2026-03-29T02:00:00Z' }, '2026-03-29')).toBe(true);
  });
});
