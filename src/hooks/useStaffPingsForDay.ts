import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import type { Ping } from '@/lib/staff/movementDetection';

/**
 * Shared cached fetch of GPS pings for a single staff/day. Multiple rows
 * (DayHeaderRow, ProjectSessionRow, expanded ping panel) all derive from the
 * same query key so the network call only happens once per (staff, date).
 */
export function useStaffPingsForDay(staffId: string, date: string, enabled = true) {
  return useQuery<Ping[]>({
    queryKey: ['staff-pings-day', staffId, date],
    enabled: enabled && !!staffId && !!date,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await mobileApi.getMovementForDay(staffId, date);
      return (res?.points || []).map(p => ({
        lat: p.lat,
        lng: p.lng,
        recorded_at: p.recorded_at,
        accuracy: p.accuracy ?? null,
      }));
    },
  });
}
