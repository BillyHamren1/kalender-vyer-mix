import { useQueries } from '@tanstack/react-query';

const MAPBOX_TOKEN_KEY = 'eventflow-mapbox-token';

async function getMapboxToken(): Promise<string | null> {
  let token = localStorage.getItem(MAPBOX_TOKEN_KEY);
  if (!token) {
    try {
      const res = await fetch('https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/mapbox-token');
      const data = await res.json();
      token = data?.token || null;
      if (token) localStorage.setItem(MAPBOX_TOKEN_KEY, token);
    } catch {
      return null;
    }
  }
  return token;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const token = await getMapboxToken();
  if (!token) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=sv&limit=1&types=address,poi,neighborhood,locality,place`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;
    // Prefer POI name + place; otherwise use formatted address minus country
    const name = feature.text;
    const place = (feature.context || []).find((c: any) =>
      typeof c.id === 'string' && (c.id.startsWith('place.') || c.id.startsWith('locality.'))
    )?.text;
    if (name && place && name !== place) return `${name}, ${place}`;
    return feature.place_name?.split(',').slice(0, 2).join(',').trim() ?? name ?? null;
  } catch {
    return null;
  }
}

/** Round coordinates so two pings ~50m apart share a cache key. */
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Reverse-geocode multiple coordinate pairs in parallel with caching.
 * Coordinates are rounded to ~100m granularity so nearby calls share cache.
 */
export function useReverseGeocode(coords: Array<{ lat: number; lng: number } | null | undefined>) {
  const results = useQueries({
    queries: coords.map((c) => ({
      queryKey: ['reverse-geocode', c ? round(c.lat) : null, c ? round(c.lng) : null],
      queryFn: () => (c ? reverseGeocode(c.lat, c.lng) : Promise.resolve(null)),
      enabled: !!c,
      staleTime: 24 * 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    })),
  });
  return results.map((r) => (r.data as string | null) ?? null);
}
