// Assemble the mobile day-report from cache + submission + minimal workday liveness.
// Pure-ish (depends only on inputs). No DB access — caller passes rows.
import type {
  MobileActionItem,
  MobileCacheStatus,
  MobileDayReport,
  MobileSegment,
  MobileSubmission,
  MobileSummary,
  MobileWorkdayStatus,
} from "./types.ts";
import { mapReportBlocksToSegments, pickCacheBlocks } from "./mapReportBlocksToSegments.ts";

export interface CacheRow {
  engine_version: string | null;
  summary_json: any;
  report_candidate_blocks_json: any;
  display_blocks_json: any;
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
 * Derive liveness purely from cache. The mirror does NOT read workdays
 * or active_time_registrations — admin web's report cache is the
 * single source of truth.
 *
 *  - "active": cache has any segment without endedAt
 *  - "ended" : cache has segments and all have endedAt
 *  - "inactive": no segments
 */
function workdayStatusFromSegments(segments: MobileSegment[]): MobileWorkdayStatus {
  if (segments.length === 0) return "inactive";
  const open = segments.some((s) => !s.endedAt);
  return open ? "active" : "ended";
}

function workdayObjFromSegments(segments: MobileSegment[]) {
  if (segments.length === 0) return null;
  const sorted = [...segments].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const startedAt = sorted[0].startedAt;
  const open = sorted.some((s) => !s.endedAt);
  // endedAt: latest endedAt across closed segments (only if all closed)
  let endedAt: string | null = null;
  if (!open) {
    endedAt = sorted.reduce<string | null>((acc, s) => {
      if (!s.endedAt) return acc;
      if (!acc) return s.endedAt;
      return new Date(s.endedAt).getTime() > new Date(acc).getTime() ? s.endedAt : acc;
    }, null);
  }
  return {
    startedAt,
    endedAt,
    isOpen: open,
    status: (open ? "active" : "ended") as MobileWorkdayStatus,
  };
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

  if (cache) {
    if (cache.error) {
      cacheStatus = "error";
    } else if (cache.stale) {
      cacheStatus = "stale";
    } else {
      cacheStatus = "ready";
    }
    // Source priority owned by pickCacheBlocks: display_blocks_json first,
    // report_candidate_blocks_json as fallback. Mobile must mirror admin web.
    segments = mapReportBlocksToSegments(pickCacheBlocks(cache));
    summary = summaryFrom(cache.summary_json, segments);
  }

  const sub = mapSubmission(submission);
  const actionsNeeded = actionsFrom(segments, sub);

  // Manual submission fallback: when cache is missing or has no segments
  // but a submission exists with explicit start/end, derive summary +
  // workday object purely from the submission. Read-model only — does
  // NOT create workdays/time_reports rows.
  let workdayStatus = workdayStatusFromSegments(segments);
  let workdayObj = workdayObjFromSegments(segments);
  const hasManualWindow =
    !!submission &&
    !!submission.requested_start_at &&
    !!submission.requested_end_at;
  if (hasManualWindow && segments.length === 0) {
    const startMs = new Date(submission!.requested_start_at!).getTime();
    const endMs = new Date(submission!.requested_end_at!).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      const workMinutes = Math.round((endMs - startMs) / 60000);
      const breakMinutes = Math.max(0, Number(submission!.break_minutes ?? 0));
      const payableMinutes = Math.max(0, workMinutes - breakMinutes);
      summary = {
        workMinutes,
        travelMinutes: 0,
        breakMinutes,
        reviewMinutes: 0,
        payableMinutes,
      };
      workdayObj = {
        startedAt: submission!.requested_start_at!,
        endedAt: submission!.requested_end_at!,
        isOpen: false,
        status: "ended",
      };
      workdayStatus = "ended";
    }
  }

  return {
    date,
    staffId,
    engineVersion: cache?.engine_version ?? null,
    cacheStatus,
    cacheError: cache?.error ?? null,
    workdayStatus,
    workday: workdayObj,
    summary,
    segments,
    actionsNeeded,
    submission: sub,
    trackingPolicy: null, // owned by background reporter; not changed here
    lastUpdatedAt: cache?.built_at ?? null,
  };
}
