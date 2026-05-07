// Shared logic to build a normalized "staff day snapshot" from raw tables.
// Pure functions — no I/O. The edge function fetches rows and calls buildStaffDaySnapshot.
//
// Workday policy authority: this builder defers all "is this work?" /
// "may this start the workday?" / "does this count inside the workday?"
// decisions to ../_shared/workdayPolicy.ts. Unknown / travel segments
// inside the workday are tagged for review but their minutes are kept
// inside the workday total (never silently dropped).

import {
  classifySegment,
  countsAsPayableUnallocated,
  countsWithinActiveWorkday,
  isConfirmedWorksitePresence,
  suggestedWorkdayStart,
  type PolicySegment,
  type PolicyStatus,
  type PolicyWorkday,
} from "./workdayPolicy.ts";

export type Iso = string;

export interface WorkdayRow {
  id: string;
  staff_id: string;
  started_at: string;
  ended_at: string | null;
  review_status: string | null;
  review_reasons: string[] | null;
  approved_at: string | null;
  admin_note: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TimeReportRow {
  id: string;
  staff_id: string;
  booking_id: string | null;
  large_project_id: string | null;
  report_date: string;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  hours_worked: number | null;
  break_time: number | null;
  description: string | null;
  approved: boolean | null;
  source?: string | null;
  source_entry_id?: string | null;
}

export interface TravelLogRow {
  id: string;
  staff_id: string;
  start_time: string;
  end_time: string | null;
  hours_worked: number | null;
  from_address: string | null;
  to_address: string | null;
  destination_booking_id: string | null;
  related_booking_id: string | null;
  manual_project_name: string | null;
  classification: string | null;
  approved: boolean | null;
  needs_review: boolean | null;
  description: string | null;
}

export interface LocationEntryRow {
  id: string;
  staff_id: string;
  location_id: string | null;
  booking_id: string | null;
  large_project_id: string | null;
  task_id: string | null;
  entry_date: string;
  entered_at: string;
  exited_at: string | null;
  total_minutes: number | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
}

export interface WorkdayFlagRow {
  id: string;
  staff_id: string;
  flag_type: string;
  severity: string | null;
  flag_date: string;
  title: string | null;
  description: string | null;
  needs_user_input: boolean | null;
  resolved: boolean | null;
  context: Record<string, unknown> | null;
}

export interface AssistantEventRow {
  id: string;
  staff_id: string;
  event_type: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  happened_at: string;
  resolution_status: string | null;
  stale_for_prompt: boolean | null;
}

export interface SnapshotInput {
  staffId: string;
  date: string; // YYYY-MM-DD
  workday: WorkdayRow | null;
  timeReports: TimeReportRow[];
  travelLogs: TravelLogRow[];
  locationEntries: LocationEntryRow[];
  flags: WorkdayFlagRow[];
  assistantEvents: AssistantEventRow[];
  /** Optional name lookup maps so segments get real labels. */
  nameMaps?: {
    bookings?: Record<string, string>;
    largeProjects?: Record<string, string>;
    locations?: Record<string, { name: string; isWork: boolean }>;
  };
  /** User/admin day attestation (per staff_id+date). When present, its break_minutes overrides time_reports.break_time sum. */
  attestation?: DayAttestationRow | null;
  /** Active (non-expired, non-consumed) tracking-policy boost rows from DB. */
  activeBoosts?: TrackingPolicyBoostRow[];
  /** Optional client hints to suppress boost (low battery / dismissed cooldown). */
  batteryPct?: number | null;
  dismissedCooldownActive?: boolean;
  /** Optional GPS pings för dagen — driver segmentChain (gap-klassning). */
  pings?: Array<{ recorded_at: string; lat: number; lng: number; accuracy?: number | null }>;
  /** Optional known places (warehouses/locations/bookings/projects) for gpsDayTimeline matching. */
  knownPlaces?: Array<{
    id: string;
    type: "booking" | "project" | "location" | "warehouse" | "home" | "unknown";
    name: string;
    lat: number;
    lng: number;
    radiusM?: number | null;
  }>;
}

export interface GpsDayTimelineSegment {
  startTs: Iso;
  endTs: Iso;
  durationMin: number;
  /** stay = stationary, travel = movement between stays, gps_gap = silent ping gap. */
  kind: "stay" | "travel" | "gps_gap";
  /** Coarse type for UI/debug. */
  type: "known_target" | "unknown_place" | "transport" | "gps_gap";
  matchedSiteId: string | null;
  matchedSiteType: string | null;
  matchedSiteName: string | null;
  centerLat: number | null;
  centerLng: number | null;
  pingCount: number;
  insideWorkday: boolean;
  affectsPayableTime: boolean;
  outsideWorkdayReason: string | null;
}

export interface DayAttestationRow {
  id: string;
  staff_id: string;
  date: string;
  break_minutes: number;
  comment: string | null;
  status: "attested" | "locked" | "revoked" | string;
  attested_at: string;
  attested_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
}

export type SegmentKind = "project" | "booking" | "travel" | "location" | "unknown" | "active";

/** Canonical normalized segment type used by UI/timeline. */
export type SegmentType =
  | "confirmed_work"
  | "active_work"
  | "warehouse"
  | "transport"
  | "other_place"
  | "break"
  | "manual_adjustment"
  | "signal_stale";

export interface DaySegment {
  /** Stable id (db row id when available, else synthesized). */
  id: string;
  kind: SegmentKind;
  /** Canonical type — preferred field for UI. */
  type: SegmentType;
  /** ISO start (alias of startedAt). */
  start: Iso;
  /** ISO end or null (alias of endedAt). */
  end: Iso | null;
  startedAt: Iso;
  endedAt: Iso | null;
  durationMinutes: number;
  isActive: boolean;
  label: string;
  source: string;
  /** 'high' = bekräftad ref, 'medium' = travel/manuell, 'low' = okänd plats. */
  confidence: "high" | "medium" | "low";
  /** True only when the segment reduces payableMinutes (break / manual_adjustment). */
  affectsPayableTime: boolean;
  /** True when admin/user must classify or attest. */
  requiresUserInput: boolean;
  /** Free-form context (kept stable). */
  metadata: Record<string, unknown>;
  refs: {
    timeReportId?: string;
    travelLogId?: string;
    locationEntryId?: string;
    workdayId?: string;
    bookingId?: string | null;
    largeProjectId?: string | null;
    locationId?: string | null;
    taskId?: string | null;
  };
  approved?: boolean | null;
  hasConfirmedRef?: boolean;
  classification?: string | null;
  policyStatus: PolicyStatus;
}

export interface DayFlag {
  id: string;
  type: string;
  severity: "info" | "warning" | "error";
  title: string;
  description: string | null;
  needsUserInput: boolean;
  resolved: boolean;
  source: "workday_flag" | "computed";
}

export interface ActiveActivity {
  kind: "location" | "booking" | "project";
  startedAt: Iso;
  durationMinutes: number;
  label: string;
  locationEntryId: string;
  bookingId: string | null;
  largeProjectId: string | null;
  locationId: string | null;
}

export interface DayTotals {
  // ---- Canonical v2 model ----
  /** Workday start → end (or now if open). Bruttotid. */
  grossWorkdayMinutes: number;
  /** Endast användar-/admin-attesterad rast (time_reports.break_time + ev. workday-attest). */
  breakMinutes: number;
  /** Endast admin/manuell korrigering (workday.metadata.manual_deduction_minutes). */
  manualDeductionMinutes: number;
  /** gross - break - manual deduction. Other_place + transport drar INTE av. */
  payableMinutes: number;
  /** Tid på bekräftade projekt/bookings (time_reports + project/booking-LTE). */
  projectMinutes: number;
  /** Tid på lager / arbetsrelaterad location. */
  warehouseMinutes: number;
  /** Transport inom arbetsdag (räknas, drar inte av). */
  transportMinutes: number;
  /** Okänd plats inom arbetsdag (räknas, drar inte av). */
  otherPlaceMinutes: number;
  /** GPS-glapp inom arbetsdag (kind/type gps_gap / signal_stale). */
  gpsGapMinutes: number;

