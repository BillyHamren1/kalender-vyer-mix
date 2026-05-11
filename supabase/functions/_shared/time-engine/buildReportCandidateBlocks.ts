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
  /**
   * Förberedd kontext för framtida AI-granskning. Sätts EJ av denna builder.
   * Display-/edge-lager kan attachera fältet i ett senare steg. Ingen AI körs nu.
   */
  aiReviewContext?: AiReviewContext | null;
}

export type AiReviewQuestionType =
  | 'match_unknown_address_to_booking'
  | 'classify_unknown_stop'
  | 'explain_missing_transition'
  | 'suggest_assignment_link';

export interface AiReviewNearestTarget {
  id: string | null;
  label: string;
  type: string | null;
  distanceMeters: number | null;
  isAssigned: boolean;
}

export interface AiReviewContext {
  questionType: AiReviewQuestionType;
  knownAddress: string | null;
  coordinate: { lat: number; lng: number } | null;
  nearestAssignedTargets: AiReviewNearestTarget[];
  nearestUnassignedCandidates: AiReviewNearestTarget[];
  previousKnownPlace: string | null;
  nextKnownPlace: string | null;
  timeWindow: { startAt: string; endAt: string };
  staffName: string | null;
  date: string | null;
  currentPlannedAssignments: string[];
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
  // Same-target transport absorption (rule 1 refinement)
  transportRowsBeforeSameTargetAbsorption: number;
  transportRowsAfterSameTargetAbsorption: number;
  sameTargetTransportAbsorbedCount: number;
  sameTargetTransportAbsorbedMinutes: number;
  /** Same-target transports rejected because measured distance exceeded
   *  sameTargetTransportAbsorbMaxDistanceMeters (real round-trip). */
  sameTargetTransportRejectedByDistanceCount: number;
  sameTargetTransportRejectedByDistanceMinutes: number;
  crossTargetTransportKeptCount: number;
  shortCrossTargetTransportReviewCount: number;
  shortUnknownTransportReviewCount: number;
  shortUnknownTransportHiddenCount: number;
  /** Examples (max 20) of same-target transports that were absorbed in PASS 2.
   *  Used by health-check tooling to verify absorption only catches jitter. */
  absorbedSameTargetTransportExamples: Array<{
    targetLabel: string | null;
    startAt: ISODateTime;
    endAt: ISODateTime;
    durationMinutes: number;
    distanceMeters: number;
    absorbedIntoWorkBlock: { startAt: ISODateTime; endAt: ISODateTime } | null;
    reviewReasons: string[];
  }>;
  /** Examples (max 20) of same-target transports that were REJECTED for
   *  absorption (distance too large or missing). Kept as transport/needs_review. */
  sameTargetTransportRejectedExamples: Array<{
    targetLabel: string | null;
    startAt: ISODateTime;
    endAt: ISODateTime;
    durationMinutes: number;
    distanceMeters: number | null;
    decision: 'kept_as_transport' | 'needs_review';
    reviewReasons: string[];
  }>;
  /** Examples (max 20) of CROSS-TARGET transports that were kept as real
   *  transport rows (work A → transport → work B). Used by health-check
   *  regression to verify cross-target movement is never absorbed. */
  keptCrossTargetTransportExamples: Array<{
    fromLabel: string | null;
    toLabel: string | null;
    startAt: ISODateTime;
    endAt: ISODateTime;
    durationMinutes: number;
    distanceMeters: number | null;
  }>;
  /** Sandwich rule: how many unknown / needs_review blocks were converted to
   *  work because they sat between two work blocks on the same day. */
  inferredFromNeighborsCount: number;
  inferredFromNeighborsMinutes: number;
  inferredFromNeighborsInheritedTargetCount: number;
  inferredFromNeighborsUnlabeledCount: number;
  /**
   * Diagnostik för needs_review-klassningen.
   * - blockingReviewBlocksCount: block med faktiska blocking-reasons (eller kind unknown/needs_review).
   * - warningOnlyBlocksCount: block som är ok men har warningLabel/non-blocking reason.
   * - signalGapWarningOnlyBlocksCount: work-block med signalgap som stannade som ok.
   * - signalGapPromotedToReviewCount: work-block där extremt signalgap utan onsite-evidens lyfte till needs_review.
   * - clearWorkBlocksIncorrectlyReviewCount: regression-räknare. Ska alltid vara 0.
   */
  reviewClassificationDiagnostics: {
    blockingReviewBlocksCount: number;
    warningOnlyBlocksCount: number;
    signalGapWarningOnlyBlocksCount: number;
    signalGapPromotedToReviewCount: number;
    clearWorkBlocksIncorrectlyReviewCount: number;
  };
}

/**
 * Reasons som faktiskt kräver mänsklig granskning.
 * Endast dessa lyfter ett block till reviewState='needs_review'.
 */
const BLOCKING_REVIEW_REASONS = new Set<string>([
  'missing_transition_evidence',
  'signal_gap_unresolved',
  'signal_gap_open_day',
  'unknown_place',
  'short_cross_target_movement',
  'short_transport_to_unknown',
  'conflicting_target_evidence',
  'home_private_conflict',
  'impossible_speed',
  'no_anchor_coordinates',
]);

/**
 * Reasons som är informativa men inte kräver granskning. Visas som
 * warningLabel / Decision Trace, aldrig som "Granska" i UI.
 */
const WARNING_ONLY_REASONS = new Set<string>([
  'signal_gaps_inside_work_block',
  'same_target_transport_missing_distance',
  'same_target_roundtrip_long_distance',
  'movement_inside_same_target',
  'absorbed_micro_movement',
  'partial_outside_sticky_geofence',
]);

export { BLOCKING_REVIEW_REASONS, WARNING_ONLY_REASONS };

