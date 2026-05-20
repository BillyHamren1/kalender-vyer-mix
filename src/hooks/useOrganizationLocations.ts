import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface KnownLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Optional radius in meters; defaults to 200m if not set on the row. */
  radiusMeters: number;
  /**
   * Exklusivt val: om geofence_mode='polygon' OCH polygonen är giltig
   * sätts polygon — då ska konsumenter rita ENDAST polygonen och ignorera
   * radius. Annars (mode='circle' eller saknad/ogiltig polygon) sätts inte
   * polygon och cirkeln gäller.
   */
  polygon?: GeoJSON.Polygon;
}

function isValidPolygon(raw: unknown): raw is GeoJSON.Polygon {
  if (!raw || typeof raw !== 'object') return false;
  const g = raw as any;
  if (g.type !== 'Polygon') return false;
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  const ring = g.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (p: any) =>
      Array.isArray(p) &&
      p.length >= 2 &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  );
}

/**
 * Hämtar org-platser (lager, kontor, fasta arbetsplatser) en gång per session.
 * Används som "sanning" för att matcha GPS-pings mot kända platser FÖRE
 * vi faller tillbaka på reverse-geocode (som kan gissa fel kommun).
 */
export function useOrganizationLocations() {
  return useQuery<KnownLocation[]>({
    queryKey: ['organization-locations-known'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_locations')
        .select('id, name, latitude, longitude, radius_meters, is_active, geofence_mode, geofence_polygon')
        .eq('is_active', true);
      if (error) throw error;
      return (data || [])
        .filter((l: any) => l.latitude != null && l.longitude != null)
        .map((l: any): KnownLocation => {
          const usePolygon =
            l.geofence_mode === 'polygon' && isValidPolygon(l.geofence_polygon);
          return {
            id: l.id,
            name: l.name,
            lat: Number(l.latitude),
            lng: Number(l.longitude),
            radiusMeters: Number(l.radius_meters ?? 200) || 200,
            polygon: usePolygon ? (l.geofence_polygon as GeoJSON.Polygon) : undefined,
          };
        });
    },
  });
}
