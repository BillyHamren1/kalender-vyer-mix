import { describe, expect, it } from 'vitest';
import { buildBadgeStackTransform, buildVisitPassages } from '@/components/staff/RawGpsSatelliteMap';

describe('buildBadgeStackTransform', () => {
  it('returns a stable translate transform for stacked badges', () => {
    expect(buildBadgeStackTransform(0)).toBe('translate(-5px, calc(-100% - 0px))');
    expect(buildBadgeStackTransform(26)).toBe('translate(-5px, calc(-100% - 26px))');
  });
});

describe('buildVisitPassages', () => {
  it('returns only entry and exit pings inside a known project geofence', () => {
    const passages = buildVisitPassages(
      [{
        placeKey: 'site:project-1:08:00',
        knownSite: { id: 'project:1', name: 'Projekt Alfa Beta Gamma Delta' },
        centre: { lat: 59.33, lng: 18.06 },
        start: '2026-05-24T08:00:00.000Z',
        end: '2026-05-24T09:00:00.000Z',
        durationMin: 60,
        pingCount: 4,
        pings: [
          { recorded_at: '2026-05-24T08:00:00.000Z', lat: 59.3296, lng: 18.0600, accuracy: 5 },
          { recorded_at: '2026-05-24T08:10:00.000Z', lat: 59.3300, lng: 18.0600, accuracy: 5 },
          { recorded_at: '2026-05-24T08:20:00.000Z', lat: 59.3303, lng: 18.0600, accuracy: 5 },
          { recorded_at: '2026-05-24T09:00:00.000Z', lat: 59.3320, lng: 18.0600, accuracy: 5 },
        ],
        subKind: 'inside',
      }],
      [{ id: 'project:1', name: 'Projekt Alfa Beta Gamma Delta', lat: 59.33, lng: 18.06, radiusMeters: 60 }],
    );

    expect(passages).toHaveLength(1);
    expect(passages[0].siteName).toBe('Projekt Alfa Beta Gamma Delta');
    expect(passages[0].entry.recorded_at).toBe('2026-05-24T08:00:00.000Z');
    expect(passages[0].exit?.recorded_at).toBe('2026-05-24T08:20:00.000Z');
  });

  it('om only one ping is inside geofence it returns just entry', () => {
    const passages = buildVisitPassages(
      [{
        placeKey: 'site:project-2:10:00',
        knownSite: { id: 'project:2', name: 'Projekt Kort Passering' },
        centre: { lat: 59.33, lng: 18.06 },
        start: '2026-05-24T10:00:00.000Z',
        end: '2026-05-24T10:05:00.000Z',
        durationMin: 5,
        pingCount: 2,
        pings: [
          { recorded_at: '2026-05-24T10:00:00.000Z', lat: 59.3301, lng: 18.0600, accuracy: 5 },
          { recorded_at: '2026-05-24T10:05:00.000Z', lat: 59.3340, lng: 18.0600, accuracy: 5 },
        ],
        subKind: 'inside',
      }],
      [{ id: 'project:2', name: 'Projekt Kort Passering', lat: 59.33, lng: 18.06, radiusMeters: 40 }],
    );

    expect(passages).toHaveLength(1);
    expect(passages[0].exit).toBeNull();
  });
});