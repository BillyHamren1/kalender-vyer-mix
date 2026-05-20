import { describe, expect, it } from 'vitest';
import { buildExactGeofenceVisits } from '@/lib/staff/buildExactGeofenceVisits';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';

const site: GeofenceSite = {
  id: 'project:westmans',
  name: 'Westmans',
  lat: 59,
  lng: 18,
  radiusMeters: 120,
};

const ping = (time: string, lat: number, lng: number) => ({
  recorded_at: time,
  lat,
  lng,
  accuracy: null,
});

describe('buildExactGeofenceVisits', () => {
  it('skapar ett block per obruten in→ut-passage', () => {
    const visits = buildExactGeofenceVisits([
      ping('2026-05-23T09:20:00.000Z', 59.0015, 18),
      ping('2026-05-23T09:26:00.000Z', 59.0002, 18),
      ping('2026-05-23T09:40:00.000Z', 59.0001, 18),
      ping('2026-05-23T10:06:00.000Z', 59.0003, 18),
      ping('2026-05-23T10:09:00.000Z', 59.0016, 18),
      ping('2026-05-23T15:05:00.000Z', 59.0002, 18),
      ping('2026-05-23T15:44:00.000Z', 59.0001, 18),
      ping('2026-05-23T16:11:00.000Z', 59.0002, 18),
      ping('2026-05-23T16:14:00.000Z', 59.0015, 18),
    ], [site]);

    expect(visits).toHaveLength(2);
    expect(visits.map((v) => [v.start, v.end])).toEqual([
      ['2026-05-23T09:26:00.000Z', '2026-05-23T10:06:00.000Z'],
      ['2026-05-23T15:05:00.000Z', '2026-05-23T16:11:00.000Z'],
    ]);
  });

  it('splittrar när personen går ut och kommer tillbaka', () => {
    const visits = buildExactGeofenceVisits([
      ping('2026-05-23T20:18:00.000Z', 59.0001, 18),
      ping('2026-05-23T20:30:00.000Z', 59.0002, 18),
      ping('2026-05-23T20:50:00.000Z', 59.0016, 18),
      ping('2026-05-23T20:58:00.000Z', 59.0002, 18),
      ping('2026-05-23T21:13:00.000Z', 59.0001, 18),
      ping('2026-05-23T21:18:00.000Z', 59.0017, 18),
    ], [site]);

    expect(visits).toHaveLength(2);
    expect(visits[0].start).toBe('2026-05-23T20:18:00.000Z');
    expect(visits[0].end).toBe('2026-05-23T20:30:00.000Z');
    expect(visits[1].start).toBe('2026-05-23T20:58:00.000Z');
    expect(visits[1].end).toBe('2026-05-23T21:13:00.000Z');
  });
});