  // ---- Legacy fields (kept for backward compat with existing UI) ----
  workdayMinutes: number;
  allocatedProjectMinutes: number;
  travelMinutes: number;
  unallocatedMinutes: number;
  unknownWithinWorkdayMinutes: number;
  liveMinutes: number;
  isWorkdayOpen: boolean;
}

export interface ActionNeeded {
  id: string;
  type: string;
  severity: "info" | "warning" | "error";
  title: string;
  description: string | null;
  needsUserInput: boolean;
}

export interface IntelligenceState {
  /** Hard rules only — AI not used in this step. */
  mode: "hard_rules_only";
  workdayBackdated: boolean;
  workdaySynthesized: boolean;
  hasOtherPlace: boolean;
  hasTransport: boolean;
}

import { buildTrackingPolicy, type BoostRow as TrackingPolicyBoostRow, type TrackingPolicy } from "./trackingPolicy.ts";
import { buildSegmentChainGaps } from "./segmentChain.ts";
import { clusterPings } from "./timeline/cluster.ts";
import { matchSegmentsToPlaces } from "./timeline/matcher.ts";
import { minutesBetween } from "./timeline/geo.ts";
export type { TrackingPolicy, TrackingPolicyBoostRow };

export interface StaffDaySnapshot {
  date: string;
  staffId: string;
  workday: {
    id: string;
    startedAt: Iso;
    endedAt: Iso | null;
    isOpen: boolean;
    reviewStatus: string | null;
    reviewReasons: string[];
    approved: boolean;
    adminNote: string | null;
    durationMinutes: number;
    /** ISO of an earlier confirmed worksite presence (back-date suggestion). */
    suggestedStartedAt: Iso | null;
    /** Set when started_at was auto-back-dated from confirmed presence. */
    autoExtendedFrom: Iso | null;
    /** True if no DB workday existed but confirmed presence synthesised one. */
    synthesizedFromEvidence: boolean;
  } | null;
  active: ActiveActivity | null;
  totals: DayTotals;
  segments: DaySegment[];
  /**
   * Where the main `segments` came from in this snapshot build.
   * - "gps_chain"                       — segmentChain produced gap classification
   * - "gps_unavailable_or_not_built"    — no GPS-derived segments available; only break / manual_adjustment may exist
   * Legacy time_reports / travel_logs / location_entries are NEVER used as main segments;
   * they live in `rawEvidence` for debug/UI only.
   */
  segmentSource: "gps_chain" | "gps_unavailable_or_not_built";
  rawEvidence: {
    timeReports: Array<Record<string, unknown>>;
    travelLogs: Array<Record<string, unknown>>;
    locationEntries: Array<Record<string, unknown>>;
  };
  flags: DayFlag[];
  actionsNeeded: ActionNeeded[];
  intelligenceState: IntelligenceState;
  trackingPolicy: TrackingPolicy;
  assistantEvents: Array<{
    id: string;
    type: string;
    happenedAt: Iso;
    label: string | null;
    targetType: string | null;
    targetId: string | null;
    resolutionStatus: string | null;
    stale: boolean;
  }>;
  attestation: {
    id: string;
    breakMinutes: number;
    comment: string | null;
    status: string;
    attestedAt: Iso;
    attestedBy: string | null;
    locked: boolean;
  } | null;
  lastUpdatedAt: Iso;
  /** Full-day GPS-derived timeline built from ALL pings (not constrained by workday). */
  gpsDayTimeline: GpsDayTimelineSegment[];
  debugMeta?: {
    totalsSource: "segments";
    legacyTotals: {
      timeReportsAllocatedMinutes: number;
      travelLogsMinutes: number;
      timeReportsBreakMinutes: number;
    };
    gpsDayTimelineCount: number;
    gpsDayTimelineFirstStart: string | null;
    gpsDayTimelineLastEnd: string | null;
    gpsTimelineSource: "all_pings";
  };
}

const MS_PER_MIN = 60_000;

function diffMinutes(start: string, end: string | null, now: Date): number {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : now.getTime();
  return Math.max(0, Math.round((e - s) / MS_PER_MIN));
}

function hoursToMin(h: number | null | undefined): number {
  if (!h || !isFinite(h)) return 0;
  return Math.round(h * 60);
}

function combineDateTime(date: string, time: string | null): string | null {
  if (!time) return null;
  // Treat as local Stockholm time -> convert to ISO assuming +01/+02 offset of provided dates.
  // Simpler: store as `${date}T${time}` (no Z) — caller treats as wall time.
  return `${date}T${time.length === 5 ? time + ":00" : time}`;
}

function detectOverlaps(segments: DaySegment[]): DayFlag[] {
  const flags: DayFlag[] = [];
  const sorted = [...segments]
    .filter((s) => s.endedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.endedAt && cur.startedAt < prev.endedAt) {
      flags.push({
        id: `overlap-${prev.refs.timeReportId ?? prev.refs.travelLogId ?? prev.refs.locationEntryId}-${cur.refs.timeReportId ?? cur.refs.travelLogId ?? cur.refs.locationEntryId}`,
        type: "overlap",
        severity: "warning",
        title: "Tidsöverlapp",
        description: `${prev.label} och ${cur.label} överlappar.`,
        needsUserInput: false,
        resolved: false,
        source: "computed",
      });
    }
  }
  return flags;
}

