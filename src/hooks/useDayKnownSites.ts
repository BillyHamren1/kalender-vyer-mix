import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationLocations } from './useOrganizationLocations';
import type { KnownSite } from '@/lib/staff/pingPlaceSegments';

/**
 * Bygger DAGENS lista över "kända platser" som GPS-pings ska kunna matchas mot.
 *
 * Källor:
 *   - organization_locations (lager, kontor, fasta arbetsplatser) — alltid
 *   - bookings.delivery_latitude/longitude för dagens time_reports + LTE
 *   - large_projects.address_latitude/longitude för dagens TR/LTE
 *
 * VIKTIGT: Projekt får BARA bli känd plats om projektets eget datum
 * (eventdate/rigdaydate/rigdowndate) matchar `date`, eller projektet är
 * is_internal (t.ex. Lager). Annars riskerar gamla testprojekt knutna till
 * en booking som råkar vara aktiv idag att matcha pings och "regga tid"
 * på fel datum.
 */
export function useDayKnownSites(staffId: string, date: string, enabled = true) {
  const { data: orgLocations = [], isLoading: orgLoading } = useOrganizationLocations();

  const dayQuery = useQuery({
    queryKey: ['day-known-sites', staffId, date],
    enabled: enabled && !!staffId && !!date,
    staleTime: 60_000,
    queryFn: async () => {
      const [teamAssignmentsRes, bookingAssignmentsRes, reportsRes, ltesRes] = await Promise.all([
        supabase
          .from('staff_assignments')
          .select('team_id')
          .eq('staff_id', staffId)
          .eq('assignment_date', date),
        supabase
          .from('booking_staff_assignments')
          .select('booking_id')
          .eq('staff_id', staffId)
          .eq('assignment_date', date),
        supabase
          .from('time_reports')
          .select('booking_id, large_project_id')
          .eq('staff_id', staffId)
          .eq('report_date', date),
        supabase
          .from('location_time_entries')
          .select('booking_id, large_project_id')
          .eq('staff_id', staffId)
          .eq('entry_date', date),
      ]);

      const teamIds = Array.from(
        new Set(((teamAssignmentsRes.data || []) as any[]).map(r => String(r.team_id)).filter(Boolean)),
      );

      const dayStartIso = `${date}T00:00:00.000Z`;
      const dayEndIso = `${date}T23:59:59.999Z`;
      const eventsRes = teamIds.length
        ? await supabase
            .from('calendar_events')
            .select('booking_id, start_time, end_time, source_date')
            .in('resource_id', teamIds)
            .or(`source_date.eq.${date},and(start_time.lte.${dayEndIso},end_time.gte.${dayStartIso})`)
        : { data: [] as any[] };

      const bookingIds = new Set<string>();
      const largeIds = new Set<string>();
      for (const a of (bookingAssignmentsRes.data || []) as any[]) {
        if (a.booking_id) bookingIds.add(String(a.booking_id));
      }
      for (const e of ((eventsRes as any).data || []) as any[]) {
        if (e.booking_id) bookingIds.add(String(e.booking_id));
      }
      for (const r of (reportsRes.data || []) as any[]) {
        if (r.booking_id) bookingIds.add(String(r.booking_id));
        if (r.large_project_id) largeIds.add(String(r.large_project_id));
      }
      for (const r of (ltesRes.data || []) as any[]) {
        if (r.booking_id) bookingIds.add(String(r.booking_id));
        if (r.large_project_id) largeIds.add(String(r.large_project_id));
      }

      const [bookingsRes, largeProjectBookingsRes] = await Promise.all([
        bookingIds.size
          ? supabase
              .from('bookings')
              .select('id, client, booking_number, deliveryaddress, delivery_latitude, delivery_longitude, large_project_id, assigned_project_id')
              .in('id', [...bookingIds])
          : Promise.resolve({ data: [] as any[] }),
        bookingIds.size
          ? supabase
              .from('large_project_bookings')
              .select('large_project_id, booking_id')
              .in('booking_id', [...bookingIds])
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const extraLargeIds = new Set<string>();
      const projectIds = new Set<string>();
      const bookingRows = ((bookingsRes as any).data || []) as any[];
      for (const row of ((largeProjectBookingsRes as any).data || []) as any[]) {
        if (row.large_project_id) largeIds.add(String(row.large_project_id));
      }
      for (const b of bookingRows) {
        if (b.large_project_id) extraLargeIds.add(String(b.large_project_id));
        if (b.assigned_project_id) projectIds.add(String(b.assigned_project_id));
      }

      const [largeRes, projectsByBookingRes, projectsByIdRes] = await Promise.all([
        largeIds.size || extraLargeIds.size
          ? supabase
              .from('large_projects')
              .select('id, name, address_latitude, address_longitude, address_radius_meters')
              .in('id', [...new Set([...largeIds, ...extraLargeIds])])
          : Promise.resolve({ data: [] as any[] }),
        bookingIds.size
          ? supabase
              .from('projects')
              .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, status, planning_status, deleted_at, booking_id, eventdate, rigdaydate, rigdowndate, is_internal')
              .in('booking_id', [...bookingIds])
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as any[] }),
        projectIds.size
          ? supabase
              .from('projects')
              .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, status, planning_status, deleted_at, booking_id, eventdate, rigdaydate, rigdowndate, is_internal')
              .in('id', [...projectIds])
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Datumfilter: ett projekt får bara fungera som "känd plats" idag om
      // det är ett internt projekt (Lager etc.) eller om dess egna datum
      // matchar `date`. Annars använder vi bokningens egen pin istället.
      const projectMatchesDate = (p: any): boolean => {
        if (p?.is_internal === true) return true;
        return p?.eventdate === date || p?.rigdaydate === date || p?.rigdowndate === date;
      };

      const sites: KnownSite[] = [];

      // Bygg projekt-sites och håll reda på vilka booking_ids som faktiskt
      // får sin pin via ett *datumvalidt* projekt (för dedup nedan).
      const projectBackedBookingIds = new Set<string>();
      const projectBackedProjectIds = new Set<string>();
      const seenProjects = new Set<string>();
      const projectRows = [
        ...(((projectsByBookingRes as any).data || []) as any[]),
        ...(((projectsByIdRes as any).data || []) as any[]),
      ];
      for (const p of projectRows) {
        if (seenProjects.has(p.id)) continue;
        seenProjects.add(p.id);
        if (p.delivery_latitude == null || p.delivery_longitude == null) continue;
        const status = (p.planning_status ?? p.status ?? '').toString().toLowerCase();
        if (status === 'cancelled' || status === 'avbokat') continue;
        if (!projectMatchesDate(p)) continue;
        if (p.booking_id) projectBackedBookingIds.add(String(p.booking_id));
        projectBackedProjectIds.add(String(p.id));
        sites.push({
          id: `project:${p.id}`,
          name: p.name || 'Projekt',
          lat: Number(p.delivery_latitude),
          lng: Number(p.delivery_longitude),
          radiusMeters: Number(p.address_radius_meters ?? 150) || 150,
        });
      }

      // Bokningens egen pin: skippa BARA om bokningen redan representeras
      // av ett datumvalidt project- eller large-project-site (annars hamnar
      // pings i ingenmansland och matchar oavsiktligt gamla projekt).
      for (const b of bookingRows) {
        if (b.delivery_latitude == null || b.delivery_longitude == null) continue;
        const backedByProject =
          projectBackedBookingIds.has(String(b.id)) ||
          (b.assigned_project_id && projectBackedProjectIds.has(String(b.assigned_project_id)));
        const backedByLarge = !!b.large_project_id;
        if (backedByProject || backedByLarge) continue;
        const label = b.booking_number
          ? `${b.booking_number} · ${b.client ?? 'Bokning'}`
          : (b.client ?? b.deliveryaddress ?? 'Bokning');
        sites.push({
          id: `booking:${b.id}`,
          name: label,
          lat: Number(b.delivery_latitude),
          lng: Number(b.delivery_longitude),
          radiusMeters: 200,
        });
      }

      // Slå upp ev. stora projekt som bokningarna hör till (utöver TR/LTE-källor).
      const missingLarge = [...extraLargeIds].filter(id => !largeIds.has(id));
      const extraLargeRes = missingLarge.length
        ? await supabase
            .from('large_projects')
            .select('id, name, address_latitude, address_longitude, address_radius_meters')
            .in('id', missingLarge)
        : { data: [] as any[] };
      const allLarge = [...((largeRes as any).data || []), ...((extraLargeRes as any).data || [])];
      const seenLarge = new Set<string>();
      for (const lp of allLarge) {
        if (seenLarge.has(lp.id)) continue;
        seenLarge.add(lp.id);
        if (lp.address_latitude == null || lp.address_longitude == null) continue;
        sites.push({
          id: `large:${lp.id}`,
          name: lp.name || 'Stort projekt',
          lat: Number(lp.address_latitude),
          lng: Number(lp.address_longitude),
          radiusMeters: Number(lp.address_radius_meters ?? 200) || 200,
        });
      }

      return sites;
    },
  });

  const knownSites = useMemo<KnownSite[]>(() => {
    const orgSites: KnownSite[] = orgLocations.map(l => ({
      id: `loc:${l.id}`,
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      radiusMeters: l.radiusMeters,
    }));
    return [...orgSites, ...(dayQuery.data || [])];
  }, [orgLocations, dayQuery.data]);

  return {
    knownSites,
    isLoading: orgLoading || dayQuery.isLoading,
  };
}
