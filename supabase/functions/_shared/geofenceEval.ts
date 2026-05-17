/**
 * Edge-function copy of geofence eval. Keep in sync with src/lib/geofenceEval.ts.
 */

export interface GeofenceTarget {
  latitude: number;
  longitude: number;
  radius_meters: number;
  geofence_mode?: 'circle' | 'polygon' | null;
  geofence_polygon?: { type: 'Polygon'; coordinates: number[][][] } | null;
}

const EARTH_R = 6371000;

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lng: number, lat: number, poly: { coordinates: number[][][] }): boolean {
  const rings = poly.coordinates;
  if (!rings || rings.length === 0) return false;
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let r = 1; r < rings.length; r++) {
    if (pointInRing(lng, lat, rings[r])) return false;
  }
  return true;
}

function pointToSegmentMeters(
  lat: number, lng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const px = (lng - aLng) * mPerDegLng;
  const py = (lat - aLat) * mPerDegLat;
  const bx = (bLng - aLng) * mPerDegLng;
  const by = (bLat - aLat) * mPerDegLat;
  const len2 = bx * bx + by * by || 1e-12;
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - t * bx;
  const dy = py - t * by;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceToPolygonEdge(lat: number, lng: number, poly: { coordinates: number[][][] }): number {
  const ring = poly.coordinates?.[0];
  if (!ring || ring.length < 2) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length - 1; i++) {
    const [aLng, aLat] = ring[i];
    const [bLng, bLat] = ring[i + 1];
    const d = pointToSegmentMeters(lat, lng, aLat, aLng, bLat, bLng);
    if (d < min) min = d;
  }
  return min;
}

export function isInsideGeofence(lat: number, lng: number, t: GeofenceTarget): boolean {
  if (t.geofence_mode === 'polygon' && t.geofence_polygon) {
    return pointInPolygon(lng, lat, t.geofence_polygon);
  }
  return haversine(lat, lng, t.latitude, t.longitude) <= (t.radius_meters || 100);
}

export function distanceToGeofenceEdge(lat: number, lng: number, t: GeofenceTarget): number {
  if (t.geofence_mode === 'polygon' && t.geofence_polygon) {
    const inside = pointInPolygon(lng, lat, t.geofence_polygon);
    const d = distanceToPolygonEdge(lat, lng, t.geofence_polygon);
    return inside ? d : -d;
  }
  const d = haversine(lat, lng, t.latitude, t.longitude);
  const r = t.radius_meters || 100;
  return r - d;
}

export const GEOFENCE_ENTER_HYSTERESIS_M = 5;
export const GEOFENCE_EXIT_HYSTERESIS_M = 15;
export const GEOFENCE_MAX_ACCURACY_M = 50;
