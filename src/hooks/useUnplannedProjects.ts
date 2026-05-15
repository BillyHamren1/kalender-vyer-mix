import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export interface UnplannedProjectRow {
  id: string;
  kind: 'medium' | 'large';
  name: string;
  client: string | null;
  booking_number: string | null;
  eventdate: string | null;
  deliveryaddress: string | null;
  created_at: string;
}

/**
 * Hämtar alla projekt (medel + stora) som väntar på planering
 * (planning_status = 'needs_planning'). Filtrerat på aktiv organization_id.
 */
export function useUnplannedProjects() {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();

  const query = useQuery({
    queryKey: ['unplanned-projects', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<UnplannedProjectRow[]> => {
      const orgId = organizationId!;
      const [mediumRes, largeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, booking_id, created_at')
          .eq('organization_id', orgId)
          .eq('planning_status', 'needs_planning')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('large_projects')
          .select('id, name, created_at')
          .eq('organization_id', orgId)
          .eq('planning_status', 'needs_planning')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      const mediumRows = mediumRes.data || [];
      const largeRows = largeRes.data || [];

      const bookingIds = mediumRows.map(r => r.booking_id).filter(Boolean) as string[];
      let bookingsById = new Map<string, any>();
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, client, booking_number, eventdate, deliveryaddress')
          .eq('organization_id', orgId)
          .in('id', bookingIds);
        bookingsById = new Map((bookings || []).map(b => [b.id, b]));
      }

      let largeBookingsByLpId = new Map<string, any>();
      if (largeRows.length > 0) {
        const lpIds = largeRows.map(r => r.id);
        const { data: lpBookings } = await supabase
          .from('bookings')
          .select('large_project_id, client, booking_number, eventdate, deliveryaddress')
          .eq('organization_id', orgId)
          .in('large_project_id', lpIds)
          .order('eventdate', { ascending: true });
        for (const b of lpBookings || []) {
          if (b.large_project_id && !largeBookingsByLpId.has(b.large_project_id)) {
            largeBookingsByLpId.set(b.large_project_id, b);
          }
        }
      }

      const medium: UnplannedProjectRow[] = mediumRows.map(r => {
        const b = r.booking_id ? bookingsById.get(r.booking_id) : null;
        return {
          id: r.id,
          kind: 'medium',
          name: r.name,
          client: b?.client ?? null,
          booking_number: b?.booking_number ?? null,
          eventdate: b?.eventdate ?? null,
          deliveryaddress: b?.deliveryaddress ?? null,
          created_at: r.created_at,
        };
      });

      const large: UnplannedProjectRow[] = largeRows.map(r => {
        const b = largeBookingsByLpId.get(r.id);
        return {
          id: r.id,
          kind: 'large',
          name: r.name,
          client: b?.client ?? null,
          booking_number: b?.booking_number ?? null,
          eventdate: b?.eventdate ?? null,
          deliveryaddress: b?.deliveryaddress ?? null,
          created_at: r.created_at,
        };
      });

      return [...medium, ...large].sort((a, b) =>
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'large_projects' }, () => {
        qc.invalidateQueries({ queryKey: ['unplanned-projects', organizationId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, organizationId]);

  return query;
}
