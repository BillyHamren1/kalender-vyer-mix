import { useQuery } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;

export interface BookingSiteSurface {
  id: string;
  booking_id: string;
  site_scan_id: string;
  surface_type: string;
  is_active: boolean;
  heightmap_url: string | null;
  mesh_url: string | null;
  point_cloud_url: string | null;
  metrics_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all surfaces for a booking, ordered so the active one is first.
 */
export function useBookingSiteSurfaces(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking-site-surfaces", bookingId],
    enabled: !!bookingId,
    queryFn: async (): Promise<BookingSiteSurface[]> => {
      const { data, error } = await supabase
        .from("booking_site_surfaces")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as unknown as BookingSiteSurface[]) ?? [];
    },
  });
}

/**
 * Convenience: returns only the active terrain surface for a booking.
 */
export function useActiveTerrainSurface(bookingId: string | undefined) {
  const query = useBookingSiteSurfaces(bookingId);

  const activeSurface = query.data?.find(
    (s) => s.is_active && s.surface_type === "terrain"
  ) ?? null;

  return {
    ...query,
    activeSurface,
  };
}
