import { supabase } from "@/integrations/supabase/client";

export interface RouteStop {
  bookingId: string;
  client: string;
  address: string | null;
  lat: number;
  lng: number;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
}

export interface StaffRouteResult {
  optimized_order: number[];
  stops: RouteStop[];
  total_distance_km: number;
  total_duration_min: number;
  polyline: GeoJSON.LineString | null;
  ai_suggestions: string;
}

export async function optimizeStaffRoute(staffId: string, date: string): Promise<StaffRouteResult> {
  const { data, error } = await supabase.functions.invoke('optimize-staff-route', {
    body: { staff_id: staffId, date },
  });

  if (error) throw new Error(error.message || 'Failed to optimize route');
  if (data?.error && !data?.stops) throw new Error(data.error);

  return data as StaffRouteResult;
}
