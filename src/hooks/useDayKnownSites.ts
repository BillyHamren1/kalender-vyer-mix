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
 * Det här är vad som tidigare saknades: utan bokningarnas leveranskoordinater
 * blev t.ex. Westers/Craft "okänd plats" och resolveAt rapporterade `travel`
 * fastän personalen var på rätt jobbadress.
 */
export function useDayKnownSites(staffId: string, date: string, enabled = true) {
  const { data: orgLocations = [], isLoading: orgLoading } = useOrganizationLocations();

  const dayQuery = useQuery({
    queryKey: ['day-known-sites', staffId, date],
    enabled: enabled && !!staffId && !!date,
    staleTime: 60_000,
    queryFn: async () => {
      const [reportsRes, ltesRes] = await Promise.all([
        supabase
          .from('time_reports')
          .select('booking_id, large_project_id, project_id:booking_id')
          .eq('staff_id', staffId)
          .eq('report_date', date),
        supabase
          .from('location_time_entries')
          .select('booking_id, large_project_id')
          .eq('staff_id', staffId)
          .eq('entry_date', date),
      ]);

      // Re-fetch time_reports including project_id (couldn't alias above safely).
      const trProjectsRes = await supabase
        .from('time_reports')
        .select('project_id')
        .eq('staff_id', staffId)
        .eq('report_date', date);

      const bookingIds = new Set<string>();
      const largeIds = new Set<string>();
      const projectIds = new Set<string>();
      for (const r of (reportsRes.data || []) as any[]) {
        if (r.booking_id) bookingIds.add(String(r.booking_id));
        if (r.large_project_id) largeIds.add(String(r.large_project_id));
      }
      for (const r of (trProjectsRes.data || []) as any[]) {
        if (r.project_id) projectIds.add(String(r.project_id));
      }
      for (const r of (ltesRes.data || []) as any[]) {
        if (r.booking_id) bookingIds.add(String(r.booking_id));
        if (r.large_project_id) largeIds.add(String(r.large_project_id));
      }

      const [bookingsRes, largeRes, projectsTodayRes, projectsRefRes] = await Promise.all([
        bookingIds.size
          ? supabase
              .from('bookings')
              .select('id, client, booking_number, deliveryaddress, delivery_latitude, delivery_longitude')
              .in('id', [...bookingIds])
          : Promise.resolve({ data: [] as any[] }),
        largeIds.size
          ? supabase
              .from('large_projects')
              .select('id, name, address_latitude, address_longitude, address_radius_meters')
              .in('id', [...largeIds])
          : Promise.resolve({ data: [] as any[] }),
        // Projekt planerade idag (event/rig/down = date)
        supabase
          .from('projects')
          .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, status, planning_status, deleted_at, eventdate, rigdaydate, rigdowndate')
          .is('deleted_at', null)
          .or(`eventdate.eq.${date},rigdaydate.eq.${date},rigdowndate.eq.${date}`),
        // Projekt refererade i dagens TR
        projectIds.size
          ? supabase
              .from('projects')
              .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, status, planning_status, deleted_at')
              .in('id', [...projectIds])
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const sites: KnownSite[] = [];
      for (const b of ((bookingsRes as any).data || [])) {
        if (b.delivery_latitude == null || b.delivery_longitude == null) continue;
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
      for (const lp of ((largeRes as any).data || [])) {
        if (lp.address_latitude == null || lp.address_longitude == null) continue;
        sites.push({
          id: `large:${lp.id}`,
          name: lp.name || 'Stort projekt',
          lat: Number(lp.address_latitude),
          lng: Number(lp.address_longitude),
          radiusMeters: Number(lp.address_radius_meters ?? 200) || 200,
        });
      }
      const seenProjects = new Set<string>();
      const projectRows = [
        ...(((projectsTodayRes as any).data || []) as any[]),
        ...(((projectsRefRes as any).data || []) as any[]),
      ];
      for (const p of projectRows) {
        if (seenProjects.has(p.id)) continue;
        seenProjects.add(p.id);
        if (p.delivery_latitude == null || p.delivery_longitude == null) continue;
        const status = (p.planning_status ?? p.status ?? '').toString().toLowerCase();
        if (status === 'cancelled' || status === 'avbokat') continue;
        sites.push({
          id: `project:${p.id}`,
          name: p.name || 'Projekt',
          lat: Number(p.delivery_latitude),
          lng: Number(p.delivery_longitude),
          radiusMeters: Number(p.address_radius_meters ?? 150) || 150,
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
