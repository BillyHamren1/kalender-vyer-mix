// Time v2 — buildDayView
// =============================================================================
// PURE: bygger en renderbar GPS Day View från råpings + manuella overrides.
// Använder INTE time_reports, workdays, location_time_entries, travel_time_logs,
// staff_day_report_cache, report_candidate_blocks_json eller display_blocks_json.
//
// Output är vad mobilen ska rendera ord för ord:
//   { title, subtitle, segments[], rows[], totals, debug.rawPingCount }
//
// Manuella overrides (per segment) ändrar currentStart/currentEndTime utan att
// röra originalStart/originalEnd. App kan visa "ändrat av användaren".

import {
  buildGpsDayTimelineOnly,
  type RawPingInput,
  type GpsTimelineSegment,
} from "../timeline/buildGpsDayTimelineOnly.ts";
import type { KnownPlace } from "../timeline/types.ts";

export interface ManualSegmentOverride {
  /** Stabil nyckel: `${originalStartTs}|${matchedSiteId ?? "unknown"}` */
  segmentKey: string;
  startIso?: string | null;
  endIso?: string | null;
  reason?: string | null;
}

export interface DayViewSegment {
  segmentKey: string;
  kind: GpsTimelineSegment["kind"];
  type: GpsTimelineSegment["type"];
  label: string;
  originalStartTime: string;       // ISO
  originalEndTime: string;         // ISO
  currentStartTime: string;        // ISO (= original om ingen override)
  currentEndTime: string;          // ISO
  durationMinutes: number;         // baserat på current
  durationLabel: string;
  matched: {
    kind: KnownPlace["type"] | null;
    id: string | null;
    name: string | null;
  };
  manualOverride: {
    hasOverride: boolean;
    reason: string | null;
  };
  confidence: number;
}

export interface DayViewRow {
  rowKey: string;                  // gruppnyckel (target id eller "unknown:1")
  label: string;
  kind: KnownPlace["type"] | "unknown" | "transport" | "gap";
  totalMinutes: number;
  totalLabel: string;
  segmentKeys: string[];
}

export interface DayViewTotals {
  totalDurationMinutes: number;
  totalDurationLabel: string;
  workMinutes: number;
  travelMinutes: number;
  gapMinutes: number;
}

export interface BuildDayViewInput {
  staffId: string;
  organizationId: string;
  date: string;                    // YYYY-MM-DD
  pings: RawPingInput[];
  knownTargets: KnownPlace[];
  manualOverrides: ManualSegmentOverride[];
  staffName?: string | null;
}

export interface BuildDayViewOutput {
  title: string;
  subtitle: string;
  segments: DayViewSegment[];
  rows: DayViewRow[];
  totals: DayViewTotals;
  manualOverridesSummary: {
    count: number;
    appliedSegmentKeys: string[];
  };
  rawPingCount: number;
  firstPingAt: string | null;
  lastPingAt: string | null;
}

