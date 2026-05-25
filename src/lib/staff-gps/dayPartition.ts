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
  /** För travel/gps_gap/unknown_place/idle: namn på platsen vi lämnade (om känd). */
  fromLabel?: string | null;
  /** För travel/gps_gap/unknown_place/idle: namn på platsen vi är på väg till (om känd). */
  toLabel?: string | null;
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
/**
 * Absorbera GPS-brus:
 *  1. `unknown_place` < 15 min → slukas av föregående work/private
 *     (annars av nästa work/private).
 *  2. `travel` < 10 min utan riktig destination → slukas av föregående
 *     work/private. "Riktig destination" = nästa work/private med
 *     ANNAN knownSiteId OCH ≥ 5 min vistelse.
 *  3. Två angränsande work/private med samma knownSiteId slås ihop.
 * Bevarar tidsbudget: tid flyttas alltid till absorberande block.
 */
function absorbShortNoise(input: DaySegment[]): DaySegment[] {
  const UNKNOWN_MAX_MS = 15 * 60_000;
  const TRAVEL_MAX_MS = 10 * 60_000;
  const NEW_ADDR_MIN_MS = 5 * 60_000;
  const dur = (s: DaySegment) => toMs(s.end) - toMs(s.start);
  const isStay = (s: DaySegment | undefined) =>
    !!s && (s.type === "work" || s.type === "private");

  const segs = input.map((s) => ({ ...s }));

  // Pass 1: korta unknown_place
  for (let pass = 0; pass < 50; pass++) {
    let didChange = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.type !== "unknown_place") continue;
      if (dur(s) >= UNKNOWN_MAX_MS) continue;
      const prev = segs[i - 1];
      const next = segs[i + 1];
      if (isStay(prev)) {
        prev.end = s.end;
        segs.splice(i, 1);
        didChange = true;
        break;
      }
      if (isStay(next)) {
        next.start = s.start;
        segs.splice(i, 1);
        didChange = true;
        break;
      }
    }
    if (!didChange) break;
  }

  // Pass 2: korta travel utan ny adress
  for (let pass = 0; pass < 50; pass++) {
    let didChange = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.type !== "travel") continue;
      if (dur(s) >= TRAVEL_MAX_MS) continue;
      const prev = segs[i - 1];
      if (!isStay(prev)) continue;
      const next = segs[i + 1];
      const leadsToNewAddr =
        !!next &&
        isStay(next) &&
        (next.knownSiteId ?? null) !== (prev.knownSiteId ?? null) &&
        dur(next) >= NEW_ADDR_MIN_MS;
      if (leadsToNewAddr) continue;
      prev.end = s.end;
      segs.splice(i, 1);
      didChange = true;
      break;
    }
    if (!didChange) break;
  }

  // Pass 3: slå ihop angränsande work/private på samma site
  for (let i = segs.length - 1; i > 0; i--) {
    const a = segs[i - 1];
    const b = segs[i];
    if (
      a.type === b.type &&
      isStay(a) &&
      (a.knownSiteId ?? null) === (b.knownSiteId ?? null)
    ) {
      a.end = b.end;
      segs.splice(i, 1);
    }
  }

  // Pass 4: SAME-SITE SANDWICH — stay(A) → [unknown_place|gps_gap|idle]+ → stay(A)
  // med SAMMA knownSiteId omgärdande ska kollapsas oavsett mellanblockens längd.
  // Personen lämnade aldrig geofencen (annars hade vi fått en travel-segment).
  // Enforcar mem://constraints/geofence-inside-time-authority-v1 och
  // mem://constraints/same-target-sandwich-collapse-v1.
  for (let pass = 0; pass < 50; pass++) {
    let didChange = false;
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i];
      if (!isStay(a) || !a.knownSiteId) continue;
      let j = i + 1;
      let onlyAbsorbable = true;
      while (j < segs.length) {
        const mid = segs[j];
        if (isStay(mid)) break;
        if (mid.type !== "unknown_place" && mid.type !== "gps_gap" && mid.type !== "idle") {
          onlyAbsorbable = false;
          break;
        }
        j++;
      }
      if (!onlyAbsorbable) continue;
      if (j >= segs.length) continue;
      const b = segs[j];
      if (!isStay(b) || b.knownSiteId !== a.knownSiteId) continue;
      if (j === i + 1) continue;
      a.end = b.end;
      segs.splice(i + 1, j - i);
      didChange = true;
      break;
    }
    if (!didChange) break;
  }

  return segs;
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

  let prevVisit: typeof visits[number] | null = null;
  for (const v of visits) {
    if (v._s > cursor) {
      const { type, label } = classifyGap(cursor, v._s, pings);
      segments.push({
        type, label,
        start: toIso(cursor),
        end: toIso(v._s),
        minutes: 0,
        fromLabel: prevVisit?.knownSite?.name ?? null,
        toLabel: v.knownSite?.name ?? null,
      });
    }
    pushVisit(v);
    cursor = Math.max(cursor, v._e);
    prevVisit = v;
  }
  if (cursor < winEnd) {
    const { type, label } = classifyGap(cursor, winEnd, pings);
    segments.push({
      type, label,
      start: toIso(cursor),
      end: toIso(winEnd),
      minutes: 0,
      fromLabel: prevVisit?.knownSite?.name ?? null,
      toLabel: null,
    });
  }

  // Absorbera kort GPS-brus innan minutfördelningen så summan bevaras.
  const absorbed = absorbShortNoise(segments);
  segments.length = 0;
  segments.push(...absorbed);



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
