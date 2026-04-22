import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ExternalSiteScan = Tables<"external_site_scans">;

export function useProjectSiteScans(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-site-scans", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ExternalSiteScan[]> => {
      const { data, error } = await supabase
        .from("external_site_scans")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}
