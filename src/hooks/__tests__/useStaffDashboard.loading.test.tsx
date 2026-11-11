import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStaffDashboard } from '../useStaffDashboard';
import { fetchStaffMessages, fetchJobActivity } from '@/services/staffDashboardService';
import { fetchStaffLocations } from '@/services/planningDashboardService';

vi.mock('@/services/staffDashboardService', () => ({
  fetchStaffMessages: vi.fn(async () => []),
  fetchJobActivity: vi.fn(async () => []),
}));
vi.mock('@/services/planningDashboardService', () => ({ fetchStaffLocations: vi.fn(async () => []) }));
vi.mock('../useRealtimeInvalidation', () => ({ useRealtimeInvalidation: vi.fn() }));

describe('dashboard loads only displayed data', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [{ activity: false, locations: false }, [1, 0, 0]],
    [{ messages: false }, [0, 1, 1]],
    [{}, [1, 1, 1]],
  ] as const)('respects enabled sections %j, including realtime invalidation', async (options, expected) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(() => useStaffDashboard(options), { wrapper });
    const fetchers = [fetchStaffMessages, fetchJobActivity, fetchStaffLocations];
    await waitFor(() => fetchers.forEach((fetcher, index) => expect(fetcher).toHaveBeenCalledTimes(expected[index])));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await act(async () => { await client.invalidateQueries(); });
    fetchers.forEach((fetcher, index) => expect(fetcher).toHaveBeenCalledTimes(expected[index] * 2));
    unmount();
    client.clear();
  });
});
