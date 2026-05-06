import { describe, it, expect } from 'vitest';
import { resolveLookupCoord } from '../resolveLookupCoord';
import type { RichGeocode } from '@/hooks/useReverseGeocodeRich';

const unresolved: RichGeocode = {
  label: 'Okänd plats – adress saknas',
  address: null,
  city: null,
  poiName: null,
  poiCategory: null,
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=59.000000,18.000000',
  coords: { lat: 59, lng: 18 },
  unresolved: true,
  source: 'none',
  error: 'mapbox_token_unavailable',
  cacheKey: '59.000,18.000',
  tokenAvailable: false,
  poiDistanceMeters: null,
  nearbyPois: [],
};

const resolved: RichGeocode = {
  ...unresolved,
  label: 'Drottninggatan 1, Stockholm',
  address: 'Drottninggatan 1',
  city: 'Stockholm',
  unresolved: false,
  source: 'mapbox',
  error: null,
  tokenAvailable: true,
  poiDistanceMeters: null,
  nearbyPois: [],
};

describe('resolveLookupCoord', () => {
  it('klassar unresolved svar som error och behåller mapsUrl + error', () => {
    const r = resolveLookupCoord({ data: unresolved });
    expect(r.status).toBe('error');
    expect(r.label).toBe('Okänd plats – adress kunde inte hämtas');
    expect(r.geo?.error).toBe('mapbox_token_unavailable');
    expect(r.geo?.unresolved).toBe(true);
    expect(r.geo?.mapsUrl).toBeTruthy();
  });

  it('klassar resolved data som ok', () => {
    const r = resolveLookupCoord({ data: resolved });
    expect(r.status).toBe('ok');
    expect(r.label).toBe('Drottninggatan 1, Stockholm');
  });

  it('loading utan data', () => {
    const r = resolveLookupCoord({ data: null, isLoading: true });
    expect(r.status).toBe('loading');
  });

  it('isError utan data ger error', () => {
    const r = resolveLookupCoord({ data: null, isError: true });
    expect(r.status).toBe('error');
    expect(r.label).toBe('Okänd plats – adress kunde inte hämtas');
  });

  it('odefinierat status → loading (initialtillstånd)', () => {
    const r = resolveLookupCoord(undefined);
    expect(r.status).toBe('loading');
  });
});
