// @ts-nocheck
// segmentChain.ts
// ----------------------------------------------------------------------------
// Central segment chain for the workday.
//
// Tar färdiga segment (från time_reports, travel_logs, location_time_entries,
// breaks, manuella avdrag) + GPS-pings + workday-fönstret och fyller IGEN
// glappen inom arbetsdagen med ETT av:
//
//   - transport     : pings rör sig (>SPEED tröskel) mellan två kända platser
//   - other_place   : pings står stilla på okänd plats inom arbetsdagen
//   - signal_stale  : inga (eller för få) pings i glappet — saknad signal,
//                     inte ett glapp i arbetet
//
// Regler (matchar prompt):
//   * känd arbetsplats = confirmed_work / warehouse  (kommer redan från LTE)
//   * lager  = warehouse                              (LTE mot organization_locations.is_work)
//   * bil/rörelse mellan två platser inom workday = transport
//   * okänd plats inom workday = other_place
//   * saknad ping = signal_stale, INTE "glapp"
//   * rast skapas ALDRIG av denna fil (bara user/admin-attest)
//   * ingen tid dras av automatiskt (alla gap-segment har affectsPayableTime=false)
//
// Pure module — ingen I/O. Anropas från staff-day-status.ts.
// ----------------------------------------------------------------------------

export interface ChainPing {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
}

export interface ChainSegmentLite {
  id: string;
  type: string;        // SegmentType (string för att undvika cyklisk import)
  startedAt: string;
  endedAt: string | null;
  hasConfirmedRef?: boolean;
}

export interface ChainGapSegment {
  id: string;
  type: "transport" | "other_place" | "signal_stale";
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  label: string;
  source: "segment_chain";
  confidence: "low" | "medium";
  affectsPayableTime: false;
  requiresUserInput: boolean;
  metadata: Record<string, unknown>;
  refs: Record<string, never>;
  hasConfirmedRef: false;
  classification: null;
  policyStatus: "other_place" | "travel_within_workday" | "unknown_needs_review";
  pingsInGap: number;
  startNeighborConfirmed: boolean;
  endNeighborConfirmed: boolean;
}

const MS_MIN = 60_000;
const MIN_GAP_MIN = 3;                 // ignorera mikro-luckor
const STALE_MAX_PINGS = 1;             // ≤1 ping i hela glappet → stale
const TRANSPORT_MIN_DISPLACEMENT_M = 400;
const TRANSPORT_MIN_AVG_KMH = 6;       // > rask gång → transport

