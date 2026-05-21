import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KnownSite } from '@/lib/staff/pingPlaceSegments';
import { filterProjectGeofences } from '@/lib/staff/filterProjectGeofences';

/**
 * Hämtar ALLA aktiva projekt + stora projekt med koordinater — oavsett
 * personal eller dag. Används på GPS-satellitkartan så att alla projekts
 * geofences alltid visas (matchar regeln "inside geo = registrera tid där").
 *
 * Filtrering + deduplicering ligger i `filterProjectGeofences` (ren helper)
 * så att cancelled-rader och dubletter på samma adress aldrig kommer fram.
 */
export function useAllActiveProjectGeofences(enabled = true) {
  return useQuery<KnownSite[]>({
    queryKey: ['all-active-project-geofences'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [projectsRes, largeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, status, planning_status, deleted_at, created_at, booking_id')
          .is('deleted_at', null)
          .not('delivery_latitude', 'is', null)
          .not('delivery_longitude', 'is', null)
          .limit(5000),
        supabase
          .from('large_projects')
          .select('id, name, address_latitude, address_longitude, address_radius_meters, created_at')
          .not('address_latitude', 'is', null)
          .not('address_longitude', 'is', null)
          .limit(5000),
      ]);

      const filtered = filterProjectGeofences(
        ((projectsRes as any).data || []) as any[],
        ((largeRes as any).data || []) as any[],
      );
      return filtered.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        radiusMeters: s.radiusMeters,
      }));
    },
  });
}

