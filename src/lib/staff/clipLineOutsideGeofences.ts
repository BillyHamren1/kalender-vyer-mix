import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';
import { haversineMeters } from '@/lib/staff/movementDetection';

function pointInPolygon(lng: number, lat: number, polygon: GeoJSON.Polygon): boolean {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pingInsideAnyFence(p: { lat: number; lng: number }, fences: GeofenceSite[]): boolean {
  for (const f of fences) {
    if (f.polygon) {
      if (pointInPolygon(p.lng, p.lat, f.polygon)) return true;
    } else if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
      const r = Math.max(10, Number(f.radiusMeters) || 200);
      const d = haversineMeters({ lat: f.lat, lng: f.lng }, { lat: p.lat, lng: p.lng });
      if (d <= r) return true;
    }
  }
  return false;
}

export function clipLineOutsideGeofences(
  pings: RawStaffGpsPing[],
  fences: GeofenceSite[],
): Array<Array<[number, number]>> {
  if (pings.length < 2) return [];
  if (!fences.length) return [pings.map((p) => [p.lng, p.lat])];

  const pieces: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];

  for (const p of pings) {
    const inside = pingInsideAnyFence(p, fences);
    if (inside) {
      if (current.length >= 2) pieces.push(current);
      current = [];
      continue;
    }

    current.push([p.lng, p.lat]);
  }

  if (current.length >= 2) pieces.push(current);
  return pieces;
}