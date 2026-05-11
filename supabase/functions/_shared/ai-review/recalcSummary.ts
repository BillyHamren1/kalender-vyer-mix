// Bygger om summary-totals från en blocklista. Speglas i frontend.
import type { AiReviewMeta } from "./types.ts";

interface BlockLike {
  kind?: string | null;
  reviewState?: string | null;
  durationMinutes?: number | null;
  aiReview?: AiReviewMeta | null;
}

export interface ReportSummaryTotals {
  workMinutes: number;
  transportMinutes: number;
  unknownMinutes: number;
  needsReviewMinutes: number;
  excludedMinutes: number;
  workBlocksCount: number;
  transportBlocksCount: number;
  unknownBlocksCount: number;
  needsReviewBlocksCount: number;
  reportCandidateBlocksCount: number;
}

export function recalculateSummaryFromReportBlocks(
  blocks: BlockLike[],
): ReportSummaryTotals {
  let workMinutes = 0;
  let transportMinutes = 0;
  let unknownMinutes = 0;
  let needsReviewMinutes = 0;
  let excludedMinutes = 0;
  let workBlocksCount = 0;
  let transportBlocksCount = 0;
  let unknownBlocksCount = 0;
  let needsReviewBlocksCount = 0;

  for (const b of blocks) {
    const minutes = Math.max(0, Math.round(Number(b.durationMinutes ?? 0)));
    const kind = String(b.kind ?? "");
    const review = String(b.reviewState ?? "");
    const stillNeedsReview = review === "needs_review";
    if (stillNeedsReview) {
      needsReviewMinutes += minutes;
      needsReviewBlocksCount += 1;
      continue;
    }
    if (kind === "work") {
      workMinutes += minutes;
      workBlocksCount += 1;
    } else if (kind === "transport") {
      transportMinutes += minutes;
      transportBlocksCount += 1;
    } else if (kind === "unknown") {
      unknownMinutes += minutes;
      unknownBlocksCount += 1;
    } else if (kind === "exclude_from_report" || kind === "private") {
      excludedMinutes += minutes;
    }
  }

  return {
    workMinutes,
    transportMinutes,
    unknownMinutes,
    needsReviewMinutes,
    excludedMinutes,
    workBlocksCount,
    transportBlocksCount,
    unknownBlocksCount,
    needsReviewBlocksCount,
    reportCandidateBlocksCount: blocks.length,
  };
}
