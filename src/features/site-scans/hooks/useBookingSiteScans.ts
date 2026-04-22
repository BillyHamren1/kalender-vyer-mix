import { useQuery } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;
import type { Tables } from "@/integrations/supabase/types";

export type ExternalSiteScan = any;

export function useBookingSiteScans(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking-site-scans", bookingId],
    enabled: !!bookingId,
    queryFn: async (): Promise<ExternalSiteScan[]> => {
      const { data, error } = await supabase
        .from("external_site_scans")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}
