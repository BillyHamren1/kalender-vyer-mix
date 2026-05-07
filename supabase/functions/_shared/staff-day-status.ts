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
  const rawSegments: Array<DaySegment & { _policy: PolicySegment }> = [];

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
    rawSegments.push({
      id: `tr-${tr.id}`,
      kind,
      type: "confirmed_work",
      start: startedAt,
      end: endedAt,
      startedAt,
      endedAt,
      durationMinutes: minutes,
      isActive: false,
      label,
      source: tr.source ?? "time_report",
      confidence: "high",
      affectsPayableTime: false,
      requiresUserInput: false,
      metadata: { hours_worked: tr.hours_worked, break_time: tr.break_time },
      refs: { timeReportId: tr.id, bookingId: tr.booking_id, largeProjectId: tr.large_project_id },
      approved: tr.approved,
      hasConfirmedRef,
      classification: null,
      policyStatus: "confirmed_work",
      _policy: { kind, startedAt, endedAt, approved: tr.approved, hasConfirmedRef },
    });
  }

  for (const tl of travelLogs) {
    const minutes = hoursToMin(tl.hours_worked) || diffMinutes(tl.start_time, tl.end_time, now);
    const destLabel = tl.destination_booking_id
      ? (nameMaps?.bookings?.[tl.destination_booking_id] ?? tl.to_address ?? tl.manual_project_name ?? "?")
      : (tl.to_address ?? tl.manual_project_name ?? "?");
    const label = (tl.description?.trim()) || `Resa ${tl.from_address ?? "?"} → ${destLabel}`;
    rawSegments.push({
      id: `tl-${tl.id}`,
      kind: "travel",
      type: "transport",
      start: tl.start_time,
      end: tl.end_time,
      startedAt: tl.start_time,
      endedAt: tl.end_time,
      durationMinutes: minutes,
      isActive: !tl.end_time,
      label,
      source: (tl as { source?: string }).source ?? "travel_log",
      confidence: "medium",
      affectsPayableTime: false,
      requiresUserInput: !!tl.needs_review,
      metadata: { from: tl.from_address, to: tl.to_address, classification: tl.classification },
      refs: { travelLogId: tl.id, bookingId: tl.destination_booking_id ?? null },
      approved: tl.approved,
      hasConfirmedRef: !!tl.destination_booking_id,
      classification: tl.classification ?? null,
      policyStatus: "travel_within_workday",
      _policy: {
        kind: "travel",
        startedAt: tl.start_time,
        endedAt: tl.end_time,
        approved: tl.approved,
        classification: tl.classification ?? null,
      },
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
    rawSegments.push({
      id: `le-${le.id}`,
      kind,
      type: "other_place",
      start: le.entered_at,
      end: le.exited_at,
      startedAt: le.entered_at,
      endedAt: le.exited_at,
      durationMinutes: minutes,
      isActive,
      label,
      source: le.source ?? "location_entry",
      confidence: hasConfirmedRef ? "high" : "low",
      affectsPayableTime: false,
      requiresUserInput: !hasConfirmedRef,
      metadata: { ...meta, isWarehouse },
      refs: {
        locationEntryId: le.id,
        bookingId: le.booking_id,
        largeProjectId: le.large_project_id,
        locationId: le.location_id,
        taskId: le.task_id,
      },
      hasConfirmedRef,
      classification,
      policyStatus: "other_place",
      _policy: {
        kind, startedAt: le.entered_at, endedAt: le.exited_at,
        hasConfirmedRef, classification,
      },
    });
  }

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
    ? {
        kind: openLoc.location_id ? "location" : openLoc.large_project_id ? "project" : "booking",
        startedAt: openLoc.entered_at,
        durationMinutes: diffMinutes(openLoc.entered_at, null, now),
        label: openLoc.location_id ? "Plats" : openLoc.large_project_id ? "Projekt" : "Bokning",
        locationEntryId: openLoc.id,
        bookingId: openLoc.booking_id,
        largeProjectId: openLoc.large_project_id,
        locationId: openLoc.location_id,
      }
    : null;

  // ---- Workday back-date / synth from confirmed presence ----
  // HARD RULE: confirmed worksite presence before workday.started_at must
  // automatically pull the workday earlier (unless approved/locked). If
  // there is no workday at all but confirmed presence exists, synthesise
  // one from the earliest confirmed presence so UI never shows
  // "Saknar arbetsdag" while there is real work evidence.
  const policySegments: PolicySegment[] = rawSegments.map((r) => r._policy);
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

  // ---- Totals ----
  // Allocated/travel are summed from their tables. Unknown vistelser
  // INSIDE the workday must NOT shrink the workday total — they show up
  // as part of unallocatedMinutes (and separately as
  // unknownWithinWorkdayMinutes for UI).
  const allocated = timeReports.reduce((s, t) => s + (hoursToMin(t.hours_worked) || 0), 0);
  const travelMin = travelLogs.reduce((s, t) => s + (hoursToMin(t.hours_worked) || diffMinutes(t.start_time, t.end_time, now)), 0);
  const wdMin = workdaySnap?.durationMinutes ?? 0;
  const unallocated = Math.max(0, wdMin - allocated - travelMin);

  let unknownWithinWd = 0;
  let warehouseMin = 0;
  let projectMin = 0;
  for (const seg of segments) {
    const inside = countsWithinActiveWorkday(
      { kind: seg.kind, startedAt: seg.startedAt, endedAt: seg.endedAt, classification: seg.classification, hasConfirmedRef: seg.hasConfirmedRef },
      effectivePolicyWorkday,
      now,
    );
    if (!inside) continue;
    if (seg.policyStatus === "other_place") {
      unknownWithinWd += seg.durationMinutes;
    } else if (seg.kind === "location" && seg.hasConfirmedRef) {
      warehouseMin += seg.durationMinutes;
    } else if ((seg.kind === "project" || seg.kind === "booking") && seg.hasConfirmedRef) {
      projectMin += seg.durationMinutes;
    }
  }
  // Project minutes default to allocated time-reports total (truth source).
  if (projectMin === 0) projectMin = allocated;

  // ---- Canonical totals: bruttotid → rast → manuellt avdrag → lönegrundande ----
  // Rast = användar-/admin-attest.
  // Prio 1: day_attestations.break_minutes (om rad finns).
  // Prio 2: time_reports.break_time (legacy).
  // Other_place + transport drar ALDRIG av lönegrundande tid.
  const trBreakMin = timeReports.reduce((s, t) => s + hoursToMin(t.break_time), 0);
  const breakMin = attestation ? Math.max(0, attestation.break_minutes | 0) : trBreakMin;
  const meta = (workday?.metadata ?? {}) as Record<string, unknown>;
  const manualDeductionMin = Math.max(0, Number(meta.manual_deduction_minutes ?? 0) | 0);
  const grossWorkdayMin = wdMin;
  const payableMin = Math.max(0, grossWorkdayMin - breakMin - manualDeductionMin);

  const liveMinutes = active?.durationMinutes ?? 0;
  const totals: DayTotals = {
    grossWorkdayMinutes: grossWorkdayMin,
    breakMinutes: breakMin,
    manualDeductionMinutes: manualDeductionMin,
    payableMinutes: payableMin,
    projectMinutes: projectMin,
    warehouseMinutes: warehouseMin,
    transportMinutes: travelMin,
    otherPlaceMinutes: unknownWithinWd,
    // Legacy
    workdayMinutes: wdMin,
    allocatedProjectMinutes: allocated,
    travelMinutes: travelMin,
    unallocatedMinutes: unallocated,
    unknownWithinWorkdayMinutes: unknownWithinWd,
    liveMinutes,
    isWorkdayOpen: workdaySnap?.isOpen ?? false,
  };

  // ---- Central segment chain: fyll glapp inom workday med
  // transport / other_place / signal_stale (saknad ping ≠ glapp).
  // Endast om vi har en workday och pings att basera klassningen på.
  if (effectivePolicyWorkday) {
    try {
      const { buildSegmentChainGaps } = await import("./segmentChain.ts");
      const chainGaps = buildSegmentChainGaps({
        workday: { startedAt: effectivePolicyWorkday.startedAt, endedAt: effectivePolicyWorkday.endedAt },
        segments: segments.map((s) => ({
          id: s.id, type: s.type, startedAt: s.startedAt, endedAt: s.endedAt,
          hasConfirmedRef: s.hasConfirmedRef,
        })),
        pings: input.pings ?? [],
        now,
      });
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
  const trackingPolicy: TrackingPolicy = buildTrackingPolicy({
    hasActiveTimer: !!active,
    workdayOpen: !!workdaySnap?.isOpen,
    activeBoosts: input.activeBoosts ?? [],
    batteryPct: input.batteryPct ?? null,
    dismissedCooldownActive: !!input.dismissedCooldownActive,
    now,
  });

  return {
    date,
    staffId,
    workday: workdaySnap,
    active,
    totals,
    segments,
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
  };
}

