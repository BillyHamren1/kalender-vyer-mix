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

  const samePoint = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

  const pushPoint = (arr: Array<[number, number]>, point: [number, number]) => {
    if (!arr.length || !samePoint(arr[arr.length - 1], point)) arr.push(point);
  };

  const lerp = (a: RawStaffGpsPing, b: RawStaffGpsPing, t: number) => ({
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  });

  const boundaryPoint = (
    a: RawStaffGpsPing,
    b: RawStaffGpsPing,
    aInside: boolean,
  ): [number, number] => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const sample = lerp(a, b, mid);
      const inside = pingInsideAnyFence(sample, fences);
      if (inside === aInside) lo = mid;
      else hi = mid;
    }
    const edge = lerp(a, b, (lo + hi) / 2);
    return [edge.lng, edge.lat];
  };

  for (let i = 0; i < pings.length - 1; i++) {
    const a = pings[i];
    const b = pings[i + 1];
    const aInside = pingInsideAnyFence(a, fences);
    const bInside = pingInsideAnyFence(b, fences);

    if (!aInside && !bInside) {
      pushPoint(current, [a.lng, a.lat]);
      pushPoint(current, [b.lng, b.lat]);
      continue;
    }

    if (!aInside && bInside) {
      pushPoint(current, [a.lng, a.lat]);
      pushPoint(current, boundaryPoint(a, b, false));
      if (current.length >= 2) pieces.push(current);
      current = [];
      continue;
    }

    if (aInside && !bInside) {
      current = [];
      pushPoint(current, boundaryPoint(a, b, true));
      pushPoint(current, [b.lng, b.lat]);
      continue;
    }

    if (current.length >= 2) pieces.push(current);
    current = [];
  }

  if (current.length >= 2) pieces.push(current);
  return pieces;
}