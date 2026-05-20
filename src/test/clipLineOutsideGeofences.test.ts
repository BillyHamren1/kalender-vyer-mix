import { describe, expect, it } from 'vitest';
import { clipLineOutsideGeofences } from '@/lib/staff/clipLineOutsideGeofences';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';

const ping = (id: string, lat: number, lng: number): RawStaffGpsPing => ({
  id,
  recorded_at: `2026-05-16T10:0${id}:00.000Z`,
  lat,
  lng,
  accuracy: null,
  speed: null,
  source: null,
  battery_percent: null,
  is_charging: null,
  app_version: null,
  app_build: null,
  platform: null,
  os_version: null,
  device_model: null,
  app_id: null,
});

describe('clipLineOutsideGeofences', () => {
  it('döljer bara koordinater som ligger innanför fence och lämnar yttre delar kvar', () => {
    const fence: GeofenceSite = {
      id: 'project:test',
      name: 'Test',
      lat: 59,
      lng: 18,
      radiusMeters: 120,
    };

    const result = clipLineOutsideGeofences([
      ping('1', 59.0015, 18),
      ping('2', 59.0010, 18),
      ping('3', 59.0003, 18),
      ping('4', 59.0001, 18),
      ping('5', 59.0011, 18),
      ping('6', 59.0016, 18),
    ], [fence]);

    expect(result).toHaveLength(2);
    expect(result[0][0]).toEqual([18, 59.0015]);
    expect(result[0][1][0]).toBe(18);
    expect(result[0][1][1]).toBeGreaterThan(59.001);
    expect(result[0][1][1]).toBeLessThan(59.0011);
    expect(result[1][0][0]).toBe(18);
    expect(result[1][0][1]).toBeGreaterThan(59.001);
    expect(result[1][0][1]).toBeLessThan(59.0011);
    expect(result[1][1]).toEqual([18, 59.0011]);
    expect(result[1][2]).toEqual([18, 59.0016]);
  });

  it('returnerar hela linjen oförändrad när inget ligger i fence', () => {
    const result = clipLineOutsideGeofences([
      ping('1', 59.01, 18),
      ping('2', 59.011, 18),
      ping('3', 59.012, 18),
    ], [{ id: 'project:test', name: 'Test', lat: 59, lng: 18, radiusMeters: 50 }]);

    expect(result).toEqual([[[18, 59.01], [18, 59.011], [18, 59.012]]]);
  });
});