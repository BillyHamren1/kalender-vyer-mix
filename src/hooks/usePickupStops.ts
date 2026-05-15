import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { toast } from "sonner";
import type { ExternalSupplier } from "./useExternalSuppliers";

export type PickupParent =
  | { type: "project"; id: string }
  | { type: "large_project"; id: string }
  | { type: "calendar_event"; id: string };

export interface PickupStop {
  id: string;
  organization_id: string;
  external_supplier_id: string;
  project_id: string | null;
  large_project_id: string | null;
  calendar_event_id: string | null;
  note: string | null;
  scheduled_at: string | null;
  status: "planned" | "picked_up" | "cancelled";
  sort_order: number;
  created_at: string;
  updated_at: string;
  external_supplier?: Pick<
    ExternalSupplier,
    "id" | "name" | "address_line1" | "postal_code" | "city" | "phone" | "email"
  > | null;
}

const queryKeyFor = (parent: PickupParent) => ["pickup-stops", parent.type, parent.id];

const parentColumn = (t: PickupParent["type"]) =>
  t === "project" ? "project_id" : t === "large_project" ? "large_project_id" : "calendar_event_id";

export function usePickupStops(parent: PickupParent | null) {
  const qc = useQueryClient();
  const { organizationId, userId } = useCurrentOrg();

  const list = useQuery({
    queryKey: parent ? queryKeyFor(parent) : ["pickup-stops", "none"],
    enabled: !!parent,
    queryFn: async (): Promise<PickupStop[]> => {
      if (!parent) return [];
      const { data, error } = await supabase
        .from("pickup_stops")
        .select(
          "*, external_supplier:external_suppliers (id, name, address_line1, postal_code, city, phone, email)",
        )
        .eq(parentColumn(parent.type), parent.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PickupStop[];
    },
  });

  const invalidate = () => {
    if (parent) qc.invalidateQueries({ queryKey: queryKeyFor(parent) });
  };

  const add = useMutation({
    mutationFn: async (input: { external_supplier_id: string; note?: string; scheduled_at?: string | null }) => {
      if (!parent) throw new Error("no_parent");
      if (!organizationId) throw new Error("no_org");
      const row: Record<string, unknown> = {
        organization_id: organizationId,
        external_supplier_id: input.external_supplier_id,
        note: input.note ?? null,
        scheduled_at: input.scheduled_at ?? null,
        created_by: userId,
        sort_order: (list.data?.length ?? 0),
      };
      row[parentColumn(parent.type)] = parent.id;
      const { error } = await supabase.from("pickup_stops").insert(row as any);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Hämtningsstopp tillagt");
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte lägga till"),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; updates: Partial<Pick<PickupStop, "note" | "scheduled_at" | "status" | "sort_order">> }) => {
      const { error } = await supabase
        .from("pickup_stops")
        .update(input.updates)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pickup_stops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Borttaget");
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte ta bort"),
  });

  return {
    stops: list.data ?? [],
    isLoading: list.isLoading,
    add: add.mutate,
    isAdding: add.isPending,
    update: update.mutate,
    remove: remove.mutate,
  };
}