export interface ActiveTimeRegistrationInput {
  id: UUID;
  staffId?: string | null;
  organizationId?: UUID | null;
  startedAt: ISODateTime;
  /** Backward-compat alias. New callers SHOULD pass `stoppedAt`. */
  endedAt?: ISODateTime | null;
  stoppedAt?: ISODateTime | null;
  /** Lifecycle status from active_time_registrations ('active' | 'stopped' | ...). */
  status?: string | null;
  /** Legacy alias for startSource. */
  source?: string | null;
  startSource?: string | null;
  stopSource?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
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
   *  target on both sides (rule 1). Default 20 min. */
  shortTransportMergeMinutes?: number;
  /** Transport bridges (gap/unknown) shorter than this are absorbed when
   *  chaining transport into a single trip. Default 5 min. */
  transportChainBridgeMinutes?: number;
  /** Post-pass: transport rows shorter than this are NEVER own report rows
   *  (rule 4). Default 5 min. They are absorbed into adjacent work or hidden. */
  microTransportMaxMinutes?: number;
  /** Post-pass: work rows shorter than this are not own report rows
   *  (rule 5). Default 2 min. */
  tinyWorkMaxMinutes?: number;
  /** Transport with measured distance ≥ this is always a real trip and is
   *  never micro-suppressed. Default = TRANSPORT_MIN_DISTANCE_METERS (500 m). */
  realTripMinDistanceMeters?: number;
  /** Same-target absorption: if work-A | transport ≤ this | work-A then the
   *  transport is folded into work-A even when the transport is longer than
   *  shortTransportMergeMinutes. Default 25 min. */
  sameTargetTransportAbsorbMaxMinutes?: number;
  /** Same-target absorption distance gate. Even when prev/next target match,
   *  the transport is only absorbed if measured distance ≤ this. Above this
   *  it is treated as a real round-trip (kept as transport, possibly
   *  needs_review). If distance is missing the transport is NOT absorbed.
   *  Default 750 m. */
  sameTargetTransportAbsorbMaxDistanceMeters?: number;
  /** Short cross-target transport (different work targets) shorter than this
   *  is downgraded to needs_review instead of being a real trip. Default 5 min. */
  shortCrossTargetReviewMaxMinutes?: number;
  /** Short transport adjacent to an unknown row that is shorter than this is
   *  hidden as evidence rather than emitted. Default 3 min. */
  shortUnknownTransportHideMaxMinutes?: number;
  /** Sandwich rule: an unknown / needs_review block that lies between two
   *  work rows on the SAME calendar day is converted to `work` (target
   *  inherited if both sides match, otherwise unlabeled work) when its
   *  duration is ≤ this. Default 90 min. Set to 0 to disable. */
  sandwichInferWorkMaxMinutes?: number;
}

export interface HomeAnchorInput {
  /** Identifier from staff_inferred_home_locations / staff_private_zones. */
  id?: string | null;
  /** 'home_sleep' | 'manual_ignore' | 'recurring_night' | inferred kind. */
  kind?: string | null;
  lat: number;
  lng: number;
  /** Radius in meters. Falls back to 200 m. */
  radiusM?: number | null;
  /** Optional human label for Decision Trace. */
  label?: string | null;
}

export interface BuildReportCandidateBlocksInput {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  presenceDayBlocks: PresenceDayBlock[];
  activeTimeRegistrations?: ActiveTimeRegistrationInput[];
  staffPresenceSessions?: StaffPresenceSessionInput[];
  /** Optional list of staff home/sleep anchors (lat/lng/radius). When a
   *  pre-work block's GPS center is inside one of these, it is excluded with
   *  reason='home_anchor' for Decision Trace. Read-only. */
  homeAnchors?: HomeAnchorInput[];
  policy?: ReportCandidatePolicy;
}

export type PreWorkExclusionReason =
  | 'before_first_primary_work_target'
  | 'home_anchor'
  | 'no_workplace_before_noon';

export interface PreWorkExclusionExample {
  staffName?: string | null;
  startAt: ISODateTime;
  endAt: ISODateTime;
  durationMinutes: number;
  originalKind: ReportBlockKind;
  originalLabel: string;
  reason: PreWorkExclusionReason;
}

export interface PreWorkExclusionDiagnostics {
  excludedPreWorkMinutes: number;
  excludedPreWorkBlocksCount: number;
  firstPrimaryWorkAt: ISODateTime | null;
  firstPrimaryTargetLabel: string | null;
  excludedReasons: Record<string, number>;
  examples: PreWorkExclusionExample[];
  /** How many home anchors were supplied for this staff/day. */
  homeAnchorsCount?: number;
  /** Subset of pre-work blocks that matched a home anchor (lat/lng inside
   *  radius). Useful for Decision Trace and health checks. */
  homeAnchorMatches?: number;
}

export interface ReportCandidateDayResult {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  blocks: ReportCandidateBlock[];
  /** Blocks that were classified as "pre-work" (before the first secure work
   *  target) and excluded from the main report. Kept here as evidence for
   *  Decision Trace — never appear in `blocks` and never count in summary. */
  excludedPreWorkBlocks: ReportCandidateBlock[];
  preWorkExclusionDiagnostics: PreWorkExclusionDiagnostics;
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
  shortTransportMergeMinutes: 20,
  transportChainBridgeMinutes: 5,
  microTransportMaxMinutes: 5,
  tinyWorkMaxMinutes: 2,
  realTripMinDistanceMeters: 1000,
  sameTargetTransportAbsorbMaxMinutes: 25,
  sameTargetTransportAbsorbMaxDistanceMeters: 750,
  shortCrossTargetReviewMaxMinutes: 5,
  shortUnknownTransportHideMaxMinutes: 3,
  sandwichInferWorkMaxMinutes: 90,
};

// ───────────────────────────────────────────────────────────────────────────
// Deterministic block ID
// ───────────────────────────────────────────────────────────────────────────

/** Small, sync, dependency-free 53-bit string hash (cyrb53). Stable across
 *  runs and platforms — used to derive deterministic report-candidate IDs.
 *  NOT a cryptographic hash. */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch: number; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36).padStart(11, '0');
}

export interface CreateReportCandidateBlockIdInput {
  staffId: string;
  date: string;
  kind: ReportBlockKind;
  startAt: string;
  endAt: string;
  targetType: string | null;
  targetId: string | null;
  sourcePresenceBlockIds: string[];
}

/**
 * Deterministic, position-independent ID for a reportCandidateBlock.
 *
 * Same input (staff, day, kind, span, target, source presence blocks) →
 * same id across runs. Any change in time/target/kind/source set yields a
 * new id. Safe to reference later from AI/action contracts.
 */
export function createReportCandidateBlockId(
  input: CreateReportCandidateBlockIdInput,
): string {
  const payload = JSON.stringify({
    s: input.staffId,
    d: input.date,
    k: input.kind,
    sa: input.startAt,
    ea: input.endAt,
    tt: input.targetType ?? null,
    ti: input.targetId ?? null,
    src: [...(input.sourcePresenceBlockIds ?? [])].sort(),
  });
  return `rc_${cyrb53(payload)}`;
}

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
  // Visa alltid i Europe/Stockholm — UTC ger fel klocka i UI (t.ex. 04:57 i stället för 06:57).
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    const d = new Date(iso);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}

