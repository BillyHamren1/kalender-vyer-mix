import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KnownSite } from '@/lib/staff/pingPlaceSegments';
import { filterProjectGeofences } from '@/lib/staff/filterProjectGeofences';

export type ProjectGeofenceSite = KnownSite & { polygon?: GeoJSON.Polygon };

/**
 * Hämtar alla projekt + stora projekt med koordinater och filtrerar dem
 * datumkänsligt: endast projekt vars aktiva fönster (rigg → sista nedrigg)
 * innehåller `dateStr` returneras.
 *
 * Filtrering + deduplicering ligger i `filterProjectGeofences` (ren helper).
 * Polygoner (address_geofence_mode='polygon') exponeras på `.polygon`.
 */
export function useAllActiveProjectGeofences(dateStr: string, enabled = true) {
  return useQuery<ProjectGeofenceSite[]>({
    queryKey: ['all-active-project-geofences', dateStr],
    enabled: enabled && !!dateStr,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [projectsRes, largeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, status, planning_status, deleted_at, created_at, booking_id, rigdaydate, rigdowndate, eventdate')
          .is('deleted_at', null)
          .not('delivery_latitude', 'is', null)
          .not('delivery_longitude', 'is', null)
          .limit(5000),
        supabase
          .from('large_projects')
          .select('id, name, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, created_at, start_date, end_date, event_date')
          .not('address_latitude', 'is', null)
          .not('address_longitude', 'is', null)
          .limit(5000),
      ]);

      const filtered = filterProjectGeofences(
        ((projectsRes as any).data || []) as any[],
        ((largeRes as any).data || []) as any[],
        dateStr,
      );
      return filtered.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        radiusMeters: s.radiusMeters,
        polygon: s.polygon,
      }));
    },
  });
}
