import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export interface UnplannedProjectRow {
  id: string;
  kind: 'medium';
  bookingId: string | null;
  name: string;
  client: string | null;
  booking_number: string | null;
  eventdate: string | null;
  deliveryaddress: string | null;
  created_at: string;
}

/**
 * Hämtar medel-projekt som väntar på planering (planning_status = 'needs_planning').
 * Stora projekt ingår INTE — de styrs av sin egen projektkalender och hör inte
 * hemma i personalkalenderns "Nya bokningar"-lista.
 */
export function useUnplannedProjects() {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();

  const query = useQuery({
    queryKey: ['unplanned-projects', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<UnplannedProjectRow[]> => {
      const orgId = organizationId!;
      const mediumRes = await supabase
        .from('projects')
        .select('id, name, booking_id, created_at')
        .eq('organization_id', orgId)
        .eq('planning_status', 'needs_planning')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const mediumRows = mediumRes.data || [];

      const bookingIds = mediumRows.map(r => r.booking_id).filter(Boolean) as string[];
      let bookingsById = new Map<string, any>();
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, client, booking_number, eventdate, deliveryaddress, assigned_project_id, large_project_id')
          .eq('organization_id', orgId)
          .in('id', bookingIds);
        bookingsById = new Map((bookings || []).map(b => [b.id, b]));
      }

      const medium: UnplannedProjectRow[] = mediumRows.flatMap(r => {
        const b = r.booking_id ? bookingsById.get(r.booking_id) : null;
        if (b?.large_project_id) return [];
        if (b?.assigned_project_id && b.assigned_project_id !== r.id) return [];
        return {
          id: r.id,
          kind: 'medium' as const,
          bookingId: r.booking_id ?? null,
          name: r.name,
          client: b?.client ?? null,
          booking_number: b?.booking_number ?? null,
          eventdate: b?.eventdate ?? null,
          deliveryaddress: b?.deliveryaddress ?? null,
          created_at: r.created_at,
        };
      });

      return medium.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    placeholderData: [],
  });

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel('unplanned-projects-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        qc.invalidateQueries({ queryKey: ['unplanned-projects', organizationId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, organizationId]);

  return query;
}
