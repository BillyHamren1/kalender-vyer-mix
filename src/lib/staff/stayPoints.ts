/**
 * stayPoints — gruppera GPS-pings till diskreta "stopp" (stay points).
 *
 * Pure function. Används i admin-tidrapporten så att en handläggare ser
 * varje ställe personen faktiskt stannade till på under dagen — inte bara
 * det som råkar finnas registrerat som timer.
 *
 * Algoritm (enkel, deterministisk):
 *   • Walk pings i kronologisk ordning.
 *   • För varje ping: om avståndet till nuvarande klusters centroid
 *     ≤ `radiusMeters` → fortsätt klustret.
 *     Annars → stäng klustret och starta ett nytt.
 *   • Behåll endast kluster med varaktighet ≥ `minDurationMin`.
 *
 * Det här är medvetet enklare än K-means/DBSCAN — vi vill bara svara
 * "här stannade hen X minuter".
 */
import { haversineMeters, type Ping } from './movementDetection';

export interface StayPoint {
  start: string;            // ISO
  end: string;              // ISO
  durationMin: number;
  centre: { lat: number; lng: number };
  pingCount: number;
}

export interface StayPointOptions {
  /** Maxavstånd från klusters centroid för att räknas som samma stopp (m). */
  radiusMeters?: number;
  /** Minsta varaktighet för att räknas som ett stopp (min). */
  minDurationMin?: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

export function clusterStayPoints(
  pings: Ping[],
  opts: StayPointOptions = {},
): StayPoint[] {
  const radius = Math.max(20, opts.radiusMeters ?? 120);
  const minDur = Math.max(1, opts.minDurationMin ?? 5);

  const sorted = [...pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  if (sorted.length === 0) return [];

  type Cluster = { pings: Ping[] };
  const clusters: Cluster[] = [];
  let current: Cluster | null = null;

  const centreOf = (c: Cluster) => ({
    lat: median(c.pings.map(p => p.lat)),
    lng: median(c.pings.map(p => p.lng)),
  });

  for (const p of sorted) {
    if (!current) {
      current = { pings: [p] };
      continue;
    }
    const c = centreOf(current);
    const d = haversineMeters(c, { lat: p.lat, lng: p.lng });
    if (d <= radius) {
      current.pings.push(p);
    } else {
      clusters.push(current);
      current = { pings: [p] };
    }
  }
  if (current) clusters.push(current);

  const raw = clusters
    .map<StayPoint>(c => {
      const start = c.pings[0].recorded_at;
      const end = c.pings[c.pings.length - 1].recorded_at;
      return {
        start,
        end,
        durationMin: minutesBetween(start, end),
        centre: centreOf(c),
        pingCount: c.pings.length,
      };
    })
    .filter(s => s.durationMin >= minDur);

  // Merge consecutive stops that are at the same physical place.
  // GPS jitter / brief signal loss / urban canyons often split one real
  // visit into several clusters with centroids 200-400 m apart, sometimes
  // with brief "drive-by" clusters in between. We collapse them into one
  // visit (arrived = first start, left = last end).
  return mergeAdjacentSamePlace(raw, 500);
}

function mergeAdjacentSamePlace(stops: StayPoint[], mergeRadius: number): StayPoint[] {
  if (stops.length <= 1) return stops;
  const out: StayPoint[] = [];
  let cur = { ...stops[0] };
  for (let i = 1; i < stops.length; i++) {
    const next = stops[i];
    // Look ahead: if a later stop is at the same place as `cur`, absorb
    // both `next` and that later stop into `cur` (the in-between stop was
    // a brief detour).
    const dDirect = haversineMeters(cur.centre, next.centre);
    let mergeUpTo = -1;
    if (dDirect <= mergeRadius) {
      mergeUpTo = i;
    } else {
      for (let j = i + 1; j < Math.min(stops.length, i + 3); j++) {
        if (haversineMeters(cur.centre, stops[j].centre) <= mergeRadius) {
          mergeUpTo = j;
          break;
        }
      }
    }

    if (mergeUpTo >= i) {
      const last = stops[mergeUpTo];
      cur = {
        start: cur.start,
        end: last.end,
        durationMin: minutesBetween(cur.start, last.end),
        centre: cur.centre,
        pingCount: cur.pingCount + stops.slice(i, mergeUpTo + 1).reduce((s, x) => s + x.pingCount, 0),
      };
      i = mergeUpTo;
    } else {
      out.push(cur);
      cur = { ...next };
    }
  }
  out.push(cur);
  return out;
}
