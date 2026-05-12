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
import { TRANSPORT_MIN_DISTANCE_METERS } from './transportThreshold.ts';
import { consolidateReportBlocksIntoSessions } from './consolidateReportBlocksIntoSessions.ts';
import { getStockholmDayWindowUtc, stockholmDateKey } from '../stockholmDayWindow.ts';

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
   * När en active_time_registration är öppen och detta block är ankaret för
   * den öppna sessionen markeras blocket som pågående. UI använder detta för
   * att visa "Pågår / Aktiv timer" och för att förstå att endAt är preliminärt.
   */
  isOngoing?: boolean;
  /**
   * Session consolidation (POST-PASS 5):
   * minuter intern rörelse (jitter-transport < 500 m, kort transport mellan
   * samma target) som absorberats in i sessionen. Visas som warning, inte
   * som eget block.
   */
  internalMovementMinutes?: number;
  /**
   * Session consolidation (Time Engine 2.6):
   * meter intern rörelse (jitter-transport < 500 m, kort transport inom
   * samma arbetsområde/lager/projekt) som absorberats in i sessionen.
   */
  internalMovementDistanceMeters?: number;
  /**
   * Session consolidation metadata (Time Engine 2.3):
   * antal absorberade signal_gap-block i sessionen.
   */
  signalGapCount?: number;
  /** IDs på block som absorberats in i denna session (för spårbarhet). */
  absorbedBlockIds?: string[];
  /** Reviewreasons från absorberade block (sammanslaget set). */
  absorbedReasons?: string[];
  /** Warning-etiketter från absorberade block (sammanslaget set). */
  warningReasons?: string[];
  /** Time Engine 2.8 — synthetic id for the consolidated session this block
   *  represents. Set by consolidateReportBlocksIntoSessions. Diagnostic only. */
  sessionId?: string;
  /** Time Engine 2.8 — per-victim absorption trail (diagnostics only,
   *  not rendered in main view). */
  absorbedTrail?: Array<{
    absorbedIntoSessionId: string;
    absorbedOriginalKind: string;
    absorbedReason: string | null;
  }>;
  /** Time Engine 2.9 — set true when at least one block was absorbed via the
   *  probabilistic same-session pass (i.e. without a strict closing same-target
   *  work block). Diagnostics only. */
  hasProbabilisticConsolidation?: boolean;
  /** Time Engine 2.9 — set true when the session carries any signal-related
   *  uncertainty after consolidation (signalGapMinutes>0, signalGapCount>0,
   *  or 'signal_gap_inside_session' warning). Diagnostics + UI hint. */
  hasSignalUncertainty?: boolean;
  /** Time Engine 2.11 — set when an open active timer's anchor was clamped
   *  because the staff has been at a private_residence ≥ 90 minutes. The
   *  block's endAt is moved back to the moment of arrival home and isOngoing
   *  is forced to false. Diagnostics + UI hint. */
  autoClosedByPrivateResidence?: boolean;
  /** Time Engine 2.11 — ISO timestamp at which the work anchor was auto-closed
   *  (== privateResidenceStay.startMs). */
  autoClosedAt?: ISODateTime | null;
  /** Time Engine 2.11 — minutes the staff has been continuously at the
   *  private_residence at the moment we clamped the work anchor. */
  privateResidenceDurationMinutes?: number;
  /**
   * Förberedd kontext för framtida AI-granskning. Sätts EJ av denna builder.
   * Display-/edge-lager kan attachera fältet i ett senare steg. Ingen AI körs nu.
   */
  aiReviewContext?: AiReviewContext | null;
}

/**
 * Read-only kontext för en öppen active_time_registration.
 *
 * När denna är satt absorberar buildReportCandidateBlocks "trailing noise"
 * (signal_gap, uncertain_transition, unknown_place, kort transport utan
 * faktisk förflyttning) efter `startedAtIso` in i ett enda sammanhållet
 * pågående arbetsblock med target = open registration.
 *
 * Builder skriver ALDRIG till active_time_registrations eller någon annan
 * tabell — denna struct är endast en hint för rapportvyns sammanslagning.
 */
export interface OpenActiveRegistrationContext {
  registrationId: UUID;
  startedAtIso: ISODateTime;
  targetType: string | null;
  targetId: UUID | null;
  targetLabel: string | null;
  /** Diagnostik: alla aktiva-timer-rader i rapportkandidatvyn ärver denna. */
  currentLabel?: string | null;
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
  /**
   * POST-PASS 5 — sammanslagning av tekniska block (signal_gap-needs_review,
   * unknown, kort transport, micro-transitions) in i sammanhängande
   * arbetssessioner. Diagnostics endast — påverkar inga skrivningar.
   */
  sessionConsolidationDiagnostics: {
    blocksBeforeSessionConsolidation: number;
    blocksAfterSessionConsolidation: number;
    sessionsCreatedCount: number;
    absorbedSignalGapBlocksCount: number;
    absorbedNeedsReviewBlocksCount: number;
    absorbedInternalTransportBlocksCount: number;
    absorbedUnknownBlocksCount: number;
    preservedNeedsReviewBlocksCount: number;
    preservedTransportBlocksCount: number;
    demotedNeedsReviewBlocksCount?: number;
    /** Time Engine 2.9 — antal block absorberade via shouldAbsorbAsProbableSameSession. */
    probabilisticAbsorptionCount?: number;
    examples: Array<{
      staffName: string | null;
      sessionLabel: string | null;
      sessionStart: ISODateTime;
      sessionEnd: ISODateTime;
      sessionDurationMinutes: number;
      originalBlockKinds: string[];
      originalBlockLabels: string[];
      absorbedBlockCount: number;
      signalGapMinutes: number;
      internalMovementMinutes: number;
      finalKind: string;
      finalReviewState: string;
      warningLabel: string | null;
      reasons: string[];
      // Legacy back-compat fields:
      sessionTargetLabel: string | null;
      sessionStartAt: ISODateTime;
      sessionEndAt: ISODateTime;
      absorbedKinds: string[];
    }>;
  };
  /**
   * Time Engine 2.11 — diagnostics for the "Jag är hemma" / private_residence
   * status row that's shown immediately when a private_residence stay starts
   * inside the open active timer window. After 90 minutes the previous work
   * session is clamped and `autoEndTriggered` flips true.
   */
  openActiveTimerPrivateResidenceStatus?: {
    detected: boolean;
    label: 'Jag är hemma';
    privateResidenceLabel: string | null;
    privateResidenceStartAt: ISODateTime | null;
    privateResidenceEndAt: ISODateTime | null;
    privateResidenceDurationMinutes: number | null;
    isOngoing: boolean;
    shownImmediately: boolean;
    thresholdMinutes: 90;
    autoEndTriggered: boolean;
    workBlockClampedAt: ISODateTime | null;
    suppressedBlocksAfterHomeArrival: number;
  };
  /**
   * Time Engine 2.11 — diagnostik för open active_time_registration anchor
   * vs. senare verkliga motorblock. Anchor får aldrig förlängas eller skapa
   * synthetic-block som visuellt ligger ovanpå senare engine-evidens
   * (verklig transport, work på annan target, känd plats, private residence).
   */
  activeTimerOverlapDiagnostics?: {
    activeTimerAnchorsFound: number;
    activeTimerAnchorsExtended: number;
    activeTimerAnchorsClampedByLaterBlock: number;
    syntheticActiveTimerBlocksCreated: number;
    syntheticActiveTimerBlocksSkippedDueToEngineBlocks: number;
    overlappingWorkBlocksDetected: number;
    overlappingWorkBlocksResolved: number;
    examples: Array<{
      activeTimerTarget: string | null;
      activeTimerStart: ISODateTime;
      originalAnchorStart: ISODateTime | null;
      originalAnchorEnd: ISODateTime | null;
      clampedAnchorEnd: ISODateTime | null;
      conflictingBlockLabel: string | null;
      conflictingBlockStart: ISODateTime | null;
      conflictingBlockEnd: ISODateTime | null;
      reason: string;
    }>;
  };

  /**
   * Time Engine 2.12 — single visible timeline diagnostics.
   * Ett finalt pass garanterar att inga block (oavsett kind) får överlappa
   * inom samma staff/dag innan summary_json/display_blocks_json skrivs.
   */
  singleTimelineDiagnostics?: {
    blocksBeforeSingleTimeline: number;
    blocksAfterSingleTimeline: number;
    overlapsDetectedCount: number;
    overlapsResolvedCount: number;
    blocksMergedCount: number;
    blocksClippedCount: number;
    blocksAbsorbedCount: number;
    syntheticActiveTimerBlocksRemovedCount: number;
    remainingOverlapsCount: number;
    examples: Array<{
      staffName: string | null;
      overlapStart: ISODateTime;
      overlapEnd: ISODateTime;
      strongerBlockLabel: string | null;
      strongerBlockKind: string;
      weakerBlockLabel: string | null;
      weakerBlockKind: string;
      action: 'absorbed' | 'clipped' | 'merged' | 'removed' | 'invariant_clipped';
      reason: string;
    }>;
  };

