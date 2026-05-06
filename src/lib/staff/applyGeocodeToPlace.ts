/**
 * Pure helper extracted from ActualDayPanel.applyEndpoint så den kan
 * unit-testas. Tar en plats (label + lat/lng + nuvarande lookupStatus)
 * tillsammans med ett valfritt RichGeocode-resultat och returnerar
 * berikad plats med korrekt status/label/error.
 *
 * Kontrakt: ett unresolved geocode-svar (geo.unresolved === true) får
 * ALDRIG klassas som lyckad — det måste bli lookupStatus='failed'.
 */

import type { RichGeocode } from '@/hooks/useReverseGeocodeRich';

export type GeoLookupStatus = 'loading' | 'ok' | 'error' | 'idle';

export interface GeoLookup {
  status: GeoLookupStatus;
  geo: RichGeocode | null;
}

export interface PlaceEndpoint {
  label: string;
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;
  lookupStatus: string;
  lookupError?: string | null;
  tokenAvailable?: boolean | null;
  source?: string | null;
  cacheKey?: string | null;
}

export function applyGeocodeToPlace<T extends PlaceEndpoint>(
  p: T,
  lookup: GeoLookup | null,
): T {
  if (!p) return p;
  if (p.lookupStatus === 'matched_internal') return p;
  if (p.lat == null || p.lng == null) {
    return { ...p, lookupError: p.lookupError ?? 'missing_coords' };
  }
  const fallbackMapUrl =
    `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const mapUrl = lookup?.geo?.mapsUrl ?? p.mapUrl ?? fallbackMapUrl;

  if (!lookup) {
    return { ...p, mapUrl, lookupError: 'lookup_not_started' };
  }
  if (lookup.status === 'loading') {
    return {
      ...p,
      label: 'Slår upp adress…',
      mapUrl,
      lookupStatus: 'pending',
      lookupError: null,
    };
  }
  if (lookup.status === 'error' || !lookup.geo || lookup.geo.unresolved === true) {
    return {
      ...p,
      label: 'Okänd plats – adress kunde inte hämtas',
      mapUrl,
      lookupStatus: 'failed',
      lookupError: lookup.geo?.error ?? 'lookup_failed',
      tokenAvailable: lookup.geo?.tokenAvailable ?? p.tokenAvailable ?? null,
      source: lookup.geo?.source ?? null,
      cacheKey: lookup.geo?.cacheKey ?? null,
    };
  }
  const g = lookup.geo;
  return {
    ...p,
    label: g.label,
    mapUrl,
    lookupStatus: g.poiName ? 'poi_lookup' : 'reverse_geocoded',
    lookupError: g.error ?? null,
    tokenAvailable: g.tokenAvailable ?? true,
    source: g.source ?? null,
    cacheKey: g.cacheKey ?? null,
  };
}
