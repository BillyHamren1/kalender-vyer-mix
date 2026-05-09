// @ts-nocheck
/**
 * Time Engine — buildReportCandidateBlocks
 * ─────────────────────────────────────────
 *
 * Pure transformation: presenceDayBlocks (evidence layer)
 *   → reportCandidateBlocks (time-report-friendly layer).
 *
 * GUARANTEES:
 *   - Never writes to the database.
 *   - Never creates time_reports / workdays / LTE / travel_logs.
 *   - Never mutates the input.
 *   - GPS gaps NEVER become transport.
 *   - GPS gaps between two DIFFERENT stable targets NEVER become work.
 *   - Long signal_gap inside same target → folded into ONE work block with
 *     reviewReasons=["signal_gaps_inside_work_block"], confidence low/medium.
 *   - 0-minute blocks are never emitted as report rows.
 *   - Tiny unknown_place / signal_gap fragments are absorbed into evidence,
 *     not exposed as report rows.
 *
 * INPUTS:
 *   - presenceDayBlocks                (required)
 *   - activeTimeRegistrations          (optional — keeps day "open")
 *   - staffPresenceSessions            (optional — keeps day "open")
 *   - policy                           (optional thresholds)
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
  durationLabel: string;
  title: string;
  subtitle: string;
  targetType: string | null;
  targetId: UUID | null;
  targetLabel: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  confidence: ReportConfidence;
  reviewState: ReportReviewState;
  reviewReasons: string[];
  warningLabel: string | null;
  evidenceSummary: {
    confirmedMinutes: number;
    probableMinutes: number;
    signalGapMinutes: number;
    transportMinutes: number;
    unknownMinutes: number;
    presenceBlockCount: number;
    suppressedSignalGapBlockCount: number;
    suppressedUnknownBlockCount: number;
    suppressedZeroLengthBlockCount: number;
    distanceMeters?: number;
  };
  sourcePresenceBlockIds: string[];
  hiddenSignalGapIds: string[];
  hiddenPresenceBlockIds: string[];
  signalGapMinutes: number;
  firstConfirmedAt: ISODateTime | null;
  lastConfirmedAt: ISODateTime | null;
}

export interface ReportCandidateSummary {
  reportCandidateBlocksCount: number;
  workBlocksCount: number;
  transportBlocksCount: number;
  unknownBlocksCount: number;
  needsReviewBlocksCount: number;
  breakBlocksCount: number;
  workMinutes: number;
  transportMinutes: number;
  unknownMinutes: number;
  needsReviewMinutes: number;
  breakMinutes: number;
  signalGapMinutesHiddenInsideWorkBlocks: number;
  reportRowsWithSignalWarnings: number;
  // Micro-suppression metrics (rule 1, 4, 5)
  reportBlocksBeforeMicroSuppression: number;
  reportBlocksAfterMicroSuppression: number;
  suppressedMicroTransportCount: number;
  suppressedMicroTransportMinutes: number;
  suppressedTinyWorkBlocksCount: number;
  suppressedTinyWorkMinutes: number;
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
  /** Signal_gap inside same target longer than this → reviewState=needs_review.
   *  Default 20 min. */
  longGapInsideWorkMinutes?: number;
  /** Lone signal_gap between unknown surroundings shorter than this is dropped
   *  silently (presence still has it). Default 10 min. */
  loneGapNeedsReviewMinutes?: number;
  /** Stable unknown_place shorter than this is dropped from the report.
   *  Default 10 min. */
  minUnknownMinutes?: number;
  /** Transport shorter than this is folded into surrounding work if same
   *  target on both sides. Default 3 min. */
  shortTransportMergeMinutes?: number;
  /** Transport bridges (gap/unknown) shorter than this are absorbed when
   *  chaining transport into a single trip. Default 5 min. */
  transportChainBridgeMinutes?: number;
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
  transportChainBridgeMinutes: 5,
};

function minutesBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

