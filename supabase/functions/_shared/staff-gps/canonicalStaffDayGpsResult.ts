// canonicalStaffDayGpsResult.ts
// =============================================================================
// CANONICAL GPS DAY PIPELINE — Etapp 1.
//
// EN plats där dagen byggs från rådata. Alla läsare (GPS-satellitkartan, appens
// dagrapport, appens veckovy, admin/tidrapport, submission, payroll) ska
// konsumera detta resultat — INTE bygga egna kopior.
//
// Bygger ovanpå befintlig kedja (inga schemaändringar):
//   getOrBuildDaySnapshot → snapshot.visits (clampade till in/ut-pings)
//     → buildDayPartition (work/private/travel/unknown/gap/idle)
//     → summarizeVisibleWindow (non-private fönster)
//
// Geofence-clamp-regel lever bara här. Tid inne i geofence motsvarar exakt
// visitens start–end (första→sista ping inne i fencen). Ingen logik som råkar
// expandera arbetsblock till hela dygnet får läggas till någon annanstans.
//
// Helt SIDE-EFFECT-FRI bortom snapshot-cachen som getOrBuildDaySnapshot redan
// underhåller. Inga skrivningar till time_reports/workdays/LTE/travel/etc.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getOrBuildDaySnapshot,
  type DaySnapshot,
  type PingRow,
  type VisitRow,
} from "./snapshotCache.ts";
import {
  buildDayPartition,
  type DaySegment,
  type SegmentType,
} from "./dayPartition.ts";
import { summarizeVisibleWindow } from "./visibleWindow.ts";
import { stockholmDayWindowUtc } from "./dayWindow.ts";

export const CANONICAL_VERSION = "canonical_staff_day_gps_result_v1";
export const CANONICAL_POLICY_VERSION = "canonical_payable_v1";
export const CANONICAL_SOURCE = "staff_gps_day_pipeline";

export interface CanonicalDayWindow {
  timezone: "Europe/Stockholm";
  startIso: string;
  endIso: string;
}

export interface CanonicalTotals {
  visibleWindowMinutes: number;
  workMinutes: number;
  travelMinutes: number;
  privateMinutes: number;
  unknownMinutes: number;
  gpsGapMinutes: number;
  idleMinutes: number;
  /** Wallclock-fönster (window) inkl. privata. Används som "brutto arbetsdag-kandidat". */
  grossWorkdayMinutes: number;
  /** Föreslagen lönegrundande tid: work + travel. */
  payableSuggestionMinutes: number;
}

export interface CanonicalSegment {
  id: string;
  type: SegmentType;
  label: string;
  startIso: string;
  endIso: string;
  durationMinutes: number;
  targetType: "known_site" | "private_zone" | "transport" | "unknown_place" | "gps_gap" | "idle";
  targetId: string | null;
  knownSiteId: string | null;
  confidence: "high" | "medium" | "low";
  warningReasons: string[];
  source: "gps_partition";
  /** För travel/gps_gap/unknown_place: namn på föregående känd plats (om finns). */
  fromLabel: string | null;
  /** För travel/gps_gap/unknown_place: namn på nästa kända plats (om finns). */
  toLabel: string | null;
}

export interface CanonicalGeofenceVisit {
  id: string;
  label: string;
  knownSiteId: string;
  startIso: string;
  endIso: string;
  durationMinutes: number;
  pingCount: number;
  /** Hur vi clampade visitens tidsfönster (alltid exakta in/ut-pings i denna version). */
  clampSource: "exact_inside_pings";
}

export interface CanonicalMapPing {
  id: string;
  lat: number;
  lng: number;
  recordedAt: string;
  accuracy: number | null;
}

export interface CanonicalMap {
  pings: CanonicalMapPing[];
  routeLine: Array<{ lat: number; lng: number; recordedAt: string }>;
  startPoint: { lat: number; lng: number; recordedAt: string } | null;
  endPoint: { lat: number; lng: number; recordedAt: string } | null;
}

export interface CanonicalPayrollSuggestion {
  payableMinutes: number;
  excludedMinutes: number;
  includedSegmentIds: string[];
  excludedSegmentIds: string[];
  policyVersion: string;
}

export interface CanonicalDebug {
  pingsCount: number;
  segmentCount: number;
  geofenceVisitCount: number;
  sourceSnapshotId: string;
  cacheHit: boolean;
  builtAt: string;
  warnings: string[];
}

export interface CanonicalStaffDayGpsResult {
  version: typeof CANONICAL_VERSION;
  source: typeof CANONICAL_SOURCE;
  organizationId: string;
  staffId: string;
  date: string;
  dayWindow: CanonicalDayWindow;
  firstIso: string | null;
  lastIso: string | null;
  totals: CanonicalTotals;
  segments: CanonicalSegment[];
  geofenceVisits: CanonicalGeofenceVisit[];
  map: CanonicalMap;
  payrollSuggestion: CanonicalPayrollSuggestion;
  debug: CanonicalDebug;
}

