import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
 * (planning_status = 'needs_planning'). Innan användaren sätter
 * tider/team finns inga calendar_events för dem.
 */
export function useUnplannedProjects() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['unplanned-projects'],
    queryFn: async (): Promise<UnplannedProjectRow[]> => {
      const [mediumRes, largeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, booking_id, created_at')
          .eq('planning_status', 'needs_planning')
          .order('created_at', { ascending: false }),
        supabase
          .from('large_projects')
          .select('id, name, created_at')
          .eq('planning_status', 'needs_planning')
          .order('created_at', { ascending: false }),
      ]);

      const mediumRows = mediumRes.data || [];
      const largeRows = largeRes.data || [];

      // Hämta booking-data för medel-projekten
      const bookingIds = mediumRows.map(r => r.booking_id).filter(Boolean) as string[];
      let bookingsById = new Map<string, any>();
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, client, booking_number, eventdate, deliveryaddress')
          .in('id', bookingIds);
        bookingsById = new Map((bookings || []).map(b => [b.id, b]));
      }

      // Hämta första bokningen per stort projekt för meta-data
      let largeBookingsByLpId = new Map<string, any>();
      if (largeRows.length > 0) {
        const lpIds = largeRows.map(r => r.id);
        const { data: lpBookings } = await supabase
          .from('bookings')
          .select('large_project_id, client, booking_number, eventdate, deliveryaddress')
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

  // Realtime — uppdatera så fort planning_status ändras eller nya projekt skapas
  useEffect(() => {
    const channel = supabase
      .channel('unplanned-projects-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        qc.invalidateQueries({ queryKey: ['unplanned-projects'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'large_projects' }, () => {
        qc.invalidateQueries({ queryKey: ['unplanned-projects'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}
