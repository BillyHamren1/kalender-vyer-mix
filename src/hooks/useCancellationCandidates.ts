import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export interface CancellationCandidate {
  booking_id: string;
  booking_number: string | null;
  client: string | null;
  source_status: string | null;
  detected_at: string;
}

/**
 * Bokningar som är avbokade i bokningssystemet men ännu inte avbokade lokalt.
 * Registreras av edge-funktionen `booking-cancellation-watch` (action=scan) —
 * ren läsning, ingen automatisk destruktiv sync.
 */
export function useCancellationCandidates() {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();

  const query = useQuery({
    queryKey: ['cancellation-candidates', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<CancellationCandidate[]> => {
      const { data, error } = await supabase
        .from('booking_cancellation_candidates')
        .select('booking_id, booking_number, client, source_status, detected_at')
        .eq('organization_id', organizationId!)
        .eq('status', 'pending')
        .order('detected_at', { ascending: false });
      if (error) {
        console.error('[useCancellationCandidates]', error);
        return [];
      }
      return (data || []) as CancellationCandidate[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel('cancellation-candidates-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_cancellation_candidates' },
        () => qc.invalidateQueries({ queryKey: ['cancellation-candidates', organizationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, organizationId]);

  return query;
}

/**
 * Kör en läsande kontroll mot bokningssystemet för angivna bokningar.
 * Skriver aldrig något på bokningar/kalender — bara kandidatlistan.
 */
export function useScanCancellationCandidates(bookingIds: string[]) {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();
  const key = [...bookingIds].sort().join(',');

  return useQuery({
    queryKey: ['cancellation-scan', organizationId, key],
    enabled: !!organizationId && bookingIds.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('booking-cancellation-watch', {
        body: { action: 'scan', booking_ids: bookingIds },
      });
      if (error) {
        console.error('[cancellation-scan]', error);
        return null;
      }
      qc.invalidateQueries({ queryKey: ['cancellation-candidates', organizationId] });
      return data;
    },
  });
}

export function useApplyCancellation() {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.functions.invoke('booking-cancellation-watch', {
        body: { action: 'apply', booking_id: bookingId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cancellation-candidates', organizationId] });
      qc.invalidateQueries({ queryKey: ['bookings-without-project'] });
      qc.invalidateQueries({ queryKey: ['unplanned-projects', organizationId] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });
}
