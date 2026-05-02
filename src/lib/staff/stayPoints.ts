/**
 * stayPoints — bygg "fysiska besök" från råa GPS-pings.
 *
 * Tidigare implementation byggde först små kluster via en växande centroid
 * och försökte sedan slå ihop dem. Det gjorde att samma vistelse splittrades
 * i 2–3 rader så fort signalen blinkade.
 *
 * Den här versionen jobbar i två steg direkt på pings:
 *
 *   1. Walk pings i kronologisk ordning. Håll en "ankarpunkt" för pågående
 *      besök. En ping inom `radiusMeters` från ankaret räknas som "hemma".
 *      När pings börjar hamna utanför ankaret samlas de i en pendingAway-
 *      buffert. Först när pendingAway både hållit i sig länge nog och
 *      stabiliserats kring en NY plats avslutas det gamla besöket och ett
 *      nytt startas. Singel-bortskott räknas som GPS-brus och kastas.
 *
 *   2. Filtrera bort besök kortare än `minDurationMin`. Slå sedan ihop
 *      direkt angränsande besök om de ligger inom `mergeRadiusMeters` från
 *      varandra. Eftersom ett "annat ställe" emellan i steg 1 i sig hade
 *      blivit ett eget besök, betyder adjacency här att personen inte
 *      faktiskt åkte någon annanstans däremellan — bara att signalen
 *      tappades en stund. Då är det samma fysiska vistelse.
 */
import { haversineMeters, type Ping } from './movementDetection';

export interface StayPoint {
  start: string;            // ISO – första ping i besöket
  end: string;              // ISO – sista ping i besöket
  durationMin: number;
  centre: { lat: number; lng: number };
  pingCount: number;
}

export interface StayPointOptions {
  /** Max avstånd från ankarpunkten för att räknas som "samma plats" (m). */
  radiusMeters?: number;
  /** Minsta varaktighet för att räknas som ett besök (min). */
  minDurationMin?: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

const minutesBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

const centreOfPings = (pings: Ping[]) => ({
  lat: median(pings.map(p => p.lat)),
  lng: median(pings.map(p => p.lng)),
});

interface Visit {
  pings: Ping[];
  anchor: { lat: number; lng: number };
}

const toStayPoint = (v: Visit): StayPoint => {
  const start = v.pings[0].recorded_at;
  const end = v.pings[v.pings.length - 1].recorded_at;
  return {
    start,
    end,
    durationMin: minutesBetween(start, end),
    centre: centreOfPings(v.pings),
    pingCount: v.pings.length,
  };
};

export function clusterStayPoints(
  pings: Ping[],
  opts: StayPointOptions = {},
): StayPoint[] {
  const radius = Math.max(40, opts.radiusMeters ?? 250);
  const minDur = Math.max(1, opts.minDurationMin ?? 5);

  // Hur länge "borta från ankaret" måste hålla i sig (i både tid OCH antal
  // pings) innan vi accepterar att personen lämnat platsen. Det här är det
  // som gör logiken tålig mot enstaka GPS-spikes och korta blinkningar.
  const CONFIRM_AWAY_PINGS = 2;
  const CONFIRM_AWAY_MIN = 2;

  const sorted = [...pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  if (sorted.length === 0) return [];

  const visits: Visit[] = [];
  let current: Visit | null = null;
  let pendingAway: Ping[] = [];

  const startVisit = (seed: Ping[]) => {
    current = {
      pings: [...seed],
      anchor: centreOfPings(seed),
    };
  };

  const closeCurrent = () => {
    if (current) visits.push(current);
    current = null;
  };

  const refreshAnchor = () => {
    if (!current) return;
    // Använd median av de senaste ~10 pingarna så ankaret följer faktisk
    // position på platsen utan att dras iväg av enstaka utskott.
    const tail = current.pings.slice(-10);
    current.anchor = centreOfPings(tail);
  };

  for (const p of sorted) {
    if (!current) {
      startVisit([p]);
      continue;
    }

    const dist = haversineMeters(current.anchor, { lat: p.lat, lng: p.lng });

    if (dist <= radius) {
      // Tillbaka inom ankaret — eventuella tidigare "borta"-pings var brus.
      // Lägg till dem ändå (de hör tidsmässigt till samma vistelse), men
      // räkna dem inte som platsbyte.
      if (pendingAway.length > 0) {
        current.pings.push(...pendingAway);
        pendingAway = [];
      }
      current.pings.push(p);
      refreshAnchor();
      continue;
    }

    // Pingen ligger utanför ankaret — kandidat för platsbyte.
    pendingAway.push(p);

    const awayDurationMin = pendingAway.length > 1
      ? minutesBetween(pendingAway[0].recorded_at, pendingAway[pendingAway.length - 1].recorded_at)
      : 0;

    const awayCentre = centreOfPings(pendingAway);
    const awaySpread = pendingAway.length > 1
      ? Math.max(...pendingAway.map(q => haversineMeters(awayCentre, { lat: q.lat, lng: q.lng })))
      : 0;

    const stableElsewhere =
      pendingAway.length >= CONFIRM_AWAY_PINGS &&
      awayDurationMin >= CONFIRM_AWAY_MIN &&
      awaySpread <= radius;

    if (stableElsewhere) {
      // Personen är nu på en ny plats. Stäng nuvarande besök och starta
      // ett nytt med pendingAway-pingsen som frö.
      closeCurrent();
      startVisit(pendingAway);
      pendingAway = [];
    }
    // Annars: vänta in fler pings för att avgöra om det är riktigt eller brus.
  }

  if (current) {
    if (pendingAway.length > 0) {
      // Hängande "borta"-pings i slutet av dagen — de hör logiskt till sista
      // besöket om de inte stabiliserats någon annanstans.
      current.pings.push(...pendingAway);
      pendingAway = [];
    }
    closeCurrent();
  }

  // Filtrera bort för korta besök innan ihop-slagningen, så att enstaka
  // mikro-besök som ändå smet igenom inte hindrar samma-plats-merge.
  const meaningful = visits
    .map(toStayPoint)
    .filter(s => s.durationMin >= minDur);

  return mergeAdjacentSamePlace(meaningful, Math.max(300, radius * 1.4));
}

function mergeAdjacentSamePlace(stops: StayPoint[], mergeRadiusMeters: number): StayPoint[] {
  if (stops.length <= 1) return stops;

  const out: StayPoint[] = [];
  let cur = { ...stops[0] };

  for (let i = 1; i < stops.length; i++) {
    const next = stops[i];
    const samePlace = haversineMeters(cur.centre, next.centre) <= mergeRadiusMeters;

    if (samePlace) {
      // Slå ihop. Inget annat meningsfullt besök ligger emellan (det hade
      // i så fall blivit en egen rad här), så gapet är bara signalbortfall.
      const totalPings = cur.pingCount + next.pingCount;
      cur = {
        start: cur.start,
        end: next.end,
        durationMin: minutesBetween(cur.start, next.end),
        centre: {
          lat: (cur.centre.lat * cur.pingCount + next.centre.lat * next.pingCount) / totalPings,
          lng: (cur.centre.lng * cur.pingCount + next.centre.lng * next.pingCount) / totalPings,
        },
        pingCount: totalPings,
      };
    } else {
      out.push(cur);
      cur = { ...next };
    }
  }
  out.push(cur);
  return out;
}
