/**
 * Group consecutive pings that stay within a small radius into a single
 * "stay". Stays that span >= minStayMs are returned as one collapsed
 * marker (centroid + time span). All other pings are returned as
 * individual point markers.
 *
 * Pure. No DB / no React.
 */
export interface StayInput {
  recorded_at: string;
  lat: number;
  lng: number;
}

export interface StayPointMarker<T> {
  kind: 'point';
  ping: T;
}

export interface StayClusterMarker<T> {
  kind: 'stay';
  lat: number;
  lng: number;
  startIso: string;
  endIso: string;
  durationMs: number;
  pings: T[];
}

export type StayMarker<T> = StayPointMarker<T> | StayClusterMarker<T>;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GroupOptions {
  /** Max distance between consecutive pings to still count as same stay. Default 60 m. */
  radiusMeters?: number;
  /** Minimum span before a stay collapses into one marker. Default 20 min. */
  minStayMs?: number;
}

export function groupPingsByStay<T extends StayInput>(
  pings: T[],
  opts: GroupOptions = {},
): StayMarker<T>[] {
  const radius = opts.radiusMeters ?? 60;
  const minStay = opts.minStayMs ?? 20 * 60 * 1000;
  if (!pings.length) return [];

  // First, group consecutive pings whose distance to the running centroid
  // stays within `radius`.
  const groups: T[][] = [];
  let current: T[] = [pings[0]];
  let sumLat = pings[0].lat;
  let sumLng = pings[0].lng;
  for (let i = 1; i < pings.length; i++) {
    const p = pings[i];
    const centroid = { lat: sumLat / current.length, lng: sumLng / current.length };
    const d = haversineMeters(centroid, p);
    if (d <= radius) {
      current.push(p);
      sumLat += p.lat;
      sumLng += p.lng;
    } else {
      groups.push(current);
      current = [p];
      sumLat = p.lat;
      sumLng = p.lng;
    }
  }
  groups.push(current);

  // Decide per group: collapse to stay marker if span >= minStay AND has 2+ pings.
  const out: StayMarker<T>[] = [];
  for (const g of groups) {
    if (g.length >= 2) {
      const start = new Date(g[0].recorded_at).getTime();
      const end = new Date(g[g.length - 1].recorded_at).getTime();
      const span = end - start;
      if (span >= minStay) {
        const cLat = g.reduce((s, p) => s + p.lat, 0) / g.length;
        const cLng = g.reduce((s, p) => s + p.lng, 0) / g.length;
        out.push({
          kind: 'stay',
          lat: cLat,
          lng: cLng,
          startIso: g[0].recorded_at,
          endIso: g[g.length - 1].recorded_at,
          durationMs: span,
          pings: g,
        });
        continue;
      }
    }
    for (const p of g) out.push({ kind: 'point', ping: p });
  }
  return out;
}
