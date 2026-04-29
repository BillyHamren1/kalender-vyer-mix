import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RealityFlagType =
  | 'missing_gps'
  | 'timer_started_offsite'
  | 'never_at_reported_site'
  | 'left_site_timer_still_open'
  | 'report_overrun_after_departure'
  | 'stale_phone'
  | 'wrong_reported_site'
  | 'gps_gap';

export interface RealityFlag {
  type: RealityFlagType;
  severity: 'info' | 'warning' | 'critical';
  at: string | null;
  until?: string | null;
  durationMin?: number;
  message: string;
  detail?: Record<string, unknown>;
  sessionId?: string | null;
}

export interface SessionReality {
  session_id: string;
  kind: 'time_report' | 'location_entry';
  label: string;
  target_type: 'booking' | 'large_project' | 'location' | 'unknown';
  target_id: string | null;
  start: string;
  end: string | null;
  is_open: boolean;
  duration_min: number;
  timer_start_position: { lat: number; lng: number; recorded_at: string } | null;
  timer_start_distance_to_reported_site: number | null;
  timer_started_offsite: boolean;
  last_seen_at_reported_site: string | null;
  left_reported_site_at: string | null;
  current_position: { lat: number; lng: number; recorded_at: string } | null;
  current_distance_to_reported_site: number | null;
  pings_in_session: number;
  pings_at_site: number;
  flags: RealityFlag[];
}

export interface DayReality {
  staff_id: string;
  date: string;
  generated_at: string;
  workday: { id: string; started_at: string | null; ended_at: string | null } | null;
  gps_points_count: number;
  first_ping: { recorded_at: string; lat: number; lng: number } | null;
  last_ping: { recorded_at: string; lat: number; lng: number } | null;
  sessions: SessionReality[];
  flags: RealityFlag[];
}

/**
 * Fetches the server-computed "day reality" for one staff member on one date.
 * Server side analyses GPS pings vs reported sessions and returns structured
 * facts + flags. Replaces ad-hoc client-side analysis.
 */
export function useStaffDayReality(
  staffId: string | null | undefined,
  date: string | null | undefined,
  enabled = true,
) {
  return useQuery<DayReality | null>({
    queryKey: ['staff-day-reality', staffId, date],
    enabled: !!staffId && !!date && enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mobile-app-api', {
        body: { action: 'get_staff_day_reality', data: { staff_id: staffId, date } },
      });
      if (error) throw error;
      if (!data) return null;
      // Endpoint may return either the bare object or { reality: ... }
      return (data.reality ?? data) as DayReality;
    },
  });
}
