/**
 * useMobileStaffDayPings — hämtar råpings + geofences för en dag via
 * snapshot-edge function get-mobile-staff-day-pings (mobile-auth).
 * Inga DB-anrop från mobilen (RLS blockerar mobile-token mot
 * staff_location_history direkt).
 */
import { useQuery } from '@tanstack/react-query';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';

export interface MobileDayPing {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface MobileDayGeofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  polygon?: GeoJSON.Polygon | null;
}

export interface MobileDayPingsResult {
  staffId: string;
  date: string;
  pings: MobileDayPing[];
  geofences: MobileDayGeofence[];
  lastUpdatedAt: string;
}

export function useMobileStaffDayPings(staffId: string | null, date: string | null, enabled = true) {
  return useQuery<MobileDayPingsResult>({
    queryKey: ['mobile-staff-day-pings', staffId, date],
    enabled: enabled && !!staffId && !!date,
    staleTime: 60_000,
    queryFn: async () => {
      const data: any = await callStaffSnapshotFunction('get-mobile-staff-day-pings', {
        staffId,
        date,
      });
      return {
        staffId: String(data?.staffId ?? staffId),
        date: String(data?.date ?? date),
        pings: ((data?.pings ?? []) as any[]).map((p) => ({
          recorded_at: String(p.recorded_at),
          lat: Number(p.lat),
          lng: Number(p.lng),
          accuracy: p.accuracy != null ? Number(p.accuracy) : null,
        })),
        geofences: ((data?.geofences ?? []) as any[]).map((g) => ({
          id: String(g.id),
          name: String(g.name),
          lat: Number(g.lat),
          lng: Number(g.lng),
          radiusMeters: Number(g.radiusMeters ?? 75),
          polygon: g.polygon ?? null,
        })),
        lastUpdatedAt: String(data?.lastUpdatedAt ?? new Date().toISOString()),
      };
    },
  });
}
