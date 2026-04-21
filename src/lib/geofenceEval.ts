/**
 * Shared geofence evaluation logic.
 * Mirror of `supabase/functions/_shared/geofenceEval.ts` — keep in sync.
 */

export interface GeofenceTarget {
  latitude: number;
  longitude: number;
  radius_meters: number;
  geofence_mode?: 'circle' | 'polygon' | null;
  geofence_polygon?: GeoJSONPolygon | null;
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [ring][point][lng,lat]
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

/** Ray-casting point-in-polygon (uses outer ring only). */
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

function pointInPolygon(lng: number, lat: number, poly: GeoJSONPolygon): boolean {
  const rings = poly.coordinates;
  if (!rings || rings.length === 0) return false;
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let r = 1; r < rings.length; r++) {
    if (pointInRing(lng, lat, rings[r])) return false; // hole
  }
  return true;
}

/** Min haversine distance from a point to any segment of the outer ring. */
function distanceToPolygonEdge(lat: number, lng: number, poly: GeoJSONPolygon): number {
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

/** Approximate planar projection good enough for sub-100m segments. */
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

export function isInsideGeofence(lat: number, lng: number, t: GeofenceTarget): boolean {
  if (t.geofence_mode === 'polygon' && t.geofence_polygon) {
    return pointInPolygon(lng, lat, t.geofence_polygon);
  }
  return haversine(lat, lng, t.latitude, t.longitude) <= (t.radius_meters || 100);
}

/**
 * Signed distance to the geofence edge in meters.
 * Positive = inside (distance until you'd leave).
 * Negative = outside (how far away from the boundary).
 */
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

/** Hysteresis thresholds (m). ENTER must be ≥5m inside; EXIT must be ≥15m outside. */
export const GEOFENCE_ENTER_HYSTERESIS_M = 5;
export const GEOFENCE_EXIT_HYSTERESIS_M = 15;

/** GPS pings worse than this accuracy are ignored for geofence evaluation. */
export const GEOFENCE_MAX_ACCURACY_M = 50;

export function shouldTriggerEnter(lat: number, lng: number, t: GeofenceTarget, accuracy: number | null): boolean {
  if (accuracy != null && accuracy > GEOFENCE_MAX_ACCURACY_M) return false;
  return distanceToGeofenceEdge(lat, lng, t) >= GEOFENCE_ENTER_HYSTERESIS_M;
}

export function shouldTriggerExit(lat: number, lng: number, t: GeofenceTarget, accuracy: number | null): boolean {
  if (accuracy != null && accuracy > GEOFENCE_MAX_ACCURACY_M) return false;
  return distanceToGeofenceEdge(lat, lng, t) <= -GEOFENCE_EXIT_HYSTERESIS_M;
}

/** Centroid of polygon outer ring. Used for list-view lat/lng on save. */
export function polygonCentroid(poly: GeoJSONPolygon): { lat: number; lng: number } {
  const ring = poly.coordinates?.[0] || [];
  if (ring.length === 0) return { lat: 0, lng: 0 };
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    area += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-12) {
    // Degenerate — fallback to mean
    const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const my = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return { lat: my, lng: mx };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { lat: cy, lng: cx };
}

/** Approx area in m² using equirectangular projection. */
export function polygonAreaM2(poly: GeoJSONPolygon): number {
  const ring = poly.coordinates?.[0] || [];
  if (ring.length < 4) return 0;
  const lat0 = ring[0][1] * Math.PI / 180;
  const mPerDegLng = 111320 * Math.cos(lat0);
  const mPerDegLat = 111320;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x0 = ring[i][0] * mPerDegLng;
    const y0 = ring[i][1] * mPerDegLat;
    const x1 = ring[i + 1][0] * mPerDegLng;
    const y1 = ring[i + 1][1] * mPerDegLat;
    area += (x0 * y1 - x1 * y0);
  }
  return Math.abs(area) / 2;
}
