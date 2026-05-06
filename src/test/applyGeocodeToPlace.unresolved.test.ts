import { describe, it, expect } from 'vitest';
import { applyGeocodeToPlace, type PlaceEndpoint } from '@/lib/staff/applyGeocodeToPlace';
import type { RichGeocode } from '@/hooks/useReverseGeocodeRich';

const basePlace: PlaceEndpoint = {
  label: 'okänd',
  lat: 59.3293,
  lng: 18.0686,
  mapUrl: null,
  lookupStatus: 'pending',
};

describe('applyGeocodeToPlace — unresolved guard', () => {
  it('classifies an unresolved RichGeocode as failed even though data is non-null', () => {
    const unresolved: RichGeocode = {
      label: 'Okänd plats – adress saknas',
      address: null,
      city: null,
      poiName: null,
      poiCategory: null,
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=59.329300,18.068600',
      coords: { lat: 59.3293, lng: 18.0686 },
      unresolved: true,
      source: 'none',
      error: 'mapbox_token_unavailable',
      cacheKey: '59.329,18.069',
      tokenAvailable: false,
  poiDistanceMeters: null,
  nearbyPois: [],
    };

    const out = applyGeocodeToPlace(basePlace, { status: 'ok', geo: unresolved });

    expect(out.lookupStatus).toBe('failed');
    expect(out.label).toBe('Okänd plats – adress kunde inte hämtas');
    expect(out.lookupError).toBe('mapbox_token_unavailable');
    expect(out.tokenAvailable).toBe(false);
    expect(out.mapUrl).toBeTruthy();
  });

  it('still classifies a successful reverse-geocode as reverse_geocoded', () => {
    const ok: RichGeocode = {
      label: 'Drottninggatan 1, Stockholm',
      address: 'Drottninggatan 1',
      city: 'Stockholm',
      poiName: null,
      poiCategory: null,
      mapsUrl: 'https://maps.example/x',
      coords: { lat: 59.3293, lng: 18.0686 },
      unresolved: false,
      source: 'mapbox',
      error: null,
      cacheKey: '59.329,18.069',
      tokenAvailable: true,
  poiDistanceMeters: null,
  nearbyPois: [],
    };

    const out = applyGeocodeToPlace(basePlace, { status: 'ok', geo: ok });

    expect(out.lookupStatus).toBe('reverse_geocoded');
    expect(out.label).toBe('Drottninggatan 1, Stockholm');
    expect(out.lookupError).toBeNull();
  });

  it('returns failed when status is error and geo is null', () => {
    const out = applyGeocodeToPlace(basePlace, { status: 'error', geo: null });
    expect(out.lookupStatus).toBe('failed');
    expect(out.lookupError).toBe('lookup_failed');
    expect(out.mapUrl).toContain('google.com/maps');
  });
});
