// Assemble the mobile day-report from cache + submission + minimal workday liveness.
// Pure-ish (depends only on inputs). No DB access — caller passes rows.
import type {
  MobileActionItem,
  MobileCacheStatus,
  MobileDayReport,
  MobileDayStatus,
  MobileDayStatusDebug,
  MobileSegment,
  MobileSourceSelection,
  MobileSubmission,
  MobileSummary,
  MobileWorkdayStatus,
} from "./types.ts";
import {
  mapReportBlocksToSegments,
  selectCacheBlockSource,
} from "./mapReportBlocksToSegments.ts";

export interface CacheRow {
  engine_version: string | null;
  summary_json: any;
  report_candidate_blocks_json: any;
  display_blocks_json: any;
  /** Optional explicit fallback layer between V2 and legacy. */
  workday_allocation_segments_json?: any;
  diagnostics_json: any;
  built_at: string | null;
  stale: boolean | null;
  error: string | null;
}

export interface SubmissionRow {
  status: string;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number | null;
  comment: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_comment: string | null;
}

// @deprecated — workdays are no longer read by the mobile day mirror.
// Type kept exported for backwards-compatibility with any old caller.
export interface WorkdayLivenessRow {
  start_time: string | null;
  end_time: string | null;
}

function summaryFrom(cacheSummary: any, segments: MobileSegment[]): MobileSummary {
  const work = Number(cacheSummary?.workMinutes ?? 0);
  const travel = Number(cacheSummary?.transportMinutes ?? cacheSummary?.travelMinutes ?? 0);
  const breakMin = Number(cacheSummary?.breakMinutes ?? 0);
  // Review minutes from segments (cache is the source for reviewState via blocks)
  const review = segments
    .filter((s) => s.kind === "needs_review")
    .reduce((a, s) => a + (s.durationMinutes ?? 0), 0);
  const payable = Math.max(0, work + travel - breakMin);
  return {
    workMinutes: Math.round(work),
    travelMinutes: Math.round(travel),
    breakMinutes: Math.round(breakMin),
    reviewMinutes: Math.round(review),
    payableMinutes: Math.round(payable),
  };
}

function actionsFrom(segments: MobileSegment[], submission: MobileSubmission | null): MobileActionItem[] {
  const out: MobileActionItem[] = [];
  const reviewCount = segments.filter((s) => s.kind === "needs_review").length;
  const unknownCount = segments.filter((s) => s.kind === "unknown").length;
  if (reviewCount > 0) {
    out.push({
      id: "review_blocks",
      title: `${reviewCount} segment behöver granskas`,
      description: "Kontrollera tider och plats innan inskick.",
      severity: "warning",
    });
  }
  if (unknownCount > 0) {
    out.push({
      id: "unknown_blocks",
      title: `${unknownCount} okänd plats`,
      description: "Markera vad du gjorde under denna tid.",
      severity: "info",
    });
  }
  if (!submission && segments.length > 0) {
    out.push({
      id: "submit_day",
      title: "Skicka in dagen",
      description: "Bekräfta din arbetstid när dagen är klar.",
      severity: "info",
    });
  }
  return out;
}

function mapSubmission(row: SubmissionRow | null): MobileSubmission | null {
  if (!row) return null;
  const allowed: MobileSubmission["status"][] = [
    "submitted", "approved", "rejected", "correction_requested", "withdrawn",
  ];
  const status = (allowed as string[]).includes(row.status)
    ? (row.status as MobileSubmission["status"])
    : "submitted";
  return {
    status,
    requestedStartAt: row.requested_start_at,
    requestedEndAt: row.requested_end_at,
    breakMinutes: Number(row.break_minutes ?? 0),
    comment: row.comment,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewComment: row.review_comment,
  };
}

