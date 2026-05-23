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
  it('slår ihop inside + outside + inside till ETT block under samma projekt', () => {
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

    expect(visits).toHaveLength(1);
    expect(visits[0].knownSite?.id).toBe('project:westmans');
    expect(visits[0].subKind).toBe('inside');
    expect(visits[0].start).toBe('2026-05-23T08:51:00.000Z');
    expect(visits[0].end).toBe('2026-05-23T20:18:00.000Z');
  });

  it('avslutar projekt A exakt när nästa projektblock börjar', () => {
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

    expect(visits).toHaveLength(2);
    expect(visits[0].knownSite?.id).toBe('project:westmans');
    expect(visits[0].end).toBe('2026-05-23T09:30:00.000Z');
    expect(visits[1].knownSite?.id).toBe('project:other');
    expect(visits[1].start).toBe('2026-05-23T10:00:00.000Z');
  });

  it('låter sista blocket ta hela vägen till sista pingen så dagen inte får glapp', () => {
    const visits = buildExactGeofenceVisits(
      [
        ping('2026-05-23T08:00:00.000Z', 59, 18),
        ping('2026-05-23T09:00:00.000Z', 59, 18),
        ping('2026-05-23T09:30:00.000Z', 59.5, 18.5),
        ping('2026-05-23T17:00:00.000Z', 59.5, 18.5),
      ],
      [siteA, siteB],
    );

    expect(visits).toHaveLength(1);
    expect(visits[0].end).toBe('2026-05-23T17:00:00.000Z');
  });

  it('behåller ett kontinuerligt block genom flera outside-pings före nästa projekt', () => {
    const visits = buildExactGeofenceVisits(
      [
        ping('2026-05-23T07:50:48.000Z', 59, 18),
        ping('2026-05-23T17:40:44.000Z', 59, 18),
        ping('2026-05-23T18:10:00.000Z', 59.5, 18.5),
        ping('2026-05-23T18:20:00.000Z', 59.5, 18.5),
        ping('2026-05-23T18:30:07.000Z', 60, 19),
      ],
      [siteA, siteB],
    );

    expect(visits).toHaveLength(2);
    expect(visits[0].knownSite?.id).toBe('project:westmans');
    expect(visits[0].start).toBe('2026-05-23T07:50:48.000Z');
    expect(visits[0].end).toBe('2026-05-23T18:20:00.000Z');
    expect(visits[1].knownSite?.id).toBe('project:other');
    expect(visits[1].start).toBe('2026-05-23T18:30:07.000Z');
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
