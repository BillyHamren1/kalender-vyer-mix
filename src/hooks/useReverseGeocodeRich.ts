import { useQueries } from '@tanstack/react-query';
import { loadMapboxToken } from './useMapboxToken';

/**
 * Rich reverse-geocode hook: returnerar adress, ort, närmaste POI och en
 * lista över andra POI:s i närheten. Två parallella Mapbox-anrop per punkt
 * — ett för adress, ett för POI — eftersom Mapbox annars ofta missar POI
 * när man kombinerar typer.
 */

async function getMapboxToken(): Promise<string | null> {
  try {
    return await loadMapboxToken();
  } catch {
    return null;
  }
}

export type LookupSource = 'mapbox' | 'none';

export interface NearbyPoi {
  name: string;
  category: string | null;
  distanceMeters: number | null;
  lat: number;
  lng: number;
  mapsUrl: string;
}

export interface RichGeocode {
  label: string;
  address: string | null;
  city: string | null;
  poiName: string | null;
  poiCategory: string | null;
  /** Avstånd (m) till närmaste POI om tillgängligt. */
  poiDistanceMeters: number | null;
  /** Upp till 5 POI inom ~150 m, sorterade efter avstånd. */
  nearbyPois: NearbyPoi[];
  mapsUrl: string | null;
  coords: { lat: number; lng: number } | null;
  unresolved: boolean;
  source: LookupSource;
  error: string | null;
  cacheKey: string | null;
  tokenAvailable: boolean;
}

const mapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

const UNRESOLVED_LABEL = 'Okänd plats – adress saknas';

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Haversine-avstånd i meter. */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** POI-kategorier vi inte vill visa som "vad finns på platsen" — rena adresser/bostad. */
const HIDDEN_POI_CATEGORIES = new Set([
  'residential',
  'address',
]);

function isMeaningfulPoi(name: string | null | undefined, category: string | null | undefined): boolean {
  if (!name) return false;
  if (!category) return true;
  // Kategorier är ofta kommaseparerade ("food, restaurant"). Filtrera bara om ALLA är "tysta".
  const cats = category.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (cats.length === 0) return true;
  return cats.some((c) => !HIDDEN_POI_CATEGORIES.has(c));
}

async function fetchAddress(lat: number, lng: number, token: string): Promise<{ address: string | null; city: string | null; rawLabel: string | null; error: string | null }> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=sv&limit=1&types=address`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { address: null, city: null, rawLabel: null, error: `address_http_${res.status}` };
    const data = await res.json();
    const f = (data?.features || [])[0];
    if (!f) return { address: null, city: null, rawLabel: null, error: 'no_address' };
    const place = (f.context || []).find((c: any) => typeof c.id === 'string' && (c.id.startsWith('place.') || c.id.startsWith('locality.')))?.text ?? null;
    const addressLine = (f.place_name?.split(',').slice(0, 2).join(',').trim()) ?? f.text ?? null;
    return { address: addressLine, city: place, rawLabel: f.place_name ?? null, error: null };
  } catch (err: any) {
    return { address: null, city: null, rawLabel: null, error: `address_exception:${err?.message ?? String(err)}` };
  }
}

async function fetchPois(lat: number, lng: number, token: string): Promise<{ pois: NearbyPoi[]; error: string | null }> {
  // limit=10 för att hitta fler kandidater att filtrera på meningsfullhet/avstånd.
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=sv&limit=10&types=poi`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { pois: [], error: `poi_http_${res.status}` };
    const data = await res.json();
    const features = (data?.features || []) as any[];
    const pois: NearbyPoi[] = features
      .filter((f) => typeof f.id === 'string' && f.id.startsWith('poi.'))
      .map((f) => {
        const [pLng, pLat] = (f.center as [number, number]) || [lng, lat];
        const dist = distanceMeters({ lat, lng }, { lat: pLat, lng: pLng });
        return {
          name: f.text as string,
          category: (f.properties?.category as string | null) ?? null,
          distanceMeters: Math.round(dist),
          lat: pLat,
          lng: pLng,
          mapsUrl: mapsLink(pLat, pLng),
        };
      })
      .filter((p) => isMeaningfulPoi(p.name, p.category))
      .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
      .slice(0, 5);
    return { pois, error: null };
  } catch (err: any) {
    return { pois: [], error: `poi_exception:${err?.message ?? String(err)}` };
  }
}

async function reverseGeocodeRich(lat: number, lng: number): Promise<RichGeocode> {
  const cacheKey = `${round(lat)},${round(lng)}`;
  const token = await getMapboxToken();
  const baseFallback = (error: string | null, source: LookupSource = 'none', tokenOk = !!token): RichGeocode => ({
    label: UNRESOLVED_LABEL,
    address: null,
    city: null,
    poiName: null,
    poiCategory: null,
    poiDistanceMeters: null,
    nearbyPois: [],
    mapsUrl: mapsLink(lat, lng),
    coords: { lat, lng },
    unresolved: true,
    source,
    error,
    cacheKey,
    tokenAvailable: tokenOk,
  });
  if (!token) return baseFallback('mapbox_token_unavailable', 'none', false);

  const [addr, poi] = await Promise.all([
    fetchAddress(lat, lng, token),
    fetchPois(lat, lng, token),
  ]);

  const nearest = poi.pois[0] ?? null;
  // Acceptera närmaste POI som "platsen" om den är inom ~150 m.
  const acceptedPoi = nearest && (nearest.distanceMeters ?? Infinity) <= 150 ? nearest : null;

  let label: string | null = null;
  if (acceptedPoi && addr.city && acceptedPoi.name !== addr.city) label = `${acceptedPoi.name}, ${addr.city}`;
  else if (acceptedPoi) label = acceptedPoi.name;
  else if (addr.address) label = addr.city && !addr.address.includes(addr.city) ? `${addr.address}, ${addr.city}` : addr.address;
  else if (addr.city) label = addr.city;

  if (!label) {
    const err = addr.error ?? poi.error ?? 'no_label_resolvable';
    return baseFallback(err, 'mapbox');
  }

  return {
    label,
    address: addr.address,
    city: addr.city,
    poiName: acceptedPoi?.name ?? null,
    poiCategory: acceptedPoi?.category ?? null,
    poiDistanceMeters: acceptedPoi?.distanceMeters ?? null,
    nearbyPois: poi.pois,
    mapsUrl: mapsLink(lat, lng),
    coords: { lat, lng },
    unresolved: false,
    source: 'mapbox',
    error: addr.error && poi.error ? `${addr.error}|${poi.error}` : null,
    cacheKey,
    tokenAvailable: true,
  };
}

/**
 * Dev/debug helper: kör reverse-geocode för en koordinat utan React Query.
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
    address: out.address,
    poiName: out.poiName,
    poiCategory: out.poiCategory,
    nearbyPois: out.nearbyPois,
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
