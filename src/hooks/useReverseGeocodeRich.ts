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
  /** Ort/stad som extraherats från geocode-context. */
  city: string | null;
  /** Punktintresse (POI) i närheten — företag, butik, station etc. */
  poiName: string | null;
  /** Mapbox category-tag(s), t.ex. "fuel", "fast_food", "restaurant". */
  poiCategory: string | null;
  /** Klickbar kartlänk (Google Maps) — alltid satt om koord finns. */
  mapsUrl: string | null;
  /** Råa koordinater — endast för debug/expand-vyn. */
  coords: { lat: number; lng: number } | null;
  /** True om Mapbox inte returnerade någon användbar plats. */
  unresolved: boolean;
}

const mapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

const UNRESOLVED_LABEL = 'Okänd plats – adress saknas';

async function reverseGeocodeRich(lat: number, lng: number): Promise<RichGeocode> {
  const token = await getMapboxToken();
  // Sista utväg: använd "Okänd plats – adress saknas" som label (aldrig råkoordinater
  // i huvudraden). Koordinater finns kvar i `coords` för expand/debug och som maps-länk.
  const fallback: RichGeocode = {
    label: UNRESOLVED_LABEL,
    address: null,
    city: null,
    poiName: null,
    poiCategory: null,
    mapsUrl: mapsLink(lat, lng),
    coords: { lat, lng },
    unresolved: true,
  };
  if (!token) return fallback;

  // Hämta både POI och address i samma anrop. POI prioriteras för "vad är detta",
  // address används som fallback-label.
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=sv&limit=5&types=poi,address,neighborhood,locality,place`;
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const data = await res.json();
    const features = (data?.features || []) as any[];
    if (!features.length) return fallback;

    const poi = features.find(f => typeof f.id === 'string' && f.id.startsWith('poi.'));
    const addr = features.find(f => typeof f.id === 'string' && f.id.startsWith('address.'));
    const neighborhood = features.find(f => typeof f.id === 'string' && f.id.startsWith('neighborhood.'));
    const place = (features[0]?.context || []).find((c: any) =>
      typeof c.id === 'string' && (c.id.startsWith('place.') || c.id.startsWith('locality.'))
    )?.text ?? null;

    const poiName = poi?.text ?? null;
    const poiCategory = poi?.properties?.category ?? null;
    const addressLine = addr
      ? (addr.place_name?.split(',').slice(0, 2).join(',').trim() ?? null)
      : null;

    // Label-prioritet: POI+ort → adress + ort → område → ort → "nära <första feature>" → unresolved.
    let label: string | null = null;
    if (poiName && place && poiName !== place) label = `${poiName}, ${place}`;
    else if (poiName) label = poiName;
    else if (addressLine) label = place && !addressLine.includes(place) ? `${addressLine}, ${place}` : addressLine;
    else if (neighborhood?.text && place) label = `nära ${neighborhood.text}, ${place}`;
    else if (place) label = place;
    else {
      const firstName = features[0]?.text ?? null;
      label = firstName ? `nära ${firstName}` : null;
    }

    if (!label) return fallback;
    return {
      label,
      address: addressLine,
      city: place,
      poiName,
      poiCategory,
      mapsUrl: mapsLink(lat, lng),
      coords: { lat, lng },
      unresolved: false,
    };
  } catch {
    return fallback;
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

/**
 * Status-medveten variant: skiljer "slår upp adress…" från "uppslag misslyckades".
 */
export interface RichGeocodeStatus {
  data: RichGeocode | null;
  isLoading: boolean;
  isError: boolean;
}
export function useReverseGeocodeRichStatus(
  coords: Array<{ lat: number; lng: number } | null | undefined>,
): Array<RichGeocodeStatus> {
  const results = useQueries({
    queries: coords.map((c) => ({
      queryKey: ['reverse-geocode-rich', c ? round(c.lat) : null, c ? round(c.lng) : null],
      queryFn: () => (c ? reverseGeocodeRich(c.lat, c.lng) : Promise.resolve(null)),
      enabled: !!c,
      staleTime: 24 * 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    })),
  });
  return results.map((r) => ({
    data: (r.data as RichGeocode | null) ?? null,
    isLoading: r.isLoading || r.isFetching,
    isError: r.isError || (r.isFetched && !r.data),
  }));
}
