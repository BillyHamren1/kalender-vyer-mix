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
}

export type SegmentKind = "project" | "booking" | "travel" | "location" | "unknown" | "active";

export interface DaySegment {
  kind: SegmentKind;
  startedAt: Iso;
  endedAt: Iso | null;
  durationMinutes: number;
  isActive: boolean;
  label: string;
  source: string;
  refs: {
    timeReportId?: string;
    travelLogId?: string;
    locationEntryId?: string;
    bookingId?: string | null;
    largeProjectId?: string | null;
    locationId?: string | null;
    taskId?: string | null;
  };
  approved?: boolean | null;
  /** True when ref points at a real booking/large_project/location_id. */
  hasConfirmedRef?: boolean;
  /** Backend-known classification: 'private' | 'break' | null. */
  classification?: string | null;
  /** Canonical status from workdayPolicy.classifySegment. */
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
  workdayMinutes: number;          // total payable workday duration
  allocatedProjectMinutes: number; // sum of time_reports
  travelMinutes: number;           // sum of travel logs
  /** workday - allocated - travel (>=0). Includes unknown-inside-workday. */
  unallocatedMinutes: number;
  /** Subset of unallocated: unknown vistelser inom arbetsdagen. */
  unknownWithinWorkdayMinutes: number;
  liveMinutes: number;             // current active location duration
  isWorkdayOpen: boolean;
}

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

export function buildStaffDaySnapshot(input: SnapshotInput, now: Date = new Date()): StaffDaySnapshot {
  const { staffId, date, workday, timeReports, travelLogs, locationEntries, flags, assistantEvents } = input;

  // ---- Workday ----
  // We may auto-extend the started_at downward (back-date) when confirmed
  // worksite presence exists earlier — this is a hard rule, not a suggestion.
  // The auto-extended value below is computed AFTER raw segments are built.
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

  // PolicyWorkday is the lightweight context the policy module reads.
  const policyWorkday: PolicyWorkday | null = workdaySnapBase
    ? {
        startedAt: workdaySnapBase.startedAt,
        endedAt: workdaySnapBase.endedAt,
        approved: workdaySnapBase.approved,
      }
    : null;

  // ---- Segments (no policyStatus yet — we tag after sort) ----
  const rawSegments: Array<DaySegment & { _policy: PolicySegment }> = [];

  for (const tr of timeReports) {
    const startedAt = combineDateTime(tr.report_date, tr.start_time) ?? `${date}T00:00:00`;
    const endedAt = combineDateTime(tr.report_date, tr.end_time);
    const minutes = hoursToMin(tr.hours_worked) || diffMinutes(startedAt, endedAt, now);
    const kind = tr.large_project_id ? "project" : "booking";
    const hasConfirmedRef = !!(tr.large_project_id || tr.booking_id);
    rawSegments.push({
      kind,
      startedAt,
      endedAt,
      durationMinutes: minutes,
      isActive: false,
      label: tr.description || (tr.large_project_id ? "Projekt" : tr.booking_id ? `Bokning ${tr.booking_id}` : "Tid"),
      source: tr.source ?? "time_report",
      refs: {
        timeReportId: tr.id,
        bookingId: tr.booking_id,
        largeProjectId: tr.large_project_id,
      },
      approved: tr.approved,
      hasConfirmedRef,
      classification: null,
      policyStatus: "confirmed_work",
      _policy: {
        kind, startedAt, endedAt, approved: tr.approved, hasConfirmedRef,
      },
    });
  }

  for (const tl of travelLogs) {
    const minutes = hoursToMin(tl.hours_worked) || diffMinutes(tl.start_time, tl.end_time, now);
    rawSegments.push({
      kind: "travel",
      startedAt: tl.start_time,
      endedAt: tl.end_time,
      durationMinutes: minutes,
      isActive: !tl.end_time,
      label: tl.description ||
        `Resa ${tl.from_address ?? "?"} → ${tl.to_address ?? tl.manual_project_name ?? "?"}`,
      source: (tl as { source?: string }).source ?? "travel_log",
      refs: {
        travelLogId: tl.id,
        bookingId: tl.destination_booking_id ?? null,
      },
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
    rawSegments.push({
      kind,
      startedAt: le.entered_at,
      endedAt: le.exited_at,
      durationMinutes: minutes,
      isActive,
      label: isActive
        ? "Pågående aktivitet"
        : kind === "location" ? "Plats"
        : kind === "unknown" ? "Okänd vistelse"
        : "Vistelse",
      source: le.source ?? "location_entry",
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

  // Tag every segment with its canonical policy status now that we have
  // the workday context.
  const segments: DaySegment[] = rawSegments
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map(({ _policy, ...rest }) => ({
      ...rest,
      policyStatus: classifySegment(_policy, policyWorkday, now),
    }));

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
  for (const seg of segments) {
    if (
      (seg.kind === "unknown" || (seg.kind === "location" && !seg.hasConfirmedRef)) &&
      countsAsPayableUnallocated(
        { kind: seg.kind, startedAt: seg.startedAt, endedAt: seg.endedAt, classification: seg.classification, hasConfirmedRef: seg.hasConfirmedRef },
        policyWorkday,
        now,
      )
    ) {
      unknownWithinWd += seg.durationMinutes;
    }
  }

  const liveMinutes = active?.durationMinutes ?? 0;
  const totals: DayTotals = {
    workdayMinutes: wdMin,
    allocatedProjectMinutes: allocated,
    travelMinutes: travelMin,
    unallocatedMinutes: unallocated,
    unknownWithinWorkdayMinutes: unknownWithinWd,
    liveMinutes,
    isWorkdayOpen: workdaySnap?.isOpen ?? false,
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
      id: `unknown-within-workday-${workdaySnap?.id ?? date}`,
      type: "unknown_within_workday",
      severity: "info",
      title: "Okänd vistelse inom arbetsdagen",
      description: `${unknownWithinWd} min ligger inom arbetsdagen och väntar på klassning.`,
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

  return {
    date,
    staffId,
    workday: workdaySnap,
    active,
    totals,
    segments,
    flags: dayFlags,
    assistantEvents: events,
    lastUpdatedAt: now.toISOString(),
  };
}
