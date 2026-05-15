import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExternalSupplier {
  id: string;
  external_id: string;
  name: string;
  organization_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  is_active: boolean;
}

export function useExternalSuppliers(opts: { search?: string } = {}) {
  const search = (opts.search ?? "").trim();

  const query = useQuery({
    queryKey: ["external-suppliers", search],
    staleTime: 60_000,
    queryFn: async (): Promise<ExternalSupplier[]> => {
      let q = supabase
        .from("external_suppliers")
        .select(
          "id, external_id, name, organization_number, email, phone, website, address_line1, address_line2, postal_code, city, country, is_active",
        )
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(500);

      if (search.length > 0) {
        q = q.or(
          `name.ilike.%${search}%,city.ilike.%${search}%,organization_number.ilike.%${search}%`,
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ExternalSupplier[];
    },
  });

  return {
    suppliers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function formatSupplierAddress(s: ExternalSupplier): string {
  const parts = [s.address_line1, s.postal_code, s.city].filter(Boolean);
  return parts.join(", ");
}
