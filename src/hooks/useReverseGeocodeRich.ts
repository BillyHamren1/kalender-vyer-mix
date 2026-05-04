import { useQueries } from '@tanstack/react-query';
import { loadMapboxToken } from './useMapboxToken';

/**
 * Rich reverse-geocode hook: returnerar inte bara en label utan även
 * adress, POI-namn och POI-kategori. Används av ActualDayPanel för att
 * göra en försiktig tolkning av okända GPS-kluster.
 *
 * Cachas på rundade koordinater (~100m granularitet) — samma kluster slås
 * aldrig upp två gånger inom cache-fönstret.
 *
 * Token hämtas via samma `mapbox-token` edge function som resten av appen
 * (via supabase.functions.invoke i useMapboxToken). Inga hårdkodade URLer.
 */

async function getMapboxToken(): Promise<string | null> {
  try {
    return await loadMapboxToken();
  } catch {
    return null;
  }
}

export interface RichGeocode {
  label: string;
  /** Närmaste adress, om sådan finns. */
  address: string | null;
  /** Punktintresse (POI) i närheten — företag, butik, station etc. */
  poiName: string | null;
  /** Mapbox category-tag(s), t.ex. "fuel", "fast_food", "restaurant". */
  poiCategory: string | null;
}

async function reverseGeocodeRich(lat: number, lng: number): Promise<RichGeocode | null> {
  const token = await getMapboxToken();
  if (!token) return null;
  // Hämta både POI och address i samma anrop. POI prioriteras för "vad är detta",
  // address används som fallback-label.
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=sv&limit=5&types=poi,address,neighborhood,locality,place`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const features = (data?.features || []) as any[];
    if (!features.length) return null;

    const poi = features.find(f => typeof f.id === 'string' && f.id.startsWith('poi.'));
    const addr = features.find(f => typeof f.id === 'string' && f.id.startsWith('address.'));
    const place = (features[0]?.context || []).find((c: any) =>
      typeof c.id === 'string' && (c.id.startsWith('place.') || c.id.startsWith('locality.'))
    )?.text ?? null;

    const poiName = poi?.text ?? null;
    const poiCategory = poi?.properties?.category ?? null;
    const addressLine = addr
      ? (addr.place_name?.split(',').slice(0, 2).join(',').trim() ?? null)
      : null;

    let label: string;
    if (poiName && place && poiName !== place) label = `${poiName}, ${place}`;
    else if (addressLine) label = addressLine;
    else label =
      features[0].place_name?.split(',').slice(0, 2).join(',').trim()
      ?? features[0].text
      ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    return {
      label,
      address: addressLine,
      poiName,
      poiCategory,
    };
  } catch {
    return null;
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function useReverseGeocodeRich(
  coords: Array<{ lat: number; lng: number } | null | undefined>,
): Array<RichGeocode | null> {
  const results = useQueries({
    queries: coords.map((c) => ({
      queryKey: ['reverse-geocode-rich', c ? round(c.lat) : null, c ? round(c.lng) : null],
      queryFn: () => (c ? reverseGeocodeRich(c.lat, c.lng) : Promise.resolve(null)),
      enabled: !!c,
      staleTime: 24 * 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    })),
  });
  return results.map((r) => (r.data as RichGeocode | null) ?? null);
}
