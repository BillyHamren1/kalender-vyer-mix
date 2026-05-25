// dayPartition.ts (Deno)
// =======================
// Pure helper. Partitionerar dagens fönster [firstIso, lastIso] i icke-överlappande
// segment som täcker varje millisekund: work / private / travel / unknown_place /
// gps_gap / idle. Summan av segmenten === windowMs (matematiskt invariant).
//
// Detta är det enda stället där "var var personen mellan visit A och B?" får
// klassificeras. Användare ska aldrig se försvunna minuter.
//
// Speglas i src/lib/staff-gps/dayPartition.ts — håll filerna identiska bortsett
// från typ-importerna.

export interface PartitionPing {
  recorded_at: string;
  lat: number;
  lng: number;
}

export interface PartitionVisit {
  start: string;
  end: string;
  knownSite: { id: string; name: string } | null;
}

export type SegmentType =
  | "work"
  | "private"
  | "travel"
  | "unknown_place"
  | "gps_gap"
  | "idle";

export interface DaySegment {
  type: SegmentType;
  label: string;
  start: string; // ISO
  end: string;   // ISO
  minutes: number;
  knownSiteId?: string | null;
}

export interface DayPartition {
  firstIso: string | null;
  lastIso: string | null;
  windowMin: number;
  segments: DaySegment[];
  workMin: number;
  privateMin: number;
  travelMin: number;
  unknownMin: number;
  gapMin: number;
  idleMin: number;
  /** Tid uppdelad per arbetsplats (knownSiteId), summa i minuter. */
  placeMinutes: Array<{ id: string; name: string; minutes: number }>;
}

const GPS_GAP_MIN_MS = 5 * 60_000;        // > 5 min utan pings = gps_gap
const TRAVEL_DISPLACEMENT_M = 500;        // egna rörelse ≥ 500m → travel
const IDLE_MAX_MS = 2 * 60_000;           // < 2 min mellan visits = idle

function toMs(iso: string): number { return new Date(iso).getTime(); }
function toIso(ms: number): string { return new Date(ms).toISOString(); }

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
}

function classifyGap(
  startMs: number,
  endMs: number,
  pings: PartitionPing[],
): { type: SegmentType; label: string } {
  const span = endMs - startMs;
  if (span <= 0) return { type: "idle", label: "Övergång" };
  if (span < IDLE_MAX_MS) return { type: "idle", label: "Övergång" };

  // Inkludera kant-pings (≥start, ≤end) så rörelse mellan visits hittas
  // även när displacement-pingarna ligger exakt på visitgränserna.
  const inGap = pings.filter((p) => {
    const t = toMs(p.recorded_at);
    return t >= startMs && t <= endMs;
  });

  // Räkna pings som STRIKT ligger inne i gapet för glapp-detektion.
  const strictInGap = inGap.filter((p) => {
    const t = toMs(p.recorded_at);
    return t > startMs && t < endMs;
  });

  if (strictInGap.length === 0 && span > GPS_GAP_MIN_MS) {
    return { type: "gps_gap", label: "GPS-glapp" };
  }

  // Compute max displacement över alla par
  let maxDist = 0;
  for (let i = 0; i < inGap.length; i++) {
    for (let j = i + 1; j < inGap.length; j++) {
      const d = haversineMeters(inGap[i], inGap[j]);
      if (d > maxDist) maxDist = d;
    }
  }
  if (maxDist >= TRAVEL_DISPLACEMENT_M) return { type: "travel", label: "Resa" };
  if (strictInGap.length === 0) return { type: "gps_gap", label: "GPS-glapp" };
  return { type: "unknown_place", label: "Okänd plats" };
}


