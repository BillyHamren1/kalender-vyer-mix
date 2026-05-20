import { describe, it, expect } from 'vitest';
import { computeGeofenceCrossings } from '../geofenceCrossings';

const g = {
  id: 'loc:a',
  name: 'A',
  lat: 59.0,
  lng: 18.0,
  radiusMeters: 100,
};

describe('computeGeofenceCrossings', () => {
  it('detekterar enter när personen går från utanför till innanför cirkel', () => {
    const pings = [
      { lat: 59.0, lng: 18.005, recorded_at: '2026-05-20T07:00:00Z' }, // ~287 m bort
      { lat: 59.0, lng: 18.0,    recorded_at: '2026-05-20T07:10:00Z' }, // inne (mitten)
    ];
    const crossings = computeGeofenceCrossings(pings, [g]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].kind).toBe('enter');
    // Korsningen ska ligga ungefär på cirkelns östliga kant
    expect(crossings[0].lng).toBeGreaterThan(18.0);
    expect(crossings[0].lng).toBeLessThan(18.005);
    // Tid ligger mellan prev och next
    const t = new Date(crossings[0].tsIso).getTime();
    expect(t).toBeGreaterThan(new Date(pings[0].recorded_at).getTime());
    expect(t).toBeLessThan(new Date(pings[1].recorded_at).getTime());
  });

  it('detekterar både enter och exit', () => {
    const pings = [
      { lat: 59.0, lng: 18.005, recorded_at: '2026-05-20T07:00:00Z' },
      { lat: 59.0, lng: 18.0,   recorded_at: '2026-05-20T07:10:00Z' },
      { lat: 59.0, lng: 18.005, recorded_at: '2026-05-20T07:20:00Z' },
    ];
    const crossings = computeGeofenceCrossings(pings, [g]);
    expect(crossings.map(c => c.kind)).toEqual(['enter', 'exit']);
  });

  it('ger inga korsningar när alla pings är innanför', () => {
    const pings = [
      { lat: 59.0, lng: 18.0,    recorded_at: '2026-05-20T07:00:00Z' },
      { lat: 59.0, lng: 18.0001, recorded_at: '2026-05-20T07:10:00Z' },
    ];
    expect(computeGeofenceCrossings(pings, [g])).toHaveLength(0);
  });

  it('hanterar polygon-staket', () => {
    const polyG = {
      id: 'loc:p',
      name: 'P',
      lat: 59.0,
      lng: 18.0,
      radiusMeters: 9999, // ska ignoreras till förmån för polygonen
      polygon: {
        type: 'Polygon' as const,
        coordinates: [[
          [17.999, 58.999],
          [18.001, 58.999],
          [18.001, 59.001],
          [17.999, 59.001],
          [17.999, 58.999],
        ]],
      },
    };
    const pings = [
      { lat: 59.0, lng: 17.997, recorded_at: '2026-05-20T07:00:00Z' }, // utanför
      { lat: 59.0, lng: 18.0,   recorded_at: '2026-05-20T07:10:00Z' }, // inne
    ];
    const crossings = computeGeofenceCrossings(pings, [polyG]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].kind).toBe('enter');
    // Korsningen ska ligga ~vid polygonens västra kant lng=17.999
    expect(crossings[0].lng).toBeCloseTo(17.999, 3);
  });
});