/**
 * Time Reporting Fix 2 — workdayStatus får ALDRIG bli "ended" bara för att
 * alla segment har endedAt. Segment är fördelning inom dagen, inte ett
 * dag-stop. Vi tolkar "ended" endast vid explicit submission.
 *
 *  - "active":  sista segmentet saknar endedAt ELLER isActive=true
 *  - "ended":   submission finns med submitted/approved (sätts senare i build)
 *  - "inactive": annars (även om historiska segment finns utan submit)
 */
function workdayStatusFromSegments(segments: MobileSegment[]): MobileWorkdayStatus {
  if (segments.length === 0) return "inactive";
  const open = segments.some((s) => !s.endedAt || s.isActive === true);
  return open ? "active" : "inactive";
}

interface InternalWorkdayObj {
  startedAt: string;
  endedAt: string | null;
  isOpen: boolean;
  status: MobileWorkdayStatus;
}

function workdayObjFromSegments(segments: MobileSegment[]): InternalWorkdayObj | null {
  if (segments.length === 0) return null;
  const sorted = [...segments].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const startedAt = sorted[0].startedAt;
  const open = sorted.some((s) => !s.endedAt || s.isActive === true);
  // endedAt EXPONERAS ALDRIG från segment-kedjan — bara explicit dag-stop får
  // sätta detta.
  return {
    startedAt,
    endedAt: null,
    isOpen: open,
    status: open ? "active" : "inactive",
  };
}

const WORKISH_KINDS = new Set([
  "project", "warehouse", "booking", "travel",
  "large_project", "location", "needs_review",
]);

function deriveDayStatus(args: {
  segments: MobileSegment[];
  submission: MobileSubmission | null;
  workdayObj: { startedAt: string; endedAt: string | null; isOpen: boolean } | null;
  hasManualSubmissionWindow: boolean;
}): { status: MobileDayStatus; reason: string; debug: MobileDayStatusDebug } {
  const { segments, submission, workdayObj, hasManualSubmissionWindow } = args;

  const activeTimerExists = !!workdayObj?.isOpen;
  const hasSegments = segments.length > 0;
  const hasWorkBlocks = segments.some(
    (s) => WORKISH_KINDS.has(String(s.kind)) && (s.durationMinutes ?? 0) > 0,
  );

  const submissionStatus = submission?.status ?? null;
  const hasSubmission =
    !!submission &&
    (submissionStatus === "submitted" ||
      submissionStatus === "approved" ||
      submissionStatus === "rejected" ||
      submissionStatus === "correction_requested");
  // I mirror-modellen är "explicit stop" synonymt med en giltig submission.
  // workdayObj.endedAt sätts numera ALDRIG från segments.
  const hasExplicitStoppedAt = hasSubmission || hasManualSubmissionWindow;

  const lastSeg = hasSegments
    ? segments.reduce((acc, s) => {
        const aEnd = acc.endedAt ?? acc.startedAt;
        const sEnd = s.endedAt ?? s.startedAt;
        return new Date(sEnd).getTime() > new Date(aEnd).getTime() ? s : acc;
      }, segments[0])
    : null;

  let status: MobileDayStatus;
  let reason: string;
  if (submission && (submissionStatus === "submitted" || submissionStatus === "approved")) {
    status = "submitted_day";
    reason = `submission.status=${submissionStatus}`;
  } else if (activeTimerExists) {
    status = "active_day";
    reason = "workday.isOpen=true (active segment)";
  } else if (hasExplicitStoppedAt) {
    status = "ended_day";
    reason = hasSubmission
      ? `submission.status=${submissionStatus}`
      : "manual_submission_window";
  } else if (hasSegments || hasWorkBlocks) {
    status = "has_time_not_submitted";
    reason = "segments_exist_without_submit";
  } else {
    status = "empty_day";
    reason = "no_workday_no_segments";
  }

  const debug: MobileDayStatusDebug = {
    dayStatus: status,
    reasonForDayStatus: reason,
    activeTimerExists,
    hasSegments,
    hasWorkBlocks,
    hasExplicitStoppedAt,
    hasSubmission,
    submissionStatus,
    lastSegmentKind: (lastSeg?.kind as string) ?? null,
    lastSegmentEndedAt: lastSeg?.endedAt ?? null,
  };
  return { status, reason, debug };
}

