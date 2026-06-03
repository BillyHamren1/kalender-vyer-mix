import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Args {
  enabled: boolean;
  staffId: string;
  date: string;
  startIso: string | null;
  endIso: string | null;
}

interface Resp { label: string | null }

/**
 * useUnknownPlaceLabel — kallar AI ENDAST när raden är "unknown_place".
 * Returnerar { label } eller null. Felar tyst.
 */
export function useUnknownPlaceLabel({ enabled, staffId, date, startIso, endIso }: Args) {
  return useQuery<Resp>({
    queryKey: ["unknown-place-label", staffId, date, startIso, endIso],
    enabled: enabled && !!staffId && !!date && !!startIso && !!endIso,
    staleTime: 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "suggest-unknown-place-label",
        { body: { staffId, date, startIso, endIso, rowKind: "unknown_place" } },
      );
      if (error) return { label: null };
      return { label: (data as any)?.label ?? null };
    },
  });
}
