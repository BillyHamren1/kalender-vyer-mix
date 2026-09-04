import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationId } from '@/hooks/useOrganizationId';

/**
 * Läser organisationsflaggan `internal_lager_enabled` som styr om det
 * konstanta interna Lager-projektet ska synas (kalenderblock, projektlista).
 * Av som standard — bara organisationer som explicit slagit på det
 * (t.ex. Frans August) ser det.
 */
export const useInternalLagerEnabled = () => {
  const { organizationId } = useOrganizationId();

  const query = useQuery<boolean>({
    queryKey: ['org-internal-lager-enabled', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('internal_lager_enabled')
        .eq('id', organizationId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { internal_lager_enabled?: boolean } | null)?.internal_lager_enabled === true;
    },
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    internalLagerEnabled: query.data ?? false,
    isLoading: !!organizationId && query.isLoading,
  };
};
