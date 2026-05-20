import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Rådata-hook: hämtar ALLA pings för en staff+dag direkt från
 * staff_location_history. Ingen filtrering, ingen klustring, ingen
 * tolkning. Får INTE importeras av Time Engine / dayJournal / display
 * timeline. Endast för /staff-management/gps-satellite-map.
 */
export interface RawStaffGpsPing {
  id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  source: string | null;
  battery_percent: number | null;
  is_charging: boolean | null;
  app_version: string | null;
  app_build: string | null;
  platform: string | null;
  os_version: string | null;
  device_model: string | null;
  app_id: string | null;
}

export function staffGpsRawQueryKey(staffId: string, date: string) {
  return ['staff-gps-raw', staffId, date] as const;
}

export function useStaffGpsPingsForDay(staffId: string | null, date: string | null, enabled = true) {
  const isEnabled = !!staffId && !!date && enabled;
  return useQuery<RawStaffGpsPing[]>({
    queryKey: staffId && date ? staffGpsRawQueryKey(staffId, date) : ['staff-gps-raw', 'noop'],
    enabled: isEnabled,
    staleTime: 30_000,
    queryFn: async () => {
      if (!staffId || !date) return [];
      const startIso = `${date}T00:00:00.000Z`;
      const endIso = `${date}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('staff_location_history')
        .select(
          'id, recorded_at, lat, lng, accuracy, speed, source, battery_percent, is_charging, app_version, app_build, platform, os_version, device_model, app_id'
        )
        .eq('staff_id', staffId)
        .gte('recorded_at', startIso)
        .lte('recorded_at', endIso)
        .order('recorded_at', { ascending: true })
        .limit(50000);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: String(r.id),
        recorded_at: String(r.recorded_at),
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracy: r.accuracy != null ? Number(r.accuracy) : null,
        speed: r.speed != null ? Number(r.speed) : null,
        source: (r.source as string | null) ?? null,
        battery_percent: r.battery_percent != null ? Number(r.battery_percent) : null,
        is_charging: typeof r.is_charging === 'boolean' ? r.is_charging : null,
        app_version: (r.app_version as string | null) ?? null,
        app_build: (r.app_build as string | null) ?? null,
        platform: (r.platform as string | null) ?? null,
        os_version: (r.os_version as string | null) ?? null,
        device_model: (r.device_model as string | null) ?? null,
        app_id: (r.app_id as string | null) ?? null,
      }));
    },
  });
}