/** Haversine distance in meters between two lat/lng points. */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Return the first home anchor whose radius contains (lat,lng), or null. */
function matchHomeAnchor(
  lat: number | null | undefined,
  lng: number | null | undefined,
  anchors: HomeAnchorInput[] | undefined,
): HomeAnchorInput | null {
  if (lat == null || lng == null || !anchors || anchors.length === 0) return null;
  for (const a of anchors) {
    if (a.lat == null || a.lng == null) continue;
    const r = a.radiusM ?? 200;
    if (distanceMeters(lat, lng, a.lat, a.lng) <= r) return a;
  }
  return null;
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
  if (active?.some((r) => {
    if ((r.status ?? '').toLowerCase() === 'active') return true;
    const stop = r.stoppedAt ?? r.endedAt ?? null;
    return !stop || new Date(stop).getTime() > end;
  })) return true;
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
  stickyWarningLabel: string | null;
}

function pickStickyWarning(b: PresenceDayBlock): string | null {
  const ev: any = b.evidence ?? {};
  if (ev.partialOutsideStickyGeofence && typeof ev.warningLabel === 'string' && ev.warningLabel.length > 0) {
    return ev.warningLabel;
  }
  return null;
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
    stickyWarningLabel: pickStickyWarning(b),
  };
}

