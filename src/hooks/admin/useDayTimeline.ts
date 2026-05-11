import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DayTimelineEventType =
  | "workday_started" | "workday_ended"
  | "timer_started" | "timer_stopped"
  | "stay_segment" | "travel_segment"
  | "arrived_at_reported_site" | "left_reported_site"
  | "arrived_at_known_location" | "left_known_location"
  | "stopped_at_unknown_location"
  | "movement_started" | "movement_ended"
  | "gps_gap_started" | "gps_gap_ended"
  | "stale_phone_detected"
  | "geofence_mismatch"
  | "ongoing_at_last_known"
  | string;

export interface DayTimelineEvent {
  id: string;
  organization_id: string;
  staff_id: string;
  date: string;
  event_type: DayTimelineEventType;
  ts: string;
  end_ts?: string | null;
  duration_min?: number | null;
  planned?: boolean | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  source: string | null;
  matched_site_id: string | null;
  matched_site_type: string | null;
  matched_site_name: string | null;
  distance_to_reported_site_m: number | null;
  confidence: number | null;
  human_readable_text: string | null;
  related_time_report_id: string | null;
  related_workday_id: string | null;
  engine_version: string;
}

export interface DayTimelineSuggestion {
  id: string;
  time_report_id: string | null;
  report_date: string;
  suggestion_type: string;
  suggested_start_time: string | null;
  suggested_end_time: string | null;
  suggested_duration_min: number | null;
  original_start_time: string | null;
  original_end_time: string | null;
  difference_min: number | null;
  confidence: number | null;
  human_readable_text: string | null;
  status: string;
}

export interface DayTimelineCoverage {
  last_ping_ts: string | null;
  last_event_end_ts: string | null;
  gap_minutes: number;
  ping_count?: number;
}

export interface DayTimelineResponse {
  events: DayTimelineEvent[];
  suggestions: DayTimelineSuggestion[];
  snapshot: { computed_at?: string; cached?: boolean } | null;
  coverage?: DayTimelineCoverage | null;
}

interface Args { staffId: string | null; date: string | null; enabled?: boolean }

export function dayTimelineQueryKey(staffId: string, date: string) {
  return ["day-timeline", staffId, date] as const;
}

async function invokeEngine(action: "get" | "compute", staffId: string, date: string, force = false): Promise<DayTimelineResponse> {
  const { data, error } = await supabase.functions.invoke("day-timeline-engine", {
    body: { action, staff_id: staffId, date, ...(force ? { force: true } : {}) },
  });
  if (error) throw error;
  return data as DayTimelineResponse;
}

export function useDayTimeline({ staffId, date, enabled = true }: Args) {
  const qc = useQueryClient();
  const isEnabled = !!staffId && !!date && enabled;

  const query = useQuery({
    queryKey: staffId && date ? dayTimelineQueryKey(staffId, date) : ["day-timeline", "noop"],
    enabled: isEnabled,
    staleTime: 30_000,
    queryFn: async (): Promise<DayTimelineResponse> => {
      if (!staffId || !date) return { events: [], suggestions: [], snapshot: null };
      // Try cached `get` first
      try {
        const got = await invokeEngine("get", staffId, date);
        if (got && (got.events?.length || got.snapshot)) return got;
      } catch (err) {
        console.warn("[useDayTimeline] get failed, falling back to compute", err);
      }
      return invokeEngine("compute", staffId, date);
    },
  });

  // Realtime invalidation on new events for this staff/date
  useEffect(() => {
    if (!staffId || !date) return;
    const channel = supabase
      .channel(`day-timeline-${staffId}-${date}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "day_timeline_events",
          filter: `staff_id=eq.${staffId}`,
        },
        (payload: any) => {
          if (payload?.new?.date === date) {
            qc.invalidateQueries({ queryKey: dayTimelineQueryKey(staffId, date) });
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [staffId, date, qc]);

  const refresh = async () => {
    if (!staffId || !date) return;
    const fresh = await invokeEngine("compute", staffId, date, true);
    qc.setQueryData(dayTimelineQueryKey(staffId, date), fresh);
    return fresh;
  };

  return {
    events: query.data?.events ?? [],
    suggestions: query.data?.suggestions ?? [],
    snapshot: query.data?.snapshot ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refresh,
  };
}
