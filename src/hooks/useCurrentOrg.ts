import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentOrg() {
  const { data, isLoading } = useQuery({
    queryKey: ["current-user-org"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ organizationId: string | null; userId: string | null }> => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id ?? null;
      if (!userId) return { organizationId: null, userId: null };
      const { data: prof } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", userId)
        .maybeSingle();
      return { organizationId: prof?.organization_id ?? null, userId };
    },
  });
  return {
    organizationId: data?.organizationId ?? null,
    userId: data?.userId ?? null,
    isLoading,
  };
}
