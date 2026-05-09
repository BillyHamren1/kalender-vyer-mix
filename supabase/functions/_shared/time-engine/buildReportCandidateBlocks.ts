// @ts-nocheck
/**
 * Time Engine — buildReportCandidateBlocks
 * ─────────────────────────────────────────
 *
 * Pure transformation: presenceDayBlocks (evidence layer) → reportCandidateBlocks
 * (time-report-friendly layer).
 *
 * presenceDayBlocks is correct for traceability — it can contain many
 * signal_gap blocks. That is NOT a good time report. This module collapses
 * those into work / transport / break / unknown / needs_review candidates.
 *
 * STRICT GUARANTEES:
 *   - This module never writes to the database.
 *   - It never creates time_reports, workdays, location_time_entries or
 *     travel_time_logs.
 *   - It never alters the underlying presenceDayBlocks input.
 *   - GPS gaps NEVER become transport.
 *   - GPS gaps between two DIFFERENT targets NEVER become work.
 *   - Long signal_gap inside the same target → folded into a single work
 *     block with reduced confidence + reviewReasons.
 *
 * INPUTS  (all optional except presenceDayBlocks):
 *   - presenceDayBlocks       (required)
 *   - activeTimeRegistrations (optional, used to keep an open day "alive"
 *                               while interpreting trailing gaps)
 *   - staffPresenceSessions   (optional, used the same way)
 *   - policy                  (optional thresholds)
 *
 * OUTPUT:
 *   ReportCandidateDayResult { blocks: ReportCandidateBlock[], summary }
 */

import type {
  PresenceDayBlock,
  PresenceConfidence,
} from './buildPresenceDayBlocks.ts';
import type { ISODate, ISODateTime, UUID } from './contracts.ts';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type ReportBlockKind =
  | 'work'
  | 'transport'
  | 'break'
  | 'unknown'
  | 'needs_review';

export type ReportConfidence = 'high' | 'medium' | 'low';
export type ReportReviewState = 'ok' | 'needs_review';

export interface ReportCandidateBlock {
  id: string;
  kind: ReportBlockKind;
  startAt: ISODateTime;
  endAt: ISODateTime;
  durationMinutes: number;
  targetType: string | null;
  targetId: UUID | null;
  targetLabel: string | null;
  confidence: ReportConfidence;
  reviewState: ReportReviewState;
  reviewReasons: string[];
  /** Discreet warning text suitable for the time-report row, or null. */
  warningLabel: string | null;
  evidenceSummary: {
    confirmedMinutes: number;
    probableMinutes: number;
    signalGapMinutes: number;
    transportMinutes: number;
    unknownMinutes: number;
    presenceBlockCount: number;
    suppressedSignalGapBlockCount: number;
    distanceMeters?: number;
  };
  sourcePresenceBlockIds: string[];
  hiddenSignalGapIds: string[];
  signalGapMinutes: number;
  firstConfirmedAt: ISODateTime | null;
  lastConfirmedAt: ISODateTime | null;
}

export interface ReportCandidateSummary {
  blocksCount: number;
  workMinutes: number;
  transportMinutes: number;
  breakMinutes: number;
  unknownMinutes: number;
  needsReviewMinutes: number;
  needsReviewCount: number;
  totalSignalGapMinutes: number;
  suppressedSignalGapBlockCount: number;
}

export interface ActiveTimeRegistrationInput {
  id: UUID;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  source?: string | null;
  targetType?: string | null;
  targetId?: UUID | null;
}

export interface StaffPresenceSessionInput {
  id: UUID;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
}

export interface ReportCandidatePolicy {
  /** Signal-gap inside same target is always folded into work, but if longer
   *  than this it forces reviewState=needs_review. Default 20 min. */
  longGapInsideWorkMinutes?: number;
  /** Lone signal_gap NOT bridging same target longer than this becomes
   *  needs_review (otherwise it is dropped/absorbed silently). Default 10. */
  loneGapNeedsReviewMinutes?: number;
  /** Stable unknown_place shorter than this is dropped from the report
   *  (kept in presence layer). Default 10 min. */
  minUnknownMinutes?: number;
  /** Transport shorter than this is folded into surrounding work if same
   *  target on both sides. Default 3 min. */
  shortTransportMergeMinutes?: number;
}