function fmtMin(m: number): string {
  const s = Math.max(0, Math.round(m));
  const h = Math.floor(s / 60);
  const mm = s % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

function segmentKeyFor(seg: GpsTimelineSegment): string {
  return `${seg.startTs}|${seg.matchedSiteId ?? "unknown"}`;
}

export function buildDayView(input: BuildDayViewInput & { prebuiltTimeline?: ReturnType<typeof buildGpsDayTimelineOnly> }): BuildDayViewOutput {
  const tl = input.prebuiltTimeline ?? buildGpsDayTimelineOnly({
    staffId: input.staffId,
    organizationId: input.organizationId,
    date: input.date,
    pings: input.pings,
    knownTargets: input.knownTargets,
  });

  const overrideByKey = new Map<string, ManualSegmentOverride>();
  for (const o of input.manualOverrides ?? []) {
    if (o && o.segmentKey) overrideByKey.set(o.segmentKey, o);
  }

  const appliedKeys: string[] = [];
  const segments: DayViewSegment[] = tl.segments.map((seg) => {
    const key = segmentKeyFor(seg);
    const ov = overrideByKey.get(key);
    const currentStart = ov?.startIso ?? seg.startTs;
    const currentEnd = ov?.endIso ?? seg.endTs;
    const hasOverride = !!ov && (
      (ov.startIso && ov.startIso !== seg.startTs) ||
      (ov.endIso && ov.endIso !== seg.endTs)
    );
    if (hasOverride) appliedKeys.push(key);

    const durMs = Math.max(0, Date.parse(currentEnd) - Date.parse(currentStart));
    const durMin = Math.round(durMs / 60000);

    return {
      segmentKey: key,
      kind: seg.kind,
      type: seg.type,
      label: seg.label,
      originalStartTime: seg.startTs,
      originalEndTime: seg.endTs,
      currentStartTime: currentStart,
      currentEndTime: currentEnd,
      durationMinutes: durMin,
      durationLabel: fmtMin(durMin),
      matched: {
        kind: seg.matchedSiteType,
        id: seg.matchedSiteId,
        name: seg.matchedSiteName,
      },
      manualOverride: {
        hasOverride: !!hasOverride,
        reason: ov?.reason ?? null,
      },
      confidence: seg.confidence,
    };
  });

  // Rows = grupperat per matchat target. Okända platser/transport/gap = egna rader.
  const rowMap = new Map<string, DayViewRow>();
  let unknownIdx = 0;
  for (const s of segments) {
    let rowKey: string;
    let label: string;
    let kind: DayViewRow["kind"];
    if (s.kind === "stay" && s.type === "known_site" && s.matched.id) {
      rowKey = `${s.matched.kind}:${s.matched.id}`;
      label = s.matched.name ?? "Plats";
      kind = (s.matched.kind ?? "location");
    } else if (s.kind === "travel") {
      rowKey = "transport:all";
      label = "Förflyttning";
      kind = "transport";
    } else if (s.kind === "gps_gap") {
      rowKey = "gap:all";
      label = "GPS-glapp";
      kind = "gap";
    } else {
      unknownIdx += 1;
      rowKey = `unknown:${unknownIdx}`;
      label = "Okänd plats";
      kind = "unknown";
    }
    const existing = rowMap.get(rowKey);
    if (existing) {
      existing.totalMinutes += s.durationMinutes;
      existing.segmentKeys.push(s.segmentKey);
    } else {
      rowMap.set(rowKey, {
        rowKey,
        label,
        kind,
        totalMinutes: s.durationMinutes,
        totalLabel: "",
        segmentKeys: [s.segmentKey],
      });
    }
  }
  const rows = Array.from(rowMap.values())
    .map((r) => ({ ...r, totalLabel: fmtMin(r.totalMinutes) }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  let workMinutes = 0;
  let homeMinutes = 0;
  let travelMinutes = 0;
  let gapMinutes = 0;
  let unknownMinutes = 0;
  for (const s of segments) {
    if (s.kind === "stay" && s.type === "known_site" && s.matched.kind === "home") {
      homeMinutes += s.durationMinutes;
    } else if (s.kind === "stay" && s.type === "known_site") {
      workMinutes += s.durationMinutes;
    } else if (s.kind === "stay" && s.type === "unknown_place") {
      unknownMinutes += s.durationMinutes;
    } else if (s.kind === "travel") {
      travelMinutes += s.durationMinutes;
    } else if (s.kind === "gps_gap") {
      gapMinutes += s.durationMinutes;
    }
  }
  const totalMinutes = workMinutes + travelMinutes;

  const subtitleParts: string[] = [];
  if (workMinutes > 0) subtitleParts.push(`Arbete ${fmtMin(workMinutes)}`);
  if (travelMinutes > 0) subtitleParts.push(`Resa ${fmtMin(travelMinutes)}`);
  if (homeMinutes > 0) subtitleParts.push(`Boende ${fmtMin(homeMinutes)}`);
  if (unknownMinutes > 0) subtitleParts.push(`Okänt ${fmtMin(unknownMinutes)}`);
  if (gapMinutes > 0) subtitleParts.push(`Glapp ${fmtMin(gapMinutes)}`);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Ingen GPS-aktivitet";

  return {
    title: input.staffName ? `${input.staffName} · ${input.date}` : input.date,
    subtitle,
    segments,
    rows,
    totals: {
      totalDurationMinutes: totalMinutes,
      totalDurationLabel: fmtMin(totalMinutes),
      workMinutes,
      travelMinutes,
      gapMinutes,
    },
    manualOverridesSummary: {
      count: appliedKeys.length,
      appliedSegmentKeys: appliedKeys,
    },
    rawPingCount: tl.rawPingCount,
    firstPingAt: tl.firstPingAt,
    lastPingAt: tl.lastPingAt,
  };
}
