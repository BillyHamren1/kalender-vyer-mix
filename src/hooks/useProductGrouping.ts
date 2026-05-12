import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";

export type GroupingScope = "large_project" | "booking";

export interface ProductGroup {
  id: string;
  name: string;
  product_ids: string[];
}

export interface ProductGroupingRow {
  id: string;
  scope: GroupingScope;
  scope_id: string;
  prompt: string | null;
  groups: ProductGroup[];
  updated_at: string;
}

export const useProductGrouping = (scope: GroupingScope, scopeId: string | undefined) => {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();

  const query = useQuery({
    queryKey: ["product-grouping", scope, scopeId],
    queryFn: async (): Promise<ProductGroupingRow | null> => {
      if (!scopeId) return null;
      const { data, error } = await supabase
        .from("product_groupings")
        .select("id, scope, scope_id, prompt, groups, updated_at")
        .eq("scope", scope)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        scope: data.scope as GroupingScope,
        scope_id: data.scope_id,
        prompt: data.prompt,
        updated_at: data.updated_at,
        groups: Array.isArray(data.groups) ? (data.groups as unknown as ProductGroup[]) : [],
      };
    },
    enabled: !!scopeId,
  });

  const save = useMutation({
    mutationFn: async ({ prompt, groups }: { prompt: string; groups: ProductGroup[] }) => {
      if (!scopeId) throw new Error("Ingen scope_id");
      if (!organizationId) throw new Error("Saknar organisation");
      const { error } = await supabase
        .from("product_groupings")
        .upsert(
          {
            scope,
            scope_id: scopeId,
            prompt,
            groups: groups as any,
            organization_id: organizationId,
          },
          { onConflict: "scope,scope_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-grouping", scope, scopeId] }),
    onError: (e: any) => toast.error(e?.message || "Kunde inte spara grupperingen"),
  });

  const generate = useMutation({
    mutationFn: async ({
      prompt,
      products,
      currentGroups,
    }: {
      prompt: string;
      products: { id: string; name: string }[];
      currentGroups?: ProductGroup[];
    }) => {
      const { data, error } = await supabase.functions.invoke("group-products-ai", {
        body: { prompt, products, currentGroups },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const groups = ((data as any).groups as ProductGroup[]) || [];
      await save.mutateAsync({ prompt, groups });
      return groups;
    },
    onError: (e: any) => toast.error(e?.message || "AI-gruppering misslyckades"),
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (!scopeId) return;
      const { error } = await supabase
        .from("product_groupings")
        .delete()
        .eq("scope", scope)
        .eq("scope_id", scopeId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-grouping", scope, scopeId] }),
  });

  return {
    grouping: query.data ?? null,
    isLoading: query.isLoading,
    generate,
    save,
    clear,
  };
};
