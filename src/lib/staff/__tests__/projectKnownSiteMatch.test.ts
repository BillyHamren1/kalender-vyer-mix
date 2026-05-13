import { describe, it, expect } from 'vitest';
import { buildPlaceVisits, type KnownSite } from '../pingPlaceSegments';
import type { Ping } from '../movementDetection';

/**
 * Regressionstest: GPS-pings inom (radius + 150 m tolerance) på ett projekt-
 * KnownSite ska matcha projektet, inte klassas som "okänd plats".
 *
 * Bug: useDayKnownSites tog tidigare inte in lokala `projects` → även när
 * staffen stod inne i projektets geofence blev visit `unknown_place`.
 */
describe('projectKnownSiteMatch', () => {
  const project: KnownSite = {
    id: 'project:wenngarn',
    name: 'Wenngarns Slott',
    lat: 59.648753,
    lng: 17.719797,
    radiusMeters: 150,
  };
  const base = '2026-05-13T08:00:00Z';
  const buildPings = (): Ping[] =>
    Array.from({ length: 30 }, (_, i) => ({
      lat: 59.64724,
      lng: 17.71753,
      recorded_at: new Date(new Date(base).getTime() + i * 60_000).toISOString(),
      accuracy: 10,
    }));

  it('GPS inom radie+tolerans på projekt-KnownSite matchar projektet', () => {
    const visits = buildPlaceVisits(buildPings(), [project], { minDurationMin: 10 });
    expect(visits.length).toBeGreaterThan(0);
    const v = visits[0];
    expect(v.knownSite?.id).toBe('project:wenngarn');
    expect(v.placeKey).toBe('site:project:wenngarn');
  });

  it('Utan projekt i knownSites blir samma pings okänd plats', () => {
    const visits = buildPlaceVisits(buildPings(), [], { minDurationMin: 10 });
    expect(visits.length).toBeGreaterThan(0);
    expect(visits[0].knownSite).toBeNull();
    expect(visits[0].placeKey.startsWith('unknown:')).toBe(true);
  });
});
