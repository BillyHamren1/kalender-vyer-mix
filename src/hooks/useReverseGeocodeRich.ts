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

export type LookupSource = 'mapbox' | 'none';
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
  /** Vilken provider svaret kom från (eller 'none' om inget kördes). */
  source: LookupSource;
  /** Felbeskrivning om uppslaget misslyckades (HTTP/exception/empty). */
  error: string | null;
  /** Cachekey som queryn använder — samma round som useQueries-key. */
  cacheKey: string | null;
  /** True om Mapbox-token kunde hämtas. */
  tokenAvailable: boolean;
}

const mapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

const UNRESOLVED_LABEL = 'Okänd plats – adress saknas';

async function reverseGeocodeRich(lat: number, lng: number): Promise<RichGeocode> {
  const cacheKey = `${round(lat)},${round(lng)}`;
  const token = await getMapboxToken();
  const baseFallback = (error: string | null, source: LookupSource = 'none', tokenOk = !!token): RichGeocode => ({
    label: UNRESOLVED_LABEL,
    address: null,
    city: null,
    poiName: null,
    poiCategory: null,
    mapsUrl: mapsLink(lat, lng),
    coords: { lat, lng },
    unresolved: true,
    source,
    error,
    cacheKey,
    tokenAvailable: tokenOk,
  });
  if (!token) return baseFallback('mapbox_token_unavailable', 'none', false);

  // OBS: Mapbox kräver `limit=1` när man kombinerar flera typer i reverse-
  // geocoding. Annars returneras HTTP 422 ("limit must be combined with a
  // single type parameter when reverse geocoding") och alla okända platser
  // hamnar som "adress kunde inte hämtas". Vi tar topp-träffen och hämtar
  // POI/adress/place från context istället.
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=sv&limit=1&types=poi,address,neighborhood,locality,place`;
  try {
    const res = await fetch(url);
    if (!res.ok) return baseFallback(`mapbox_http_${res.status}`, 'mapbox');
    const data = await res.json();
    const features = (data?.features || []) as any[];
    if (!features.length) return baseFallback('no_features', 'mapbox');

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

    if (!label) return baseFallback('no_label_resolvable', 'mapbox');
    return {
      label,
      address: addressLine,
      city: place,
      poiName,
      poiCategory,
      mapsUrl: mapsLink(lat, lng),
      coords: { lat, lng },
      unresolved: false,
      source: 'mapbox',
      error: null,
      cacheKey,
      tokenAvailable: true,
    };
  } catch (err: any) {
    return baseFallback(`exception:${err?.message ?? String(err)}`, 'mapbox');
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Dev/debug helper: kör reverse-geocode för en koordinat utan React Query.
 * Bypass:ar cache så att det alltid ses som ett friskt anrop. Loggar i
 * console för enkel diagnos och returnerar fullständig RichGeocode.
 */
export async function testReverseGeocode(lat: number, lng: number): Promise<RichGeocode> {
  // eslint-disable-next-line no-console
  console.groupCollapsed(`[testReverseGeocode] ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  const out = await reverseGeocodeRich(lat, lng);
  // eslint-disable-next-line no-console
  console.log({
    tokenAvailable: out.tokenAvailable,
    source: out.source,
    label: out.label,
    unresolved: out.unresolved,
    error: out.error,
    mapsUrl: out.mapsUrl,
    cacheKey: out.cacheKey,
  });
  // eslint-disable-next-line no-console
  console.groupEnd();
  return out;
}

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
