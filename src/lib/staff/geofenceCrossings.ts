/**
 * geofenceCrossings — beräknar exakt var (lng,lat) personen korsade
 * staketet IN respektive UT, plus klockslag interpolerat mellan
 * pingen innan och pingen efter korsningen.
 *
 * Ren funktion. Inga DB-anrop. Testas separat.
 */

export interface CrossingPing {
  lat: number;
  lng: number;
  recorded_at: string; // ISO
}

export interface CrossingGeofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Om satt: polygonen vinner över cirkel (samma regel som rendering). */
  polygon?: GeoJSON.Polygon;
}

export interface GeofenceCrossing {
  geofenceId: string;
  geofenceName: string;
  kind: 'enter' | 'exit';
  lat: number;
  lng: number;
  /** ISO interpolerad mellan prev/next ping. */
  tsIso: string;
  prevPing: CrossingPing;
  nextPing: CrossingPing;
}

const R_EARTH = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const a = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

function pointInsideCircle(lat: number, lng: number, g: CrossingGeofence): boolean {
  return haversine(lat, lng, g.lat, g.lng) <= g.radiusMeters;
}

/** Ray casting i lng/lat-plan; OK för småskala (≤ några km). */
function pointInsidePolygon(lat: number, lng: number, poly: GeoJSON.Polygon): boolean {
  const ring = poly.coordinates[0] ?? [];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isInside(lat: number, lng: number, g: CrossingGeofence): boolean {
  if (g.polygon) return pointInsidePolygon(lat, lng, g.polygon);
  return pointInsideCircle(lat, lng, g);
}

/** Binärsökning av t∈[0,1] mellan prev (utanför) och next (innanför). */
function findCrossingT(
  prev: CrossingPing,
  next: CrossingPing,
  g: CrossingGeofence,
  prevInside: boolean,
): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const lat = prev.lat + (next.lat - prev.lat) * mid;
    const lng = prev.lng + (next.lng - prev.lng) * mid;
    const inside = isInside(lat, lng, g);
    if (inside === prevInside) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function interpolate(prev: CrossingPing, next: CrossingPing, t: number) {
  const lat = prev.lat + (next.lat - prev.lat) * t;
  const lng = prev.lng + (next.lng - prev.lng) * t;
  const t0 = new Date(prev.recorded_at).getTime();
  const t1 = new Date(next.recorded_at).getTime();
  const ts = new Date(t0 + (t1 - t0) * t).toISOString();
  return { lat, lng, tsIso: ts };
}

export function computeGeofenceCrossings(
  pings: CrossingPing[],
  geofences: CrossingGeofence[],
): GeofenceCrossing[] {
  if (pings.length < 2 || geofences.length === 0) return [];
  const sorted = [...pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const out: GeofenceCrossing[] = [];
  for (const g of geofences) {
    let prevInside = isInside(sorted[0].lat, sorted[0].lng, g);
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      const curInside = isInside(cur.lat, cur.lng, g);
      if (curInside !== prevInside) {
        const prev = sorted[i - 1];
        const t = findCrossingT(prev, cur, g, prevInside);
        const { lat, lng, tsIso } = interpolate(prev, cur, t);
        out.push({
          geofenceId: g.id,
          geofenceName: g.name,
          kind: prevInside ? 'exit' : 'enter',
          lat, lng, tsIso,
          prevPing: prev,
          nextPing: cur,
        });
      }
      prevInside = curInside;
    }
  }
  return out.sort((a, b) => a.tsIso.localeCompare(b.tsIso));
}
