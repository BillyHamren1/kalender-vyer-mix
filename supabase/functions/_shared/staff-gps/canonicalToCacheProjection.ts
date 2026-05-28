// canonicalToCacheProjection.ts
// =============================================================================
// Time report mirrors GPS week summary 1:1.
//
// Tidrapport-cache (staff_day_report_cache.summary_json +
// report_candidate_blocks_json) får ALDRIG byggas från någon annan motor än
// `buildCanonicalStaffDayGpsResult`. Den här filen är den enda projektionen
// från canonical → cache-shape som tidrapportsidan läser.
//
// Helt pure — inga DB-anrop, ingen tidsomräkning. Speglar GPS-veckovyns
// totals och segment direkt så att admin-vyn visar exakt samma "Arbete",
// "Resa", "FA Warehouse → Swedish game fair"-rader som bilden i appens
// GPS-veckosammanfattning.

import type {
  CanonicalSegment,
  CanonicalStaffDayGpsResult,
} from "./canonicalStaffDayGpsResult.ts";

export interface CacheSummaryFromCanonical {
  source: "canonical_gps_day_v1";
  pingCount: number;
  reportBlocks: number;
  /** "Arbete + Resa" — det som tidrapportcellen visar och som vinner som godkännbar tid. */
  payableMinutes: number;
  /** Samma värde som payable — UI-läsare som faller tillbaka på workMinutes ska få totalsumman. */
  workMinutes: number;
  /** Ren GPS-arbete (kända platser). */
  workOnlyMinutes: number;
  travelMinutes: number;
  privateMinutes: number;
  unknownMinutes: number;
  gpsGapMinutes: number;
  idleMinutes: number;
  visibleWindowMinutes: number;
  grossWorkdayMinutes: number;
  firstIso: string | null;
  lastIso: string | null;
  totalMinutes: number;
  /** Ingen rast härleds — GPS-vyn räknar ingen. */
  breakMinutes: 0;
}

export interface CacheBlockFromCanonical {
  id: string;
  /** Tidrapport-cellen mappar "work" → räknas som arbete, "travel" → "Resa". */
  kind: "work" | "travel" | "unknown" | "gap" | "private" | "idle";
  type: CanonicalSegment["type"];
  classification: CanonicalSegment["type"];
  start: string;
  end: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  minutes: number;
  /** Visningsetikett — "FA Warehouse" eller "Resa FA Warehouse → Swedish game fair". */
  label: string;
  displayLabel: string;
  targetLabel: string;
  targetType: CanonicalSegment["targetType"];
  targetId: string | null;
  knownSiteId: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  confidence: CanonicalSegment["confidence"];
  warningReasons: string[];
  source: "canonical_gps_day_v1";
}

function buildLabel(seg: CanonicalSegment): string {
  if (seg.type === "travel") {
    const from = seg.fromLabel?.trim();
    const to = seg.toLabel?.trim();
    if (from && to) return `Resa ${from} → ${to}`;
    if (from) return `Resa från ${from}`;
    if (to) return `Resa till ${to}`;
    return "Resa";
  }
  if (seg.type === "gps_gap") return "GPS-glapp";
  if (seg.type === "unknown_place") {
    const label = seg.label?.trim();
    return label && label.length > 0 ? label : "Okänd plats";
  }
  if (seg.type === "idle") return seg.label?.trim() || "Inaktiv";
  if (seg.type === "private") return seg.label?.trim() || "Privat";
  return seg.label?.trim() || "Arbete";
}

function kindFor(seg: CanonicalSegment): CacheBlockFromCanonical["kind"] {
  switch (seg.type) {
    case "work": return "work";
    case "travel": return "travel";
    case "gps_gap": return "gap";
    case "private": return "private";
    case "idle": return "idle";
    case "unknown_place":
    default: return "unknown";
  }
}

/**
 * Projicera canonical-segment → cache-block. En till en, ingen filtrering.
 */
export function canonicalToCacheBlocks(
  canonical: CanonicalStaffDayGpsResult,
): CacheBlockFromCanonical[] {
  return canonical.segments.map((seg) => {
    const label = buildLabel(seg);
    return {
      id: seg.id,
      kind: kindFor(seg),
      type: seg.type,
      classification: seg.type,
      start: seg.startIso,
      end: seg.endIso,
      startAt: seg.startIso,
      endAt: seg.endIso,
      durationMinutes: seg.durationMinutes,
      minutes: seg.durationMinutes,
      label,
      displayLabel: label,
      targetLabel: label,
      targetType: seg.targetType,
      targetId: seg.targetId,
      knownSiteId: seg.knownSiteId,
      fromLabel: seg.fromLabel,
      toLabel: seg.toLabel,
      confidence: seg.confidence,
      warningReasons: seg.warningReasons,
      source: "canonical_gps_day_v1",
    };
  });
}

/**
 * Projicera canonical-totals → cache-summary. workMinutes och payableMinutes
 * sätts till samma "Arbete + Resa"-summa så att admin-vyns talcell visar
 * exakt det som GPS-veckosammanfattningen visar längst till höger ("11h 11m").
 */
export function canonicalToCacheSummary(
  canonical: CanonicalStaffDayGpsResult,
  extras: { pingCount: number } = { pingCount: canonical.debug.pingsCount },
): CacheSummaryFromCanonical {
  const t = canonical.totals;
  const payable = t.payableSuggestionMinutes;
  return {
    source: "canonical_gps_day_v1",
    pingCount: extras.pingCount,
    reportBlocks: canonical.segments.length,
    payableMinutes: payable,
    workMinutes: payable,
    workOnlyMinutes: t.workMinutes,
    travelMinutes: t.travelMinutes,
    privateMinutes: t.privateMinutes,
    unknownMinutes: t.unknownMinutes,
    gpsGapMinutes: t.gpsGapMinutes,
    idleMinutes: t.idleMinutes,
    visibleWindowMinutes: t.visibleWindowMinutes,
    grossWorkdayMinutes: t.grossWorkdayMinutes,
    firstIso: canonical.firstIso,
    lastIso: canonical.lastIso,
    totalMinutes: payable,
    breakMinutes: 0,
  };
}
