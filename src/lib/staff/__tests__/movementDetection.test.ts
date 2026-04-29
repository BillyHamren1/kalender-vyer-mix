import { describe, it, expect } from 'vitest';
import { detectMovementSegments, haversineMeters } from '../movementDetection';

const stableBase = { lat: 59.3293, lng: 18.0686 }; // Stockholm

const ping = (lat: number, lng: number, isoMin: number, address?: string) => ({
  lat,
  lng,
  recorded_at: new Date(2026, 3, 29, 8, isoMin).toISOString(),
  address: address ?? null,
});

describe('detectMovementSegments', () => {
  it('returns no segments when staff stays put', () => {
    const pings = Array.from({ length: 10 }, (_, i) =>
      ping(stableBase.lat + (Math.random() - 0.5) * 0.00005, stableBase.lng, i),
    );
    const res = detectMovementSegments(pings, { windowSize: 3, thresholdMeters: 200 });
    expect(res.segments).toHaveLength(0);
  });

  it('flags a real movement (>200m) and returns it as a segment', () => {
    // First 5 pings near base, then 4 pings ~1km away
    const away = { lat: stableBase.lat + 0.01, lng: stableBase.lng }; // ~1.1km north
    const pings = [
      ping(stableBase.lat, stableBase.lng, 0),
      ping(stableBase.lat, stableBase.lng, 1),
      ping(stableBase.lat, stableBase.lng, 2),
      ping(stableBase.lat, stableBase.lng, 3),
      ping(stableBase.lat, stableBase.lng, 4),
      ping(away.lat, away.lng, 10, 'Hamngatan 4'),
      ping(away.lat, away.lng, 11),
      ping(away.lat, away.lng, 12),
      ping(away.lat, away.lng, 13),
    ];
    const res = detectMovementSegments(pings, { windowSize: 3, thresholdMeters: 200 });
    expect(res.segments).toHaveLength(1);
    expect(res.segments[0].distanceFromBaseMeters).toBeGreaterThan(800);
    expect(res.segments[0].address).toBe('Hamngatan 4');
  });

  it('ignores a single noisy ping (window of 3 prevents false trigger)', () => {
    const noisy = { lat: stableBase.lat + 0.01, lng: stableBase.lng };
    const pings = [
      ping(stableBase.lat, stableBase.lng, 0),
      ping(stableBase.lat, stableBase.lng, 1),
      ping(stableBase.lat, stableBase.lng, 2),
      ping(noisy.lat, noisy.lng, 3), // single outlier
      ping(stableBase.lat, stableBase.lng, 4),
      ping(stableBase.lat, stableBase.lng, 5),
    ];
    const res = detectMovementSegments(pings, { windowSize: 3, thresholdMeters: 200 });
    expect(res.segments).toHaveLength(0);
  });

  it('returns nothing when fewer pings than window', () => {
    const res = detectMovementSegments(
      [ping(stableBase.lat, stableBase.lng, 0), ping(stableBase.lat, stableBase.lng, 1)],
      { windowSize: 3 },
    );
    expect(res.segments).toHaveLength(0);
  });

  it('haversineMeters: ~111km for 1° latitude', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});
