import { describe, it, expect } from 'vitest';
import { compressLocationBatch } from '../locationBatchCompressor';

function pt(id: string, secondsOffset: number, lat: number, lng: number, source: string) {
  return {
    id,
    recordedAt: new Date(Date.UTC(2026, 0, 1, 8, 0, secondsOffset)).toISOString(),
    latitude: lat,
    longitude: lng,
    accuracy: 10,
    speed: 0,
    source,
  };
}

describe('compressLocationBatch — preserve & inside-geofence density', () => {
  it('aldrig komprimerar bort geofence/location_ping/gps_pulse/heartbeat/manual/foreground', () => {
    const base = { lat: 59.3293, lng: 18.0686 };
    const input = [
      pt('a', 0, base.lat, base.lng, 'background'),
      pt('b', 5, base.lat, base.lng, 'geofence'),
      pt('c', 10, base.lat, base.lng, 'location_ping'),
      pt('d', 15, base.lat, base.lng, 'gps_pulse'),
      pt('e', 20, base.lat, base.lng, 'heartbeat'),
      pt('f', 25, base.lat, base.lng, 'manual'),
      pt('g', 30, base.lat, base.lng, 'foreground'),
      pt('h', 35, base.lat, base.lng, 'background'),
    ];
    const res = compressLocationBatch(input, { uploadMode: 'batch_inside_geofence' });
    for (const id of ['b', 'c', 'd', 'e', 'f', 'g']) {
      expect(res.selectedIds.has(id)).toBe(true);
    }
  });

  it('batch_inside_geofence behåller fler punkter än default-stay (heartbeat var 2 min)', () => {
    const base = { lat: 59.3293, lng: 18.0686 };
    // 30 background-punkter, en var 60:e sekund (= 30 minuter stilla).
    const input = Array.from({ length: 30 }, (_, i) =>
      pt(`p${i}`, i * 60, base.lat, base.lng, 'background'),
    );

    const inside = compressLocationBatch(input, { uploadMode: 'batch_inside_geofence' });
    const def = compressLocationBatch(input, { uploadMode: 'default' });

    // Inside-policy ska bevara minst dubbelt så många punkter som default-stay.
    expect(inside.selectedIds.size).toBeGreaterThan(def.selectedIds.size);
    // Ska vara fler än bara start+slut.
    expect(inside.selectedIds.size).toBeGreaterThan(2);
  });
});
