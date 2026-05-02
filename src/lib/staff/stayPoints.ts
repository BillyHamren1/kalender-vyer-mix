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

  return clusters
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
}
