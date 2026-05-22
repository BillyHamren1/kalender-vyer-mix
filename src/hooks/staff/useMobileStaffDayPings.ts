/**
 * useMobileStaffDayPings — hämtar den sparade GPS-dagssnapshoten för en dag via
 * snapshot-edge function get-mobile-staff-day-pings (mobile-auth).
 * Mobilen får aldrig räkna eller läsa GPS-rådata själv.
 */
import { useQuery } from '@tanstack/react-query';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import type { StaffGpsDaySnapshot } from '@/types/staffGpsSnapshot';

export function useMobileStaffDayPings(staffId: string | null, date: string | null, enabled = true) {
  return useQuery<StaffGpsDaySnapshot>({
    queryKey: ['mobile-staff-day-pings', staffId, date],
    enabled: enabled && !!staffId && !!date,
    staleTime: 60_000,
    queryFn: async () => {
      return await callStaffSnapshotFunction<StaffGpsDaySnapshot>('get-mobile-staff-day-pings', {
        staffId,
        date,
      });
    },
  });
}