function targetKey(b: { targetType: string | null; targetId: UUID | null }): string | null {
  if (!b.targetId && !b.targetType) return null;
  return `${b.targetType ?? ''}::${b.targetId ?? ''}`;
}

function sameTargetAs(a: { targetType: string | null; targetId: UUID | null }, b: PresenceDayBlock): boolean {
  const ka = targetKey(a);
  const kb = targetKey(b);
  return ka !== null && kb !== null && ka === kb;
}

function isOnSite(b: PresenceDayBlock): boolean {
  return b.kind === 'confirmed_on_site' || b.kind === 'probable_on_site';
}

function downgrade(c: ReportConfidence, to: ReportConfidence): ReportConfidence {
  const order: ReportConfidence[] = ['low', 'medium', 'high'];
  const ai = order.indexOf(c);
  const bi = order.indexOf(to);
  if (ai < 0) return to;
  return order[Math.min(ai, bi)];
}

function fmtDuration(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h} h ${r} min`;
  if (h > 0) return `${h} h`;
  return `${r} min`;
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
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
// Accumulator
// ───────────────────────────────────────────────────────────────────────────

interface AccumulatedBlock {
  kind: ReportBlockKind;
  startAt: string;
  endAt: string;
  targetType: string | null;
  targetId: UUID | null;
  targetLabel: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  sourceIds: string[];
  hiddenSignalGapIds: string[];
  hiddenPresenceBlockIds: string[];
  signalGapMinutes: number;
  suppressedSignalGapBlockCount: number;
  suppressedUnknownBlockCount: number;
  suppressedZeroLengthBlockCount: number;
  confirmedMinutes: number;
  probableMinutes: number;
  transportMinutes: number;
  unknownMinutes: number;
  distanceMeters: number;
  reviewReasons: Set<string>;
  firstConfirmedAt: string | null;
  lastConfirmedAt: string | null;
  baseConfidence: ReportConfidence;
}

function newAcc(kind: ReportBlockKind, b: PresenceDayBlock): AccumulatedBlock {
  return {
    kind,
    startAt: b.startAt,
    endAt: b.endAt,
    targetType: b.targetType,
    targetId: b.targetId,
    targetLabel: b.targetLabel,
    fromLabel: kind === 'transport' ? null : null,
    toLabel: kind === 'transport' ? null : null,
    sourceIds: [b.id],
    hiddenSignalGapIds: [],
    hiddenPresenceBlockIds: [],
    signalGapMinutes: b.signalGapMinutes ?? 0,
    suppressedSignalGapBlockCount: 0,
    suppressedUnknownBlockCount: 0,
    suppressedZeroLengthBlockCount: 0,
    confirmedMinutes: b.kind === 'confirmed_on_site' ? b.durationMinutes : 0,
    probableMinutes: b.kind === 'probable_on_site' ? b.durationMinutes : 0,
    transportMinutes: b.kind === 'transport' ? b.durationMinutes : 0,
    unknownMinutes: b.kind === 'unknown_place' ? b.durationMinutes : 0,
    distanceMeters: b.evidence?.distanceMeters ?? 0,
    reviewReasons: new Set<string>(),
    firstConfirmedAt: b.kind === 'confirmed_on_site' ? b.startAt : null,
    lastConfirmedAt: b.kind === 'confirmed_on_site' ? b.endAt : null,
    baseConfidence: (b.confidence as ReportConfidence) ?? 'medium',
  };
}

function absorb(acc: AccumulatedBlock, b: PresenceDayBlock, asSignalGap = false) {
  acc.endAt = b.endAt;
  acc.sourceIds.push(b.id);
  if (b.durationMinutes <= 0) {
    acc.suppressedZeroLengthBlockCount += 1;
    acc.hiddenPresenceBlockIds.push(b.id);
  }
  if (asSignalGap || b.kind === 'signal_gap' || b.kind === 'uncertain_transition') {
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
    if (b.durationMinutes < 5) {
      acc.suppressedUnknownBlockCount += 1;
      acc.hiddenPresenceBlockIds.push(b.id);
    }
    acc.unknownMinutes += b.durationMinutes;
  }
}

function buildTitleSubtitle(acc: AccumulatedBlock): { title: string; subtitle: string } {
  const dur = fmtDuration(minutesBetween(acc.startAt, acc.endAt));
  const span = `${fmtClock(acc.startAt)}–${fmtClock(acc.endAt)}`;
  switch (acc.kind) {
    case 'work':
      return { title: acc.targetLabel ?? 'Arbete', subtitle: `${span} · ${dur}` };
    case 'transport':
      return {
        title: 'Resa',
        subtitle:
          acc.fromLabel && acc.toLabel
            ? `${acc.fromLabel} → ${acc.toLabel} · ${span}`
            : `${span} · ${dur}`,
      };
    case 'break':
      return { title: 'Rast', subtitle: `${span} · ${dur}` };
    case 'unknown':
      return { title: 'Okänd plats', subtitle: `${span} · ${dur}` };
    case 'needs_review':
      return { title: 'Behöver granskas', subtitle: `${span} · ${dur}` };
  }
}

function finalize(
  acc: AccumulatedBlock,
  policy: Required<ReportCandidatePolicy>,
  index: number,
): ReportCandidateBlock | null {
  const duration = minutesBetween(acc.startAt, acc.endAt);

  // Rule 6: never emit 0-minute report rows
  if (duration <= 0) return null;

  let confidence: ReportConfidence = acc.baseConfidence;
  if (acc.kind === 'work') {
    const ratio = duration > 0 ? acc.signalGapMinutes / duration : 0;
    if (acc.signalGapMinutes >= policy.longGapInsideWorkMinutes || ratio > 0.4) {
      confidence = 'low';
      acc.reviewReasons.add('signal_gaps_inside_work_block');
    } else if (acc.signalGapMinutes > 0 || acc.probableMinutes > acc.confirmedMinutes) {
      confidence = downgrade(confidence, 'medium');
      if (acc.signalGapMinutes > 0) acc.reviewReasons.add('signal_gaps_inside_work_block');
    } else if (acc.confirmedMinutes > 0) {
      confidence = 'high';
    }
  } else if (acc.kind === 'transport') {
    confidence = acc.distanceMeters > 0 ? 'high' : 'medium';
  } else if (acc.kind === 'unknown') {
    confidence = 'low';
    acc.reviewReasons.add('unknown_place');
  } else if (acc.kind === 'needs_review') {
    confidence = 'low';
  }

  const reviewState: ReportReviewState =
    acc.kind === 'needs_review' || acc.kind === 'unknown' || acc.reviewReasons.size > 0 || confidence === 'low'
      ? 'needs_review'
      : 'ok';

  const warningLabel =
    acc.kind === 'work' && acc.signalGapMinutes > 0
      ? `Signal saknades periodvis: ${fmtDuration(acc.signalGapMinutes)}`
      : null;

  const { title, subtitle } = buildTitleSubtitle(acc);

  return {
    id: `rc-${index}-${acc.startAt}`,
    kind: acc.kind,
    startAt: acc.startAt,
    endAt: acc.endAt,
    durationMinutes: duration,
    durationLabel: fmtDuration(duration),
    title,
    subtitle,
    targetType: acc.targetType,
    targetId: acc.targetId,
    targetLabel: acc.targetLabel,
    fromLabel: acc.fromLabel,
    toLabel: acc.toLabel,
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
      suppressedUnknownBlockCount: acc.suppressedUnknownBlockCount,
      suppressedZeroLengthBlockCount: acc.suppressedZeroLengthBlockCount,
      distanceMeters: acc.distanceMeters || undefined,
    },
    sourcePresenceBlockIds: acc.sourceIds,
    hiddenSignalGapIds: acc.hiddenSignalGapIds,
    hiddenPresenceBlockIds: acc.hiddenPresenceBlockIds,
    signalGapMinutes: acc.signalGapMinutes,
    firstConfirmedAt: acc.firstConfirmedAt,
    lastConfirmedAt: acc.lastConfirmedAt,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Core
// ───────────────────────────────────────────────────────────────────────────

/** Look ahead through bridge blocks (gap/unknown < threshold) to see if the
 *  next stable on-site block has the same target as `acc`. Returns the index
 *  of that on-site block, or -1. */
function findSameTargetReturn(
  blocks: PresenceDayBlock[],
  fromIdx: number,
  acc: AccumulatedBlock,
  policy: Required<ReportCandidatePolicy>,
): number {
  let i = fromIdx;
  let bridgeMinutes = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (isOnSite(b)) {
      return sameTargetAs(acc, b) ? i : -1;
    }
    if (b.kind === 'signal_gap' || b.kind === 'uncertain_transition') {
      bridgeMinutes += b.durationMinutes;
      // Always allow bridging — long gaps still allowed if same target returns
      // (rule 2). Confidence will drop accordingly.
      i += 1;
      continue;
    }
    if (b.kind === 'unknown_place') {
      if (b.durationMinutes >= policy.minUnknownMinutes) return -1;
      bridgeMinutes += b.durationMinutes;
      i += 1;
      continue;
    }
    if (b.kind === 'transport') {
      // A real movement segment between ends the same-target chain.
      return -1;
    }
    if (b.kind === 'timer_marker') {
      i += 1;
      continue;
    }
    return -1;
  }
  return -1;
}

export function buildReportCandidateBlocks(
  input: BuildReportCandidateBlocksInput,
): ReportCandidateDayResult {
  const policy: Required<ReportCandidatePolicy> = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
  const warnings: string[] = [];

  const blocks = (input.presenceDayBlocks ?? []).filter((b) => b.kind !== 'timer_marker');
  blocks.sort((a, b) => a.startAt.localeCompare(b.startAt));

  const out: ReportCandidateBlock[] = [];
  let acc: AccumulatedBlock | null = null;

  const flush = () => {
    if (acc) {
      const fin = finalize(acc, policy, out.length);
      if (fin) out.push(fin);
      acc = null;
    }
  };

  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];

    // ── ON-SITE → work
    if (isOnSite(b)) {
      if (acc && acc.kind === 'work' && sameTargetAs(acc, b)) {
        absorb(acc, b);
      } else {
        flush();
        acc = newAcc('work', b);
      }
      i += 1;
      continue;
    }

    // ── SIGNAL_GAP / UNCERTAIN_TRANSITION
    if (b.kind === 'signal_gap' || b.kind === 'uncertain_transition') {
      // Try to bridge inside the current work block: same target returns later?
      if (acc && acc.kind === 'work') {
        const ret = findSameTargetReturn(blocks, i + 1, acc, policy);
        if (ret >= 0) {
          // Absorb everything from i..ret-1 as bridge inside work, then the
          // returning on-site block also into the same work block.
          for (let k = i; k < ret; k++) absorb(acc, blocks[k], true);
          absorb(acc, blocks[ret]);
          if (b.durationMinutes >= policy.longGapInsideWorkMinutes) {
            acc.reviewReasons.add('signal_gaps_inside_work_block');
          }
          i = ret + 1;
          continue;
        }
      }

      // No same-target return → close current work
      flush();

      // Drop short lone gaps; long ones become needs_review
      if (b.durationMinutes >= policy.loneGapNeedsReviewMinutes) {
        const candidate = newAcc('needs_review', b);
        const prev = blocks[i - 1];
        const next = blocks[i + 1];
        candidate.fromLabel = prev?.targetLabel ?? null;
        candidate.toLabel = next?.targetLabel ?? null;
        if (prev?.targetLabel && next?.targetLabel && prev.targetLabel !== next.targetLabel) {
          candidate.reviewReasons.add('missing_transition_evidence');
        } else if (
          isDayOpen(input.date, b.endAt, input.activeTimeRegistrations, input.staffPresenceSessions)
        ) {
          candidate.reviewReasons.add('signal_gap_open_day');
        } else {
          candidate.reviewReasons.add('signal_gap_unresolved');
        }
        const fin = finalize(candidate, policy, out.length);
        if (fin) out.push(fin);
      }
      i += 1;
      continue;
    }

    // ── TRANSPORT (real GPS movement only — guaranteed by presence layer)
    if (b.kind === 'transport') {
      // Short transport bridging same-target work → fold in
      if (
        acc && acc.kind === 'work' &&
        b.durationMinutes < policy.shortTransportMergeMinutes
      ) {
        const ret = findSameTargetReturn(blocks, i + 1, acc, policy);
        if (ret >= 0) {
          absorb(acc, b);
          for (let k = i + 1; k < ret; k++) absorb(acc, blocks[k], blocks[k].kind === 'signal_gap');
          absorb(acc, blocks[ret]);
          i = ret + 1;
          continue;
        }
      }

      flush();
      acc = newAcc('transport', b);
      acc.fromLabel = blocks[i - 1]?.targetLabel ?? null;

      // Chain forward: consecutive transport, plus tiny non-stable bridges
      let j = i + 1;
      while (j < blocks.length) {
        const nb = blocks[j];
        if (nb.kind === 'transport') {
          absorb(acc, nb);
          j += 1;
          continue;
        }
        // Tiny gap/unknown bridge between transport segments
        if (
          (nb.kind === 'signal_gap' || nb.kind === 'uncertain_transition') &&
          nb.durationMinutes < policy.transportChainBridgeMinutes &&
          j + 1 < blocks.length && blocks[j + 1].kind === 'transport'
        ) {
          absorb(acc, nb, true);
          j += 1;
          continue;
        }
        if (
          nb.kind === 'unknown_place' &&
          nb.durationMinutes < policy.transportChainBridgeMinutes &&
          j + 1 < blocks.length && blocks[j + 1].kind === 'transport'
        ) {
          absorb(acc, nb);
          j += 1;
          continue;
        }
        break;
      }
      acc.toLabel = blocks[j]?.targetLabel ?? null;
      i = j;
      flush();
      continue;
    }

    // ── UNKNOWN_PLACE
    if (b.kind === 'unknown_place') {
      flush();
      if (b.durationMinutes < policy.minUnknownMinutes) {
        // Drop tiny unknowns from the report (still in presence layer).
        i += 1;
        continue;
      }
      acc = newAcc('unknown', b);
      flush();
      i += 1;
      continue;
    }

    // Fallback — unknown kind
    i += 1;
  }

  flush();

  // ── Summary
  const summary: ReportCandidateSummary = {
    reportCandidateBlocksCount: out.length,
    workBlocksCount: 0,
    transportBlocksCount: 0,
    unknownBlocksCount: 0,
    needsReviewBlocksCount: 0,
    breakBlocksCount: 0,
    workMinutes: 0,
    transportMinutes: 0,
    unknownMinutes: 0,
    needsReviewMinutes: 0,
    breakMinutes: 0,
    signalGapMinutesHiddenInsideWorkBlocks: 0,
    reportRowsWithSignalWarnings: 0,
  };
  for (const r of out) {
    if (r.kind === 'work') {
      summary.workBlocksCount += 1;
      summary.workMinutes += r.durationMinutes;
      summary.signalGapMinutesHiddenInsideWorkBlocks += r.signalGapMinutes;
    } else if (r.kind === 'transport') {
      summary.transportBlocksCount += 1;
      summary.transportMinutes += r.durationMinutes;
    } else if (r.kind === 'unknown') {
      summary.unknownBlocksCount += 1;
      summary.unknownMinutes += r.durationMinutes;
    } else if (r.kind === 'needs_review') {
      summary.needsReviewBlocksCount += 1;
      summary.needsReviewMinutes += r.durationMinutes;
    } else if (r.kind === 'break') {
      summary.breakBlocksCount += 1;
      summary.breakMinutes += r.durationMinutes;
    }
    if (r.warningLabel) summary.reportRowsWithSignalWarnings += 1;
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