function ms(iso: string | null | undefined): number {
  return iso ? new Date(iso).getTime() : NaN;
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function classifyGap(
  startMs: number,
  endMs: number,
  pings: ChainPing[],
  startConfirmed: boolean,
  endConfirmed: boolean,
): { type: ChainGapSegment["type"]; meta: Record<string, unknown> } {
  const inWindow = pings.filter((p) => {
    const t = ms(p.recorded_at);
    return t >= startMs && t <= endMs;
  });
  const durMin = Math.max(1, Math.round((endMs - startMs) / MS_MIN));

  if (inWindow.length <= STALE_MAX_PINGS) {
    return { type: "signal_stale", meta: { pings: inWindow.length, reason: "no_or_single_ping_in_gap" } };
  }

  // Compute total path length + net displacement
  let totalM = 0;
  for (let i = 1; i < inWindow.length; i++) {
    totalM += haversine(inWindow[i - 1], inWindow[i]);
  }
  const netM = haversine(inWindow[0], inWindow[inWindow.length - 1]);
  const avgKmh = (totalM / 1000) / Math.max(0.01, durMin / 60);

  const looksLikeMovement =
    netM >= TRANSPORT_MIN_DISPLACEMENT_M && avgKmh >= TRANSPORT_MIN_AVG_KMH;

  // Bil/rörelse mellan två platser inom workday = transport.
  // Vi kräver att MINST en av sidorna är confirmed (annars är det bara
  // strö-rörelse mellan okända platser → other_place).
  if (looksLikeMovement && (startConfirmed || endConfirmed)) {
    return {
      type: "transport",
      meta: {
        pings: inWindow.length,
        path_m: Math.round(totalM),
        net_m: Math.round(netM),
        avg_kmh: Math.round(avgKmh * 10) / 10,
        reason: "movement_between_known_places",
      },
    };
  }

  return {
    type: "other_place",
    meta: {
      pings: inWindow.length,
      net_m: Math.round(netM),
      avg_kmh: Math.round(avgKmh * 10) / 10,
      reason: "stationary_or_unknown",
    },
  };
}

/**
 * Fyll IGEN glapp inom workday med transport / other_place / signal_stale.
 * Returnerar ENDAST de nya gap-segmenten — caller mergar in dem och sorterar.
 */
export function buildSegmentChainGaps(args: {
  workday: { startedAt: string; endedAt: string | null } | null;
  segments: ChainSegmentLite[];
  pings: ChainPing[];
  now: Date;
}): ChainGapSegment[] {
  const { workday, segments, pings, now } = args;
  if (!workday) return [];

  const wdStart = ms(workday.startedAt);
  const wdEnd = workday.endedAt ? ms(workday.endedAt) : now.getTime();
  if (!isFinite(wdStart) || wdEnd <= wdStart) return [];

  // Bygg kronologisk lista av "occupancy" inom workday (klippt mot fönstret).
  // Hoppa över null-längd / break / manual_adjustment (de äter ingen klocktid).
  const skipTypes = new Set(["break", "manual_adjustment"]);
  const occ = segments
    .filter((s) => !skipTypes.has(s.type))
    .map((s) => {
      const a = Math.max(wdStart, ms(s.startedAt));
      const b = Math.min(wdEnd, s.endedAt ? ms(s.endedAt) : wdEnd);
      return { a, b, confirmed: !!s.hasConfirmedRef, type: s.type };
    })
    .filter((o) => isFinite(o.a) && isFinite(o.b) && o.b > o.a)
    .sort((x, y) => x.a - y.a);

  // Merge overlap för att hitta verkliga "free intervals" inom workday.
  const merged: Array<{ a: number; b: number; startConfirmed: boolean; endConfirmed: boolean }> = [];
  for (const o of occ) {
    const last = merged[merged.length - 1];
    if (last && o.a <= last.b) {
      if (o.b > last.b) {
        last.b = o.b;
        last.endConfirmed = o.confirmed;
      }
    } else {
      merged.push({ a: o.a, b: o.b, startConfirmed: o.confirmed, endConfirmed: o.confirmed });
    }
  }

  const gaps: Array<{ a: number; b: number; startConfirmed: boolean; endConfirmed: boolean }> = [];
  let cursor = wdStart;
  let prevConfirmed = false;
  for (const m of merged) {
    if (m.a > cursor) {
      gaps.push({ a: cursor, b: m.a, startConfirmed: prevConfirmed, endConfirmed: m.startConfirmed });
    }
    cursor = Math.max(cursor, m.b);
    prevConfirmed = m.endConfirmed;
  }
  if (wdEnd > cursor) {
    gaps.push({ a: cursor, b: wdEnd, startConfirmed: prevConfirmed, endConfirmed: false });
  }

  const out: ChainGapSegment[] = [];
  for (const g of gaps) {
    const durMin = Math.round((g.b - g.a) / MS_MIN);
    if (durMin < MIN_GAP_MIN) continue;
    const cls = classifyGap(g.a, g.b, pings, g.startConfirmed, g.endConfirmed);
    const startedAt = new Date(g.a).toISOString();
    const endedAt = new Date(g.b).toISOString();
    const policyStatus =
      cls.type === "transport" ? "travel_within_workday"
      : cls.type === "signal_stale" ? "unknown_needs_review"
      : "other_place";
    const label =
      cls.type === "transport" ? "Transport"
      : cls.type === "signal_stale" ? "Saknad GPS-signal"
      : "Annan plats";
    out.push({
      id: `chain-${g.a}-${g.b}-${cls.type}`,
      type: cls.type,
      startedAt,
      endedAt,
      durationMinutes: durMin,
      label,
      source: "segment_chain",
      confidence: cls.type === "transport" ? "medium" : "low",
      affectsPayableTime: false,
      requiresUserInput: cls.type !== "signal_stale",
      metadata: cls.meta,
      refs: {} as Record<string, never>,
      hasConfirmedRef: false,
      classification: null,
      policyStatus,
      pingsInGap: Number(cls.meta.pings ?? 0),
      startNeighborConfirmed: g.startConfirmed,
      endNeighborConfirmed: g.endConfirmed,
    });
  }
  return out;
}