function absorb(acc: AccumulatedBlock, b: PresenceDayBlock, asSignalGap = false) {
  acc.endAt = b.endAt;
  acc.sourceIds.push(b.id);
  if (!acc.stickyWarningLabel) acc.stickyWarningLabel = pickStickyWarning(b);
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
      // Stort signalgap → confidence sänks, men det är en VARNING — inte
      // automatisk granskning. Markeras som warning-only reason.
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

  // ─── reviewState — separat från confidence och warningLabel ────────────
  const reasonList = Array.from(acc.reviewReasons);
  const hasBlockingReason = reasonList.some((r) => BLOCKING_REVIEW_REASONS.has(r));
  const hasTarget = !!(acc.targetId || acc.targetLabel);
  const onsiteMinutes = acc.confirmedMinutes + acc.probableMinutes;
  const hasOnsiteEvidence = onsiteMinutes > 0;

  let reviewState: ReportReviewState =
    acc.kind === 'needs_review' || acc.kind === 'unknown' ? 'needs_review' : 'ok';

  if (reviewState === 'ok' && hasBlockingReason) reviewState = 'needs_review';

  // Work-block utan target = vi vet inte vad det är.
  if (reviewState === 'ok' && acc.kind === 'work' && !hasTarget) reviewState = 'needs_review';

  // Signalgap-promotion: bara om gapet är extremt OCH ingen on-site-evidens
  // finns OCH vi inte ens har en känd arbetsplats. Har vi target vet vi var
  // personen varit — om hen smitit iväg en stund må så vara, det räcker som
  // varning (warningLabel via signal_gaps_inside_work_block).
  if (acc.kind === 'work' && duration > 0 && !hasTarget) {
    const gapRatio = acc.signalGapMinutes / duration;
    if (gapRatio > 0.75 && acc.confirmedMinutes === 0 && acc.probableMinutes === 0) {
      acc.reviewReasons.add('signal_gap_unresolved');
      reviewState = 'needs_review';
    }
  }

  // Skydd: work-block på känd arbetsplats ska inte tvingas till granskning
  // av rena signal-gap-skäl. Vi vet vart personen var; ev. utflykter visas
  // som warning, inte som blockerande granskning.
  if (acc.kind === 'work' && hasTarget && duration >= 15) {
    const SIGNAL_GAP_REASONS = new Set([
      'signal_gap_unresolved',
      'signal_gap_open_day',
      'signal_gaps_inside_work_block',
    ]);
    // Demota signalgap-relaterade blocking reasons → warning-only.
    for (const r of Array.from(acc.reviewReasons)) {
      if (SIGNAL_GAP_REASONS.has(r)) acc.reviewReasons.delete(r);
    }
    const stillBlocking = Array.from(acc.reviewReasons).some((r) =>
      BLOCKING_REVIEW_REASONS.has(r),
    );
    if (!stillBlocking) reviewState = 'ok';
  }

  const signalGapWarning =
    acc.kind === 'work' && acc.signalGapMinutes > 0
      ? `Signal saknades periodvis: ${fmtDuration(acc.signalGapMinutes)}`
      : null;
  // Sticky-warning ("GPS låg delvis utanför arbetsområdet") har prio över signal-gap.
  const warningLabel = acc.stickyWarningLabel ?? signalGapWarning;

  const { title, subtitle } = buildTitleSubtitle(acc);

  return {
    // Placeholder — replaced with deterministic id at end of pipeline
    // (see createReportCandidateBlockId call after all post-passes).
    id: '',
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

      // Drop short lone gaps; long ones need to be classified
      if (b.durationMinutes >= policy.loneGapNeedsReviewMinutes) {
        const prev = blocks[i - 1];
        const next = blocks[i + 1];
        const prevKnown = !!(prev && (prev.kind === 'confirmed_on_site' || prev.kind === 'probable_on_site') && prev.targetLabel);
        const nextKnown = !!(next && (next.kind === 'confirmed_on_site' || next.kind === 'probable_on_site') && next.targetLabel);
        const prevKey = prev ? `${prev.targetType ?? ''}::${prev.targetId ?? prev.targetLabel ?? ''}` : '';
        const nextKey = next ? `${next.targetType ?? ''}::${next.targetId ?? next.targetLabel ?? ''}` : '';

        // ── BRIDGED-TRIP PROMOTION (generell regel) ─────────────────────
        // När gapet sitter mellan TVÅ DISTINKTA kända arbetsplatser är det
        // en uppenbar A→B-resa. Klassa direkt som transport (reviewState
        // ok) istället för needs_review("missing_transition_evidence").
        // Confidence = high när båda sidor är confirmed_on_site, annars
        // medium. Påverkar inte time_reports/lön (transport är fortfarande
        // ett admin-förslag).
        if (prevKnown && nextKnown && prevKey !== nextKey) {
          const candidate = newAcc('transport', b);
          candidate.fromLabel = prev!.targetLabel;
          candidate.toLabel = next!.targetLabel;
          // Markera som hög confidence när båda sidor är confirmed_on_site,
          // annars medium. finalize() läser distanceMeters för transport;
          // vi har inget mätt avstånd här, så vi sätter ett litet sentinel
          // för att förhindra att finalize fastnar på "medium" när vi
          // egentligen vet att båda ändpunkterna är hårda.
          if (prev!.kind === 'confirmed_on_site' && next!.kind === 'confirmed_on_site') {
            candidate.distanceMeters = 1; // räcker för finalize → 'high'
          }
          const fin = finalize(candidate, policy, out.length);
          if (fin) out.push(fin);
          i += 1;
          continue;
        }

        const candidate = newAcc('needs_review', b);
        candidate.fromLabel = prev?.targetLabel ?? null;
        candidate.toLabel = next?.targetLabel ?? null;
        if (prev?.targetLabel && next?.targetLabel && prev.targetLabel !== next.targetLabel) {
          // Should be unreachable now thanks to bridged-trip promotion above,
          // but kept as a safety net for cases where targets are not "known"
          // on-site blocks (e.g. probable_on_site edge cases that didn't pass
          // the prevKnown/nextKnown gate).
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
      // NOTE: Same-target round-trip absorption was previously done here in
      // the main loop based only on duration (< shortTransportMergeMinutes).
      // That bypassed the distance guard and could fold real round-trips into
      // work. It is now exclusively handled by PASS 2 below, which gates
      // absorption on policy.sameTargetTransportAbsorbMaxDistanceMeters and
      // emits needs_review (same_target_roundtrip_distance_too_large) or
      // same_target_transport_missing_distance otherwise.


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

  // ───────────────────────────────────────────────────────────────────────
  // POST-PASS: Micro-movement suppression (rules 1, 4, 5)
  //
  // The presence/main-loop already absorbs short transport that round-trips
  // to the same target. This pass cleans up cases where two work blocks at
  // the SAME target are still separated by a tiny transport row (e.g. GPS
  // jitter, walking inside a warehouse) and removes any leftover
  // 0–2 min work fragments that should never be a top-level row.
  //
  // Rule 4: transport <microTransportMaxMinutes is never own row.
  // Rule 1 (post-fold): work-A | tiny transport | work-A → one work-A.
  // Rule 5: work <tinyWorkMaxMinutes is hidden as evidence on a neighbour.
  //
  // Real trips (distance ≥ realTripMinDistanceMeters or between two
  // DIFFERENT targets and ≥ shortTransportMergeMinutes) are preserved.
  // ───────────────────────────────────────────────────────────────────────
  const reportBlocksBeforeMicroSuppression = out.length;
  let suppressedMicroTransportCount = 0;
  let suppressedMicroTransportMinutes = 0;
  let suppressedTinyWorkBlocksCount = 0;
  let suppressedTinyWorkMinutes = 0;

  const targetKeyOf = (r: ReportCandidateBlock | undefined): string | null => {
    if (!r) return null;
    if (!r.targetId && !r.targetType) return null;
    return `${r.targetType ?? ''}::${r.targetId ?? ''}`;
  };

  const absorbInto = (host: ReportCandidateBlock, victim: ReportCandidateBlock) => {
    // Extend the host time-span to cover the victim
    if (victim.startAt < host.startAt) host.startAt = victim.startAt;
    if (victim.endAt > host.endAt) host.endAt = victim.endAt;
    host.durationMinutes = minutesBetween(host.startAt, host.endAt);
    host.durationLabel = fmtDuration(host.durationMinutes);
    // Record provenance
    host.sourcePresenceBlockIds.push(...victim.sourcePresenceBlockIds);
    host.hiddenPresenceBlockIds.push(
      ...victim.sourcePresenceBlockIds,
      ...victim.hiddenPresenceBlockIds,
    );
    host.hiddenSignalGapIds.push(...victim.hiddenSignalGapIds);
    host.signalGapMinutes += victim.signalGapMinutes;
    // Counters
    host.evidenceSummary.confirmedMinutes += victim.evidenceSummary.confirmedMinutes;
    host.evidenceSummary.probableMinutes += victim.evidenceSummary.probableMinutes;
    host.evidenceSummary.signalGapMinutes += victim.evidenceSummary.signalGapMinutes;
    host.evidenceSummary.transportMinutes += victim.evidenceSummary.transportMinutes;
    host.evidenceSummary.unknownMinutes += victim.evidenceSummary.unknownMinutes;
    host.evidenceSummary.presenceBlockCount += victim.evidenceSummary.presenceBlockCount;
    host.evidenceSummary.suppressedSignalGapBlockCount +=
      victim.evidenceSummary.suppressedSignalGapBlockCount;
    host.evidenceSummary.suppressedUnknownBlockCount +=
      victim.evidenceSummary.suppressedUnknownBlockCount;
    host.evidenceSummary.suppressedZeroLengthBlockCount +=
      victim.evidenceSummary.suppressedZeroLengthBlockCount;
    if (victim.evidenceSummary.distanceMeters) {
      host.evidenceSummary.distanceMeters =
        (host.evidenceSummary.distanceMeters ?? 0) + victim.evidenceSummary.distanceMeters;
    }
    host.reviewReasons = Array.from(new Set([...(host.reviewReasons ?? []), ...(victim.reviewReasons ?? [])]));
    if (!host.warningLabel && victim.warningLabel) {
      host.warningLabel = victim.warningLabel;
    }
    // Confidence drops one notch when we fold movement evidence in
    if (host.kind === 'work' && victim.kind === 'transport' && host.confidence === 'high') {
      host.confidence = 'medium';
    }
    if (victim.warningLabel) {
      host.reviewReasons = Array.from(new Set([...host.reviewReasons, 'absorbed_micro_movement']));
    }
    // Refresh subtitle
    const ts = buildTitleSubtitle({
      kind: host.kind,
      startAt: host.startAt,
      endAt: host.endAt,
      targetLabel: host.targetLabel,
      fromLabel: host.fromLabel,
      toLabel: host.toLabel,
    } as AccumulatedBlock);
    host.subtitle = ts.subtitle;
  };

  // Walk the list and apply suppression in-place
  let changed = true;
  let safety = 0;
  while (changed && safety < 50) {
    changed = false;
    safety += 1;

    for (let k = 0; k < out.length; k++) {
      const cur = out[k];

      // Rule 4 + post-rule-1: tiny transport
      if (cur.kind === 'transport' && cur.durationMinutes < policy.microTransportMaxMinutes) {
        const dist = cur.evidenceSummary.distanceMeters ?? 0;
        if (dist >= policy.realTripMinDistanceMeters) continue; // real trip, leave it

        const prev = out[k - 1];
        const next = out[k + 1];
        const prevKey = targetKeyOf(prev);
        const nextKey = targetKeyOf(next);
        const sameAround = prevKey && nextKey && prevKey === nextKey
          && prev?.kind === 'work' && next?.kind === 'work';

        if (sameAround) {
          // Fold: prev ⟵ cur ⟵ next
          absorbInto(prev, cur);
          absorbInto(prev, next);
          out.splice(k, 2); // remove cur and next
          suppressedMicroTransportCount += 1;
          suppressedMicroTransportMinutes += cur.durationMinutes;
          changed = true;
          break;
        }
        if (prev?.kind === 'work') {
          absorbInto(prev, cur);
          out.splice(k, 1);
          suppressedMicroTransportCount += 1;
          suppressedMicroTransportMinutes += cur.durationMinutes;
          changed = true;
          break;
        }
        if (next?.kind === 'work') {
          absorbInto(next, cur);
          out.splice(k, 1);
          suppressedMicroTransportCount += 1;
          suppressedMicroTransportMinutes += cur.durationMinutes;
          changed = true;
          break;
        }
        // No work neighbour — drop silently as evidence (no host to attach
        // to, but still don't show as a 3 min "Resa" row).
        out.splice(k, 1);
        suppressedMicroTransportCount += 1;
        suppressedMicroTransportMinutes += cur.durationMinutes;
        changed = true;
        break;
      }

      // Rule 5: tiny work block
      if (cur.kind === 'work' && cur.durationMinutes < policy.tinyWorkMaxMinutes) {
        const prev = out[k - 1];
        const next = out[k + 1];
        const prevSame = prev?.kind === 'work' && targetKeyOf(prev) === targetKeyOf(cur);
        const nextSame = next?.kind === 'work' && targetKeyOf(next) === targetKeyOf(cur);
        if (prevSame) {
          absorbInto(prev, cur);
          out.splice(k, 1);
          suppressedTinyWorkBlocksCount += 1;
          suppressedTinyWorkMinutes += cur.durationMinutes;
          changed = true;
          break;
        }
        if (nextSame) {
          absorbInto(next, cur);
          out.splice(k, 1);
          suppressedTinyWorkBlocksCount += 1;
          suppressedTinyWorkMinutes += cur.durationMinutes;
          changed = true;
          break;
        }
        // Lone tiny work — hide as evidence on closest neighbour, else drop
        const host = (prev && prev.kind !== 'needs_review' && prev.kind !== 'unknown')
          ? prev
          : (next && next.kind !== 'needs_review' && next.kind !== 'unknown')
            ? next
            : null;
        if (host) {
          absorbInto(host, cur);
        }
        out.splice(k, 1);
        suppressedTinyWorkBlocksCount += 1;
        suppressedTinyWorkMinutes += cur.durationMinutes;
        changed = true;
        break;
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // POST-PASS 2: Refined transport rules (rule 1/2/3 of refinement spec)
  //  - work-A | transport ≤ sameTargetTransportAbsorbMaxMinutes | work-A
  //      → absorb transport (and right-hand work) into work-A.
  //      Marked with reviewReason "movement_inside_same_target".
  //  - work-A | short transport (< shortCrossTargetReviewMaxMinutes) | work-B
  //      where distance < realTripMinDistanceMeters → flip to needs_review
  //      with reviewReason "short_cross_target_movement".
  //  - transport adjacent to unknown:
  //      < shortUnknownTransportHideMaxMinutes → hide as evidence on neighbour
  //      else short → needs_review("short_transport_to_unknown")
  // Real trips (distance ≥ realTripMinDistanceMeters, or long cross-target)
  // are kept as-is.
  // ───────────────────────────────────────────────────────────────────────
  const transportRowsBeforeSameTargetAbsorption = out.filter((r) => r.kind === 'transport').length;
  let sameTargetTransportAbsorbedCount = 0;
  let sameTargetTransportAbsorbedMinutes = 0;
  let sameTargetTransportRejectedByDistanceCount = 0;
  let sameTargetTransportRejectedByDistanceMinutes = 0;
  let crossTargetTransportKeptCount = 0;
  let shortCrossTargetTransportReviewCount = 0;
  let shortUnknownTransportReviewCount = 0;
  let shortUnknownTransportHiddenCount = 0;
  const absorbedSameTargetTransportExamples: ReportCandidateSummary['absorbedSameTargetTransportExamples'] = [];
  const sameTargetTransportRejectedExamples: ReportCandidateSummary['sameTargetTransportRejectedExamples'] = [];
  const keptCrossTargetTransportExamples: ReportCandidateSummary['keptCrossTargetTransportExamples'] = [];

  const collectCrossTargetExample = (
    cur: ReportCandidateBlock,
    prev: ReportCandidateBlock | undefined,
    next: ReportCandidateBlock | undefined,
    dist: number,
    distMissing: boolean,
  ) => {
    const prevKey = prev ? `${prev.targetType ?? ''}::${prev.targetId ?? ''}` : null;
    const nextKey = next ? `${next.targetType ?? ''}::${next.targetId ?? ''}` : null;
    const isCrossTargetWork =
      prev?.kind === 'work' && next?.kind === 'work' &&
      prevKey && nextKey && prevKey !== nextKey;
    if (!isCrossTargetWork) return;
    if (keptCrossTargetTransportExamples.length >= 20) return;
    keptCrossTargetTransportExamples.push({
      fromLabel: prev.targetLabel ?? null,
      toLabel: next.targetLabel ?? null,
      startAt: cur.startAt,
      endAt: cur.endAt,
      durationMinutes: Math.round(cur.durationMinutes * 100) / 100,
      distanceMeters: distMissing ? null : Math.round(dist),
    });
  };

  const flipToNeedsReview = (r: ReportCandidateBlock, reason: string) => {
    r.kind = 'needs_review';
    r.reviewState = 'needs_review';
    r.confidence = 'low';
    if (!r.reviewReasons.includes(reason)) r.reviewReasons.push(reason);
    r.title = 'Behöver granskas';
    r.subtitle = `${fmtClock(r.startAt)}–${fmtClock(r.endAt)} · ${fmtDuration(r.durationMinutes)}`;
  };

  let changed2 = true;
  let safety2 = 0;
  while (changed2 && safety2 < 50) {
    changed2 = false;
    safety2 += 1;
    for (let k = 0; k < out.length; k++) {
      const cur = out[k];
      if (cur.kind !== 'transport') continue;
      const distRaw = cur.evidenceSummary.distanceMeters;
      const distMissing = distRaw === undefined || distRaw === null;
      const dist = distRaw ?? 0;

      const prev = out[k - 1];
      const next = out[k + 1];
      const prevKey = targetKeyOf(prev);
      const nextKey = targetKeyOf(next);
      const prevWork = prev?.kind === 'work';
      const nextWork = next?.kind === 'work';

      // Rule 1 refinement: same-target absorption (any duration up to cap)
      // GATED by distance — only fold true jitter (≤ sameTargetTransportAbsorbMaxDistanceMeters).
      // Real round-trips (e.g. drive away from warehouse and back) stay as transport.
      const sameTargetCandidate =
        prevWork && nextWork && prevKey && nextKey && prevKey === nextKey &&
        cur.durationMinutes <= policy.sameTargetTransportAbsorbMaxMinutes;

      if (sameTargetCandidate) {
        // SOFT ABSORB (generell regel): När transport-segmentet ligger mellan
        // två work-block med samma target absorberar vi ALLTID in i föregående
        // work-block, oavsett distans eller om distans saknas. Att splittra
        // arbetsdagen i 3 separata Bergman-block är värre än att flagga
        // utflykten med en mjuk review-reason på det sammanslagna blocket.
        const transportMin = cur.durationMinutes;
        const softReason = distMissing
          ? 'same_target_transport_missing_distance'
          : (dist > policy.sameTargetTransportAbsorbMaxDistanceMeters
              ? 'same_target_roundtrip_long_distance'
              : 'movement_inside_same_target');
        const exampleSnapshot = {
          targetLabel: prev.targetLabel ?? null,
          startAt: cur.startAt,
          endAt: cur.endAt,
          durationMinutes: Math.round(transportMin * 100) / 100,
          distanceMeters: distMissing ? null : Math.round(dist),
          absorbedIntoWorkBlock: { startAt: prev.startAt, endAt: prev.endAt },
          reviewReasons: [softReason],
        };
        absorbInto(prev, cur);
        absorbInto(prev, next);
        if (!prev.reviewReasons.includes(softReason)) {
          prev.reviewReasons.push(softReason);
        }
        out.splice(k, 2);
        sameTargetTransportAbsorbedCount += 1;
        sameTargetTransportAbsorbedMinutes += transportMin;
        if (softReason === 'same_target_roundtrip_long_distance') {
          sameTargetTransportRejectedByDistanceCount += 1;
          sameTargetTransportRejectedByDistanceMinutes += transportMin;
        }
        if (absorbedSameTargetTransportExamples.length < 20) {
          absorbedSameTargetTransportExamples.push(exampleSnapshot);
        }
        changed2 = true;
        break;
      }

      if (dist >= policy.realTripMinDistanceMeters) {
        crossTargetTransportKeptCount += 1;
        collectCrossTargetExample(cur, prev, next, dist, distMissing);
        continue;
      }

      // Rule 3: adjacent to unknown
      const touchesUnknown = prev?.kind === 'unknown' || next?.kind === 'unknown';
      if (touchesUnknown) {
        if (cur.durationMinutes < policy.shortUnknownTransportHideMaxMinutes) {
          const host = prev?.kind === 'unknown' ? prev : next;
          if (host) absorbInto(host, cur);
          out.splice(k, 1);
          shortUnknownTransportHiddenCount += 1;
          changed2 = true;
          break;
        }
        if (cur.durationMinutes < policy.shortCrossTargetReviewMaxMinutes) {
          flipToNeedsReview(cur, 'short_transport_to_unknown');
          shortUnknownTransportReviewCount += 1;
          changed2 = true;
          break;
        }
        crossTargetTransportKeptCount += 1;
        continue;
      }

      // Rule 2: cross-target
      if (
        prevWork && nextWork && prevKey && nextKey && prevKey !== nextKey &&
        cur.durationMinutes < policy.shortCrossTargetReviewMaxMinutes
      ) {
        flipToNeedsReview(cur, 'short_cross_target_movement');
        shortCrossTargetTransportReviewCount += 1;
        changed2 = true;
        break;
      }

      crossTargetTransportKeptCount += 1;
      collectCrossTargetExample(cur, prev, next, dist, distMissing);
    }
  }

  const transportRowsAfterSameTargetAbsorption = out.filter((r) => r.kind === 'transport').length;

  // ───────────────────────────────────────────────────────────────────────
  // POST-PASS 2.5: Sandwich-inferred work
  //
  // Short unknown / needs_review block placed between two `work` rows on the
  // SAME calendar day → reclassify as `work` with inherited target (when both
  // sides match) or unlabeled work otherwise. Removes review-noise for small
  // unidentified gaps clearly inside an active work day.
  // ───────────────────────────────────────────────────────────────────────
  let inferredFromNeighborsCount = 0;
  let inferredFromNeighborsMinutes = 0;
  let inferredFromNeighborsInheritedTargetCount = 0;
  let inferredFromNeighborsUnlabeledCount = 0;
  if (policy.sandwichInferWorkMaxMinutes > 0) {
    const stockholmDay = (iso: string): string => {
      try {
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Stockholm',
          year: 'numeric', month: '2-digit', day: '2-digit',
        });
        return fmt.format(new Date(iso));
      } catch {
        return iso.slice(0, 10);
      }
    };
    for (let k = 1; k < out.length - 1; k++) {
      const cur = out[k];
      if (cur.kind !== 'unknown' && cur.kind !== 'needs_review') continue;
      if (cur.durationMinutes > policy.sandwichInferWorkMaxMinutes) continue;
      const prev = out[k - 1];
      const next = out[k + 1];
      if (prev.kind !== 'work' || next.kind !== 'work') continue;
      if (
        stockholmDay(cur.startAt) !== stockholmDay(prev.endAt) ||
        stockholmDay(cur.endAt) !== stockholmDay(next.startAt)
      ) continue;

      const prevKey = targetKeyOf(prev);
      const nextKey = targetKeyOf(next);
      const sameTarget = prevKey && nextKey && prevKey === nextKey;

      cur.kind = 'work';
      cur.reviewState = 'ok';
      cur.confidence = 'low';
      if (!cur.reviewReasons.includes('inferred_from_neighbors')) {
        cur.reviewReasons.push('inferred_from_neighbors');
      }
      cur.warningLabel = null;
      if (sameTarget) {
        cur.targetType = prev.targetType;
        cur.targetId = prev.targetId;
        cur.targetLabel = prev.targetLabel;
        cur.title = prev.targetLabel || 'Arbete';
        inferredFromNeighborsInheritedTargetCount += 1;
      } else {
        cur.targetType = null;
        cur.targetId = null;
        cur.targetLabel = null;
        cur.title = 'Arbete (okänd plats)';
        inferredFromNeighborsUnlabeledCount += 1;
      }
      cur.fromLabel = null;
      cur.toLabel = null;
      cur.subtitle = `${fmtClock(cur.startAt)}–${fmtClock(cur.endAt)} · ${fmtDuration(cur.durationMinutes)}`;
      inferredFromNeighborsCount += 1;
      inferredFromNeighborsMinutes += cur.durationMinutes;
    }
  }

  // POST-PASS 2.6: merge adjacent same-target work after sandwich inference.
  // When a short unknown/needs_review row is reclassified to `work` with an
  // inherited target, it can leave `work-A | work-A | work-A` as three visible
  // rows because the earlier merge passes have already run. Fold these back
  // together so one continuous workplace span is shown.
  let changed25 = true;
  let safety25 = 0;
  while (changed25 && safety25 < 50) {
    changed25 = false;
    safety25 += 1;
    for (let k = 1; k < out.length; k++) {
      const prev = out[k - 1];
      const cur = out[k];
      if (prev.kind !== 'work' || cur.kind !== 'work') continue;
      const prevKey = targetKeyOf(prev);
      const curKey = targetKeyOf(cur);
      if (!prevKey || !curKey || prevKey !== curKey) continue;
      absorbInto(prev, cur);
      out.splice(k, 1);
      changed25 = true;
      break;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // POST-PASS 3: Pre-work exclusion
  //
  // Time before the FIRST secure work target (a `work` block with a real
  // targetId — i.e. confirmed/probable on-site at a primary target) is not
  // a time-report candidate. Unknown / needs_review / non-target work / and
  // un-anchored transport are dropped from the main report and exposed
  // separately as `excludedPreWorkBlocks` for Decision Trace.
  //
  // Special rule: if the first secure work target starts AFTER 12:00 local
  // (Stockholm), every pre-work row is excluded with reason
  // `no_workplace_before_noon` — including transport — because we have no
  // evidence the morning was actual work.
  //
  // Anchored transport (immediately preceding the first primary target,
  // small gap, plausible direction) is preserved when there IS a primary
  // work target before noon.
  // ───────────────────────────────────────────────────────────────────────
  const excludedPreWorkBlocks: ReportCandidateBlock[] = [];
  const preWorkExclusionDiagnostics: PreWorkExclusionDiagnostics = {
    excludedPreWorkMinutes: 0,
    excludedPreWorkBlocksCount: 0,
    firstPrimaryWorkAt: null,
    firstPrimaryTargetLabel: null,
    excludedReasons: {},
    examples: [],
    homeAnchorsCount: input.homeAnchors?.length ?? 0,
    homeAnchorMatches: 0,
  };

  // Index presence blocks by id so we can recover GPS center for a candidate
  // block via its sourcePresenceBlockIds. Used by the home-anchor check below.
  const presenceById = new Map<string, PresenceDayBlock>();
  for (const pb of blocks) presenceById.set(pb.id, pb);
  const blockCenter = (
    r: ReportCandidateBlock,
  ): { lat: number; lng: number } | null => {
    for (const sid of r.sourcePresenceBlockIds ?? []) {
      const pb = presenceById.get(sid);
      const lat = pb?.evidence?.centerLat ?? null;
      const lng = pb?.evidence?.centerLng ?? null;
      if (lat != null && lng != null) return { lat, lng };
    }
    return null;
  };

  const stockholmHour = (iso: string): number => {
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Stockholm',
        hour: 'numeric',
        hour12: false,
      });
      return Number(fmt.format(new Date(iso)));
    } catch {
      return new Date(iso).getUTCHours() + 1; // fallback rough
    }
  };

  const firstPrimaryIdx = out.findIndex((r) => r.kind === 'work' && !!r.targetId);
  if (firstPrimaryIdx > 0) {
    const firstPrimary = out[firstPrimaryIdx];
    preWorkExclusionDiagnostics.firstPrimaryWorkAt = firstPrimary.startAt;
    preWorkExclusionDiagnostics.firstPrimaryTargetLabel = firstPrimary.targetLabel;
    const noWorkBeforeNoon = stockholmHour(firstPrimary.startAt) >= 12;

    const keep: boolean[] = new Array(firstPrimaryIdx).fill(true);
    for (let k = 0; k < firstPrimaryIdx; k++) {
      const r = out[k];
      let reason: PreWorkExclusionReason | null = null;

      // Home-anchor check FIRST — overrides other pre-work reasons so the
      // Decision Trace can say "Matchade privat nattplats" instead of just
      // "Före arbetsdag". Only applies to non-targeted blocks.
      if (!r.targetId) {
        const center = blockCenter(r);
        if (center && matchHomeAnchor(center.lat, center.lng, input.homeAnchors)) {
          reason = 'home_anchor';
          preWorkExclusionDiagnostics.homeAnchorMatches =
            (preWorkExclusionDiagnostics.homeAnchorMatches ?? 0) + 1;
        }
      }

      if (!reason) {
        if (noWorkBeforeNoon) {
          reason = 'no_workplace_before_noon';
        } else if (r.kind === 'unknown') {
          reason = 'before_first_primary_work_target';
        } else if (r.kind === 'needs_review') {
          reason = 'before_first_primary_work_target';
        } else if (r.kind === 'work' && !r.targetId) {
          reason = 'before_first_primary_work_target';
        } else if (r.kind === 'transport') {
          const isImmediatelyBefore = k === firstPrimaryIdx - 1;
          const gapMin =
            (new Date(firstPrimary.startAt).getTime() - new Date(r.endAt).getTime()) / 60_000;
          const anchored =
            isImmediatelyBefore &&
            gapMin <= 5 &&
            (!r.toLabel || !firstPrimary.targetLabel || r.toLabel === firstPrimary.targetLabel);
          if (!anchored) reason = 'before_first_primary_work_target';
        }
      }

      if (reason) {
        keep[k] = false;
        preWorkExclusionDiagnostics.excludedPreWorkMinutes += r.durationMinutes;
        preWorkExclusionDiagnostics.excludedPreWorkBlocksCount += 1;
        preWorkExclusionDiagnostics.excludedReasons[reason] =
          (preWorkExclusionDiagnostics.excludedReasons[reason] ?? 0) + 1;
        if (preWorkExclusionDiagnostics.examples.length < 20) {
          preWorkExclusionDiagnostics.examples.push({
            startAt: r.startAt,
            endAt: r.endAt,
            durationMinutes: r.durationMinutes,
            originalKind: r.kind,
            originalLabel: r.title,
            reason,
          });
        }
        excludedPreWorkBlocks.push(r);
      }
    }

    if (preWorkExclusionDiagnostics.excludedPreWorkBlocksCount > 0) {
      const filtered: ReportCandidateBlock[] = [];
      for (let k = 0; k < out.length; k++) {
        if (k >= firstPrimaryIdx || keep[k]) filtered.push(out[k]);
      }
      out.length = 0;
      out.push(...filtered);
    }
  }

  // Second pass — even when there is no firstPrimary work target (all-home
  // day, day off, etc.), exclude any non-targeted unknown/needs_review block
  // whose GPS center matches a home anchor. Keeps "Hemma / privat plats" out
  // of the main report on rest days.
  if ((input.homeAnchors?.length ?? 0) > 0 && out.length > 0) {
    const keepAll: boolean[] = new Array(out.length).fill(true);
    for (let k = 0; k < out.length; k++) {
      const r = out[k];
      if (r.targetId) continue;
      if (r.kind !== 'unknown' && r.kind !== 'needs_review') continue;
      const center = blockCenter(r);
      if (!center) continue;
      if (!matchHomeAnchor(center.lat, center.lng, input.homeAnchors)) continue;
      keepAll[k] = false;
      preWorkExclusionDiagnostics.excludedPreWorkMinutes += r.durationMinutes;
      preWorkExclusionDiagnostics.excludedPreWorkBlocksCount += 1;
      preWorkExclusionDiagnostics.excludedReasons['home_anchor'] =
        (preWorkExclusionDiagnostics.excludedReasons['home_anchor'] ?? 0) + 1;
      preWorkExclusionDiagnostics.homeAnchorMatches =
        (preWorkExclusionDiagnostics.homeAnchorMatches ?? 0) + 1;
      if (preWorkExclusionDiagnostics.examples.length < 20) {
        preWorkExclusionDiagnostics.examples.push({
          startAt: r.startAt,
          endAt: r.endAt,
          durationMinutes: r.durationMinutes,
          originalKind: r.kind,
          originalLabel: r.title,
          reason: 'home_anchor',
        });
      }
      excludedPreWorkBlocks.push(r);
    }
    if (keepAll.some((k) => !k)) {
      const filtered: ReportCandidateBlock[] = [];
      for (let k = 0; k < out.length; k++) if (keepAll[k]) filtered.push(out[k]);
      out.length = 0;
      out.push(...filtered);
    }
  }


  // Assign deterministic, position-independent ids. Same staff+day+kind+span
  // +target+source set ⇒ same id across runs. See createReportCandidateBlockId.
  const assignId = (r: ReportCandidateBlock) => {
    r.id = createReportCandidateBlockId({
      staffId: input.staffId,
      date: input.date,
      kind: r.kind,
      startAt: r.startAt,
      endAt: r.endAt,
      targetType: r.targetType,
      targetId: r.targetId,
      sourcePresenceBlockIds: r.sourcePresenceBlockIds,
    });
  };
  out.forEach(assignId);
  excludedPreWorkBlocks.forEach(assignId);

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
    reportBlocksBeforeMicroSuppression,
    reportBlocksAfterMicroSuppression: out.length,
    suppressedMicroTransportCount,
    suppressedMicroTransportMinutes,
    suppressedTinyWorkBlocksCount,
    suppressedTinyWorkMinutes,
    transportRowsBeforeSameTargetAbsorption,
    transportRowsAfterSameTargetAbsorption,
    sameTargetTransportAbsorbedCount,
    sameTargetTransportAbsorbedMinutes,
    crossTargetTransportKeptCount,
    shortCrossTargetTransportReviewCount,
    shortUnknownTransportReviewCount,
    shortUnknownTransportHiddenCount,
    absorbedSameTargetTransportExamples,
    sameTargetTransportRejectedByDistanceCount,
    sameTargetTransportRejectedByDistanceMinutes,
    sameTargetTransportRejectedExamples,
    keptCrossTargetTransportExamples,
    inferredFromNeighborsCount,
    inferredFromNeighborsMinutes,
    inferredFromNeighborsInheritedTargetCount,
    inferredFromNeighborsUnlabeledCount,
    reviewClassificationDiagnostics: {
      blockingReviewBlocksCount: 0,
      warningOnlyBlocksCount: 0,
      signalGapWarningOnlyBlocksCount: 0,
      signalGapPromotedToReviewCount: 0,
      clearWorkBlocksIncorrectlyReviewCount: 0,
    },
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

    // ─── Review-classification diagnostics ───────────────────────────
    const reasons = r.reviewReasons ?? [];
    const hasBlocking = reasons.some((x) => BLOCKING_REVIEW_REASONS.has(x));
    const hasWarningOnly = reasons.some((x) => WARNING_ONLY_REASONS.has(x));
    const onsiteEv = (r.evidenceSummary?.confirmedMinutes ?? 0) + (r.evidenceSummary?.probableMinutes ?? 0);
    const hasTarget = !!(r.targetId || r.targetLabel);

    if (r.reviewState === 'needs_review') {
      summary.reviewClassificationDiagnostics.blockingReviewBlocksCount += 1;
      if (reasons.includes('signal_gap_unresolved') && r.kind === 'work') {
        summary.reviewClassificationDiagnostics.signalGapPromotedToReviewCount += 1;
      }
      if (
        r.kind === 'work' &&
        hasTarget &&
        onsiteEv > 0 &&
        !hasBlocking &&
        reasons.length > 0 &&
        reasons.every((x) => WARNING_ONLY_REASONS.has(x))
      ) {
        summary.reviewClassificationDiagnostics.clearWorkBlocksIncorrectlyReviewCount += 1;
        warnings.push(
          `regression: work-block ${r.startAt}–${r.endAt} (${r.targetLabel ?? 'okänd target'}) ` +
            `markerades needs_review trots target+onsite-evidens och endast warning-only reasons (${reasons.join(',')})`,
        );
      }
    } else if (r.reviewState === 'ok' && (r.warningLabel || hasWarningOnly)) {
      summary.reviewClassificationDiagnostics.warningOnlyBlocksCount += 1;
      if (r.kind === 'work' && r.signalGapMinutes > 0) {
        summary.reviewClassificationDiagnostics.signalGapWarningOnlyBlocksCount += 1;
      }
    }
  }

  return {
    staffId: input.staffId,
    organizationId: input.organizationId,
    date: input.date,
    blocks: out,
    excludedPreWorkBlocks,
    preWorkExclusionDiagnostics,
    summary,
    warnings,
    policy,
  };
}
