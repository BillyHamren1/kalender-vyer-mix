import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllEconomyData } from '@/services/planningApiService';
import { economyBookingKey } from '@/lib/economy/cacheContract';
import { useCurrentOrg } from './useCurrentOrg';

export function useBookingEconomyBatch(bookingId: string | null | undefined) {
  const { organizationId } = useCurrentOrg();
  const client = useQueryClient();
  const stale = useQuery({ queryKey: ['economy-stale', organizationId, bookingId], queryFn: () => false, enabled: false });
  const query = useQuery({
    queryKey: economyBookingKey(organizationId, bookingId),
    queryFn: async ({ signal }) => {
      if (!bookingId || !organizationId) throw new Error('Bokning eller organisation saknas');
      const batch = await fetchAllEconomyData(bookingId);
      if (!signal.aborted) client.setQueryData<boolean>(['economy-stale', organizationId, bookingId], false);
      return batch;
    },
    enabled: !!organizationId && !!bookingId,
  });
  return { ...query, error: query.error ?? (stale.data ? new Error('Ekonomin är inaktuell. Försök igen.') : null) };
}