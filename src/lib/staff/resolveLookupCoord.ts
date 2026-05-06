import type { RichGeocode } from '@/hooks/useReverseGeocodeRich';

export interface LookupStatus {
  data: RichGeocode | null;
  isLoading?: boolean;
  isError?: boolean;
}

export interface ResolvedLookup {
  label: string;
  geo: RichGeocode | null;
  status: 'ok' | 'loading' | 'error';
}

/**
 * Klassificerar en RichGeocode-status från useReverseGeocodeRich.
 * Ett unresolved-svar (t.ex. mapbox_token_unavailable / no_features /
 * mapbox_http_xxx) får ALDRIG behandlas som status='ok'.
 */
export function resolveLookupCoord(s: LookupStatus | undefined | null): ResolvedLookup {
  if (s?.data?.unresolved) {
    return { label: 'Okänd plats – adress kunde inte hämtas', geo: s.data, status: 'error' };
  }
  if (s?.data) return { label: s.data.label, geo: s.data, status: 'ok' };
  if (s?.isLoading) return { label: 'Slår upp adress…', geo: null, status: 'loading' };
  if (s?.isError) return { label: 'Okänd plats – adress kunde inte hämtas', geo: null, status: 'error' };
  return { label: 'Slår upp adress…', geo: null, status: 'loading' };
}