export interface BuildReportCandidateBlocksInput {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  presenceDayBlocks: PresenceDayBlock[];
  activeTimeRegistrations?: ActiveTimeRegistrationInput[];
  staffPresenceSessions?: StaffPresenceSessionInput[];
  policy?: ReportCandidatePolicy;
}

export interface ReportCandidateDayResult {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  blocks: ReportCandidateBlock[];
  summary: ReportCandidateSummary;
  warnings: string[];
  policy: Required<ReportCandidatePolicy>;
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_POLICY: Required<ReportCandidatePolicy> = {
  longGapInsideWorkMinutes: 20,
  loneGapNeedsReviewMinutes: 10,
  minUnknownMinutes: 10,
  shortTransportMergeMinutes: 3,
};

function minutesBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

function targetKey(b: PresenceDayBlock): string | null {
  if (!b.targetId && !b.targetType) return null;
  return `${b.targetType ?? ''}::${b.targetId ?? ''}`;
}

function isOnSite(b: PresenceDayBlock): boolean {
  return b.kind === 'confirmed_on_site' || b.kind === 'probable_on_site';
}

function downgrade(c: PresenceConfidence | ReportConfidence, to: ReportConfidence): ReportConfidence {
  const order: ReportConfidence[] = ['low', 'medium', 'high'];
  const ai = order.indexOf(c as ReportConfidence);
  const bi = order.indexOf(to);
  if (ai < 0) return to;
  return order[Math.min(ai, bi)] as ReportConfidence;
}

function fmtMinutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h} h ${r} min`;
  if (h > 0) return `${h} h`;
  return `${r} min`;
}

function isDayOpen(
  date: ISODate,
  endAt: string,
  active?: ActiveTimeRegistrationInput[],
  sessions?: StaffPresenceSessionInput[],
): boolean {
  const cutoff = new Date(`${date}T23:59:59Z`).getTime();
  const end = new Date(endAt).getTime();
  if (end >= cutoff) return true;
  if (active?.some((r) => !r.endedAt || new Date(r.endedAt).getTime() > end)) return true;
  if (sessions?.some((s) => !s.endedAt || new Date(s.endedAt).getTime() > end)) return true;
  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// Core
// ───────────────────────────────────────────────────────────────────────────

interface AccumulatedBlock {
  kind: ReportBlockKind;
  startAt: string;
  endAt: string;
  targetType: string | null;
  targetId: UUID | null;
  targetLabel: string | null;
  sourceIds: string[];
  hiddenSignalGapIds: string[];
  signalGapMinutes: number;
  suppressedSignalGapBlockCount: number;
  confirmedMinutes: number;
  probableMinutes: number;
  transportMinutes: number;
  unknownMinutes: number;
  distanceMeters: number;
  reviewReasons: Set<string>;
  firstConfirmedAt: string | null;
  lastConfirmedAt: string | null;
  confidence: ReportConfidence;
}

function newAcc(kind: ReportBlockKind, b: PresenceDayBlock): AccumulatedBlock {
  return {
    kind,
    startAt: b.startAt,
    endAt: b.endAt,
    targetType: b.targetType,
    targetId: b.targetId,
    targetLabel: b.targetLabel,
    sourceIds: [b.id],
    hiddenSignalGapIds: [],
    signalGapMinutes: b.signalGapMinutes ?? 0,
    suppressedSignalGapBlockCount: 0,
    confirmedMinutes: b.kind === 'confirmed_on_site' ? b.durationMinutes : 0,
    probableMinutes: b.kind === 'probable_on_site' ? b.durationMinutes : 0,
    transportMinutes: b.kind === 'transport' ? b.durationMinutes : 0,
    unknownMinutes: b.kind === 'unknown_place' ? b.durationMinutes : 0,
    distanceMeters: b.evidence?.distanceMeters ?? 0,
    reviewReasons: new Set<string>(),
    firstConfirmedAt: b.kind === 'confirmed_on_site' ? b.startAt : null,
    lastConfirmedAt: b.kind === 'confirmed_on_site' ? b.endAt : null,
    confidence: b.confidence as ReportConfidence,
  };
}

function absorb(acc: AccumulatedBlock, b: PresenceDayBlock, asSignalGap = false) {
  acc.endAt = b.endAt;
  acc.sourceIds.push(b.id);
  if (asSignalGap || b.kind === 'signal_gap') {
    acc.hiddenSignalGapIds.push(b.id);
    acc.signalGapMinutes += b.durationMinutes;
    acc.suppressedSignalGapBlockCount += 1;
  } else {
    acc.signalGapMinutes += b.signalGapMinutes ?? 0;
  }
  if (b.kind === 'confirmed_on_site') {
    acc.confirmedMinutes += b.durationMinutes;
    if (!acc.firstConfirmedAt) acc.firstConfirmedAt = b.startAt;
    acc.lastConfirmedAt = b.endAt;
  } else if (b.kind === 'probable_on_site') {
    acc.probableMinutes += b.durationMinutes;
  } else if (b.kind === 'transport') {
    acc.transportMinutes += b.durationMinutes;
    acc.distanceMeters += b.evidence?.distanceMeters ?? 0;
  } else if (b.kind === 'unknown_place') {
    acc.unknownMinutes += b.durationMinutes;
  }
}

function finalize(
  acc: AccumulatedBlock,
  policy: Required<ReportCandidatePolicy>,
  index: number,
): ReportCandidateBlock {
  const duration = minutesBetween(acc.startAt, acc.endAt);

  // Confidence rules
  let confidence: ReportConfidence = acc.confidence;
  if (acc.kind === 'work') {
    const onSite = acc.confirmedMinutes + acc.probableMinutes;
    const ratio = duration > 0 ? acc.signalGapMinutes / duration : 0;
    if (acc.signalGapMinutes >= policy.longGapInsideWorkMinutes || ratio > 0.4) {
      confidence = 'low';
      acc.reviewReasons.add('signal_gaps_inside_work_block');
    } else if (acc.signalGapMinutes > 0 || acc.probableMinutes > acc.confirmedMinutes) {
      confidence = downgrade(confidence, 'medium');
    } else if (onSite > 0) {
      confidence = 'high';
    }
  } else if (acc.kind === 'transport') {
    confidence = acc.distanceMeters > 0 ? 'high' : 'medium';
  } else if (acc.kind === 'unknown') {
    confidence = 'low';
  } else if (acc.kind === 'needs_review') {
    confidence = 'low';
  }

  let reviewState: ReportReviewState =
    acc.reviewReasons.size > 0 || acc.kind === 'needs_review' || confidence === 'low'
      ? 'needs_review'
      : 'ok';
  if (acc.kind === 'needs_review') reviewState = 'needs_review';

  const warningLabel =
    acc.signalGapMinutes > 0 && acc.kind === 'work'
      ? `Signal saknades periodvis: ${fmtMinutes(acc.signalGapMinutes)}`
      : null;

  return {
    id: `rc-${index}-${acc.startAt}`,
    kind: acc.kind,
    startAt: acc.startAt,
    endAt: acc.endAt,
    durationMinutes: duration,
    targetType: acc.targetType,
    targetId: acc.targetId,
    targetLabel: acc.targetLabel,
    confidence,
    reviewState,
    reviewReasons: Array.from(acc.reviewReasons),
    warningLabel,
    evidenceSummary: {
      confirmedMinutes: acc.confirmedMinutes,
      probableMinutes: acc.probableMinutes,
      signalGapMinutes: acc.signalGapMinutes,
      transportMinutes: acc.transportMinutes,
      unknownMinutes: acc.unknownMinutes,
      presenceBlockCount: acc.sourceIds.length,
      suppressedSignalGapBlockCount: acc.suppressedSignalGapBlockCount,
      distanceMeters: acc.distanceMeters || undefined,
    },
    sourcePresenceBlockIds: acc.sourceIds,
    hiddenSignalGapIds: acc.hiddenSignalGapIds,
    signalGapMinutes: acc.signalGapMinutes,
    firstConfirmedAt: acc.firstConfirmedAt,
    lastConfirmedAt: acc.lastConfirmedAt,
  };
}

export function buildReportCandidateBlocks(
  input: BuildReportCandidateBlocksInput,
): ReportCandidateDayResult {
  const policy: Required<ReportCandidatePolicy> = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
  const warnings: string[] = [];

  // Filter out timer_marker — this layer is pure presence-derived.
  const blocks = (input.presenceDayBlocks ?? []).filter((b) => b.kind !== 'timer_marker');
  blocks.sort((a, b) => a.startAt.localeCompare(b.startAt));

  const out: ReportCandidateBlock[] = [];
  let acc: AccumulatedBlock | null = null;

  const flush = () => {
    if (acc) {
      out.push(finalize(acc, policy, out.length));
      acc = null;
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const next = blocks[i + 1];
    const prev = blocks[i - 1];

    // ── ON-SITE (confirmed/probable) → work
    if (isOnSite(b)) {
      if (acc && acc.kind === 'work' && targetKey(b) === `${acc.targetType ?? ''}::${acc.targetId ?? ''}`) {
        absorb(acc, b);
      } else {
        flush();
        acc = newAcc('work', b);
      }
      continue;
    }

    // ── SIGNAL_GAP / UNCERTAIN_TRANSITION
    if (b.kind === 'signal_gap' || b.kind === 'uncertain_transition') {
      const sameTargetBridge =
        acc && acc.kind === 'work' &&
        next && isOnSite(next) &&
        targetKey(next) === `${acc.targetType ?? ''}::${acc.targetId ?? ''}`;

      if (sameTargetBridge) {
        // Fold into current work block; will downgrade confidence at finalize().
        absorb(acc!, b, true);
        if (b.durationMinutes >= policy.longGapInsideWorkMinutes) {
          acc!.reviewReasons.add('signal_gaps_inside_work_block');
        }
        continue;
      }

      // Different (or missing) surrounding targets → close current work first.
      flush();

      // Drop short lone gaps; keep long ones as needs_review.
      if (b.durationMinutes >= policy.loneGapNeedsReviewMinutes) {
        const candidate = newAcc('needs_review', b);
        const beforeLabel = prev?.targetLabel ?? null;
        const afterLabel = next?.targetLabel ?? null;
        if (beforeLabel && afterLabel && beforeLabel !== afterLabel) {
          candidate.reviewReasons.add('missing_transition_evidence');
        } else if (
          isDayOpen(input.date, b.endAt, input.activeTimeRegistrations, input.staffPresenceSessions)
        ) {
          candidate.reviewReasons.add('signal_gap_open_day');
        } else {
          candidate.reviewReasons.add('signal_gap_unresolved');
        }
        out.push(finalize(candidate, policy, out.length));
      }
      continue;
    }

    // ── TRANSPORT (real movement only — guaranteed by presence layer)
    if (b.kind === 'transport') {
      // Short transport between two on-site blocks of same target → fold into work
      if (
        acc && acc.kind === 'work' &&
        b.durationMinutes < policy.shortTransportMergeMinutes &&
        next && isOnSite(next) &&
        targetKey(next) === `${acc.targetType ?? ''}::${acc.targetId ?? ''}`
      ) {
        absorb(acc, b);
        continue;
      }
      flush();
      acc = newAcc('transport', b);
      // Allow following transport segments to chain
      while (
        i + 1 < blocks.length &&
        blocks[i + 1].kind === 'transport'
      ) {
        i += 1;
        absorb(acc, blocks[i]);
      }
      flush();
      continue;
    }

    // ── UNKNOWN_PLACE (stable cluster only — guaranteed by presence layer)
    if (b.kind === 'unknown_place') {
      flush();
      if (b.durationMinutes < policy.minUnknownMinutes) {
        // Drop tiny unknowns from the report (still in presence layer).
        continue;
      }
      acc = newAcc('unknown', b);
      acc.reviewReasons.add('unknown_place');
      flush();
      continue;
    }
  }

  flush();

  // ── Summary
  const summary: ReportCandidateSummary = {
    blocksCount: out.length,
    workMinutes: 0,
    transportMinutes: 0,
    breakMinutes: 0,
    unknownMinutes: 0,
    needsReviewMinutes: 0,
    needsReviewCount: 0,
    totalSignalGapMinutes: 0,
    suppressedSignalGapBlockCount: 0,
  };
  for (const r of out) {
    if (r.kind === 'work') summary.workMinutes += r.durationMinutes;
    else if (r.kind === 'transport') summary.transportMinutes += r.durationMinutes;
    else if (r.kind === 'break') summary.breakMinutes += r.durationMinutes;
    else if (r.kind === 'unknown') summary.unknownMinutes += r.durationMinutes;
    else if (r.kind === 'needs_review') summary.needsReviewMinutes += r.durationMinutes;
    if (r.reviewState === 'needs_review') summary.needsReviewCount += 1;
    summary.totalSignalGapMinutes += r.signalGapMinutes;
    summary.suppressedSignalGapBlockCount += r.evidenceSummary.suppressedSignalGapBlockCount;
  }

  return {
    staffId: input.staffId,
    organizationId: input.organizationId,
    date: input.date,
    blocks: out,
    summary,
    warnings,
    policy,
  };
}
