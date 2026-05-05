import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Kontraktstest: useReverseGeocodeRich.ts måste:
 *   1. Använda loadMapboxToken (ingen hårdkodad supabase URL för tokenhämtning).
 *   2. Aldrig direkt anropa /functions/v1/mapbox-token via fetch.
 *   3. Alltid sätta mapsUrl i fallback-grenarna (säkerställer att huvudjournalen
 *      kan visa kartlänk även när reverse geocode failar).
 *   4. Exponera source/error/cacheKey/tokenAvailable så debug-expanden kan visa
 *      *varför* adress saknas.
 */
describe('useReverseGeocodeRich token chain', () => {
  const src = readFileSync(
    resolve(__dirname, '../hooks/useReverseGeocodeRich.ts'),
    'utf8',
  );

  it('uses loadMapboxToken instead of hardcoded supabase URL', () => {
    expect(src).toContain('loadMapboxToken');
    expect(src).not.toMatch(/https?:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/mapbox-token/);
  });

  it('does not bypass loadMapboxToken with raw fetch to mapbox-token', () => {
    expect(src).not.toMatch(/fetch\([^)]*mapbox-token[^)]*\)/);
  });

  it('returns mapsUrl in failure paths (so map link is always available)', () => {
    expect(src).toMatch(/mapsUrl:\s*mapsLink\(lat,\s*lng\)/);
  });

  it('exposes debug fields on RichGeocode', () => {
    for (const field of ['source:', 'error:', 'cacheKey:', 'tokenAvailable:']) {
      expect(src).toContain(field);
    }
  });

  it('classifies token-unavailable distinctly from http/exception failures', () => {
    expect(src).toContain('mapbox_token_unavailable');
    expect(src).toMatch(/mapbox_http_/);
    expect(src).toContain('exception:');
    expect(src).toContain('no_features');
  });
});
