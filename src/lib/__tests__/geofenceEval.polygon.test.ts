import { describe, expect, it } from 'vitest';
import {
  isInsideGeofence,
  shouldTriggerEnter,
  shouldTriggerExit,
  type GeoJSONPolygon,
} from '@/lib/geofenceEval';

// Square ~200m around (lat=59.0, lng=18.0)
const polygon: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [[
    [17.999, 58.999],
    [18.001, 58.999],
    [18.001, 59.001],
    [17.999, 59.001],
    [17.999, 58.999],
  ]],
};

describe('geofenceEval (polygon + circle fallback)', () => {
  it('polygon inside → isInsideGeofence + shouldTriggerEnter true', () => {
    const t = {
      latitude: 59.0,
      longitude: 18.0,
      radius_meters: 100,
      geofence_mode: 'polygon' as const,
      geofence_polygon: polygon,
    };
    expect(isInsideGeofence(59.0, 18.0, t)).toBe(true);
    expect(shouldTriggerEnter(59.0, 18.0, t, 10)).toBe(true);
  });

  it('polygon outside → shouldTriggerExit true', () => {
    const t = {
      latitude: 59.0,
      longitude: 18.0,
      radius_meters: 100,
      geofence_mode: 'polygon' as const,
      geofence_polygon: polygon,
    };
    // ~500m utanför
    expect(isInsideGeofence(59.01, 18.0, t)).toBe(false);
    expect(shouldTriggerExit(59.01, 18.0, t, 10)).toBe(true);
  });

  it('circle fallback fungerar när polygon saknas', () => {
    const t = {
      latitude: 59.0,
      longitude: 18.0,
      radius_meters: 100,
      geofence_mode: 'circle' as const,
      geofence_polygon: null,
    };
    expect(isInsideGeofence(59.0, 18.0, t)).toBe(true);
    expect(isInsideGeofence(59.01, 18.0, t)).toBe(false);
  });

  it('dålig accuracy hindrar enter/exit', () => {
    const t = {
      latitude: 59.0,
      longitude: 18.0,
      radius_meters: 100,
      geofence_mode: 'circle' as const,
      geofence_polygon: null,
    };
    // accuracy 200m > GEOFENCE_MAX_ACCURACY_M (50)
    expect(shouldTriggerEnter(59.0, 18.0, t, 200)).toBe(false);
    expect(shouldTriggerExit(59.01, 18.0, t, 200)).toBe(false);
  });
});
