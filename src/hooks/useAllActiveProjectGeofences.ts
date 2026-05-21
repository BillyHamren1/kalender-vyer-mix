import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KnownSite } from '@/lib/staff/pingPlaceSegments';

/**
 * Hämtar ALLA aktiva projekt + stora projekt med koordinater — oavsett
 * personal eller dag. Används på GPS-satellitkartan så att alla projekts
 * geofences alltid visas (matchar regeln "inside geo = registrera tid där").
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
          .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, status, planning_status, deleted_at')
          .is('deleted_at', null)
          .not('delivery_latitude', 'is', null)
          .not('delivery_longitude', 'is', null)
          .limit(5000),
        supabase
          .from('large_projects')
          .select('id, name, address_latitude, address_longitude, address_radius_meters')
          .not('address_latitude', 'is', null)
          .not('address_longitude', 'is', null)
          .limit(5000),
      ]);

      const sites: KnownSite[] = [];
      for (const p of ((projectsRes as any).data || []) as any[]) {
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
      for (const lp of ((largeRes as any).data || []) as any[]) {
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
