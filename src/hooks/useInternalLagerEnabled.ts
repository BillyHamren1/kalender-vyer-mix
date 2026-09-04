import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Är det konstanta interna Lager-projektet påslaget för den inloggade
 * organisationen?
 *
 * Källa: `organizations.internal_lager_enabled` (av som standard). RLS på
 * `organizations` scopar redan raden till användarens egen organisation,
 * så ingen extra org-lookup behövs.
 *
 * Flaggan är ENDA grinden för att visa Lager i Planning-ytorna. Befintliga
 * interna projektrader raderas aldrig — de ritas bara inte ut.
 */
export function useInternalLagerEnabled() {
  const query = useQuery<boolean>({
    queryKey: ['org-internal-lager-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('internal_lager_enabled')
        .maybeSingle();
      if (error) throw error;
      return Boolean((data as any)?.internal_lager_enabled);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    lagerEnabled: query.data === true,
    isLoading: query.isLoading,
  };
}

export default useInternalLagerEnabled;
