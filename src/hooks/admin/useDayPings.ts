import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DayPing {
  id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  source: string | null;
  time_report_id: string | null;
}

interface Args {
  staffId: string | null;
  date: string | null;
  enabled?: boolean;
}

export function dayPingsQueryKey(staffId: string, date: string) {
  return ["day-pings", staffId, date] as const;
}

export function useDayPings({ staffId, date, enabled = true }: Args) {
  const isEnabled = !!staffId && !!date && enabled;

  const query = useQuery({
    queryKey: staffId && date ? dayPingsQueryKey(staffId, date) : ["day-pings", "noop"],
    enabled: isEnabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DayPing[]> => {
      if (!staffId || !date) return [];
      const startIso = `${date}T00:00:00.000Z`;
      // End of local day in UTC bounds — fetch a generous window to cover TZ shifts.
      const endIso = `${date}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from("staff_location_history")
        .select("id, recorded_at, lat, lng, accuracy, speed, time_report_id")
        .eq("staff_id", staffId)
        .gte("recorded_at", startIso)
        .lte("recorded_at", endIso)
        .order("recorded_at", { ascending: true })
        .limit(5000);

      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        recorded_at: r.recorded_at as string,
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracy: r.accuracy != null ? Number(r.accuracy) : null,
        speed: r.speed != null ? Number(r.speed) : null,
        source: null,
        time_report_id: (r.time_report_id as string | null) ?? null,
      }));
    },
  });

  return {
    pings: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
