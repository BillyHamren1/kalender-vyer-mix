/**
 * Tests for the work-exclusion helper used by infer-home-location.
 * Mirrors the inline definitions in index.ts (kept tiny on purpose).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface WorkExclusion {
  org: string;
  lat: number;
  lng: number;
  radiusM: number;
  name: string;
}

function isInsideWorkExclusion(
  org: string,
  lat: number,
  lng: number,
  exclusions: WorkExclusion[],
): WorkExclusion | null {
  for (const ex of exclusions) {
    if (ex.org !== org) continue;
    if (distanceM(lat, lng, ex.lat, ex.lng) < ex.radiusM + 50) return ex;
  }
  return null;
}

const FA: WorkExclusion = {
  org: 'org-1',
  lat: 59.49145,
  lng: 17.85536,
  radiusM: 200,
  name: 'FA Warehouse',
};

Deno.test('ping inside warehouse polygon is excluded', () => {
  // ~140m from FA Warehouse — well inside 200+50 buffer
  const hit = isInsideWorkExclusion('org-1', 59.491, 17.853, [FA]);
  assert(hit, 'expected exclusion match');
  assertEquals(hit?.name, 'FA Warehouse');
});

Deno.test('ping just outside buffer is NOT excluded', () => {
  // ~500m away
  const hit = isInsideWorkExclusion('org-1', 59.4960, 17.8553, [FA]);
  assertEquals(hit, null);
});

Deno.test('different org is never excluded', () => {
  const hit = isInsideWorkExclusion('org-2', 59.491, 17.853, [FA]);
  assertEquals(hit, null);
});

Deno.test('actual home 25km away is NOT excluded', () => {
  const hit = isInsideWorkExclusion('org-1', 59.651, 17.72, [FA]);
  assertEquals(hit, null);
});