export interface BuildMobileSnapshotInput {
  date: string;
  staffId: string;
  cache: CacheRow | null;
  submission: SubmissionRow | null;
  /** @deprecated workdays are no longer used by the mirror. Ignored if passed. */
  workday?: WorkdayLivenessRow | null;
}

export function buildMobileSnapshot(input: BuildMobileSnapshotInput): MobileDayReport {
  const { date, staffId, cache, submission } = input;

  let cacheStatus: MobileCacheStatus = "missing";
  let segments: MobileSegment[] = [];
  let summary: MobileSummary = {
    workMinutes: 0, travelMinutes: 0, breakMinutes: 0, reviewMinutes: 0, payableMinutes: 0,
  };
  let sourceSelection: MobileSourceSelection = {
    hasDisplayTimelineV2Field: false,
    displayTimelineV2Count: 0,
    reportCandidateCount: 0,
    selectedSegmentSource: "none",
    fallbackReason: "no_cache_or_blocks",
  };

  if (cache) {
    if (cache.error) cacheStatus = "error";
    else if (cache.stale) cacheStatus = "stale";
    else cacheStatus = "ready";
    const picked = selectCacheBlockSource(cache);
    sourceSelection = picked.selection;
    // Time Reporting Fix 6 — om V2-fältet finns men är tomt så bygger vi
    // INGA segment. Mobilen får visa GPS-evidence/status istället för att
    // fylla på från legacy.
    if (picked.source !== "none") {
      segments = mapReportBlocksToSegments(picked.blocks, { source: picked.source });
    }
    summary = summaryFrom(cache.summary_json, segments);
  }

  const sub = mapSubmission(submission);
  const actionsNeeded = actionsFrom(segments, sub);

  let workdayStatus = workdayStatusFromSegments(segments);
  let workdayObj = workdayObjFromSegments(segments);
  const hasManualWindow =
    !!submission &&
    !!submission.requested_start_at &&
    !!submission.requested_end_at;

  // Manual submission fallback: explicit window räknas som ended.
  if (hasManualWindow && segments.length === 0) {
    const startMs = new Date(submission!.requested_start_at!).getTime();
    const endMs = new Date(submission!.requested_end_at!).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      const workMinutes = Math.round((endMs - startMs) / 60000);
      const breakMinutes = Math.max(0, Number(submission!.break_minutes ?? 0));
      const payableMinutes = Math.max(0, workMinutes - breakMinutes);
      summary = { workMinutes, travelMinutes: 0, breakMinutes, reviewMinutes: 0, payableMinutes };
      workdayObj = {
        startedAt: submission!.requested_start_at!,
        endedAt: submission!.requested_end_at!,
        isOpen: false,
        status: "ended",
      };
      workdayStatus = "ended";
    }
  }

  // Submission med submitted/approved räcker för "ended" workday även utan window.
  if (
    workdayStatus !== "ended" &&
    sub &&
    (sub.status === "submitted" || sub.status === "approved")
  ) {
    workdayStatus = "ended";
    if (workdayObj) workdayObj = { ...workdayObj, isOpen: false, status: "ended" };
  }

  const dayStatusResult = deriveDayStatus({
    segments,
    submission: sub,
    workdayObj,
    hasManualSubmissionWindow: hasManualWindow,
  });

  return {
    date,
    staffId,
    engineVersion: cache?.engine_version ?? null,
    cacheStatus,
    cacheError: cache?.error ?? null,
    workdayStatus,
    workday: workdayObj,
    dayStatus: dayStatusResult.status,
    debugDayStatus: dayStatusResult.debug,
    debugSourceSelection: sourceSelection,
    summary,
    segments,
    actionsNeeded,
    submission: sub,
    trackingPolicy: null,
    lastUpdatedAt: cache?.built_at ?? null,
  };
}