export function buildDayPartition(input: {
  pings: PartitionPing[];
  visits: PartitionVisit[];
  privateGeofenceIds: string[];
}): DayPartition {
  const privateIds = new Set(input.privateGeofenceIds);
  const pings = [...input.pings].sort(
    (a, b) => toMs(a.recorded_at) - toMs(b.recorded_at),
  );
  if (pings.length === 0) {
    return {
      firstIso: null,
      lastIso: null,
      windowMin: 0,
      segments: [],
      workMin: 0,
      privateMin: 0,
      travelMin: 0,
      unknownMin: 0,
      gapMin: 0,
      idleMin: 0,
      placeMinutes: [],
    };
  }

  const firstIso = pings[0].recorded_at;
  const lastIso = pings[pings.length - 1].recorded_at;
  const winStart = toMs(firstIso);
  const winEnd = toMs(lastIso);

  // Sort + clamp visits to window. Drop zero-length.
  const visits = [...input.visits]
    .map((v) => {
      const s = Math.max(winStart, toMs(v.start));
      const e = Math.min(winEnd, toMs(v.end));
      return { ...v, _s: s, _e: e };
    })
    .filter((v) => v._e > v._s)
    .sort((a, b) => a._s - b._s);

  // Boundary fix: when visit B starts exactly where visit A ends, give the
  // boundary millisecond to B. Ensures sum(visits) never double-counts.
  for (let i = 1; i < visits.length; i++) {
    if (visits[i]._s <= visits[i - 1]._e) {
      visits[i - 1]._e = Math.max(visits[i - 1]._s, visits[i]._s - 1);
    }
  }

  const segments: DaySegment[] = [];
  let cursor = winStart;

  const pushVisit = (v: typeof visits[number]) => {
    const isPrivate = v.knownSite ? privateIds.has(v.knownSite.id) : false;
    const label = v.knownSite?.name ?? (isPrivate ? "Privat zon" : "Okänd plats");
    segments.push({
      type: isPrivate ? "private" : v.knownSite ? "work" : "unknown_place",
      label,
      start: toIso(v._s),
      end: toIso(v._e),
      minutes: 0, // fyllt nedan
      knownSiteId: v.knownSite?.id ?? null,
    });
  };

  for (const v of visits) {
    if (v._s > cursor) {
      const { type, label } = classifyGap(cursor, v._s, pings);
      segments.push({
        type, label,
        start: toIso(cursor),
        end: toIso(v._s),
        minutes: 0,
      });
    }
    pushVisit(v);
    cursor = Math.max(cursor, v._e);
  }
  if (cursor < winEnd) {
    const { type, label } = classifyGap(cursor, winEnd, pings);
    segments.push({
      type, label,
      start: toIso(cursor),
      end: toIso(winEnd),
      minutes: 0,
    });
  }

  // Single rounding pass (ms → minutes), preserving partition exactness:
  // distribute window minutes with largest-remainder so sum(minutes) === windowMin.
  const windowMs = winEnd - winStart;
  const windowMin = Math.max(0, Math.round(windowMs / 60_000));

  const rawMinutes = segments.map((s) => (toMs(s.end) - toMs(s.start)) / 60_000);
  const floors = rawMinutes.map((m) => Math.floor(m));
  let used = floors.reduce((a, b) => a + b, 0);
  const remainders = rawMinutes
    .map((m, i) => ({ i, frac: m - Math.floor(m) }))
    .sort((a, b) => b.frac - a.frac);
  let r = 0;
  while (used < windowMin && r < remainders.length) {
    floors[remainders[r].i] += 1;
    used += 1;
    r += 1;
  }
  segments.forEach((s, i) => { s.minutes = floors[i]; });

  // Buckets
  let workMin = 0, privateMin = 0, travelMin = 0, unknownMin = 0, gapMin = 0, idleMin = 0;
  const byPlace = new Map<string, { id: string; name: string; minutes: number }>();
  for (const s of segments) {
    switch (s.type) {
      case "work":
        workMin += s.minutes;
        if (s.knownSiteId) {
          const cur = byPlace.get(s.knownSiteId);
          if (cur) cur.minutes += s.minutes;
          else byPlace.set(s.knownSiteId, { id: s.knownSiteId, name: s.label, minutes: s.minutes });
        }
        break;
      case "private": privateMin += s.minutes; break;
      case "travel": travelMin += s.minutes; break;
      case "unknown_place": unknownMin += s.minutes; break;
      case "gps_gap": gapMin += s.minutes; break;
      case "idle": idleMin += s.minutes; break;
    }
  }

  return {
    firstIso,
    lastIso,
    windowMin,
    segments,
    workMin,
    privateMin,
    travelMin,
    unknownMin,
    gapMin,
    idleMin,
    placeMinutes: Array.from(byPlace.values()).sort((a, b) => b.minutes - a.minutes),
  };
}