  /**
   * Time Engine 3.3 — open-timer clamp diagnostics.
   * En open active_time_registration får ALDRIG förlänga ett synligt block
   * till `now`/`dayEnd` om
   *   - input.date inte är dagens datum i Europe/Stockholm, ELLER
   *   - det saknas färsk engine-evidens efter ankarets endAt (stale).
   * När förlängning blockeras klipps blocket vid senaste säkra evidens och
   * en diagnostic 'block_prevented_from_continuing_to_now' sätts.
   */
  openTimerClampDiagnostics?: {
    activeTimersSeen: number;
    activeTimersAllowedToExtend: number;
    activeTimersNotExtendedDueToStaleEvidence: number;
    activeTimersNotExtendedBecauseHistoricalDate: number;
    blocksPreventedFromContinuingToNow: number;
    /** Stale-window i minuter som tillämpas på lastFreshEvidenceAtIso. */
    freshEvidenceWindowMinutes: number;
    isStockholmToday: boolean;
    lastFreshEvidenceAtIso: ISODateTime | null;
    examples: Array<{
      reason:
        | 'historical_date_open_timer_not_extended'
        | 'stale_evidence_open_timer_not_extended'
        | 'block_prevented_from_continuing_to_now'
        | 'historical_date_synthetic_block_skipped'
        | 'stale_evidence_synthetic_block_skipped';
      activeTimerStart: ISODateTime;
      activeTimerTarget: string | null;
      anchorEndBefore: ISODateTime | null;
      anchorEndAfter: ISODateTime | null;
      lastFreshEvidenceAtIso: ISODateTime | null;
      stockholmDayEndUtc: ISODateTime;
    }>;
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
  /** Optional: when a registration is open (status='active' & stopped_at IS NULL),
   *  consolidate trailing noise after `startedAtIso` into one ongoing work block. */
  openActiveRegistration?: OpenActiveRegistrationContext | null;
  /** Time Engine 2.12 — planerad arbetsdagsslut för (staff, date), ISO.
   *  När satt och personen kommer hem FÖRE plannedEndOfDayIso − 15 min,
   *  räknas det som "hem mitt på dagen" och 90-min-auto-end SUPPRESSAS.
   *  Anchor markeras icke-pågående utan bakåtklamp. Räknas ut i callsite
   *  via `_shared/workday/plannedDay.ts` → computePlannedDaySignals. */
  plannedEndOfDayIso?: string | null;
  /** Time Engine 3.3 — senaste färska engine-evidens (typiskt sista GPS-pingens
   *  recorded_at). Används för att avgöra om en open active_time_registration
   *  tillåts förlänga ett synligt block till `now/dayEnd` eller om blocket ska
   *  klippas vid senaste säkra evidens. Krävs för att historiska dagar och
   *  stale open timers inte ska sträcka block över rapportdagens slut. */
  lastFreshEvidenceAtIso?: string | null;
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
  /** Engine 4 — PresenceDayBlocks whose evidence.privateResidence === true.
   *  These are filtered out BEFORE the report-candidate builder runs so they
   *  never become work / needs_review / unknown rows. Kept here as raw
   *  PresenceDayBlock evidence so Decision Trace can render them as
   *  "Dolt: Boende / privat plats". */
  excludedPrivateResidenceBlocks: PresenceDayBlock[];
  excludedPrivateResidenceDiagnostics: {
    excludedCount: number;
    excludedMinutes: number;
    targetIds: string[];
  };
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
  realTripMinDistanceMeters: TRANSPORT_MIN_DISTANCE_METERS,
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
  // Time Engine 4.2 — använd Europe/Stockholm dagsslut, inte UTC.
  // Tidigare bug: `${date}T23:59:59Z` (UTC) kunde ligga 1–2 h FÖRE
  // svensk midnatt, vilket gjorde att svenska kvällsblock felaktigt
  // klassades som "dag öppen" och fortsatte över 00:00 lokal tid.
  const cutoff = getStockholmDayWindowUtc(date).endUtcMs;
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
  // Time Engine 2.13 — ärva mänsklig label från victim om host saknar
  // (förhindrar att RIGG/work-block visas namnlöst när bästa label gömmer
  // sig i ett absorberat confirmed_on_site/probable_on_site block).
  if (!acc.targetLabel && b.targetLabel) {
    acc.targetLabel = b.targetLabel;
    if (!acc.targetId && b.targetId) acc.targetId = b.targetId;
    if (!acc.targetType && b.targetType) acc.targetType = b.targetType;
  }
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

  // Engine 4 — partition out private_residence / boende presence blocks BEFORE
  // any candidate logic runs. These must NEVER appear in the main report
  // (work / needs_review / unknown / transport). They are kept on the result
  // as raw evidence for Decision Trace.
  const allInputBlocks = (input.presenceDayBlocks ?? []).filter((b) => b.kind !== 'timer_marker');
  const excludedPrivateResidenceBlocks: PresenceDayBlock[] = [];
  const blocks: PresenceDayBlock[] = [];
  for (const b of allInputBlocks) {
    if ((b.evidence as any)?.privateResidence === true) {
      excludedPrivateResidenceBlocks.push(b);
    } else {
      blocks.push(b);
    }
  }
  const excludedPrivateResidenceDiagnostics = {
    excludedCount: excludedPrivateResidenceBlocks.length,
    excludedMinutes: excludedPrivateResidenceBlocks.reduce((a, b) => a + (b.durationMinutes ?? 0), 0),
    targetIds: Array.from(new Set(
      excludedPrivateResidenceBlocks
        .map((b) => (b.evidence as any)?.privateResidenceTargetId)
        .filter((x): x is string => typeof x === 'string' && x.length > 0),
    )),
  };
  if (excludedPrivateResidenceBlocks.length > 0) {
    warnings.push(
      `engine4_private_residence_excluded: ${excludedPrivateResidenceBlocks.length} block ` +
        `(${excludedPrivateResidenceDiagnostics.excludedMinutes} min) dolda från huvudvyn ` +
        `(boende-polygon).`,
    );
  }
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
        // Engine 4 hard gate: only allow bridged-trip promotion if THIS
        // staff's own GPS shows real displacement >= TRANSPORT_MIN_DISTANCE_METERS
        // around the gap. Without measured movement, two differing target
        // labels on either side (often caused by missing private_residence
        // polygon — home matched to nearby Warehouse on one side) would
        // otherwise hallucinate a "Resa" with zero meters travelled.
        const ownDispMeters: number | null =
          (b as any).evidence?.staffOwnDisplacementMeters ?? null;
        const ownMovementOk =
          ownDispMeters != null && ownDispMeters >= TRANSPORT_MIN_DISTANCE_METERS;

        if (prevKnown && nextKnown && prevKey !== nextKey && ownMovementOk) {
          const candidate = newAcc('transport', b);
          candidate.fromLabel = prev!.targetLabel;
          candidate.toLabel = next!.targetLabel;
          candidate.distanceMeters = Math.round(ownDispMeters!);
          if (prev!.kind === 'confirmed_on_site' && next!.kind === 'confirmed_on_site') {
            // both sides hard → high confidence already implied by distance,
            // but keep behaviour from before.
          }
          const fin = finalize(candidate, policy, out.length);
          if (fin) out.push(fin);
          i += 1;
          continue;
        }
        if (prevKnown && nextKnown && prevKey !== nextKey && !ownMovementOk) {
          // Differing labels but no measured movement → keep as needs_review
          // with explicit reason. Falls through to needs_review block below.
          const candidate = newAcc('needs_review', b);
          candidate.fromLabel = prev!.targetLabel;
          candidate.toLabel = next!.targetLabel;
          candidate.reviewReasons.add('targets_differ_without_movement');
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
    // Time Engine 2.3 — session metadata för spårbarhet
    host.absorbedBlockIds = Array.from(new Set([
      ...(host.absorbedBlockIds ?? []),
      victim.id,
      ...(victim.absorbedBlockIds ?? []),
    ]));
    if ((victim.reviewReasons?.length ?? 0) > 0) {
      host.absorbedReasons = Array.from(new Set([
        ...(host.absorbedReasons ?? []),
        ...victim.reviewReasons,
      ]));
    }
    if (victim.warningLabel) {
      host.warningReasons = Array.from(new Set([
        ...(host.warningReasons ?? []),
        victim.warningLabel,
        ...(victim.warningReasons ?? []),
      ]));
    }
    if (victim.kind === 'needs_review' || victim.signalGapMinutes > 0) {
      const looksLikeSignalGap =
        (victim.reviewReasons ?? []).some((rr) =>
          rr === 'signal_gap_unresolved' ||
          rr === 'signal_gap_open_day' ||
          rr === 'signal_gaps_inside_work_block' ||
          rr === 'missing_transition_evidence' ||
          rr === 'targets_differ_without_movement',
        ) || victim.signalGapMinutes > 0;
      if (looksLikeSignalGap) {
        host.signalGapCount = (host.signalGapCount ?? 0) + 1;
      }
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

  // ───────────────────────────────────────────────────────────────────────
  // POST-PASS 4: Open active_time_registration consolidation.
  //
  // När en active_time_registration är öppen (status=active, stopped_at=NULL)
  // är den auktoritativ kontext för att personen fortfarande arbetar på en
  // viss target. Då ska GPS-glapp / okända kortare perioder / korta
  // transport-rader UTAN faktisk förflyttning som ligger efter
  // openActiveStartedAt absorberas in i ETT sammanhållet pågående
  // arbetsblock — inte synas som separata GRANSKA/Okänd plats/Transport-
  // rader. Privata zoner (boende) hanteras separat (Time Engine 2.11):
  // direkt synlig "Jag är hemma"-status + 90-min auto-end på work-anchor.
  //
  // Stoppvillkor (segmenten EFTER ankaret behåller sin egen rad):
  //   - work-block med ANNAN target än aktiv registration
  //   - transport med distance >= realTripMinDistanceMeters (verklig resa)
  //
  // Inga writes till time_reports/workdays/LTE/travel/active_time_registrations.
  // ───────────────────────────────────────────────────────────────────────
  // Time Engine 2.11 — diagnostics row för "Jag är hemma" status.
  const PRIVATE_RESIDENCE_AUTO_END_THRESHOLD_MIN = 90;
  let privateResidenceStatusDiag:
    | NonNullable<ReportCandidateSummary['openActiveTimerPrivateResidenceStatus']>
    | undefined = undefined;

  // Time Engine 2.11 — Active timer overlap diagnostics. Active timer-ankaret
  // får aldrig förlängas (eller spawnas som synthetic block) ovanpå senare
  // verkliga motorblock (real transport, annan-target work, private_residence,
  // känd plats med engine-evidens).
  const activeTimerOverlapDiag: NonNullable<ReportCandidateSummary['activeTimerOverlapDiagnostics']> = {
    activeTimerAnchorsFound: 0,
    activeTimerAnchorsExtended: 0,
    activeTimerAnchorsClampedByLaterBlock: 0,
    syntheticActiveTimerBlocksCreated: 0,
    syntheticActiveTimerBlocksSkippedDueToEngineBlocks: 0,
    overlappingWorkBlocksDetected: 0,
    overlappingWorkBlocksResolved: 0,
    examples: [],
  };
  const pushOverlapExample = (ex: NonNullable<ReportCandidateSummary['activeTimerOverlapDiagnostics']>['examples'][number]) => {
    if (activeTimerOverlapDiag.examples.length < 20) activeTimerOverlapDiag.examples.push(ex);
  };

  // Time Engine 3.3 — open-timer clamp diagnostics.
  const FRESH_EVIDENCE_WINDOW_MIN = 30;
  const todayStockholm = stockholmDateKey(new Date().toISOString());
  const isStockholmToday = todayStockholm === input.date;
  const lastFreshEvidenceMs = input.lastFreshEvidenceAtIso
    ? new Date(input.lastFreshEvidenceAtIso).getTime()
    : NaN;
  const stockholmDayWindowAll = getStockholmDayWindowUtc(input.date);
  const openTimerClampDiag: NonNullable<ReportCandidateSummary['openTimerClampDiagnostics']> = {
    activeTimersSeen: 0,
    activeTimersAllowedToExtend: 0,
    activeTimersNotExtendedDueToStaleEvidence: 0,
    activeTimersNotExtendedBecauseHistoricalDate: 0,
    blocksPreventedFromContinuingToNow: 0,
    freshEvidenceWindowMinutes: FRESH_EVIDENCE_WINDOW_MIN,
    isStockholmToday,
    lastFreshEvidenceAtIso: input.lastFreshEvidenceAtIso ?? null,
    examples: [],
  };
  const pushClampExample = (ex: NonNullable<ReportCandidateSummary['openTimerClampDiagnostics']>['examples'][number]) => {
    if (openTimerClampDiag.examples.length < 20) openTimerClampDiag.examples.push(ex);
  };
  /**
   * Avgör om en open active_time_registration får förlänga ett synligt block
   * mot now/dayEnd. Returnerar ett beslut som callers använder för att klampa.
   *
   * Villkor för 'allowed':
   *  - input.date är dagens svenska datum
   *  - color: lastFreshEvidenceAtIso finns och inte är äldre än
   *    FRESH_EVIDENCE_WINDOW_MIN gentemot now
   *  - lastFreshEvidenceMs ligger efter ankarets nuvarande endAt − tolerance
   */
  const evaluateOpenTimerExtension = (params: {
    anchorEndMs: number | null;
  }): { allowed: boolean; reason: 'historical_date' | 'stale_evidence' | 'allowed' } => {
    if (!isStockholmToday) return { allowed: false, reason: 'historical_date' };
    if (!Number.isFinite(lastFreshEvidenceMs)) return { allowed: false, reason: 'stale_evidence' };
    const ageMs = Date.now() - lastFreshEvidenceMs;
    if (ageMs > FRESH_EVIDENCE_WINDOW_MIN * 60_000) {
      return { allowed: false, reason: 'stale_evidence' };
    }
    if (params.anchorEndMs != null) {
      // Färsk evidens måste ligga efter ankarets nuvarande endAt − tolerance
      // (annars finns ingen NY evidens som motiverar förlängning).
      const tolMs = 5 * 60_000;
      if (lastFreshEvidenceMs < params.anchorEndMs - tolMs) {
        return { allowed: false, reason: 'stale_evidence' };
      }
    }
    return { allowed: true, reason: 'allowed' };
  };


  const openCtx = input.openActiveRegistration ?? null;
  if (openCtx && openCtx.startedAtIso) {
    openTimerClampDiag.activeTimersSeen += 1;
    const startedMs = new Date(openCtx.startedAtIso).getTime();
    // Time Engine 4.2 — Europe/Stockholm dagsfönster (inte UTC `T23:59:59Z`).
    // Historiska dagar: clamp `nowMs` till stockholmDayEndMs så ankaret
    // aldrig sträcks in på efterföljande svensk kalenderdag.
    const stockholmDay = getStockholmDayWindowUtc(input.date);
    const dayCutoffMs = stockholmDay.endUtcMs;
    const rawNowMs = Date.now();
    // Time Engine 3.3 — på historiska dagar får Date.now ALDRIG vara visible
    // end. Klampa hårt till stockholmDayEndMs (clamp.ts upprepar för säkerhet).
    const nowMs = isStockholmToday ? Math.min(rawNowMs, dayCutoffMs) : dayCutoffMs;
    const openTargetKey = openCtx.targetId
      ? `${openCtx.targetType ?? ''}::${openCtx.targetId}`
      : null;
    const isOpenTarget = (r: ReportCandidateBlock): boolean => {
      if (!openTargetKey) return false;
      if (!r.targetId) return false;
      return `${r.targetType ?? ''}::${r.targetId}` === openTargetKey;
    };

    // Time Engine 2.11 — hård-break efter active timer:
    //  - real transport (>= realTripMinDistanceMeters)
    //  - work-block med ANNAN target än aktiv registration
    //  - private_residence (boende / hemma)
    //  - block med private_residence-relaterade reviewReasons
    const isHardBreakBlock = (r: ReportCandidateBlock): boolean => {
      const dist = r.evidenceSummary?.distanceMeters ?? 0;
      if (r.kind === 'transport' && dist >= policy.realTripMinDistanceMeters) return true;
      if (
        r.kind === 'work' &&
        !!r.targetId &&
        openTargetKey != null &&
        !isOpenTarget(r)
      ) return true;
      if (r.targetType === 'private_residence') return true;
      const reasons = r.reviewReasons ?? [];
      if (reasons.some((rr) => rr === 'private_residence' || rr === 'private_residence_status' || rr === 'home_private_conflict')) return true;
      return false;
    };
    const findFirstHardBreakAfter = (afterMs: number): { block: ReportCandidateBlock; startMs: number } | null => {
      let best: { block: ReportCandidateBlock; startMs: number } | null = null;
      for (const r of out) {
        const sMs = new Date(r.startAt).getTime();
        if (sMs <= afterMs) continue;
        if (!isHardBreakBlock(r)) continue;
        if (!best || sMs < best.startMs) best = { block: r, startMs: sMs };
      }
      return best;
    };

    // Hitta ankaret: senaste work-block (helst med matchande target) som
    // ligger inom eller överlappar [startedAt, dayEnd].
    let anchorIdx = -1;
    for (let k = out.length - 1; k >= 0; k--) {
      const r = out[k];
      if (r.kind !== 'work') continue;
      const endMs = new Date(r.endAt).getTime();
      const startMs = new Date(r.startAt).getTime();
      if (endMs < startedMs) break;
      if (isOpenTarget(r)) { anchorIdx = k; break; }
      // Acceptera även otarget-work om vi inte har ett bättre val
      if (anchorIdx === -1 && !r.targetId) anchorIdx = k;
      if (startMs >= startedMs && anchorIdx === -1) anchorIdx = k;
    }

    // Skapa syntetiskt block om inget work-block matchar
    if (anchorIdx === -1 && openTargetKey) {
      const liveEndMsRaw = Math.min(nowMs, dayCutoffMs);
      // Time Engine 2.11 — synth-block får ALDRIG sträcka sig in i / ovanpå
      // ett senare verkligt motorblock (real transport, annan-target work,
      // private_residence). Klampa till första hard-break.startAt.
      const firstBreak = findFirstHardBreakAfter(startedMs);
      const synthEndMs = firstBreak ? Math.min(liveEndMsRaw, firstBreak.startMs) : liveEndMsRaw;
      const synthDurMin = Math.round((synthEndMs - startedMs) / 60_000);
      if (synthDurMin < 1) {
        // Inget meningsfullt synth-block — engine har redan tydlig senare
        // session. Använd active timer endast som live-metadata.
        activeTimerOverlapDiag.syntheticActiveTimerBlocksSkippedDueToEngineBlocks += 1;
        if (firstBreak) {
          pushOverlapExample({
            activeTimerTarget: openCtx.targetLabel ?? openCtx.currentLabel ?? null,
            activeTimerStart: openCtx.startedAtIso,
            originalAnchorStart: null,
            originalAnchorEnd: null,
            clampedAnchorEnd: null,
            conflictingBlockLabel: firstBreak.block.targetLabel ?? firstBreak.block.title ?? null,
            conflictingBlockStart: firstBreak.block.startAt,
            conflictingBlockEnd: firstBreak.block.endAt,
            reason: 'synthetic_active_timer_block_skipped_due_to_later_engine_block',
          });
        }
      } else {
        const synthEnd = new Date(synthEndMs).toISOString();
        const synthStart = openCtx.startedAtIso;
        const dur = Math.max(1, synthDurMin);
        const synth: ReportCandidateBlock = {
          id: '',
          kind: 'work',
          startAt: synthStart,
          endAt: synthEnd,
          durationMinutes: dur,
          durationLabel: fmtDuration(dur),
          title: openCtx.targetLabel ?? openCtx.currentLabel ?? 'Arbete',
          subtitle: firstBreak
            ? `${fmtClock(synthStart)}–${fmtClock(synthEnd)} · ${fmtDuration(dur)}`
            : `${fmtClock(synthStart)}– pågår · ${fmtDuration(dur)}`,
          targetType: openCtx.targetType,
          targetId: openCtx.targetId,
          targetLabel: openCtx.targetLabel ?? openCtx.currentLabel ?? null,
          fromLabel: null,
          toLabel: null,
          confidence: 'medium',
          reviewState: 'ok',
          reviewReasons: ['open_active_timer_anchor'],
          warningLabel: firstBreak ? 'Aktiv timer avbruten av senare platsbevis' : null,
          evidenceSummary: {
            confirmedMinutes: 0,
            probableMinutes: 0,
            signalGapMinutes: 0,
            transportMinutes: 0,
            unknownMinutes: 0,
            presenceBlockCount: 0,
            suppressedSignalGapBlockCount: 0,
            suppressedUnknownBlockCount: 0,
            suppressedZeroLengthBlockCount: 0,
          },
          sourcePresenceBlockIds: [],
          hiddenSignalGapIds: [],
          hiddenPresenceBlockIds: [],
          signalGapMinutes: 0,
          firstConfirmedAt: null,
          lastConfirmedAt: null,
          isOngoing: !firstBreak,
        };
        if (firstBreak) {
          synth.warningReasons = ['active_timer_context_cut_by_later_engine_block'];
          synth.reviewReasons.push('active_timer_clamped_by_later_block');
          activeTimerOverlapDiag.activeTimerAnchorsClampedByLaterBlock += 1;
          pushOverlapExample({
            activeTimerTarget: openCtx.targetLabel ?? openCtx.currentLabel ?? null,
            activeTimerStart: openCtx.startedAtIso,
            originalAnchorStart: synthStart,
            originalAnchorEnd: new Date(liveEndMsRaw).toISOString(),
            clampedAnchorEnd: synthEnd,
            conflictingBlockLabel: firstBreak.block.targetLabel ?? firstBreak.block.title ?? null,
            conflictingBlockStart: firstBreak.block.startAt,
            conflictingBlockEnd: firstBreak.block.endAt,
            reason: 'active_timer_context_cut_by_later_engine_block',
          });
        }
        // sätt in i sorterad ordning
        let insertAt = out.length;
        for (let k = 0; k < out.length; k++) {
          if (out[k].startAt > synthStart) { insertAt = k; break; }
        }
        out.splice(insertAt, 0, synth);
        anchorIdx = insertAt;
        activeTimerOverlapDiag.syntheticActiveTimerBlocksCreated += 1;
      }
    }

    if (anchorIdx >= 0) {
      const anchor = out[anchorIdx];
      activeTimerOverlapDiag.activeTimerAnchorsFound += 1;
      // Adoptera open-target på ankaret om det saknar target
      if (!anchor.targetId && openCtx.targetId) {
        anchor.targetType = openCtx.targetType;
        anchor.targetId = openCtx.targetId;
        anchor.targetLabel = openCtx.targetLabel ?? openCtx.currentLabel ?? anchor.targetLabel;
        anchor.title = anchor.targetLabel ?? anchor.title;
      }

      // Walk forward and absorb absorberbara block, tills vi träffar något
      // som ska behålla sin egen rad.
      let k = anchorIdx + 1;
      let absorbedAny = false;
      while (k < out.length) {
        const r = out[k];
        const dist = r.evidenceSummary?.distanceMeters ?? 0;
        const isSameTargetWork =
          r.kind === 'work' && (isOpenTarget(r) || (!r.targetId && !openTargetKey));
        const isAbsorbableNoise =
          r.kind === 'needs_review' || r.kind === 'unknown';
        const isJitterTransport =
          r.kind === 'transport' && dist < policy.realTripMinDistanceMeters;
        const isRealTransport =
          r.kind === 'transport' && dist >= policy.realTripMinDistanceMeters;
        const isDifferentTargetWork =
          r.kind === 'work' && !!r.targetId && openTargetKey != null && !isOpenTarget(r);

        if (isRealTransport || isDifferentTargetWork) break;

        if (isSameTargetWork || isAbsorbableNoise || isJitterTransport) {
          absorbInto(anchor, r);
          out.splice(k, 1);
          absorbedAny = true;
          continue;
        }
        break;
      }

      // ─────────────────────────────────────────────────────────────────
      // Time Engine 2.11 — "Jag är hemma" + 90-min auto-end on home arrival.
      //
      // Hitta första private_residence-vistelse efter aktiv timer-start.
      // Källan är `excludedPrivateResidenceBlocks` (filtrerad innan builder
      // körs där `evidence.privateResidence === true`). Vi tar även hänsyn
      // till block i `out` som markerats med private_residence-relaterade
      // reviewReasons / targetType, så identifieringen blir robust.
      // ─────────────────────────────────────────────────────────────────
      type PrivateResidenceStay = {
        startMs: number;
        endMs: number;
        durationMinutes: number;
        label: string;
        targetId: string | null;
        isOngoing: boolean;
        sourcePresenceBlockIds: string[];
      };

      const PRIVATE_RESIDENCE_REASON_HINTS = new Set<string>([
        'private_residence',
        'private_zone',
        'open_active_timer_in_private_residence',
        'home_private_conflict',
      ]);

      const isPrivateResidenceCandidateBlock = (b: ReportCandidateBlock): boolean => {
        if (b.targetType === 'private_residence') return true;
        const reasons = b.reviewReasons ?? [];
        if (reasons.some((rr) => PRIVATE_RESIDENCE_REASON_HINTS.has(rr))) return true;
        return false;
      };

      const findPrivateResidenceStayAfter = (
        openStartMs: number,
      ): PrivateResidenceStay | null => {
        // Källa 1 — Engine-4-exkluderade presence-block (privacy-polygon).
        const fromExcluded = (excludedPrivateResidenceBlocks ?? [])
          .filter((b) => new Date(b.endAt).getTime() > openStartMs)
          .map((b) => ({
            startMs: Math.max(openStartMs, new Date(b.startAt).getTime()),
            endMs: new Date(b.endAt).getTime(),
            label:
              ((b.evidence as any)?.privateResidenceLabel as string | undefined) ??
              'Hemma',
            targetId:
              ((b.evidence as any)?.privateResidenceTargetId as string | undefined) ?? null,
            sourceId: b.id,
          }));

        // Källa 2 — block som redan ligger i `out` med private-residence-hint.
        const fromCandidates = out
          .filter((r) => {
            const e = new Date(r.endAt).getTime();
            return e > openStartMs && isPrivateResidenceCandidateBlock(r);
          })
          .map((r) => ({
            startMs: Math.max(openStartMs, new Date(r.startAt).getTime()),
            endMs: new Date(r.endAt).getTime(),
            label: r.targetLabel ?? r.title ?? 'Hemma',
            targetId: r.targetId ?? null,
            sourceId: r.id,
          }));

        const merged = [...fromExcluded, ...fromCandidates]
          .filter((s) => s.endMs > s.startMs)
          .sort((a, b) => a.startMs - b.startMs);
        if (merged.length === 0) return null;

        // Slå ihop närliggande private-residence-segment (gap < 20 min) som
        // sannolikt hör till samma hemmavistelse.
        const MERGE_GAP_MS = 20 * 60_000;
        let stayStart = merged[0].startMs;
        let stayEnd = merged[0].endMs;
        let label = merged[0].label;
        let targetId = merged[0].targetId;
        const ids: string[] = [merged[0].sourceId];
        for (let m = 1; m < merged.length; m++) {
          if (merged[m].startMs - stayEnd <= MERGE_GAP_MS) {
            stayEnd = Math.max(stayEnd, merged[m].endMs);
            ids.push(merged[m].sourceId);
            if (!targetId && merged[m].targetId) targetId = merged[m].targetId;
            if ((!label || label === 'Hemma') && merged[m].label) label = merged[m].label;
          } else {
            // Endast första vistelsen är intressant för auto-end-policyn.
            break;
          }
        }

        const isOngoing = stayEnd >= nowMs - 5 * 60_000;
        const effectiveEnd = isOngoing ? Math.min(nowMs, dayCutoffMs) : stayEnd;
        const durationMinutes = Math.max(0, Math.round((effectiveEnd - stayStart) / 60_000));
        return {
          startMs: stayStart,
          endMs: effectiveEnd,
          durationMinutes,
          label,
          targetId,
          isOngoing,
          sourcePresenceBlockIds: ids.filter((x) => typeof x === 'string' && x.length > 0),
        };
      };

      const stay = findPrivateResidenceStayAfter(startedMs);

      // Time Engine 4.4 — Planering får inte hålla dagen levande utan färsk
      // engine-evidence. plannedEnd är stöddata och blockerar BARA auto-end
      // om personen faktiskt återvänt till arbete efter hemkomsten (dvs det
      // finns senare work-evidence i `out` som inte är private_residence).
      //
      // Regel:
      //   - stay >= 90 min utan senare work evidence  → auto-end (även om
      //     plannedEnd ligger senare)
      //   - stay >= 90 min och senare work evidence    → person återvände,
      //     ingen auto-end (oförändrat)
      //   - stay <  90 min                             → ingen auto-end
      //     (täcker både hemma-paus och korta hemresor inom 90 min innan
      //     personen återvänder till jobb)
      const PLANNED_END_GRACE_MS = 15 * 60_000;
      const plannedEndIso = input.plannedEndOfDayIso ?? null;
      const plannedEndMs = plannedEndIso ? new Date(plannedEndIso).getTime() : NaN;

      const hasLaterWorkAfterStay = !!stay && out.some((b) => {
        if (b.kind !== 'work') return false;
        if (isPrivateResidenceCandidateBlock(b)) return false;
        return new Date(b.startAt).getTime() > stay.endMs;
      });

      const homeArrivedDuringPlannedDay =
        !!stay &&
        Number.isFinite(plannedEndMs) &&
        stay.startMs < plannedEndMs - PLANNED_END_GRACE_MS;

      // plannedEnd får INTE blockera auto-end utan faktisk return-to-work.
      const plannedEndBlocksAutoEnd = homeArrivedDuringPlannedDay && hasLaterWorkAfterStay;

      const autoEndTriggered =
        !!stay &&
        stay.durationMinutes >= PRIVATE_RESIDENCE_AUTO_END_THRESHOLD_MIN &&
        !plannedEndBlocksAutoEnd;

      // 1) Klampa eller förläng anchor.endAt baserat på home-stay.
      const anchorEndMsRaw = new Date(anchor.endAt).getTime();
      const liveEndMs = Math.min(nowMs, dayCutoffMs);
      let workBlockClampedAt: string | null = null;

      if (stay && autoEndTriggered) {
        // ≥90 min hemma → avsluta sessionen bakåt vid hemkomsttiden.
        const clampMs = Math.max(new Date(anchor.startAt).getTime() + 60_000, stay.startMs);
        anchor.endAt = new Date(clampMs).toISOString();
        anchor.durationMinutes = minutesBetween(anchor.startAt, anchor.endAt);
        anchor.durationLabel = fmtDuration(anchor.durationMinutes);
        anchor.isOngoing = false;
        anchor.autoClosedByPrivateResidence = true;
        anchor.autoClosedAt = anchor.endAt;
        anchor.privateResidenceDurationMinutes = stay.durationMinutes;
        anchor.warningReasons = Array.from(new Set([
          ...(anchor.warningReasons ?? []),
          'active_timer_auto_closed_by_private_residence',
        ]));
        if (!anchor.reviewReasons.includes('open_active_timer_reached_private_residence')) {
          anchor.reviewReasons.push('open_active_timer_reached_private_residence');
        }
        if (!anchor.reviewReasons.includes('private_residence_auto_end_after_90_min')) {
          anchor.reviewReasons.push('private_residence_auto_end_after_90_min');
        }
        anchor.warningLabel = 'Avslutad – hemkomst (90 min)';
        anchor.subtitle =
          `${fmtClock(anchor.startAt)}–${fmtClock(anchor.endAt)} · ${fmtDuration(anchor.durationMinutes)}`;
        workBlockClampedAt = anchor.endAt;
      } else if (stay && !autoEndTriggered) {
        // <90 min hemma — ELLER hem mitt under planerad arbetsdag.
        // Markera anchor som icke-pågående utan att klampa bakåt; vi vet
        // att personen just nu är hemma, men dagen är inte slut.
        if (anchorEndMsRaw < liveEndMs) {
          // Förläng INTE förbi hemkomsten — låt blocket sluta där det slutar
          // och låt "Jag är hemma"-blocket ta över visuellt.
          const safeEndMs = Math.min(liveEndMs, stay.startMs);
          if (safeEndMs > anchorEndMsRaw) {
            anchor.endAt = new Date(safeEndMs).toISOString();
            anchor.durationMinutes = minutesBetween(anchor.startAt, anchor.endAt);
            anchor.durationLabel = fmtDuration(anchor.durationMinutes);
          }
        }
        anchor.isOngoing = false;
        const reasonTag = homeArrivedDuringPlannedDay
          ? 'active_timer_home_during_planned_day'
          : 'active_timer_currently_at_private_residence';
        anchor.warningReasons = Array.from(new Set([
          ...(anchor.warningReasons ?? []),
          reasonTag,
        ]));
        if (homeArrivedDuringPlannedDay && !anchor.reviewReasons.includes('home_during_planned_day_no_auto_end')) {
          anchor.reviewReasons.push('home_during_planned_day_no_auto_end');
        }
        anchor.warningLabel = anchor.warningLabel ?? (
          homeArrivedDuringPlannedDay
            ? 'Pausad – hemma (planerad dag pågår)'
            : 'Pausad – hemma just nu'
        );
        anchor.subtitle =
          `${fmtClock(anchor.startAt)}–${fmtClock(anchor.endAt)} · ${fmtDuration(anchor.durationMinutes)}`;
      } else {
        // Ingen home-stay — gammal beteende: förläng till min(now, dayEnd).
        // Time Engine 2.11 — men ALDRIG förbi senare verkligt motorblock.
        const anchorStartMs = new Date(anchor.startAt).getTime();
        const liveEndMsRaw2 = Math.min(nowMs, dayCutoffMs);
        const firstBreak2 = findFirstHardBreakAfter(anchorStartMs);
        const breakStartMs = firstBreak2 ? firstBreak2.startMs : Number.POSITIVE_INFINITY;
        const targetEndMs = Math.min(liveEndMsRaw2, breakStartMs);
        const wasClampedByBreak = firstBreak2 != null && breakStartMs < liveEndMsRaw2;

        if (targetEndMs > anchorEndMsRaw) {
          anchor.endAt = new Date(targetEndMs).toISOString();
          anchor.durationMinutes = minutesBetween(anchor.startAt, anchor.endAt);
          anchor.durationLabel = fmtDuration(anchor.durationMinutes);
          activeTimerOverlapDiag.activeTimerAnchorsExtended += 1;
        } else if (wasClampedByBreak && anchorEndMsRaw > breakStartMs) {
          // Ankaret var redan extended förbi den hårda breaken — klampa bakåt.
          anchor.endAt = new Date(breakStartMs).toISOString();
          anchor.durationMinutes = minutesBetween(anchor.startAt, anchor.endAt);
          anchor.durationLabel = fmtDuration(anchor.durationMinutes);
        }

        if (wasClampedByBreak) {
          anchor.isOngoing = false;
          anchor.warningReasons = Array.from(new Set([
            ...(anchor.warningReasons ?? []),
            'active_timer_context_cut_by_later_engine_block',
          ]));
          anchor.warningLabel = 'Aktiv timer avbruten av senare platsbevis';
          anchor.subtitle = `${fmtClock(anchor.startAt)}–${fmtClock(anchor.endAt)} · ${fmtDuration(anchor.durationMinutes)}`;
          activeTimerOverlapDiag.activeTimerAnchorsClampedByLaterBlock += 1;
          pushOverlapExample({
            activeTimerTarget: openCtx.targetLabel ?? openCtx.currentLabel ?? null,
            activeTimerStart: openCtx.startedAtIso,
            originalAnchorStart: anchor.startAt,
            originalAnchorEnd: new Date(Math.max(anchorEndMsRaw, liveEndMsRaw2)).toISOString(),
            clampedAnchorEnd: anchor.endAt,
            conflictingBlockLabel: firstBreak2!.block.targetLabel ?? firstBreak2!.block.title ?? null,
            conflictingBlockStart: firstBreak2!.block.startAt,
            conflictingBlockEnd: firstBreak2!.block.endAt,
            reason: 'active_timer_context_cut_by_later_engine_block',
          });
        } else {
          anchor.isOngoing = true;
          anchor.warningLabel = anchor.warningLabel ?? 'Pågår – aktiv timer';
          anchor.subtitle =
            `${fmtClock(anchor.startAt)}– pågår · ${fmtDuration(anchor.durationMinutes)}`;
        }
      }

      anchor.reviewState = 'ok';
      if (!anchor.reviewReasons.includes('open_active_timer_consolidated') && absorbedAny) {
        anchor.reviewReasons.push('open_active_timer_consolidated');
      }
      // Rensa blocking review reasons — vi vet att personen jobbar (öppen timer)
      anchor.reviewReasons = anchor.reviewReasons.filter(
        (rr) => !BLOCKING_REVIEW_REASONS.has(rr) || WARNING_ONLY_REASONS.has(rr),
      );

      // 2) "Jag är hemma" status-block + suppress brus efter hemkomst.
      let suppressedAfterHomeArrival = 0;
      if (stay) {
        // Suppressa småblock efter hemkomsttiden: signal_gap, unknown,
        // jitter-transport, soft needs_review. Riktig transport >=500m
        // (ny arbetsresa) lämnas kvar.
        const filtered: ReportCandidateBlock[] = [];
        for (const r of out) {
          const rStart = new Date(r.startAt).getTime();
          if (rStart < stay.startMs) {
            filtered.push(r);
            continue;
          }
          // Skydda anchor + redan-private-residence-noteringar.
          if (r === anchor) { filtered.push(r); continue; }
          if (isPrivateResidenceCandidateBlock(r)) { filtered.push(r); continue; }

          const dist = r.evidenceSummary?.distanceMeters ?? 0;
          const isSoftNoise =
            r.kind === 'unknown' ||
            (r.kind === 'transport' && dist < policy.realTripMinDistanceMeters) ||
            (r.kind === 'needs_review');
          const isRealNewTrip =
            r.kind === 'transport' && dist >= policy.realTripMinDistanceMeters;
          if (isSoftNoise && !isRealNewTrip) {
            suppressedAfterHomeArrival += 1;
            continue;
          }
          filtered.push(r);
        }
        out.length = 0;
        out.push(...filtered);

        // Lägg in / behåll exakt ETT "Jag är hemma"-block.
        const homeStartIso = new Date(stay.startMs).toISOString();
        const homeEndIso = new Date(stay.endMs).toISOString();
        const homeDur = Math.max(1, Math.round((stay.endMs - stay.startMs) / 60_000));
        // Ta bort ev. äldre private-residence-noteringar i out.
        for (let k = out.length - 1; k >= 0; k--) {
          const r = out[k];
          if ((r.reviewReasons ?? []).includes('private_residence_status')) {
            out.splice(k, 1);
          }
        }
        out.push({
          id: '',
          kind: 'needs_review', // bibehåller typkontrakt; reviewState='ok' + title styr UI
          startAt: homeStartIso,
          endAt: homeEndIso,
          durationMinutes: homeDur,
          durationLabel: fmtDuration(homeDur),
          title: 'Jag är hemma',
          subtitle: stay.isOngoing
            ? `${fmtClock(homeStartIso)}– pågår · ${fmtDuration(homeDur)}`
            : `${fmtClock(homeStartIso)}–${fmtClock(homeEndIso)} · ${fmtDuration(homeDur)}`,
          targetType: 'private_residence',
          targetId: stay.targetId,
          targetLabel: stay.label || 'Hemma',
          fromLabel: null,
          toLabel: null,
          confidence: 'high',
          reviewState: 'ok',
          // 'private_residence' finns i HARD_SESSION_BREAK_REASONS i
          // consolidateReportBlocksIntoSessions → blocket kan aldrig
          // absorberas in i FA Warehouse / work-session.
          reviewReasons: ['private_residence_status', 'private_residence'],
          warningLabel: stay.isOngoing ? 'Pågår – hemma' : null,
          evidenceSummary: {
            confirmedMinutes: 0,
            probableMinutes: 0,
            signalGapMinutes: 0,
            transportMinutes: 0,
            unknownMinutes: 0,
            presenceBlockCount: stay.sourcePresenceBlockIds.length,
            suppressedSignalGapBlockCount: 0,
            suppressedUnknownBlockCount: 0,
            suppressedZeroLengthBlockCount: 0,
          },
          sourcePresenceBlockIds: stay.sourcePresenceBlockIds,
          hiddenSignalGapIds: [],
          hiddenPresenceBlockIds: stay.sourcePresenceBlockIds,
          signalGapMinutes: 0,
          firstConfirmedAt: null,
          lastConfirmedAt: null,
          isOngoing: stay.isOngoing,
        });
        out.sort((a, b) => a.startAt.localeCompare(b.startAt));
      }

      privateResidenceStatusDiag = {
        detected: !!stay,
        label: 'Jag är hemma',
        privateResidenceLabel: stay?.label ?? null,
        privateResidenceStartAt: stay ? new Date(stay.startMs).toISOString() : null,
        privateResidenceEndAt: stay ? new Date(stay.endMs).toISOString() : null,
        privateResidenceDurationMinutes: stay?.durationMinutes ?? null,
        isOngoing: stay?.isOngoing ?? false,
        shownImmediately: !!stay,
        thresholdMinutes: PRIVATE_RESIDENCE_AUTO_END_THRESHOLD_MIN,
        autoEndTriggered,
        workBlockClampedAt,
        suppressedBlocksAfterHomeArrival: suppressedAfterHomeArrival,
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // POST-PASS 4.5 — preventOverlappingWorkBlocks
  //
  // Säkerhetsnät: två work-block med olika target får aldrig överlappa
  // visuellt. Active timer-anchor är SVAGARE än verklig engine-evidens.
  // Prioritet (störst vinner):
  //   1. private_residence
  //   2. känd plats / project / booking / warehouse target
  //   3. real transport (>= realTripMinDistanceMeters)
  //   4. open_active_timer_anchor (active_time_registration)
  //
  // Om två work-block överlappar med olika target klipps anchor-blocket
  // (eller det svagaste) bakåt så det slutar vid det andras startAt.
  // ───────────────────────────────────────────────────────────────────────
  {
    const blockStrength = (b: ReportCandidateBlock): number => {
      const reasons = b.reviewReasons ?? [];
      if (b.targetType === 'private_residence' || reasons.includes('private_residence')) return 100;
      if (reasons.includes('open_active_timer_anchor')) return 30;
      // Verklig engine-target med stark evidens
      if (b.kind === 'work' && b.targetId) {
        const onsiteEv = (b.evidenceSummary?.confirmedMinutes ?? 0) + (b.evidenceSummary?.probableMinutes ?? 0);
        if (onsiteEv > 0) return 80;
        return 60;
      }
      if (b.kind === 'transport') {
        const dist = b.evidenceSummary?.distanceMeters ?? 0;
        if (dist >= policy.realTripMinDistanceMeters) return 50;
        return 20;
      }
      return 10;
    };

    out.sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      if (a.kind !== 'work') continue;
      const aEnd = new Date(a.endAt).getTime();
      const aStart = new Date(a.startAt).getTime();
      for (let j = i + 1; j < out.length; j++) {
        const b = out[j];
        if (b.kind !== 'work') continue;
        const bStart = new Date(b.startAt).getTime();
        if (bStart >= aEnd) break;
        // Overlapp: a slutar efter b startar.
        const sameTarget = a.targetId && b.targetId && a.targetId === b.targetId;
        if (sameTarget) continue;
        activeTimerOverlapDiag.overlappingWorkBlocksDetected += 1;
        const aS = blockStrength(a);
        const bS = blockStrength(b);
        // Klipp den svagare. Vid lika styrka — klipp den senare (b)
        // tillbaka? Nej, behåll a oförändrat och klipp b? Det förstör
        // start. Klipp istället den svagare så den slutar/startar vid
        // den starkares gräns.
        const loser = aS <= bS ? a : b;
        const winner = loser === a ? b : a;
        if (loser === a) {
          // klipp a:s slut till winner.start
          if (bStart > aStart + 60_000) {
            a.endAt = b.startAt;
            a.durationMinutes = minutesBetween(a.startAt, a.endAt);
            a.durationLabel = fmtDuration(a.durationMinutes);
            a.isOngoing = false;
            a.warningReasons = Array.from(new Set([
              ...(a.warningReasons ?? []),
              'active_timer_target_conflicts_with_engine_location',
            ]));
            a.warningLabel = a.warningLabel ?? 'Aktiv timer avbruten av senare platsbevis';
            a.subtitle = `${fmtClock(a.startAt)}–${fmtClock(a.endAt)} · ${fmtDuration(a.durationMinutes)}`;
            activeTimerOverlapDiag.overlappingWorkBlocksResolved += 1;
            pushOverlapExample({
              activeTimerTarget: a.targetLabel ?? a.title ?? null,
              activeTimerStart: a.startAt,
              originalAnchorStart: a.startAt,
              originalAnchorEnd: new Date(aEnd).toISOString(),
              clampedAnchorEnd: a.endAt,
              conflictingBlockLabel: winner.targetLabel ?? winner.title ?? null,
              conflictingBlockStart: winner.startAt,
              conflictingBlockEnd: winner.endAt,
              reason: 'overlap_resolved_clamped_weaker_block',
            });
          }
        } else {
          // loser === b: klipp b:s start framåt till a.endAt (sällan
          // praktiskt — vi klipper hellre slutet på a om b är starkare).
          // Lämna b orört, justera a istället om a är svagare hanteras ovan.
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // POST-PASS 5: consolidateReportBlocksIntoSessions
  //
  // Sista Time Engine pass innan summary_json / display_blocks_json /
  // staff_day_report_cache skrivs. Logik och dokumentation lever i
  // ./consolidateReportBlocksIntoSessions.ts (pure helper).
  //
  // Returnerar { blocks, diagnostics }. Diagnostics propageras vidare via
  // summary.sessionConsolidationDiagnostics och hamnar i diagnostics_json
  // hos backfill-staff-day-report-cache.
  // ───────────────────────────────────────────────────────────────────────
  const consolidationResult = consolidateReportBlocksIntoSessions(out, {
    realTripMinDistanceMeters: policy.realTripMinDistanceMeters,
    absorbInto,
    fmtClock,
    fmtDuration,
    blockingReviewReasons: BLOCKING_REVIEW_REASONS,
    warningOnlyReasons: WARNING_ONLY_REASONS,
  });
  // Replace the working list in-place to keep downstream id-assignment +
  // diagnostics wiring untouched.
  out.length = 0;
  out.push(...consolidationResult.blocks);
  const sessionDiagnostics = consolidationResult.diagnostics;

  // ───────────────────────────────────────────────────────────────────────
  // POST-PASS 6 — enforceSingleVisibleTimeline (Time Engine 2.12)
  //
  // Hård invariant: en person kan inte vara på två platser samtidigt.
  // Detta pass kör EFTER all consolidering och garanterar att de slutliga
  // blocken är strikt sekventiella per staff/dag innan summary_json /
  // display_blocks_json / staff_day_report_cache skrivs.
  //
  // Prioritet (störst vinner):
  //   1. private_residence
  //   2. confirmed work/known site med stark target-evidens
  //   3. project/booking/warehouse work-session från engine
  //   4. real transport (>= realTripMinDistanceMeters)
  //   5. probable work/known site
  //   6. probable transport
  //   7. warning-only/signalproblem
  //   8. needs_review
  //   9. open_active_timer_anchor (svagast — får aldrig vinna)
  // ───────────────────────────────────────────────────────────────────────
  const singleTimelineDiag: NonNullable<
    ReportCandidateSummary['singleTimelineDiagnostics']
  > = {
    blocksBeforeSingleTimeline: out.length,
    blocksAfterSingleTimeline: 0,
    overlapsDetectedCount: 0,
    overlapsResolvedCount: 0,
    blocksMergedCount: 0,
    blocksClippedCount: 0,
    blocksAbsorbedCount: 0,
    syntheticActiveTimerBlocksRemovedCount: 0,
    remainingOverlapsCount: 0,
    examples: [],
  };
  const pushSTExample = (
    ex: NonNullable<ReportCandidateSummary['singleTimelineDiagnostics']>['examples'][number],
  ) => {
    if (singleTimelineDiag.examples.length < 25) singleTimelineDiag.examples.push(ex);
  };
  {
    const ABSORB_MAX_REMAINDER_MIN = 3;
    const strengthOf = (b: ReportCandidateBlock): number => {
      const reasons = b.reviewReasons ?? [];
      if (b.targetType === 'private_residence' || reasons.includes('private_residence')) return 100;
      if (reasons.includes('open_active_timer_anchor')) return 5;
      const onsiteEv =
        (b.evidenceSummary?.confirmedMinutes ?? 0) +
        (b.evidenceSummary?.probableMinutes ?? 0);
      if (b.kind === 'work' && b.targetId && onsiteEv > 0) return 90;
      if (b.kind === 'work' && b.targetId) return 70;
      if (b.kind === 'transport') {
        const dist = b.evidenceSummary?.distanceMeters ?? 0;
        if (dist >= policy.realTripMinDistanceMeters) return 60;
        return 25;
      }
      if (b.kind === 'work') return 40;
      if (b.kind === 'needs_review') return 20;
      if (b.kind === 'unknown') return 15;
      return 10;
    };
    const labelOf = (b: ReportCandidateBlock): string | null =>
      b.targetLabel ?? b.title ?? null;
    const sameTargetKey = (a: ReportCandidateBlock, b: ReportCandidateBlock) => {
      if (!a.targetId || !b.targetId) return false;
      return a.targetId === b.targetId && (a.targetType ?? '') === (b.targetType ?? '');
    };
    const recompute = (b: ReportCandidateBlock) => {
      b.durationMinutes = minutesBetween(b.startAt, b.endAt);
      b.durationLabel = fmtDuration(b.durationMinutes);
      b.subtitle = `${fmtClock(b.startAt)}–${fmtClock(b.endAt)} · ${fmtDuration(b.durationMinutes)}`;
    };

    let safety = 0;
    while (safety++ < 200) {
      out.sort((a, b) =>
        a.startAt !== b.startAt ? a.startAt.localeCompare(b.startAt) : b.endAt.localeCompare(a.endAt),
      );
      let foundOverlap = false;
      for (let i = 0; i < out.length - 1; i++) {
        const a = out[i];
        const b = out[i + 1];
        const aStart = Date.parse(a.startAt);
        const aEnd = Date.parse(a.endAt);
        const bStart = Date.parse(b.startAt);
        const bEnd = Date.parse(b.endAt);
        if (bStart >= aEnd) continue; // ingen overlap
        foundOverlap = true;
        singleTimelineDiag.overlapsDetectedCount += 1;
        const overlapStart = a.startAt > b.startAt ? a.startAt : b.startAt;
        const overlapEnd = a.endAt < b.endAt ? a.endAt : b.endAt;

        // Same-target work merge
        if (a.kind === 'work' && b.kind === 'work' && sameTargetKey(a, b)) {
          absorbInto(a, b);
          out.splice(i + 1, 1);
          singleTimelineDiag.blocksMergedCount += 1;
          singleTimelineDiag.overlapsResolvedCount += 1;
          pushSTExample({
            staffName: null,
            overlapStart,
            overlapEnd,
            strongerBlockLabel: labelOf(a),
            strongerBlockKind: a.kind,
            weakerBlockLabel: labelOf(b),
            weakerBlockKind: b.kind,
            action: 'merged',
            reason: 'same_target_work_merged',
          });
          break;
        }

        const aS = strengthOf(a);
        const bS = strengthOf(b);
        const winner = aS >= bS ? a : b;
        const loser = winner === a ? b : a;
        const isSyntheticAnchor = (loser.reviewReasons ?? []).includes('open_active_timer_anchor');

        // Loser fully inside winner → absorb/remove
        const loserStart = Date.parse(loser.startAt);
        const loserEnd = Date.parse(loser.endAt);
        const winnerStart = Date.parse(winner.startAt);
        const winnerEnd = Date.parse(winner.endAt);
        if (loserStart >= winnerStart && loserEnd <= winnerEnd) {
          // remove loser
          const idx = out.indexOf(loser);
          if (idx >= 0) out.splice(idx, 1);
          singleTimelineDiag.blocksAbsorbedCount += 1;
          singleTimelineDiag.overlapsResolvedCount += 1;
          if (isSyntheticAnchor) singleTimelineDiag.syntheticActiveTimerBlocksRemovedCount += 1;
          pushSTExample({
            staffName: null,
            overlapStart,
            overlapEnd,
            strongerBlockLabel: labelOf(winner),
            strongerBlockKind: winner.kind,
            weakerBlockLabel: labelOf(loser),
            weakerBlockKind: loser.kind,
            action: isSyntheticAnchor ? 'removed' : 'absorbed',
            reason: 'loser_fully_inside_winner',
          });
          break;
        }

        // Annars: klipp loser så den inte överlappar winner.
        // a ligger alltid före b i tid (sorted). Två fall:
        if (loser === a) {
          // klipp a:s slut till b.start
          const newEnd = b.startAt;
          if (Date.parse(newEnd) - aStart < 60_000) {
            // för litet kvar → ta bort
            out.splice(i, 1);
            singleTimelineDiag.blocksAbsorbedCount += 1;
            if (isSyntheticAnchor) singleTimelineDiag.syntheticActiveTimerBlocksRemovedCount += 1;
            pushSTExample({
              staffName: null,
              overlapStart,
              overlapEnd,
              strongerBlockLabel: labelOf(b),
              strongerBlockKind: b.kind,
              weakerBlockLabel: labelOf(a),
              weakerBlockKind: a.kind,
              action: 'removed',
              reason: 'remainder_too_small_after_clip',
            });
          } else {
            a.endAt = newEnd;
            a.isOngoing = false;
            recompute(a);
            const remainder = minutesBetween(a.startAt, a.endAt);
            if (remainder < ABSORB_MAX_REMAINDER_MIN) {
              out.splice(i, 1);
              singleTimelineDiag.blocksAbsorbedCount += 1;
              if (isSyntheticAnchor) singleTimelineDiag.syntheticActiveTimerBlocksRemovedCount += 1;
              pushSTExample({
                staffName: null,
                overlapStart,
                overlapEnd,
                strongerBlockLabel: labelOf(b),
                strongerBlockKind: b.kind,
                weakerBlockLabel: labelOf(a),
                weakerBlockKind: a.kind,
                action: 'absorbed',
                reason: 'remainder_below_3min',
              });
            } else {
              singleTimelineDiag.blocksClippedCount += 1;
              pushSTExample({
                staffName: null,
                overlapStart,
                overlapEnd,
                strongerBlockLabel: labelOf(b),
                strongerBlockKind: b.kind,
                weakerBlockLabel: labelOf(a),
                weakerBlockKind: a.kind,
                action: 'clipped',
                reason: 'weaker_clipped_end_to_winner_start',
              });
            }
          }
        } else {
          // loser === b → klipp b:s start framåt till a.endAt
          const newStart = a.endAt;
          if (bEnd - Date.parse(newStart) < 60_000) {
            const idx = out.indexOf(b);
            if (idx >= 0) out.splice(idx, 1);
            singleTimelineDiag.blocksAbsorbedCount += 1;
            if (isSyntheticAnchor) singleTimelineDiag.syntheticActiveTimerBlocksRemovedCount += 1;
            pushSTExample({
              staffName: null,
              overlapStart,
              overlapEnd,
              strongerBlockLabel: labelOf(a),
              strongerBlockKind: a.kind,
              weakerBlockLabel: labelOf(b),
              weakerBlockKind: b.kind,
              action: 'removed',
              reason: 'remainder_too_small_after_clip',
            });
          } else {
            b.startAt = newStart;
            recompute(b);
            const remainder = minutesBetween(b.startAt, b.endAt);
            if (remainder < ABSORB_MAX_REMAINDER_MIN) {
              const idx = out.indexOf(b);
              if (idx >= 0) out.splice(idx, 1);
              singleTimelineDiag.blocksAbsorbedCount += 1;
              if (isSyntheticAnchor) singleTimelineDiag.syntheticActiveTimerBlocksRemovedCount += 1;
              pushSTExample({
                staffName: null,
                overlapStart,
                overlapEnd,
                strongerBlockLabel: labelOf(a),
                strongerBlockKind: a.kind,
                weakerBlockLabel: labelOf(b),
                weakerBlockKind: b.kind,
                action: 'absorbed',
                reason: 'remainder_below_3min',
              });
            } else {
              singleTimelineDiag.blocksClippedCount += 1;
              pushSTExample({
                staffName: null,
                overlapStart,
                overlapEnd,
                strongerBlockLabel: labelOf(a),
                strongerBlockKind: a.kind,
                weakerBlockLabel: labelOf(b),
                weakerBlockKind: b.kind,
                action: 'clipped',
                reason: 'weaker_clipped_start_to_winner_end',
              });
            }
          }
        }
        singleTimelineDiag.overlapsResolvedCount += 1;
        break; // re-sort and re-scan
      }
      if (!foundOverlap) break;
    }

    // Hård invariant — sista säkerhetsnät. Om något fortfarande överlappar:
    // klipp current.startAt till previous.endAt och räkna som engine error.
    out.sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur = out[i];
      if (Date.parse(prev.endAt) > Date.parse(cur.startAt)) {
        singleTimelineDiag.remainingOverlapsCount += 1;
        warnings.push(
          `engine_error: remaining overlap after enforceSingleVisibleTimeline ${prev.endAt} > ${cur.startAt}`,
        );
        if (Date.parse(prev.endAt) < Date.parse(cur.endAt)) {
          cur.startAt = prev.endAt;
          recompute(cur);
          pushSTExample({
            staffName: null,
            overlapStart: cur.startAt,
            overlapEnd: prev.endAt,
            strongerBlockLabel: labelOf(prev),
            strongerBlockKind: prev.kind,
            weakerBlockLabel: labelOf(cur),
            weakerBlockKind: cur.kind,
            action: 'invariant_clipped',
            reason: 'engine_error_safety_net',
          });
        }
      }
    }
    singleTimelineDiag.blocksAfterSingleTimeline = out.length;
  }


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
    sessionConsolidationDiagnostics: sessionDiagnostics,
    openActiveTimerPrivateResidenceStatus: privateResidenceStatusDiag,
    activeTimerOverlapDiagnostics: activeTimerOverlapDiag,
    singleTimelineDiagnostics: singleTimelineDiag,
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

  // ───────────────────────────────────────────────────────────────────────
  // Time Engine 4.2 — FINAL DAY-WINDOW CLAMP
  // Hård invariant: inga synliga blocks får ligga utanför svensk
  // rapportdag (Europe/Stockholm). Block helt utanför dagen tas bort,
  // block som överlappar dagsgränsen klipps. Detta körs sist så att alla
  // tidigare passes (open-active-timer-extend, single-timeline, session-
  // konsolidering) inte kan smita förbi.
  // ───────────────────────────────────────────────────────────────────────
  {
    const win = getStockholmDayWindowUtc(input.date);
    const clamped: ReportCandidateBlock[] = [];
    for (const b of out) {
      const sMs = Date.parse(b.startAt);
      const eMs = Date.parse(b.endAt);
      if (!Number.isFinite(sMs) || !Number.isFinite(eMs)) continue;
      if (eMs <= win.startUtcMs) continue; // helt före dagen
      if (sMs >= win.endUtcMs) continue;   // helt efter dagen
      const newSMs = Math.max(sMs, win.startUtcMs);
      const newEMs = Math.min(eMs, win.endUtcMs);
      if (newEMs - newSMs < 60_000) continue; // < 1 min kvar — droppa
      const startChanged = newSMs !== sMs;
      const endChanged = newEMs !== eMs;
      if (startChanged) b.startAt = new Date(newSMs).toISOString();
      if (endChanged) {
        b.endAt = new Date(newEMs).toISOString();
        // Block får aldrig anses pågående utanför dagsfönstret.
        if (b.isOngoing) b.isOngoing = false;
      }
      if (startChanged || endChanged) {
        b.durationMinutes = Math.max(1, Math.round((newEMs - newSMs) / 60_000));
        b.durationLabel = fmtDuration(b.durationMinutes);
        b.subtitle = `${fmtClock(b.startAt)}–${fmtClock(b.endAt)} · ${fmtDuration(b.durationMinutes)}`;
        const reasons = new Set(b.reviewReasons ?? []);
        reasons.add('clamped_to_stockholm_day_window');
        b.reviewReasons = Array.from(reasons);
      }
      clamped.push(b);
    }
    out.length = 0;
    out.push(...clamped);
  }

  return {
    staffId: input.staffId,
    organizationId: input.organizationId,
    date: input.date,
    blocks: out,
    excludedPreWorkBlocks,
    excludedPrivateResidenceBlocks,
    excludedPrivateResidenceDiagnostics,
    preWorkExclusionDiagnostics,
    summary,
    warnings,
    policy,
  };
}
