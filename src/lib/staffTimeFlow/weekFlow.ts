// Pure mapper: GPS-summeringar + staff_day_submissions → WeekFlow.
// Återanvänder reportRowFilter.toReportRows för GPS-förslag och läser
// display_timeline_snapshot_json för inskickade/attesterade dagar.

import { format } from "date-fns";
import { toReportRows, summarizeReportRows } from "@/lib/staff-gps/reportRowFilter";
import { formatStockholmHm } from "@/lib/staff/formatStockholmTime";
import type { StaffGpsDaySummary } from "@/hooks/staff/useStaffGpsWeekSummary";
import type { StaffDaySubmissionRow } from "@/hooks/staff/useStaffDaySubmissions";
import { calculateWorkTimeBuckets } from "./workTimeBuckets";
import type {
  WeekFlow,
  WeekFlowDay,
  WeekFlowRow,
  WeekFlowRowKind,
  WeekFlowStatus,
  WeekFlowViewer,
} from "./types";

export interface BuildWeekFlowInput {
  staffId: string;
  weekDates: Date[];
  gpsSummaries: StaffGpsDaySummary[];
  /** Submissions för (staffId, weekDates). Filtreras internt. */
  submissions: StaffDaySubmissionRow[];
  /** Submission med display_timeline_snapshot_json (per-id lookup). */
  snapshotsById?: Record<string, unknown> | null;
  viewer: WeekFlowViewer;
}

/** DB-status → flow-status. Okända statusar faller till submitted_waiting_approval. */
export function mapDbStatusToFlow(status: string): WeekFlowStatus {
  if (status === "approved" || status === "payroll_approved") return "approved";
  if (status === "correction_requested") return "correction_requested";
  if (
    status === "submitted" ||
    status === "edited" ||
    status === "needs_control" ||
    status === "needs_user_attention" ||
    status === "ai_flagged"
  ) {
    return "submitted_waiting_approval";
  }
  return "submitted_waiting_approval";
}

function emptyDay(date: string, viewer: WeekFlowViewer): WeekFlowDay {
  return {
    date,
    status: "gps_proposal",
    startTime: null,
    endTime: null,
    workMinutes: 0,
    travelMinutes: 0,
    totalMinutes: 0,
    normalMinutes: 0,
    overtimeMinutes: 0,
    rows: [],
    source: "empty",
    submissionId: null,
    gpsAvailable: false,
    canSubmit: viewer === "staff",
    canApprove: false,
    canRequestCorrection: false,
    submittedAt: null,
    approvedAt: null,
    approvedBy: null,
    reviewComment: null,
    pingCount: 0,
  };
}

function rowsFromGpsSummary(summary: StaffGpsDaySummary): WeekFlowRow[] {
  const reportRows = toReportRows(summary.segments ?? []);
  return reportRows.map((s, idx) => {
    const kind: WeekFlowRowKind =
      s.type === "work" ? "work"
      : s.type === "travel" ? "travel"
      : s.type === "private" ? "private"
      : s.type === "unknown_place" ? "unknown_place"
      : s.type === "gps_gap" ? "gps_gap"
      : "other";
    const isTravelish = kind === "travel" || kind === "gps_gap" || kind === "unknown_place";
    return {
      key: `${summary.date}:gps:${idx}`,
      kind,
      label: s.label,
      startIso: s.start,
      endIso: s.end,
      minutes: s.minutes,
      fromLabel: isTravelish ? s.fromLabel ?? null : null,
      toLabel: isTravelish ? s.toLabel ?? null : null,
    };
  });
}

function rowsFromSubmissionSnapshot(snapshot: unknown, date: string): WeekFlowRow[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((r, idx) => {
    const raw = r as Record<string, any>;
    const type = String(raw.type ?? raw.kind ?? "work");
    const kind: WeekFlowRowKind =
      type === "manual_work" || type === "work" ? "work"
      : type === "travel" ? "travel"
      : type === "private" ? "private"
      : type === "unknown_place" ? "unknown_place"
      : type === "gps_gap" ? "gps_gap"
      : "other";
    const minutes = Number(raw.minutes ?? raw.durationMinutes ?? 0) || 0;
    return {
      key: String(raw.id ?? raw.segmentKey ?? `${date}:snap:${idx}`),
      kind,
      label: String(raw.label ?? "Arbete"),
      startIso: (raw.start ?? raw.startedAt ?? null) as string | null,
      endIso: (raw.end ?? raw.endedAt ?? null) as string | null,
      minutes,
      targetType: raw.targetType ?? null,
      targetId: raw.targetId ?? null,
      warning: raw.warning ?? null,
    };
  });
}