// Helpers for label resolution and normalization
function resolveLabel(opts: {
  bookingId?: string | null;
  largeProjectId?: string | null;
  locationId?: string | null;
  description?: string | null;
  fallback: string;
  nameMaps?: SnapshotInput["nameMaps"];
}): string {
  const m = opts.nameMaps ?? {};
  if (opts.largeProjectId && m.largeProjects?.[opts.largeProjectId]) {
    return m.largeProjects[opts.largeProjectId];
  }
  if (opts.bookingId && m.bookings?.[opts.bookingId]) {
    return m.bookings[opts.bookingId];
  }
  if (opts.locationId && m.locations?.[opts.locationId]?.name) {
    return m.locations[opts.locationId].name;
  }
  if (opts.description && opts.description.trim()) return opts.description.trim();
  return opts.fallback;
}

function isWarehouseLocation(locationId: string | null | undefined, nameMaps?: SnapshotInput["nameMaps"]): boolean {
  if (!locationId) return false;
  return nameMaps?.locations?.[locationId]?.isWork === true;
}

function deriveSegmentType(
  policyStatus: PolicyStatus,
  kind: SegmentKind,
  hasConfirmedRef: boolean,
  classification: string | null,
  isWarehouse: boolean,
): SegmentType {
  if (classification === "break") return "break";
  if (kind === "active") return "active_work";
  if (kind === "travel") return "transport";
  if (isWarehouse && hasConfirmedRef) return "warehouse";
  if (kind === "project" || kind === "booking") {
    return hasConfirmedRef ? "confirmed_work" : "other_place";
  }
  if (kind === "location") {
    return hasConfirmedRef ? (isWarehouse ? "warehouse" : "confirmed_work") : "other_place";
  }
  if (policyStatus === "other_place") return "other_place";
  return "other_place";
}

function deriveConfidence(type: SegmentType, hasConfirmedRef: boolean): "high" | "medium" | "low" {
  if (type === "confirmed_work" || type === "active_work" || type === "warehouse") return "high";
  if (type === "transport" || type === "break" || type === "manual_adjustment") return "medium";
  if (hasConfirmedRef) return "medium";
  return "low";
}

