import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { toast } from "sonner";

export interface CustomColumn {
  id: string; // "custom:<uuid>"
  label: string;
}

// custom_values: { [bookingId]: { [columnId]: string } }
export type CustomValues = Record<string, Record<string, string>>;

export interface ViewConfig {
  column_order: string[];
  custom_columns: CustomColumn[];
  custom_values: CustomValues;
}

const empty: ViewConfig = { column_order: [], custom_columns: [], custom_values: {} };

export const useLargeProjectViewConfig = (largeProjectId: string | undefined) => {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();
  const queryKey = ["large-project-view-config", largeProjectId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ViewConfig> => {
      if (!largeProjectId) return empty;
      const { data, error } = await supabase
        .from("large_project_view_config")
        .select("column_order, custom_columns, custom_values")
        .eq("large_project_id", largeProjectId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return empty;
      return {
        column_order: Array.isArray(data.column_order) ? (data.column_order as string[]) : [],
        custom_columns: Array.isArray(data.custom_columns) ? (data.custom_columns as unknown as CustomColumn[]) : [],
        custom_values: (data.custom_values as unknown as CustomValues) || {},
      };
    },
    enabled: !!largeProjectId,
  });

  const save = useMutation({
    mutationFn: async (next: ViewConfig) => {
      if (!largeProjectId) throw new Error("Saknar projekt-id");
      if (!organizationId) throw new Error("Saknar organisation");
      const { error } = await supabase
        .from("large_project_view_config")
        .upsert(
          {
            large_project_id: largeProjectId,
            organization_id: organizationId,
            column_order: next.column_order as any,
            custom_columns: next.custom_columns as any,
            custom_values: next.custom_values as any,
          },
          { onConflict: "large_project_id" },
        );
      if (error) throw error;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ViewConfig>(queryKey);
      qc.setQueryData(queryKey, next);
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e?.message || "Kunde inte spara vy-inställning");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    config: query.data ?? empty,
    isLoading: query.isLoading,
    save: (next: ViewConfig) => save.mutate(next),
  };
};