function permissionsFor(status: WeekFlowStatus, viewer: WeekFlowViewer) {
  return {
    canSubmit: viewer === "staff" && (status === "gps_proposal" || status === "correction_requested"),
    canApprove: viewer === "admin" && status === "submitted_waiting_approval",
    canRequestCorrection: viewer === "admin" && status === "submitted_waiting_approval",
  };
}

function isoTimeFromIso(iso: string | null): string | null {
  if (!iso) return null;
  try { return formatStockholmHm(iso); } catch { return null; }
}

export function buildWeekFlow(input: BuildWeekFlowInput): WeekFlow {
  const { staffId, weekDates, gpsSummaries, submissions, snapshotsById, viewer } = input;
  const dateStrs = weekDates.map((d) => format(d, "yyyy-MM-dd"));

  const gpsByDate = new Map<string, StaffGpsDaySummary>();
  for (const g of gpsSummaries) gpsByDate.set(g.date, g);

  // Senaste submission per datum vinner (submitted_at desc förväntas redan).
  const subByDate = new Map<string, StaffDaySubmissionRow>();
  for (const s of submissions) {
    if (s.staff_id !== staffId) continue;
    if (!subByDate.has(s.date)) subByDate.set(s.date, s);
  }

  const days: WeekFlowDay[] = dateStrs.map((date) => {
    const gps = gpsByDate.get(date);
    const sub = subByDate.get(date);
    const day = emptyDay(date, viewer);
    day.gpsAvailable = !!gps && gps.pingsCount > 0;
    day.pingCount = gps?.pingsCount ?? 0;

    if (sub) {
      const status = mapDbStatusToFlow(String(sub.status));
      const snapshot = snapshotsById?.[sub.id] ?? null;
      const rows = rowsFromSubmissionSnapshot(snapshot, date);
      // Total/work/travel: räkna från snapshot om rader finns, annars summary.
      const workMin = rows.filter((r) => r.kind === "work").reduce((a, r) => a + r.minutes, 0);
      const travelMin = rows.filter((r) => r.kind === "travel").reduce((a, r) => a + r.minutes, 0);
      const startIso = sub.requested_start_at ?? rows[0]?.startIso ?? null;
      const endIso = sub.requested_end_at ?? rows[rows.length - 1]?.endIso ?? null;
      const totalMin = rows.length > 0
        ? rows.reduce((a, r) => a + r.minutes, 0)
        : (startIso && endIso
            ? Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000) - (sub.break_minutes ?? 0))
            : 0);
      const buckets = calculateWorkTimeBuckets(
        rows.map((r) => ({ kind: r.kind, startIso: r.startIso, endIso: r.endIso, minutes: r.minutes })),
        { breakMinutes: sub.break_minutes ?? 0 },
      );

      const perms = permissionsFor(status, viewer);
      const isApproved = status === "approved";
      return {
        ...day,
        status,
        startTime: isoTimeFromIso(startIso),
        endTime: isoTimeFromIso(endIso),
        workMinutes: workMin,
        travelMinutes: travelMin,
        totalMinutes: totalMin,
        normalMinutes: buckets.normalMinutes,
        overtimeMinutes: buckets.overtimeMinutes,
        rows,
        source: "submission_snapshot",
        submissionId: sub.id,
        submittedAt: sub.submitted_at ?? null,
        approvedAt: isApproved ? sub.reviewed_at : null,
        approvedBy: isApproved ? sub.reviewed_by : null,
        reviewComment: sub.review_comment ?? null,
        ...perms,
      };
    }

    // Inget submission — bygg GPS-förslag.
    if (gps && gps.pingsCount > 0) {
      const rows = rowsFromGpsSummary(gps);
      const reportSummary = summarizeReportRows(toReportRows(gps.segments ?? []), gps.segments ?? []);
      const startIso = rows[0]?.startIso ?? gps.firstIso;
      const endIso = rows[rows.length - 1]?.endIso ?? gps.lastIso;
      const status: WeekFlowStatus = "gps_proposal";
      const perms = permissionsFor(status, viewer);
      const buckets = calculateWorkTimeBuckets(
        rows.map((r) => ({ kind: r.kind, startIso: r.startIso, endIso: r.endIso, minutes: r.minutes })),
        { breakMinutes: 0 },
      );
      return {
        ...day,
        status,
        startTime: isoTimeFromIso(startIso),
        endTime: isoTimeFromIso(endIso),
        workMinutes: reportSummary.workMin,
        travelMinutes: reportSummary.travelMin,
        totalMinutes: rows.reduce((a, r) => a + r.minutes, 0),
        normalMinutes: buckets.normalMinutes,
        overtimeMinutes: buckets.overtimeMinutes,
        rows,
        source: "gps_proposal",
        ...perms,
      };
    }

    return day;
  });

  return {
    staffId,
    weekStart: dateStrs[0] ?? "",
    weekEnd: dateStrs[dateStrs.length - 1] ?? "",
    viewer,
    days,
  };
}
