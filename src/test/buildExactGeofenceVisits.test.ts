import { describe, expect, it } from 'vitest';
import { buildExactGeofenceVisits } from '@/lib/staff/buildExactGeofenceVisits';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';

const siteA: GeofenceSite = {
  id: 'project:westmans',
  name: 'Westmans',
  lat: 59,
  lng: 18,
  radiusMeters: 120,
};

const siteB: GeofenceSite = {
  id: 'project:other',
  name: 'Annat projekt',
  lat: 60,
  lng: 19,
  radiusMeters: 120,
};

const ping = (time: string, lat: number, lng: number) => ({
  recorded_at: time,
  lat,
  lng,
  accuracy: null,
});

describe('buildExactGeofenceVisits', () => {
  it('skapar inside + outside_geo + inside-delblock under SAMMA projekt vid återkomst', () => {
    const visits = buildExactGeofenceVisits(
      [
        ping('2026-05-23T08:51:00.000Z', 59, 18),
        ping('2026-05-23T12:30:00.000Z', 59, 18),
        ping('2026-05-23T12:36:00.000Z', 59.5, 18.5),
        ping('2026-05-23T12:46:00.000Z', 59.5, 18.5),
        ping('2026-05-23T12:46:30.000Z', 59, 18),
        ping('2026-05-23T20:18:00.000Z', 59, 18),
      ],
      [siteA, siteB],
    );

    expect(visits).toHaveLength(3);
    expect(visits.map((v) => v.knownSite?.id)).toEqual([
      'project:westmans',
      'project:westmans',
      'project:westmans',
    ]);
    expect(visits.map((v) => v.subKind)).toEqual(['inside', 'outside_geo', 'inside']);
    expect(visits[0].start).toBe('2026-05-23T08:51:00.000Z');
    expect(visits[0].end).toBe('2026-05-23T12:30:00.000Z');
    expect(visits[2].end).toBe('2026-05-23T20:18:00.000Z');
  });

  it('avslutar projekt A och startar projekt B när personen korsar annat staket', () => {
    const visits = buildExactGeofenceVisits(
      [
        ping('2026-05-23T08:00:00.000Z', 59, 18),
        ping('2026-05-23T09:00:00.000Z', 59, 18),
        ping('2026-05-23T09:30:00.000Z', 59.5, 18.5),
        ping('2026-05-23T10:00:00.000Z', 60, 19),
        ping('2026-05-23T11:00:00.000Z', 60, 19),
      ],
      [siteA, siteB],
    );

    expect(visits).toHaveLength(3);
    expect(visits[0].knownSite?.id).toBe('project:westmans');
    expect(visits[0].subKind).toBe('inside');
    expect(visits[1].knownSite?.id).toBe('project:westmans');
    expect(visits[1].subKind).toBe('outside_geo');
    expect(visits[2].knownSite?.id).toBe('project:other');
    expect(visits[2].subKind).toBe('inside');
  });

  it('behåller hängande outside_geo-block under aktivt projekt om dagen slutar utanför', () => {
    const visits = buildExactGeofenceVisits(
      [
        ping('2026-05-23T08:00:00.000Z', 59, 18),
        ping('2026-05-23T09:00:00.000Z', 59, 18),
        ping('2026-05-23T09:30:00.000Z', 59.5, 18.5),
        ping('2026-05-23T17:00:00.000Z', 59.5, 18.5),
      ],
      [siteA, siteB],
    );

    expect(visits).toHaveLength(2);
    expect(visits[0].subKind).toBe('inside');
    expect(visits[1].subKind).toBe('outside_geo');
    expect(visits[1].end).toBe('2026-05-23T17:00:00.000Z');
  });

  it('ignorerar pings innan personen någonsin gått in i ett geofence', () => {
    const visits = buildExactGeofenceVisits(
      [
        ping('2026-05-23T07:00:00.000Z', 59.5, 18.5),
        ping('2026-05-23T08:00:00.000Z', 59, 18),
      ],
      [siteA, siteB],
    );
    expect(visits).toHaveLength(1);
    expect(visits[0].subKind).toBe('inside');
  });
});