export function buildStaffDaySnapshot(input: SnapshotInput, now: Date = new Date()): StaffDaySnapshot {
  const { staffId, date, workday, timeReports, travelLogs, locationEntries, flags, assistantEvents, nameMaps, attestation } = input;

  // ---- Workday ----
  const workdaySnapBase = workday
    ? {
        id: workday.id,
        startedAt: workday.started_at,
        endedAt: workday.ended_at,
        isOpen: !workday.ended_at,
        reviewStatus: workday.review_status,
        reviewReasons: workday.review_reasons ?? [],
        approved: !!workday.approved_at,
        adminNote: workday.admin_note,
        durationMinutes: diffMinutes(workday.started_at, workday.ended_at, now),
        autoExtendedFrom: null as Iso | null,
        synthesizedFromEvidence: false,
      }
    : null;

  const policyWorkday: PolicyWorkday | null = workdaySnapBase
    ? {
        startedAt: workdaySnapBase.startedAt,
        endedAt: workdaySnapBase.endedAt,
        approved: workdaySnapBase.approved,
      }
    : null;

  // ---- Segments ----
  // HARD RULE (step 3): time_reports / travel_logs / location_entries are
  // legacy evidence rows. They MUST NOT create main segments in the snapshot
  // because they can describe long timespans that disagree with the actual
  // GPS pings. They are surfaced under `rawEvidence` for debug/UI only.
  // Main segments in this step come from:
  //   - user-attested break (time_reports.break_time)
  //   - manual workday adjustment (workday.metadata)
  //   - GPS-derived chain gaps (segmentChain) added further below
  const rawSegments: Array<DaySegment & { _policy: PolicySegment }> = [];

  // Legacy policy rows — used ONLY for workday back-date / synth detection
  // (suggestedWorkdayStart). They are NOT pushed as segments.
  const legacyPolicySegments: PolicySegment[] = [];

  // Debug evidence (kept verbatim so admins can still see the old rows).
  const rawEvidence = {
    timeReports: [] as Array<{
      id: string; startedAt: Iso; endedAt: Iso | null; minutes: number;
      kind: SegmentKind; hasConfirmedRef: boolean; label: string;
      bookingId: string | null; largeProjectId: string | null;
      approved: boolean; source: string;
    }>,
    travelLogs: [] as Array<{
      id: string; startedAt: Iso; endedAt: Iso | null; minutes: number;
      label: string; from: string | null; to: string | null;
      destinationBookingId: string | null; classification: string | null;
      approved: boolean; needsReview: boolean; source: string;
    }>,
    locationEntries: [] as Array<{
      id: string; enteredAt: Iso; exitedAt: Iso | null; minutes: number;
      kind: SegmentKind; hasConfirmedRef: boolean; label: string;
      bookingId: string | null; largeProjectId: string | null;
      locationId: string | null; taskId: string | null;
      isWarehouse: boolean; classification: string | null; source: string;
      isActive: boolean;
    }>,
  };

  for (const tr of timeReports) {
    const startedAt = combineDateTime(tr.report_date, tr.start_time) ?? `${date}T00:00:00`;
    const endedAt = combineDateTime(tr.report_date, tr.end_time);
    const minutes = hoursToMin(tr.hours_worked) || diffMinutes(startedAt, endedAt, now);
    const kind: SegmentKind = tr.large_project_id ? "project" : "booking";
    const hasConfirmedRef = !!(tr.large_project_id || tr.booking_id);
    const label = resolveLabel({
      bookingId: tr.booking_id,
      largeProjectId: tr.large_project_id,
      description: tr.description,
      fallback: "Tidrapport",
      nameMaps,
    });
    legacyPolicySegments.push({ kind, startedAt, endedAt, approved: tr.approved, hasConfirmedRef });
    rawEvidence.timeReports.push({
      id: tr.id, startedAt, endedAt, minutes, kind, hasConfirmedRef, label,
      bookingId: tr.booking_id, largeProjectId: tr.large_project_id,
      approved: !!tr.approved, source: tr.source ?? "time_report",
    });
  }

  for (const tl of travelLogs) {
    const minutes = hoursToMin(tl.hours_worked) || diffMinutes(tl.start_time, tl.end_time, now);
    const destLabel = tl.destination_booking_id
      ? (nameMaps?.bookings?.[tl.destination_booking_id] ?? tl.to_address ?? tl.manual_project_name ?? "?")
      : (tl.to_address ?? tl.manual_project_name ?? "?");
    const label = (tl.description?.trim()) || `Resa ${tl.from_address ?? "?"} → ${destLabel}`;
    legacyPolicySegments.push({
      kind: "travel",
      startedAt: tl.start_time,
      endedAt: tl.end_time,
      approved: tl.approved,
      classification: tl.classification ?? null,
    });
    rawEvidence.travelLogs.push({
      id: tl.id, startedAt: tl.start_time, endedAt: tl.end_time, minutes, label,
      from: tl.from_address ?? null, to: tl.to_address ?? null,
      destinationBookingId: tl.destination_booking_id ?? null,
      classification: tl.classification ?? null,
      approved: !!tl.approved, needsReview: !!tl.needs_review,
      source: (tl as { source?: string }).source ?? "travel_log",
    });
  }

  for (const le of locationEntries) {
    const minutes = le.total_minutes ?? diffMinutes(le.entered_at, le.exited_at, now);
    const isActive = !le.exited_at;
    const kind: SegmentKind = isActive
      ? "active"
      : le.location_id
      ? "location"
      : le.booking_id || le.large_project_id
      ? le.large_project_id ? "project" : "booking"
      : "unknown";
    const hasConfirmedRef = !!(le.location_id || le.booking_id || le.large_project_id);
    const meta = (le.metadata ?? {}) as Record<string, unknown>;
    const classification = (meta.classification as string | undefined) ?? null;
    const isWarehouse = isWarehouseLocation(le.location_id, nameMaps);
    const fallback = isActive ? "Pågående aktivitet" : isWarehouse ? "Lager" : "Okänd plats";
    const label = resolveLabel({
      bookingId: le.booking_id,
      largeProjectId: le.large_project_id,
      locationId: le.location_id,
      fallback,
      nameMaps,
    });
    legacyPolicySegments.push({
      kind, startedAt: le.entered_at, endedAt: le.exited_at,
      hasConfirmedRef, classification,
    });
    rawEvidence.locationEntries.push({
      id: le.id, enteredAt: le.entered_at, exitedAt: le.exited_at, minutes,
      kind, hasConfirmedRef, label,
      bookingId: le.booking_id, largeProjectId: le.large_project_id,
      locationId: le.location_id, taskId: le.task_id,
      isWarehouse, classification, source: le.source ?? "location_entry",
      isActive,
    });
  }

  // (Legacy push-to-rawSegments removed in step 3 — see rawEvidence above.)


  // ---- Manual adjustment from workday metadata (admin/user only) ----
  const wdMeta = (workday?.metadata ?? {}) as Record<string, unknown>;
  const manualDeductionMin = Math.max(0, Number(wdMeta.manual_deduction_minutes ?? 0) | 0);
  if (manualDeductionMin > 0 && workday) {
    rawSegments.push({
      id: `manual-${workday.id}`,
      kind: "unknown",
      type: "manual_adjustment",
      start: workday.started_at,
      end: workday.started_at,
      startedAt: workday.started_at,
      endedAt: workday.started_at,
      durationMinutes: manualDeductionMin,
      isActive: false,
      label: typeof wdMeta.manual_deduction_label === "string"
        ? (wdMeta.manual_deduction_label as string)
        : "Manuellt avdrag",
      source: "workday_metadata",
      confidence: "high",
      affectsPayableTime: true,
      requiresUserInput: false,
      metadata: { reason: wdMeta.manual_deduction_reason ?? null },
      refs: { workdayId: workday.id },
      hasConfirmedRef: false,
      classification: null,
      policyStatus: "approved",
      _policy: { kind: "unknown", startedAt: workday.started_at, endedAt: workday.started_at },
    } as DaySegment & { _policy: PolicySegment });
  }

  // ---- Break segments from time_reports.break_time (user-attested) ----
  for (const tr of timeReports) {
    const breakMin = hoursToMin(tr.break_time);
    if (breakMin <= 0) continue;
    const trStart = combineDateTime(tr.report_date, tr.start_time) ?? `${date}T00:00:00`;
    rawSegments.push({
      id: `break-${tr.id}`,
      kind: "unknown",
      type: "break",
      start: trStart,
      end: trStart,
      startedAt: trStart,
      endedAt: trStart,
      durationMinutes: breakMin,
      isActive: false,
      label: "Rast",
      source: "time_report.break_time",
      confidence: "high",
      affectsPayableTime: true,
      requiresUserInput: false,
      metadata: { timeReportId: tr.id },
      refs: { timeReportId: tr.id },
      hasConfirmedRef: false,
      classification: "break",
      policyStatus: "break",
      _policy: { kind: "unknown", startedAt: trStart, endedAt: trStart, classification: "break" },
    } as DaySegment & { _policy: PolicySegment });
  }

  // Tag every segment with its canonical policy status + normalized type/confidence.
  const segments: DaySegment[] = rawSegments
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map(({ _policy, ...rest }) => {
      const policyStatus = classifySegment(_policy, policyWorkday, now);
      const isBreakOrAdj = rest.type === "break" || rest.type === "manual_adjustment";
      const isWh = !!(rest.metadata as Record<string, unknown>)?.isWarehouse;
      const type: SegmentType = isBreakOrAdj
        ? rest.type
        : deriveSegmentType(policyStatus, rest.kind, !!rest.hasConfirmedRef, rest.classification ?? null, isWh);
      const confidence = isBreakOrAdj ? rest.confidence : deriveConfidence(type, !!rest.hasConfirmedRef);
      const affectsPayableTime = type === "break" || type === "manual_adjustment";
      const requiresUserInput = rest.requiresUserInput || (type === "other_place" && !rest.hasConfirmedRef);
      return { ...rest, policyStatus, type, confidence, affectsPayableTime, requiresUserInput };
    });

  // ---- Active activity ----
  const openLoc = locationEntries.find((l) => !l.exited_at);
  const active: ActiveActivity | null = openLoc
    ? (() => {
        const isWh = isWarehouseLocation(openLoc.location_id, nameMaps);
        const kind: ActiveActivity["kind"] = openLoc.location_id
          ? (isWh ? "location" : "location")
          : openLoc.large_project_id
            ? "project"
            : "booking";
        // Use the same resolver as segments. Fallback "Annan plats" — never
        // generic "Plats" / "Projekt" / "Bokning" / "Pågående aktivitet".
        const label = resolveLabel({
          bookingId: openLoc.booking_id,
          largeProjectId: openLoc.large_project_id,
          locationId: openLoc.location_id,
          description: null,
          fallback: "Annan plats",
          nameMaps,
        });
        return {
          kind,
          startedAt: openLoc.entered_at,
          durationMinutes: diffMinutes(openLoc.entered_at, null, now),
          label,
          locationEntryId: openLoc.id,
          bookingId: openLoc.booking_id,
          largeProjectId: openLoc.large_project_id,
          locationId: openLoc.location_id,
        };
      })()
    : null;

  // ---- Workday back-date / synth from confirmed presence ----
  // HARD RULE: confirmed worksite presence before workday.started_at must
  // automatically pull the workday earlier (unless approved/locked). If
  // there is no workday at all but confirmed presence exists, synthesise
  // one from the earliest confirmed presence so UI never shows
  // "Saknar arbetsdag" while there is real work evidence.
  // Use legacy evidence rows (NOT main segments) to detect earliest
  // confirmed presence for workday back-date / synth.
  const policySegments: PolicySegment[] = [
    ...legacyPolicySegments,
    ...rawSegments.map((r) => r._policy),
  ];
  const earliestConfirmed = suggestedWorkdayStart(policySegments, policyWorkday);

  let workdaySnap = workdaySnapBase;
  let effectivePolicyWorkday = policyWorkday;

  if (workdaySnap) {
    const canMutate = !workdaySnap.approved;
    if (canMutate && earliestConfirmed && earliestConfirmed < workdaySnap.startedAt) {
      const originalStart = workdaySnap.startedAt;
      workdaySnap = {
        ...workdaySnap,
        startedAt: earliestConfirmed,
        autoExtendedFrom: originalStart,
        durationMinutes: diffMinutes(earliestConfirmed, workdaySnap.endedAt, now),
      };
      effectivePolicyWorkday = {
        startedAt: earliestConfirmed,
        endedAt: workdaySnap.endedAt,
        approved: workdaySnap.approved,
      };
    }
  } else if (earliestConfirmed) {
    // Synthesised workday — derived purely from confirmed worksite presence.
    workdaySnap = {
      id: `synth-${date}-${staffId}`,
      startedAt: earliestConfirmed,
      endedAt: null,
      isOpen: true,
      reviewStatus: null,
      reviewReasons: [],
      approved: false,
      adminNote: null,
      durationMinutes: diffMinutes(earliestConfirmed, null, now),
      autoExtendedFrom: null,
      synthesizedFromEvidence: true,
    };
    effectivePolicyWorkday = {
      startedAt: earliestConfirmed,
      endedAt: null,
      approved: false,
    };
  }

  // Re-classify segments against the (possibly extended/synth) workday so
  // an early Tiomila ping inside the new window is "confirmed_work", not
  // "unknown_needs_review".
  if (effectivePolicyWorkday !== policyWorkday) {
    for (let i = 0; i < segments.length; i++) {
      segments[i] = {
        ...segments[i],
        policyStatus: classifySegment(rawSegments[i]._policy, effectivePolicyWorkday, now),
      };
    }
  }

  // suggestedStartedAt is kept for backward compat, but only exposed when
  // the auto-extend path could NOT apply (e.g. day is approved/locked).
  const suggestedStartedAt =
    workdaySnap && workdaySnap.autoExtendedFrom == null && earliestConfirmed && earliestConfirmed < workdaySnap.startedAt
      ? earliestConfirmed
      : null;
  if (workdaySnap) {
    workdaySnap = { ...workdaySnap, suggestedStartedAt } as typeof workdaySnap;
  }

  // ---- Central segment chain (run BEFORE totals so segments are final) ----
  // Fyll glapp inom workday med transport / other_place / signal_stale
  // (saknad ping ≠ glapp). Endast om vi har en workday och pings.
  let gpsChainProducedSegments = false;
  if (effectivePolicyWorkday) {
    try {
      const chainGaps = buildSegmentChainGaps({
        workday: { startedAt: effectivePolicyWorkday.startedAt, endedAt: effectivePolicyWorkday.endedAt },
        segments: segments.map((s) => ({
          id: s.id, type: s.type, startedAt: s.startedAt, endedAt: s.endedAt,
          hasConfirmedRef: s.hasConfirmedRef,
        })),
        pings: input.pings ?? [],
        now,
      });
      if (chainGaps.length > 0) gpsChainProducedSegments = true;
      for (const g of chainGaps) {
        segments.push({
          id: g.id,
          kind: g.type === "transport" ? "travel" : "unknown",
          type: g.type,
          start: g.startedAt,
          end: g.endedAt,
          startedAt: g.startedAt,
          endedAt: g.endedAt,
          durationMinutes: g.durationMinutes,
          isActive: false,
          label: g.label,
          source: g.source,
          confidence: g.confidence,
          affectsPayableTime: false,
          requiresUserInput: g.requiresUserInput,
          metadata: g.metadata,
          refs: {},
          hasConfirmedRef: false,
          classification: null,
          policyStatus: g.policyStatus as PolicyStatus,
        });
      }
      segments.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    } catch (err) {
      console.warn("[staff-day-status] segmentChain failed", (err as Error)?.message);
    }
  }

  // ---- Totals (canonical source: snapshot.segments) ----
  // Step 4: totals are derived from segments only. timeReports/travelLogs
  // are NEVER the source of truth for totals — they live in `rawEvidence`
  // and `debugMeta.legacyTotals` for visibility/debug.
  // Rules:
  //   - workdayMinutes from workday session
  //   - projectMinutes  : segments project|booking|warehouse / type confirmed_work|active_work|warehouse
  //   - travelMinutes   : segments kind=travel / type=transport
  //   - otherPlaceMinutes: type=other_place (or kind=unknown without confirmed ref)
  //   - gpsGapMinutes   : type=signal_stale (gps gap)
  //   - payableMinutes does NOT auto-deduct break (only manual_adjustment)
  const wdMin = workdaySnap?.durationMinutes ?? 0;

  let projectMin = 0;
  let warehouseMin = 0;
  let travelMin = 0;
  let unknownWithinWd = 0;
  let gpsGapMin = 0;

  for (const seg of segments) {
    const inside = countsWithinActiveWorkday(
      { kind: seg.kind, startedAt: seg.startedAt, endedAt: seg.endedAt, classification: seg.classification, hasConfirmedRef: seg.hasConfirmedRef },
      effectivePolicyWorkday,
      now,
    );
    if (!inside) continue;
    const dur = seg.durationMinutes;
    // gps gap / signal stale
    if (seg.type === "signal_stale") {
      gpsGapMin += dur;
      continue;
    }
    // travel / transport
    if (seg.kind === "travel" || seg.type === "transport") {
      travelMin += dur;
      continue;
    }
    // warehouse
    if (seg.type === "warehouse" || (seg.kind === "location" && seg.hasConfirmedRef)) {
      warehouseMin += dur;
      continue;
    }
    // confirmed project / booking work
    if (
      seg.type === "confirmed_work" ||
      seg.type === "active_work" ||
      ((seg.kind === "project" || seg.kind === "booking") && seg.hasConfirmedRef)
    ) {
      projectMin += dur;
      continue;
    }
    // other place / unknown
    if (seg.type === "other_place" || seg.policyStatus === "other_place" || seg.kind === "unknown") {
      unknownWithinWd += dur;
      continue;
    }
  }

  // ---- Canonical payable model: bruttotid → manuellt avdrag → lönegrundande ----
  // Rast (attestation/time_reports.break_time) räknas separat och dras INTE
  // automatiskt av här (step 4 — payable should not auto-deduct break).
  // Other_place + transport drar ALDRIG av lönegrundande tid.
  const trBreakMin = timeReports.reduce((s, t) => s + hoursToMin(t.break_time), 0);
  const breakMin = attestation ? Math.max(0, attestation.break_minutes | 0) : trBreakMin;
  const meta = (workday?.metadata ?? {}) as Record<string, unknown>;
  const manualDeductionMinTotal = Math.max(0, Number(meta.manual_deduction_minutes ?? 0) | 0);
  const grossWorkdayMin = wdMin;
  const payableMin = Math.max(0, grossWorkdayMin - manualDeductionMinTotal);

  const unallocated = Math.max(0, wdMin - projectMin - warehouseMin - travelMin);

  // Legacy totals from old tables — for debug only.
  const legacyAllocated = timeReports.reduce((s, t) => s + (hoursToMin(t.hours_worked) || 0), 0);
  const legacyTravelMin = travelLogs.reduce((s, t) => s + (hoursToMin(t.hours_worked) || diffMinutes(t.start_time, t.end_time, now)), 0);

  const liveMinutes = active?.durationMinutes ?? 0;
  const totals: DayTotals = {
    grossWorkdayMinutes: grossWorkdayMin,
    breakMinutes: breakMin,
    manualDeductionMinutes: manualDeductionMinTotal,
    payableMinutes: payableMin,
    projectMinutes: projectMin,
    warehouseMinutes: warehouseMin,
    transportMinutes: travelMin,
    otherPlaceMinutes: unknownWithinWd,
    gpsGapMinutes: gpsGapMin,
    // Legacy
    workdayMinutes: wdMin,
    allocatedProjectMinutes: projectMin,
    travelMinutes: travelMin,
    unallocatedMinutes: unallocated,
    unknownWithinWorkdayMinutes: unknownWithinWd,
    liveMinutes,
    isWorkdayOpen: workdaySnap?.isOpen ?? false,
  };

  // ---- GPS Day Timeline (built from ALL pings, independent of workday) ----
  const gpsDayTimeline: GpsDayTimelineSegment[] = (() => {
    const allPings = (input.pings ?? [])
      .filter((p) => p && p.recorded_at && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({
        ts: p.recorded_at,
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy ?? null,
      }));
    if (allPings.length === 0) return [];

    const knownPlaces = (input.knownPlaces ?? []).map((k) => ({
      id: k.id,
      // matcher accepts the broader type union; cast for TS.
      type: (k.type === "warehouse" ? "location" : k.type) as
        | "booking" | "project" | "location" | "home" | "unknown",
      name: k.name,
      lat: k.lat,
      lng: k.lng,
      radiusM: k.radiusM ?? 100,
    }));

    let raw;
    try {
      raw = clusterPings(allPings);
      raw = matchSegmentsToPlaces(raw, knownPlaces);
    } catch (err) {
      console.warn("[staff-day-status] gpsDayTimeline build failed", (err as Error)?.message);
      return [];
    }

    const wdStart = workdaySnap?.startedAt ?? null;
    const wdEnd = workdaySnap?.endedAt ?? null;

    const inWorkday = (startTs: string, endTs: string): boolean => {
      if (!wdStart) return false;
      const s = new Date(startTs).getTime();
      const e = new Date(endTs).getTime();
      const ws = new Date(wdStart).getTime();
      const we = wdEnd ? new Date(wdEnd).getTime() : now.getTime();
      return e > ws && s < we;
    };

    const out: GpsDayTimelineSegment[] = [];
    for (let i = 0; i < raw.length; i++) {
      const seg = raw[i];
      let kind: GpsDayTimelineSegment["kind"];
      let type: GpsDayTimelineSegment["type"];
      if (!seg.isStationary) {
        kind = "travel";
        type = "transport";
      } else {
        kind = "stay";
        type = seg.matchedPlace ? "known_target" : "unknown_place";
      }
      const inside = inWorkday(seg.startTs, seg.endTs);
      out.push({
        startTs: seg.startTs,
        endTs: seg.endTs,
        durationMin: Math.round(seg.durationMin),
        kind,
        type,
        matchedSiteId: seg.matchedPlace?.id ?? null,
        matchedSiteType: seg.matchedPlace?.type ?? null,
        matchedSiteName: seg.matchedPlace?.name ?? null,
        centerLat: seg.centerLat,
        centerLng: seg.centerLng,
        pingCount: seg.pingCount,
        insideWorkday: inside,
        affectsPayableTime: false, // gpsDayTimeline never drives totals
        outsideWorkdayReason: inside
          ? null
          : !wdStart
            ? "no_workday"
            : new Date(seg.endTs).getTime() <= new Date(wdStart).getTime()
              ? "before_workday_start"
              : "after_workday_end",
      });
    }

    // Insert gps_gap segments where pings are silent for >10 min between adjacent raw segments
    const withGaps: GpsDayTimelineSegment[] = [];
    for (let i = 0; i < out.length; i++) {
      withGaps.push(out[i]);
      const next = out[i + 1];
      if (next) {
        const gapMin = minutesBetween(out[i].endTs, next.startTs);
        if (gapMin >= 10) {
          const inside = inWorkday(out[i].endTs, next.startTs);
          withGaps.push({
            startTs: out[i].endTs,
            endTs: next.startTs,
            durationMin: Math.round(gapMin),
            kind: "gps_gap",
            type: "gps_gap",
            matchedSiteId: null,
            matchedSiteType: null,
            matchedSiteName: null,
            centerLat: null,
            centerLng: null,
            pingCount: 0,
            insideWorkday: inside,
            affectsPayableTime: false,
            outsideWorkdayReason: inside
              ? null
              : !wdStart
                ? "no_workday"
                : "outside_workday",
          });
        }
      }
    }
    return withGaps;
  })();

  const debugMeta = {
    totalsSource: "segments" as const,
    legacyTotals: {
      timeReportsAllocatedMinutes: legacyAllocated,
      travelLogsMinutes: legacyTravelMin,
      timeReportsBreakMinutes: trBreakMin,
    },
    gpsDayTimelineCount: gpsDayTimeline.length,
    gpsDayTimelineFirstStart: gpsDayTimeline[0]?.startTs ?? null,
    gpsDayTimelineLastEnd: gpsDayTimeline[gpsDayTimeline.length - 1]?.endTs ?? null,
    gpsTimelineSource: "all_pings" as const,
  };

  // ---- Flags ----
  const dayFlags: DayFlag[] = flags.map((f) => ({
    id: f.id,
    type: f.flag_type,
    severity: (f.severity as "info" | "warning" | "error") ?? "info",
    title: f.title ?? f.flag_type,
    description: f.description,
    needsUserInput: !!f.needs_user_input,
    resolved: !!f.resolved,
    source: "workday_flag",
  }));

  // NOTE: "missing_workday" is no longer emitted here. The engine now
  // synthesises a workday from confirmed worksite presence above, so the
  // only remaining case (no workday AND no confirmed evidence) means
  // there is genuinely nothing to report — and that is signalled by
  // workday === null, not by a noisy warning flag.
  // "early_confirmed_presence" is likewise gone: the engine back-dates
  // automatically. We still surface a passive info flag if the day is
  // approved/locked and could not be auto-extended.
  if (workdaySnap && !workdaySnap.endedAt && new Date(workdaySnap.startedAt).getTime() < now.getTime() - 16 * 60 * MS_PER_MIN) {
    dayFlags.push({
      id: `missing-end-${workdaySnap.id}`,
      type: "missing_end_time",
      severity: "warning",
      title: "Saknad sluttid",
      description: "Arbetsdagen är fortfarande öppen efter mer än 16 timmar.",
      needsUserInput: true,
      resolved: false,
      source: "computed",
    });
  }

  if (unallocated > 30 && workdaySnap?.endedAt) {
    dayFlags.push({
      id: `unallocated-${workdaySnap.id}`,
      type: "unallocated_time",
      severity: "warning",
      title: "Ej fördelad tid",
      description: `${unallocated} min av arbetsdagen saknar projekt-/bokningstid.`,
      needsUserInput: false,
      resolved: false,
      source: "computed",
    });
  }

  if (unknownWithinWd > 0 && !workdaySnap?.approved) {
    dayFlags.push({
      id: `other-place-${workdaySnap?.id ?? date}`,
      type: "other_place_within_workday",
      severity: "info",
      title: "Annan plats inom arbetsdagen",
      description: `${unknownWithinWd} min ligger inom arbetsdagen som annan plats.`,
      needsUserInput: false,
      resolved: false,
      source: "computed",
    });
  }

  if (workdaySnap && suggestedStartedAt && workdaySnap.approved) {
    // Day is locked — engine could not auto-extend, surface as passive info.
    dayFlags.push({
      id: `early-confirmed-presence-${workdaySnap.id}`,
      type: "early_confirmed_presence",
      severity: "info",
      title: "Tidigare bekräftat arbete",
      description: `Bekräftad arbetsplats finns från ${suggestedStartedAt.slice(11, 16)} (dagen är låst).`,
      needsUserInput: false,
      resolved: false,
      source: "computed",
    });
  }

  if (workdaySnap?.adminNote) {
    dayFlags.push({
      id: `admin-${workdaySnap.id}`,
      type: "admin_correction",
      severity: "info",
      title: "Adminkorrigering",
      description: workdaySnap.adminNote,
      needsUserInput: false,
      resolved: true,
      source: "computed",
    });
  }

  dayFlags.push(...detectOverlaps(segments));

  // ---- Assistant events (passthrough, normalized) ----
  const events = assistantEvents.map((e) => ({
    id: e.id,
    type: e.event_type,
    happenedAt: e.happened_at,
    label: e.target_label,
    targetType: e.target_type,
    targetId: e.target_id,
    resolutionStatus: e.resolution_status,
    stale: !!e.stale_for_prompt,
  }));

  // ---- Actions needed (subset of flags requiring user/admin attention) ----
  const actionsNeeded: ActionNeeded[] = dayFlags
    .filter((f) => f.needsUserInput && !f.resolved)
    .map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      title: f.title,
      description: f.description,
      needsUserInput: true,
    }));

  // ---- Intelligence state (hard rules only — AI not used in this step) ----
  const intelligenceState: IntelligenceState = {
    mode: "hard_rules_only",
    workdayBackdated: !!workdaySnap?.autoExtendedFrom,
    workdaySynthesized: !!workdaySnap?.synthesizedFromEvidence,
    hasOtherPlace: totals.otherPlaceMinutes > 0,
    hasTransport: totals.transportMinutes > 0,
  };

  // ---- Tracking policy (server-authoritative; merges DB boosts) ----
  // Backend owns the heartbeat contract. lastPingAt = senaste GPS-ping vi
  // sett från enheten (max recorded_at från staff_location_history för dagen).
  // Backend markerar isSignalStale när silenceMs > maxSilenceMs — men skapar
  // ALDRIG ett glapp/segment av tystnaden. Tyst telefon ≠ tidsglapp.
  const pingsForPolicy = input.pings ?? [];
  let lastPingAtIso: string | null = null;
  for (const p of pingsForPolicy) {
    if (!p?.recorded_at) continue;
    if (!lastPingAtIso || new Date(p.recorded_at).getTime() > new Date(lastPingAtIso).getTime()) {
      lastPingAtIso = p.recorded_at;
    }
  }
  const trackingPolicy: TrackingPolicy = buildTrackingPolicy({
    hasActiveTimer: !!active,
    workdayOpen: !!workdaySnap?.isOpen,
    activeBoosts: input.activeBoosts ?? [],
    batteryPct: input.batteryPct ?? null,
    dismissedCooldownActive: !!input.dismissedCooldownActive,
    lastPingAt: lastPingAtIso,
    now,
  });

  return {
    date,
    staffId,
    workday: workdaySnap,
    active,
    totals,
    segments,
    segmentSource: gpsChainProducedSegments ? "gps_chain" : "gps_unavailable_or_not_built",
    rawEvidence,
    flags: dayFlags,
    actionsNeeded,
    intelligenceState,
    trackingPolicy,
    assistantEvents: events,
    attestation: attestation
      ? {
          id: attestation.id,
          breakMinutes: Math.max(0, attestation.break_minutes | 0),
          comment: attestation.comment,
          status: attestation.status,
          attestedAt: attestation.attested_at,
          attestedBy: attestation.attested_by,
          locked: attestation.status === "locked",
        }
      : null,
    lastUpdatedAt: now.toISOString(),
    gpsDayTimeline,
    debugMeta,
  };
}