function segmentId(seg: DaySegment, idx: number): string {
  return `${seg.type}:${seg.start}:${idx}`;
}

function targetTypeFor(seg: DaySegment): CanonicalSegment["targetType"] {
  switch (seg.type) {
    case "work": return "known_site";
    case "private": return "private_zone";
    case "travel": return "transport";
    case "unknown_place": return "unknown_place";
    case "gps_gap": return "gps_gap";
    case "idle": return "idle";
  }
}

function confidenceFor(seg: DaySegment): "high" | "medium" | "low" {
  if (seg.type === "work" || seg.type === "private") return "high";
  if (seg.type === "travel") return "medium";
  return "low";
}

function warningReasonsFor(seg: DaySegment): string[] {
  const out: string[] = [];
  if (seg.type === "gps_gap") out.push("gps_gap_in_window");
  if (seg.type === "unknown_place") out.push("unknown_place");
  return out;
}

function toMapPings(pings: PingRow[]): CanonicalMapPing[] {
  return pings.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    recordedAt: p.recorded_at,
    accuracy: p.accuracy,
  }));
}

/**
 * Bygger canonical result från befintliga snapshot/visits/partition.
 * Pure transform — testbar utan DB.
 */
export function projectCanonicalResult(input: {
  organizationId: string;
  staffId: string;
  date: string;
  snapshot: DaySnapshot;
  cacheHit: boolean;
}): CanonicalStaffDayGpsResult {
  const { organizationId, staffId, date, snapshot, cacheHit } = input;
  const dayWindowUtc = stockholmDayWindowUtc(date);
  const warnings: string[] = [];

  // ── Partition (matchar exakt det GPS-satellitkartan/admin-veckovyn använder)
  const partition = buildDayPartition({
    pings: snapshot.pings,
    visits: snapshot.visits.map((v) => ({
      start: v.start,
      end: v.end,
      knownSite: v.knownSite,
    })),
    privateGeofenceIds: snapshot.privateGeofenceIds,
  });

  // ── Visible window: första/sista ping UTANFÖR privata zoner.
  // (Exakt samma regel som get-staff-gps-week-summary; hemvistelser flyttar inte
  // dagens fönster.)
  const privateIds = new Set(snapshot.privateGeofenceIds);
  const privatePingIds = new Set<string>();
  for (const v of snapshot.visits) {
    if (v.knownSite && privateIds.has(v.knownSite.id)) {
      for (const p of v.pings) privatePingIds.add(p.id);
    }
  }
  const nonPrivate = snapshot.pings.filter((p) => !privatePingIds.has(p.id));
  const firstIso = nonPrivate.length ? nonPrivate[0].recorded_at : null;
  const lastIso = nonPrivate.length ? nonPrivate[nonPrivate.length - 1].recorded_at : null;
  const visible = summarizeVisibleWindow(partition.segments, firstIso, lastIso);

  // ── Map (rå data — UI ritar prickar + linje)
  const sortedPings = [...snapshot.pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const map: CanonicalMap = {
    pings: toMapPings(sortedPings),
    routeLine: sortedPings.map((p) => ({
      lat: p.lat, lng: p.lng, recordedAt: p.recorded_at,
    })),
    startPoint: sortedPings.length
      ? { lat: sortedPings[0].lat, lng: sortedPings[0].lng, recordedAt: sortedPings[0].recorded_at }
      : null,
    endPoint: sortedPings.length
      ? {
          lat: sortedPings[sortedPings.length - 1].lat,
          lng: sortedPings[sortedPings.length - 1].lng,
          recordedAt: sortedPings[sortedPings.length - 1].recorded_at,
        }
      : null,
  };

  // ── Segments
  const segments: CanonicalSegment[] = visible.segments.map((seg, idx) => ({
    id: segmentId(seg, idx),
    type: seg.type,
    label: seg.label,
    startIso: seg.start,
    endIso: seg.end,
    durationMinutes: seg.minutes,
    targetType: targetTypeFor(seg),
    targetId: seg.knownSiteId ?? null,
    knownSiteId: seg.knownSiteId ?? null,
    confidence: confidenceFor(seg),
    warningReasons: warningReasonsFor(seg),
    source: "gps_partition",
  }));

  // ── Geofence-visits — clampade till exakta in/ut-pings (snapshot.visits).
  // CRITICAL: dessa är THE truth för "tid på arbetsplats". Bygg ALDRIG om
  // detta i någon annan endpoint.
  const geofenceVisits: CanonicalGeofenceVisit[] = snapshot.visits
    .filter((v: VisitRow) => v.knownSite && !privateIds.has(v.knownSite.id))
    .map((v: VisitRow) => ({
      id: v.placeKey,
      label: v.knownSite!.name,
      knownSiteId: v.knownSite!.id,
      startIso: v.start,
      endIso: v.end,
      durationMinutes: v.durationMin,
      pingCount: v.pingCount,
      clampSource: "exact_inside_pings" as const,
    }));

  // ── Totals
  const grossWorkdayMinutes = visible.windowMin;
  const payableSuggestionMinutes = visible.workMin + visible.travelMin;
  const totals: CanonicalTotals = {
    visibleWindowMinutes: visible.windowMin,
    workMinutes: visible.workMin,
    travelMinutes: visible.travelMin,
    privateMinutes: visible.privateMin,
    unknownMinutes: visible.unknownMin,
    gpsGapMinutes: visible.gapMin,
    idleMinutes: visible.idleMin,
    grossWorkdayMinutes,
    payableSuggestionMinutes,
  };

  // ── Payroll suggestion (work + travel)
  const payableTypes = new Set<SegmentType>(["work", "travel"]);
  const includedSegmentIds: string[] = [];
  const excludedSegmentIds: string[] = [];
  let excludedMinutes = 0;
  for (const seg of segments) {
    if (payableTypes.has(seg.type)) includedSegmentIds.push(seg.id);
    else {
      excludedSegmentIds.push(seg.id);
      excludedMinutes += seg.durationMinutes;
    }
  }
  const payrollSuggestion: CanonicalPayrollSuggestion = {
    payableMinutes: payableSuggestionMinutes,
    excludedMinutes,
    includedSegmentIds,
    excludedSegmentIds,
    policyVersion: CANONICAL_POLICY_VERSION,
  };

  // ── Debug + invariant warnings
  if (snapshot.pings.length === 0) warnings.push("no_pings_for_day");
  if (segments.length === 0 && snapshot.pings.length > 0) warnings.push("empty_partition_with_pings");

  const sourceSnapshotId = `${date}:${staffId}:${snapshot.pings.length}:${firstIso ?? "-"}:${lastIso ?? "-"}`;

  return {
    version: CANONICAL_VERSION,
    source: CANONICAL_SOURCE,
    organizationId,
    staffId,
    date,
    dayWindow: {
      timezone: "Europe/Stockholm",
      startIso: dayWindowUtc.startIso,
      endIso: dayWindowUtc.endIso,
    },
    firstIso,
    lastIso,
    totals,
    segments,
    geofenceVisits,
    map,
    payrollSuggestion,
    debug: {
      pingsCount: snapshot.pings.length,
      segmentCount: segments.length,
      geofenceVisitCount: geofenceVisits.length,
      sourceSnapshotId,
      cacheHit,
      builtAt: snapshot.builtAt,
      warnings,
    },
  };
}

/**
 * Canonical entry point — bygger (eller läser från cache) dagsresultatet.
 *
 * @param admin   Service-role Supabase client
 * @param opts    organizationId + staffId + date (YYYY-MM-DD) + forceRefresh?
 */
export async function buildCanonicalStaffDayGpsResult(
  admin: SupabaseClient,
  opts: { organizationId: string; staffId: string; date: string; forceRefresh?: boolean },
): Promise<CanonicalStaffDayGpsResult> {
  const { organizationId, staffId, date, forceRefresh } = opts;

  // Vid forceRefresh — invalidera snapshot-cachen genom att nolla signature.
  // (Behåller raden så vi inte tappar audit/built_at; nästa getOrBuildDaySnapshot
  //  signaturmatchar inte och kör om hela kedjan.)
  if (forceRefresh) {
    try {
      await admin
        .from("staff_gps_day_snapshots")
        .update({ input_signature: "__force_refresh__" })
        .eq("staff_id", staffId)
        .eq("date", date);
    } catch (e) {
      console.warn("[canonicalStaffDayGpsResult] forceRefresh invalidate failed", e);
    }
  }

  // Mät cacheHit by reading first
  let cacheHit = false;
  if (!forceRefresh) {
    try {
      const { data } = await admin
        .from("staff_gps_day_snapshots")
        .select("input_signature")
        .eq("staff_id", staffId)
        .eq("date", date)
        .maybeSingle();
      cacheHit = !!data?.input_signature;
    } catch {/* ignore */}
  }

  const snapshot = await getOrBuildDaySnapshot(admin, {
    staffId,
    date,
    organizationId,
  });

  return projectCanonicalResult({
    organizationId,
    staffId,
    date,
    snapshot,
    cacheHit,
  });
}
