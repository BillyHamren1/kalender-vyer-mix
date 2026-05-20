import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KnownSite } from '@/lib/staff/pingPlaceSegments';

/**
 * Hämtar ALLA target-geofences (projects + large_projects) som har koordinater.
 * Används av kartvyn för att visa hela "stängselparken" oavsett vald person/dag.
 * Filtrerar bort cancelled/avbokat och soft-deleted.
 */
export function useAllTargetGeofences(enabled = true) {
  return useQuery({
    queryKey: ['all-target-geofences'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<KnownSite[]> => {
      const [projectsRes, largeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, status, planning_status')
          .is('deleted_at', null)
          .not('delivery_latitude', 'is', null)
          .not('delivery_longitude', 'is', null)
          .limit(2000),
        supabase
          .from('large_projects')
          .select('id, name, address_latitude, address_longitude, address_radius_meters')
          .not('address_latitude', 'is', null)
          .not('address_longitude', 'is', null)
          .limit(500),
      ]);

      const sites: KnownSite[] = [];
      for (const p of (projectsRes.data || []) as any[]) {
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
      for (const lp of (largeRes.data || []) as any[]) {
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
}
