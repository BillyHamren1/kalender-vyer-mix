/**
 * Lager 3.1 — Workday Allocation Layer (read-only)
 * ────────────────────────────────────────────────
 *
 * Tar Lager 2 (LocationTruthV2) och en aktiv arbetsdag (workday) och
 * fördelar tiden inom workdayens fönster på rätt arbetskontext.
 *
 * GRUNDREGEL:
 *   Om dagtimern är aktiv är tiden inom arbetsdagen normalt arbetstid.
 *   Lager 3 ifrågasätter inte varje minut — den FÖRDELAR tiden rätt.
 *
 * Lager 3 får INTE:
 *   - ändra var personen var (LocationTruth är sanning här)
 *   - skriva time_reports / location_time_entries / payroll
 *   - röra active_time_registrations / GPS-pings / display_blocks_json
 *   - koppla till UI ännu (returneras endast i debug-fält)
 *
 * Output används i Lager 3.x-tester och senare lager (allokeringsförslag).
 */
import type { DayEvidence } from './buildDayEvidence.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
  BusinessContextStatus,
} from './buildLocationTruthFromDayEvidence.ts';
import {
  resolveEffectiveWorkdayEndFromEvidence,
  type DayEndStopReason,
} from './resolveEffectiveWorkdayEndFromEvidence.ts';
import {
  resolveBusinessContextForAllocation,
  type BusinessContextResolution,
} from './resolveBusinessContextForAllocation.ts';
import type { AssignmentEvidenceItem } from './buildAssignmentEvidence.ts';
import type { KnownTargetEvidenceItem } from './buildKnownTargetsEvidence.ts';

// ── Types ────────────────────────────────────────────────────────────────

export type WorkdayAllocationType =
  | 'project_work'
  | 'large_project_work'
  | 'booking_work'
  | 'warehouse_work'
  | 'supplier_visit'
  | 'work_travel'
  | 'commute_travel'
  | 'unlinked_work_address'
  | 'private_time'
  | 'needs_work_allocation_review';

export type WorkdayAllocationConfidence = 'high' | 'medium' | 'low';

// ── Lager 3.11B — kanoniska assignmentStatus-värden ──────────────────
//   assigned                 = matchad target av typ project/booking/large_project
//                              OCH personen var planerad på den (overlap).
//   unassigned_but_present   = matchad project/booking/large_project utan assignment
//                              (GPS/plats är tydlig men personalen var inte planerad).
//   no_assignment_required   = matchad supplier/warehouse/organization_location
//                              (ingen assignment krävs i normal arbetskontext).
//   unknown                  = status kan inte avgöras (t.ex. utanför workday).
export type WorkdayAllocationAssignmentStatus =
  | 'assigned'
  | 'unassigned_but_present'
  | 'no_assignment_required'
  | 'unknown';

// Lager 3.11B — extra detaljnivå utan att förorena assignmentStatus.
export type WorkdayAllocationAssignmentMatch =
  | 'overlap'        // assignment finns och täcker intervallet
  | 'no_overlap'     // matchad target men ingen assignment-overlap
  | 'not_required'   // supplier/warehouse/organization_location
  | 'missing'        // ingen target alls
  | 'unknown';       // utanför workday / kan ej avgöras

export interface WorkdayAllocationSegment {
  id: string;
  startAt: string;
  endAt: string;
  /** Kopplade LocationTruth-segment-ID:n (kan vara flera om flera segment slogs ihop). */
  sourceLocationTruthSegmentIds: string[];
  allocationType: WorkdayAllocationType;
  /** Plats-target-typ (om någon). */
  targetType: LocationTruthTargetType | null;
  targetId: string | null;
  label: string | null;
  address: string | null;
  confidence: WorkdayAllocationConfidence;
  warnings: WorkdayAllocationWarning[];
  /** Om personen var planerad på detta target i intervallet. */
  assignmentStatus: WorkdayAllocationAssignmentStatus;
  /** Lager 3.11B — extra detalj om hur assignment matchades. */
  assignmentMatch: WorkdayAllocationAssignmentMatch;
  /** Speglar Lager 2 businessContext.status — för transparens neråt. */
  businessContextStatus: BusinessContextStatus | null;
  /** Originalfönstret innan klippning till workday (debug). */
  rawSegmentStartAt?: string;
  rawSegmentEndAt?: string;
  /** True om segmentet ligger utanför aktiv workday och därför ej tilldelas arbete. */
  outsideWorkday?: boolean;
  /** Lager 3.5 — deterministisk projektkandidat för supplier_visit. */
  linkedProjectCandidate?: SupplierProjectCandidate | null;
  /** Time Engine Core Fix 2 — full business-context-resolution diagnostics. */
  businessContextResolution?: BusinessContextResolution | null;
  /** Map Trace 4 — fysisk plats-fält från LocationTruth (oberoende av target). */
  physicalLocationLabel?: string | null;
  physicalLocationAddress?: string | null;
  physicalLocationLat?: number | null;
  physicalLocationLng?: number | null;
  physicalLocationSource?: string | null;
  physicalLocationConfidence?: 'high' | 'medium' | 'low' | null;
  /** Map Trace 4 — full platsmatchnings-trace (kandidater/rejects/beslut). */
  locationMatchDiagnostics?: unknown;
}

export type SupplierProjectCandidateSource =
  | 'overlapping_assignment'
  | 'project_before'
  | 'project_after'
  | 'pattern_warehouse_supplier_project'
  | 'pattern_project_supplier_project'
  | 'pattern_project_supplier_warehouse';

export interface SupplierProjectCandidate {
  targetType: LocationTruthTargetType;
  targetId: string;
  label: string | null;
  source: SupplierProjectCandidateSource;
  confidence: WorkdayAllocationConfidence;
}

export type WorkdayAllocationWarning =
  | 'no_active_workday'
  | 'segment_outside_workday'
  | 'segment_partially_outside_workday'
  | 'unresolved_location_inside_workday'
  | 'private_residence_inside_workday'
  | 'movement_classified_as_work_travel'
  | 'movement_classified_as_commute'
  | 'unassigned_known_target_presence'
  | 'staff_not_assigned_to_matched_target'
  | 'no_project_link'
  | 'planning_geo_mismatch'
  | 'needs_review_business_context'
  | 'allocation_low_confidence'
  // ── Lager 3.4 — movement-warnings ─────────────────────────────────────
  | 'normally_not_paid_commute'
  | 'normally_not_paid_homebound'
  | 'long_travel_over_150km'
  | 'movement_missing_anchor'
  // ── Lager 3.5 — supplier-warnings ─────────────────────────────────────
  | 'supplier_visit_without_project_context'
  | 'supplier_visit_during_planned_project'
  // ── Lager 3.6 — hem/private efter sista arbetsplats ───────────────────
  | 'home_after_last_work_location'
  | 'temporary_home_presence'
  // ── Lager 3.10C — uncovered workday time (mjuk varning) ────────────────
  | 'workday_time_without_location_truth_segment'
  // ── Lager 3.11C — warehouse-warnings (ersätter warehouse_presence_no_assignment) ─
  | 'warehouse_presence'
  | 'warehouse_presence_during_planned_project'
  // ── Time Engine 3 — open/stale timer utan same-day evidence ──────────
  | 'open_timer_without_same_day_evidence'
  | 'workday_start_adjusted_to_first_evidence'
  // ── Time Engine STOP 1 — inferred day end pga non-work efter sista jobb ──
  | 'day_end_inferred_from_non_work_presence'
  | 'open_timer_ignored_after_inferred_day_end'
  // ── Time Engine Core Fix 1 — raw GPS finns men LocationTruth saknas ──
  | 'raw_pings_exist_but_location_truth_missing'
  // ── Time Engine Core Fix 2 — business context resolution ─────────────
  | 'target_missing_geo'
  | 'business_context_from_assignment'
  | 'competing_targets';

// ── Lager 3.11C — DEPRECATED warnings (får INTE emitteras) ─────────────
//   - supplier_visit_no_assignment       → använd supplier_visit_without_project_context
//                                          eller supplier_visit_during_planned_project
//   - warehouse_presence_no_assignment   → använd warehouse_presence
//                                          eller warehouse_presence_during_planned_project
//   - gap_in_workday                     → använd uncovered_workday_time-proposal
//                                          + workday_time_without_location_truth_segment
// Borttagna ur unionen så TS-koden inte kan återinföra dem av misstag.


export type WorkdayAllocationProposalType =
  | 'allocation_candidate'
  | 'suggest_workday_end'
  | 'consider_workday_end_from_private'
  // ── Lager 3.10C — gap som signalfrånvaro, inte review per default ──────
  | 'uncovered_workday_time'
  // ── Lager 3.10B — supplier→projektkandidat ──────────────────────────────
  | 'link_supplier_to_project_candidate'
  // ── Lager 3.10D — explicit AI-review-kandidat (skickas vidare till aiWorkdayReviewer) ─
  | 'ai_review_candidate';

export type WorkdayAllocationProposalSeverity = 'low' | 'medium' | 'high';

/** Lager 3.10B — explicit reason-vokab för link_supplier_to_project_candidate. */
export type SupplierLinkProposalReason =
  | 'supplier_visit_linked_to_project_candidate'
  | 'supplier_between_warehouse_and_project'
  | 'supplier_between_project_and_project'
  | 'supplier_near_overlapping_assignment';

export interface WorkdayAllocationDiagnostics {
  staffId: string | null;
  date: string | null;
  builtAtIso: string;
  buildDurationMs: number;
  hasActiveWorkday: boolean;
  workdayStartAt: string | null;
  workdayEndAt: string | null;
  workdayDurationMinutes: number;
  inputSegmentCount: number;
  segmentsInsideWorkday: number;
  segmentsOutsideWorkday: number;
  segmentsPartiallyClipped: number;
  allocationCounts: Record<WorkdayAllocationType, number>;
  warningsByType: Record<WorkdayAllocationWarning, number>;
  warnings: string[];
  /** Mins inom workdayen som inte täcks av något segment (gaps). */
  uncoveredWorkdayMinutes: number;
  // ── Lager 3.2 — Workday Envelope diagnostics ──────────────────────────
  workdayEnvelopeFound: boolean;
  openWorkday: boolean;
  workdayStartSource: WorkdayEnvelopeStartSource;
  workdayEndSource: WorkdayEnvelopeEndSource;
  envelopeWarnings: WorkdayEnvelopeWarning[];
  /** Lager 3.11D — strukturerad envelope-snapshot (timer vs effektiv vs analys). */
  workdayEnvelope: WorkdayEnvelopeDiagnostics;
  /** Alias för segmentsInsideWorkday — uttryckt mot envelope-vokabulären. */
  segmentsInsideEnvelope: number;
  /** Alias för segmentsOutsideWorkday. */
  segmentsOutsideEnvelope: number;
  // ── Lager 3.3 — fördelningsräknare ─────────────────────────────────────
  projectWorkCount: number;
  largeProjectWorkCount: number;
  bookingWorkCount: number;
  warehouseWorkCount: number;
  supplierVisitCount: number;
  unlinkedWorkAddressCount: number;
  unassignedButPresentCount: number;
  planningMismatchCount: number;
  // ── Lager 3.4 — movement-räknare ───────────────────────────────────────
  workTravelCount: number;
  commuteTravelCount: number;
  longTravelOver150kmCount: number;
  movementReviewCount: number;
  // ── Lager 3.5 — supplier-räknare ───────────────────────────────────────
  /** Alias för supplierVisitCount (Lager 3.5-vokab). */
  supplierVisits: number;
  supplierVisitsLinkedToProjectCandidate: number;
  supplierVisitsWithoutProjectContext: number;
  // ── Lager 3.6 — hem/private efter sista arbetsplats ───────────────────
  homeSegmentsAfterWork: number;
  homeOver90MinutesCount: number;
  suggestedWorkdayEndCount: number;
  temporaryHomePresenceCount: number;
  // ── Lager 3.10C — uncovered workday gaps ──────────────────────────────
  /** Antal gaps inom workday utan LocationTruth-täckning (alla längder). */
  uncoveredGapCount: number;
  /** Total minuttid uncovered inom workday (alias mot uncoveredWorkdayMinutes). */
  uncoveredGapMinutesTotal: number;
  /** Korta gaps (< proposalThreshold) som BARA räknas, inte föreslås. */
  shortUncoveredGapsIgnoredCount: number;
  /** Gaps som faktiskt blev proposals (≥ tröskel). */
  uncoveredGapsProposedCount: number;
  examples: Array<{
    id: string;
    allocationType: WorkdayAllocationType;
    label: string | null;
    startAt: string;
    endAt: string;
    confidence: WorkdayAllocationConfidence;
    warnings: WorkdayAllocationWarning[];
  }>;
  /** Time Engine STOP 1 — inferred day end (om triggad). */
  dayEndDecision?: WorkdayDayEndDecision | null;
  // ── Time Engine Core Fix 1 — LocationTruth obligatorisk ──────────────
  /** True om dagen har raw GPS-pings men 0 LocationTruth V2-segment. */
  hasRawPingsButNoLocationTruth?: boolean;
  /** True om allocation/display blockerats pga saknad LocationTruth. */
  engineBlockedBecauseLocationTruthMissing?: boolean;
  /** Antal raw pings i input (för debug/trace). */
  rawPingCount?: number;
  /** Antal LocationTruth V2-segment i input. */
  locationTruthV2SegmentCount?: number;
  // ── Time Engine Core Fix 2 — business context resolution ─────────────
  /** Antal segment där business context lyftes från assignment utan geo. */
  businessContextFromAssignmentCount?: number;
  /** Antal segment med target_missing_geo-warning. */
  targetMissingGeoCount?: number;
  /** Antal segment med konkurrerande targets. */
  competingTargetsCount?: number;
  /** Antal segment som fortfarande blir unlinked_work_address efter resolution. */
  stableAddressNoTargetCount?: number;
  /** Räkna fallbackUsed-utfall över alla segment. */
  businessContextFallbackCounts?: {
    none: number;
    assignment_without_geo: number;
    stable_address_no_target: number;
    unknown_location: number;
  };
}

export interface WorkdayAllocationProposal {
  segmentId: string;
  proposalType?: WorkdayAllocationProposalType;
  proposedAllocationType: WorkdayAllocationType;
  targetType: LocationTruthTargetType | null;
  targetId: string | null;
  label: string | null;
  startAt: string;
  endAt: string;
  /** Lager 3.6 — för suggest_workday_end: föreslagen sluttidpunkt. */
  suggestedEndAt?: string;
  confidence: WorkdayAllocationConfidence;
  reason: string;
  // ── Lager 3.10B — supplier-link metadata (endast för
  //    proposalType='link_supplier_to_project_candidate') ──────────────────
  /** Alla LocationTruth-segment-id:n som proposalen härleds från. */
  sourceSegmentIds?: string[];
  supplierTargetId?: string | null;
  supplierLabel?: string | null;
  candidateTargetType?: LocationTruthTargetType | null;
  candidateTargetId?: string | null;
  candidateLabel?: string | null;
  /** True = föreslås, men kräver mänsklig godkänning innan något skrivs. */
  requiresHumanApproval?: boolean;
  /** Lager 3.10C — severity för uncovered_workday_time. */
  severity?: WorkdayAllocationProposalSeverity;
}

export interface WorkdayAllocationResult {
  segments: WorkdayAllocationSegment[];
  proposals: WorkdayAllocationProposal[];
  diagnostics: WorkdayAllocationDiagnostics;
}

// ── Active workday input shape (minimal — vi äger inte schemat) ──────────

export interface ActiveWorkdayInput {
  /** Workday started ISO. Krävs för att fördelningen ska göra något. */
  startedAt: string | null;
  /** Workday stopped ISO; null/undefined = pågående → vi använder dayEvidence-slut. */
  stoppedAt?: string | null;
  staffId?: string | null;
  date?: string | null;
}

// ── Lager 3.2 — Workday Envelope ─────────────────────────────────────────
// Arbetsdagens RAM. Lager 3 fördelar tid INOM detta fönster.
// Skrivs ALDRIG någonstans — endast read-only debug + intern allokering.

export type WorkdayEnvelopeStartSource =
  | 'active_time_registration'
  | 'manual_input'
  | 'unknown';

export type WorkdayEnvelopeEndSource =
  | 'active_time_registration_stop'
  | 'analysis_window_end'
  | 'now'
  | 'manual_input'
  | 'unknown';

export type WorkdayEnvelopeWarning =
  | 'workday_timer_open'
  | 'workday_start_missing'
  | 'workday_end_before_start'
  | 'envelope_clipped_to_analysis_window'
  // Lager 3.11A — analysdag-klippning
  | 'workday_started_before_analysis_day'
  | 'workday_continues_after_analysis_day';

export interface WorkdayEnvelope {
  /** Arbetsdagens startsanning (effektiv, klippt mot analysdagen). null = ingen aktiv dagtimer. */
  startAt: string | null;
  /** Arbetsdagens slutsanning (effektiv, klippt mot analysdagen). Om isOpen=true är detta analysfönster/now. */
  endAt: string | null;
  /** True om dagtimern fortfarande är öppen (ingen stopp registrerad). */
  isOpen: boolean;
  startSource: WorkdayEnvelopeStartSource;
  endSource: WorkdayEnvelopeEndSource;
  warnings: WorkdayEnvelopeWarning[];
  // ── Lager 3.11A — diagnostics: bevara råa värden bredvid effektiva ──
  /** Rå timer-start från active_time_registrations (oklippt). */
  timerStartedAt?: string | null;
  /** Rå timer-stop från active_time_registrations (null om öppen). */
  timerStoppedAt?: string | null;
  /** Effektiv start (= max(timerStart, analysisDayStart)). Alias för startAt. */
  effectiveWorkdayStartAt?: string | null;
  /** Effektivt slut (= min(timerStop ?? now, analysisDayEnd)). Alias för endAt. */
  effectiveWorkdayEndAt?: string | null;
  /** Analysfönsterstart som användes för klippning. */
  analysisDayStartAt?: string | null;
  /** Analysfönsterslut som användes för klippning. */
  analysisDayEndAt?: string | null;
  // ── Lager 3.11D — explicita klipp-flaggor ──────────────────────────
  /** True om timer-start föll före analysdagens start och klipptes upp. */
  startWasClippedToDay?: boolean;
  /** True om timer-stop (eller now) föll efter analysdagens slut och klipptes ner. */
  endWasClippedToDay?: boolean;
  /** True om endAt sattes till "now" pga öppen timer (utan att nå analysDayEnd). */
  endWasClippedToNow?: boolean;
}

/**
 * Lager 3.11D — strukturerad envelope-snapshot för diagnostics/endpoint.
 * Speglar WorkdayEnvelope-fälten men är garanterat ifyllda (icke-optional)
 * och avsedda för UI/debug-visning.
 */
export interface WorkdayEnvelopeDiagnostics {
  timerStartedAt: string | null;
  timerStoppedAt: string | null;
  timerIsOpen: boolean;
  effectiveWorkdayStartAt: string | null;
  effectiveWorkdayEndAt: string | null;
  analysisDayStartAt: string | null;
  analysisDayEndAt: string | null;
  startWasClippedToDay: boolean;
  endWasClippedToDay: boolean;
  endWasClippedToNow: boolean;
  // ── Time Engine STOP 1 — inferred day end ────────────────────────────
  /** True om effectiveWorkdayEndAt klippts pga non-work-närvaro efter sista jobb. */
  endWasInferredFromNonWorkPresence?: boolean;
  /** True om öppen timer ignorerats bortom inferred end. */
  openTimerIgnoredAfterEnd?: boolean;
  /** Total non-work-närvaro (minuter) efter sista work-evidence. */
  nonWorkAfterLastWorkMinutes?: number;
  /** Time Engine STOP 1.1 — true om wdEnd klippts FÖRE allocation-loopen körts. */
  clampedBeforeAllocation?: boolean;
  /** STOP 1.1 — antal LT-segment som ignorerats för att de ligger efter inferred end. */
  segmentsIgnoredAfterInferredDayEnd?: number;
  /** STOP 1.1 — total tid (minuter) i ignorerade segment efter inferred end. */
  minutesIgnoredAfterInferredDayEnd?: number;
  warnings: WorkdayEnvelopeWarning[];
}

// ── Time Engine STOP 1 — dayEndDecision i workdayAllocation ──────────────
export type WorkdayDayEndReason =
  | 'home_after_last_work_over_90m'
  | 'private_after_last_work_over_90m'
  | 'non_work_location_after_last_work_over_90m'
  | 'no_work_evidence_after_last_work_over_90m'
  | 'open_timer_ignored_after_inferred_day_end';

export interface WorkdayDayEndDecision {
  dayEnded: boolean;
  endedAt: string | null;
  endReason: WorkdayDayEndReason | null;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface ResolveWorkdayEnvelopeInput {
  activeWorkday: ActiveWorkdayInput | null;
  /** Yttre slut för analysfönstret (t.ex. dayEnd UTC eller now-iso). Optional. */
  analysisWindowEndIso?: string | null;
  /** Lager 3.11A — analysfönsterstart (t.ex. dayStart UTC). Klipper bort tid före analysdagen. */
  analysisWindowStartIso?: string | null;
  /** Optional "now"-injection för testbarhet. */
  nowIso?: string | null;
}


/**
 * Bygger workdayEnvelope från aktiv dagtimer.
 * Skriver ALDRIG. Returnerar en ren beskrivning av arbetsdagens ram.
 */
export function resolveWorkdayEnvelope(
  input: ResolveWorkdayEnvelopeInput,
): WorkdayEnvelope {
  const wd = input.activeWorkday;
  const rawStartMs = toMs(wd?.startedAt ?? null);
  const rawStopMs = toMs(wd?.stoppedAt ?? null);
  const nowMs = toMs(input.nowIso ?? null) ?? Date.now();
  const analysisStartMs = toMs(input.analysisWindowStartIso ?? null);
  const analysisEndMs = toMs(input.analysisWindowEndIso ?? null);
  const warnings: WorkdayEnvelopeWarning[] = [];

  const timerStartedAt = rawStartMs !== null ? new Date(rawStartMs).toISOString() : null;
  const timerStoppedAt = rawStopMs !== null ? new Date(rawStopMs).toISOString() : null;
  const analysisDayStartAt = analysisStartMs !== null ? new Date(analysisStartMs).toISOString() : null;
  const analysisDayEndAt = analysisEndMs !== null ? new Date(analysisEndMs).toISOString() : null;

  if (rawStartMs === null) {
    return {
      startAt: null,
      endAt: null,
      isOpen: false,
      startSource: 'unknown',
      endSource: 'unknown',
      warnings: ['workday_start_missing'],
      timerStartedAt,
      timerStoppedAt,
      effectiveWorkdayStartAt: null,
      effectiveWorkdayEndAt: null,
      analysisDayStartAt,
      analysisDayEndAt,
      startWasClippedToDay: false,
      endWasClippedToDay: false,
      endWasClippedToNow: false,
    };
  }

  // ── Lager 3.11A — klipp start mot analysdag ──
  let effectiveStartMs = rawStartMs;
  let startWasClippedToDay = false;
  if (analysisStartMs !== null && rawStartMs < analysisStartMs) {
    effectiveStartMs = analysisStartMs;
    startWasClippedToDay = true;
    warnings.push('workday_started_before_analysis_day');
  }

  const startSource: WorkdayEnvelopeStartSource = 'active_time_registration';
  const isOpen = rawStopMs === null;

  // Bestäm rå end-kandidat: timer-stop om stängd, annars now.
  let rawEndCandidateMs: number;
  let endSource: WorkdayEnvelopeEndSource;
  if (!isOpen) {
    rawEndCandidateMs = rawStopMs!;
    endSource = 'active_time_registration_stop';
    if (rawEndCandidateMs <= rawStartMs) warnings.push('workday_end_before_start');
  } else {
    warnings.push('workday_timer_open');
    rawEndCandidateMs = nowMs;
    endSource = 'now';
  }

  // ── Lager 3.11A — klipp slut mot analysdag ──
  let effectiveEndMs = rawEndCandidateMs;
  let endWasClippedToDay = false;
  let endWasClippedToNow = false;
  if (analysisEndMs !== null && rawEndCandidateMs > analysisEndMs) {
    effectiveEndMs = analysisEndMs;
    endSource = 'analysis_window_end';
    endWasClippedToDay = true;
    warnings.push('workday_continues_after_analysis_day');
    if (isOpen) warnings.push('envelope_clipped_to_analysis_window');
  } else if (isOpen && analysisEndMs !== null && rawEndCandidateMs < analysisEndMs) {
    // Öppen timer mitt i dagen → endAt = now < analysisEnd.
    endWasClippedToNow = true;
    warnings.push('envelope_clipped_to_analysis_window');
  } else if (isOpen && analysisEndMs === null) {
    // Öppen utan analysfönster → endAt=now.
    endWasClippedToNow = true;
  }

  if (effectiveEndMs < effectiveStartMs) effectiveEndMs = effectiveStartMs;

  const startAt = new Date(effectiveStartMs).toISOString();
  const endAt = new Date(effectiveEndMs).toISOString();
  return {
    startAt,
    endAt,
    isOpen,
    startSource,
    endSource,
    warnings,
    timerStartedAt,
    timerStoppedAt,
    effectiveWorkdayStartAt: startAt,
    effectiveWorkdayEndAt: endAt,
    analysisDayStartAt,
    analysisDayEndAt,
    startWasClippedToDay,
    endWasClippedToDay,
    endWasClippedToNow,
  };
}

export interface BuildWorkdayAllocationInput {
  dayEvidence: DayEvidence | null;
  locationTruthV2: LocationTruthResult | null;
  /**
   * Bakåtkompatibel: rå aktiv dagtimer. Om workdayEnvelope INTE skickas
   * resolvar vi internt via resolveWorkdayEnvelope().
   */
  activeWorkday?: ActiveWorkdayInput | null;
  /** Lager 3.2 — färdigberäknad envelope. Om satt vinner den över activeWorkday. */
  workdayEnvelope?: WorkdayEnvelope | null;
  /** Optional analysfönsterslut för envelope-resolving (om vi resolvar internt). */
  analysisWindowEndIso?: string | null;
  /** Lager 3.11A — Optional analysfönsterstart för envelope-klippning. */
  analysisWindowStartIso?: string | null;
  /** Optional now-injection för testbarhet. */
  nowIso?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const ALLOC_TYPES: WorkdayAllocationType[] = [
  'project_work', 'large_project_work', 'booking_work', 'warehouse_work',
  'supplier_visit', 'work_travel', 'commute_travel', 'unlinked_work_address',
  'private_time', 'needs_work_allocation_review',
];
const WARNING_TYPES: WorkdayAllocationWarning[] = [
  'no_active_workday', 'segment_outside_workday', 'segment_partially_outside_workday',
  'unresolved_location_inside_workday', 'private_residence_inside_workday',
  'movement_classified_as_work_travel', 'movement_classified_as_commute',
  'unassigned_known_target_presence', 'staff_not_assigned_to_matched_target',
  'no_project_link', 'planning_geo_mismatch',
  'needs_review_business_context', 'allocation_low_confidence',
  'normally_not_paid_commute', 'normally_not_paid_homebound',
  'long_travel_over_150km', 'movement_missing_anchor',
  'supplier_visit_without_project_context', 'supplier_visit_during_planned_project',
  'home_after_last_work_location', 'temporary_home_presence',
  'workday_time_without_location_truth_segment',
  'warehouse_presence', 'warehouse_presence_during_planned_project',
  'open_timer_without_same_day_evidence',
  'workday_start_adjusted_to_first_evidence',
  'day_end_inferred_from_non_work_presence',
  'open_timer_ignored_after_inferred_day_end',
  'raw_pings_exist_but_location_truth_missing',
  'target_missing_geo', 'business_context_from_assignment', 'competing_targets',
];

const emptyAllocCounts = (): Record<WorkdayAllocationType, number> =>
  Object.fromEntries(ALLOC_TYPES.map((t) => [t, 0])) as Record<WorkdayAllocationType, number>;
const emptyWarningCounts = (): Record<WorkdayAllocationWarning, number> =>
  Object.fromEntries(WARNING_TYPES.map((w) => [w, 0])) as Record<WorkdayAllocationWarning, number>;

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

// Lager 3.4 — kontext för movement-fördelning.
export type MovementSide =
  | 'work_project'
  | 'work_large_project'
  | 'work_booking'
  | 'work_warehouse'
  | 'work_supplier'
  | 'home_or_private'
  | 'unknown';

export interface MovementContext {
  fromSide: MovementSide;
  toSide: MovementSide;
  distanceMeters: number | null;
  /** True om detta är dagens första movement från hem → jobb. */
  isFirstWorkboundCommuteOfDay: boolean;
  /** True om detta är dagens sista movement från jobb → hem. */
  isLastHomeboundCommuteOfDay: boolean;
}

function isWorkSide(s: MovementSide): boolean {
  return s === 'work_project' || s === 'work_large_project' ||
    s === 'work_booking' || s === 'work_warehouse' || s === 'work_supplier';
}

function classifyMovementSide(target: LocationTruthMatchedTargetLike | null): MovementSide {
  if (!target || !target.targetType) return 'unknown';
  switch (target.targetType) {
    case 'project': return 'work_project';
    case 'large_project': return 'work_large_project';
    case 'booking': return 'work_booking';
    case 'warehouse':
    case 'organization_location': return 'work_warehouse';
    case 'supplier': return 'work_supplier';
    case 'private_zone': return 'home_or_private';
    default: return 'unknown';
  }
}

type LocationTruthMatchedTargetLike = { targetType?: LocationTruthTargetType };

/** Beslutar allocationType utifrån LocationTruth-segmentet. */
function deriveAllocation(
  seg: LocationTruthSegment,
  hasOverlapWithAssignment: boolean,
  movementCtx?: MovementContext | null,
  businessContextResolution?: BusinessContextResolution | null,
): {
  type: WorkdayAllocationType;
  warnings: WorkdayAllocationWarning[];
  confidence: WorkdayAllocationConfidence;
} {
  const warnings: WorkdayAllocationWarning[] = [];
  const matched = seg.businessContext?.matchedTarget ?? seg.matchedTarget;
  const status = seg.businessContext?.status ?? null;

  // ── Lager 3.4 — movement med arbetskontext ─────────────────────────
  if (seg.finalType === 'movement') {
    const ctx = movementCtx ?? null;
    const dist = ctx?.distanceMeters ?? null;
    const longTravel = dist !== null && dist > 150_000;

    // Saknar tydlig fram/till-anchor → behöver review.
    if (!ctx || ctx.fromSide === 'unknown' || ctx.toSide === 'unknown') {
      const w: WorkdayAllocationWarning[] = ['movement_missing_anchor'];
      if (longTravel) w.push('long_travel_over_150km');
      return {
        type: 'needs_work_allocation_review',
        warnings: w,
        confidence: 'low',
      };
    }

    // Hem ↔ arbetsplats → commute.
    if (ctx.fromSide === 'home_or_private' && isWorkSide(ctx.toSide)) {
      const w: WorkdayAllocationWarning[] = [
        'movement_classified_as_commute',
        'normally_not_paid_commute',
      ];
      if (longTravel) w.push('long_travel_over_150km');
      return { type: 'commute_travel', warnings: w, confidence: seg.confidence };
    }
    if (isWorkSide(ctx.fromSide) && ctx.toSide === 'home_or_private') {
      const w: WorkdayAllocationWarning[] = [
        'movement_classified_as_commute',
        'normally_not_paid_homebound',
      ];
      if (longTravel) w.push('long_travel_over_150km');
      return { type: 'commute_travel', warnings: w, confidence: seg.confidence };
    }

    // Arbete ↔ arbete → work_travel.
    if (isWorkSide(ctx.fromSide) && isWorkSide(ctx.toSide)) {
      const w: WorkdayAllocationWarning[] = ['movement_classified_as_work_travel'];
      if (longTravel) w.push('long_travel_over_150km');
      return { type: 'work_travel', warnings: w, confidence: seg.confidence };
    }

    // Hem ↔ hem eller andra konstellationer → review.
    const w: WorkdayAllocationWarning[] = ['movement_missing_anchor'];
    if (longTravel) w.push('long_travel_over_150km');
    return { type: 'needs_work_allocation_review', warnings: w, confidence: 'low' };
  }

  if (seg.finalType === 'private_residence') {
    return { type: 'private_time', warnings: ['private_residence_inside_workday'], confidence: seg.confidence };
  }

  if (seg.finalType === 'unresolved_location') {
    return {
      type: 'needs_work_allocation_review',
      warnings: ['unresolved_location_inside_workday'],
      confidence: 'low',
    };
  }

  if (seg.finalType === 'needs_location_review') {
    return {
      type: 'needs_work_allocation_review',
      warnings: ['needs_review_business_context'],
      confidence: 'low',
    };
  }

  if (seg.finalType === 'known_address') {
    // Time Engine Core Fix 2: pröva business-context-resolution INNAN
    // vi faller till unlinked_work_address. Om personen är planerad på
    // project/booking/large_project under samma tid är det inte en
    // okopplad adress — det är planerat arbete där target saknar geo.
    if (status === 'planning_geo_mismatch') warnings.push('planning_geo_mismatch');
    if (status === 'needs_review') warnings.push('needs_review_business_context');

    const r = businessContextResolution;
    if (r && r.fallbackUsed === 'assignment_without_geo' && r.selectedTargetType) {
      for (const w of r.extraWarnings) {
        if (!warnings.includes(w as WorkdayAllocationWarning)) {
          warnings.push(w as WorkdayAllocationWarning);
        }
      }
      const typeMap: Record<string, WorkdayAllocationType> = {
        large_project: 'large_project_work',
        project: 'project_work',
        booking: 'booking_work',
        warehouse: 'warehouse_work',
        organization_location: 'warehouse_work',
        supplier: 'supplier_visit',
      };
      const allocType = typeMap[r.selectedTargetType as string] ?? 'unlinked_work_address';
      return {
        type: allocType,
        warnings,
        confidence: seg.confidence === 'high' ? 'medium' : seg.confidence,
      };
    }
    if (r && r.competingTargets) {
      for (const w of r.extraWarnings) {
        if (!warnings.includes(w as WorkdayAllocationWarning)) {
          warnings.push(w as WorkdayAllocationWarning);
        }
      }
      return {
        type: 'needs_work_allocation_review',
        warnings,
        confidence: 'low',
      };
    }

    // Fysisk plats stabil men ingen assignment/target → unlinked_work_address.
    // Severity warning/info via Lager 4-mappning.
    warnings.push('no_project_link');
    return {
      type: 'unlinked_work_address',
      warnings,
      confidence: seg.confidence === 'high' ? 'medium' : seg.confidence,
    };
  }

  // known_site → mappa per matchedTarget.targetType
  // Lager 3.3: GPS/plats vinner. Saknad assignment SLOPAR INTE kopplingen
  // — den ger bara en warning + unassigned_but_present-status.
  if (matched) {
    // planning_geo_mismatch betyder GPS säger en sak, planering en annan.
    // GPS/plats vinner → vi behåller mappingen men varnar.
    if (status === 'planning_geo_mismatch') warnings.push('planning_geo_mismatch');

    switch (matched.targetType) {
      case 'large_project':
        if (!hasOverlapWithAssignment) warnings.push('staff_not_assigned_to_matched_target');
        return { type: 'large_project_work', warnings, confidence: seg.confidence };
      case 'project':
        if (!hasOverlapWithAssignment) warnings.push('staff_not_assigned_to_matched_target');
        return { type: 'project_work', warnings, confidence: seg.confidence };
      case 'booking':
        if (!hasOverlapWithAssignment) warnings.push('staff_not_assigned_to_matched_target');
        return { type: 'booking_work', warnings, confidence: seg.confidence };
      case 'warehouse':
      case 'organization_location':
        // Lager 3.10A: warehouse/organization_location kräver INGEN assignment.
        // Det är normal arbetskontext inom aktiv dagtimer. Inga
        // warehouse_presence_no_assignment / organization_location_no_assignment
        // varningar emitteras längre.
        return { type: 'warehouse_work', warnings, confidence: seg.confidence };
      case 'supplier':
        // Lager 3.10A: supplier kräver INGEN assignment.
        // supplier_visit_no_assignment emitteras inte längre.
        return { type: 'supplier_visit', warnings, confidence: seg.confidence };
      case 'private_zone':
        return { type: 'private_time', warnings: ['private_residence_inside_workday'], confidence: seg.confidence };
    }
  }

  // known_site utan matched target → unassigned presence (saknar projektkoppling).
  if (status === 'unassigned_known_target_presence') {
    warnings.push('unassigned_known_target_presence');
  }
  warnings.push('no_project_link');
  return { type: 'unlinked_work_address', warnings, confidence: 'low' };
}

// ── Main ─────────────────────────────────────────────────────────────────

export function buildWorkdayAllocationFromLocationTruth(
  input: BuildWorkdayAllocationInput,
): WorkdayAllocationResult {
  const startedAt = Date.now();
  const ltSegments = input.locationTruthV2?.segments ?? [];

  // ── Lager 3.2 — resolva workday envelope ────────────────────────────
  // Om callern skickade en färdig envelope använder vi den. Annars resolvar
  // vi från activeWorkday (bakåtkompatibelt). Skriver INGENTING.
  const envelope: WorkdayEnvelope = input.workdayEnvelope ?? resolveWorkdayEnvelope({
    activeWorkday: input.activeWorkday ?? null,
    analysisWindowEndIso: input.analysisWindowEndIso
      ?? (input.locationTruthV2?.diagnostics.date
        ? `${input.locationTruthV2.diagnostics.date}T23:59:59.999Z`
        : null),
    analysisWindowStartIso: input.analysisWindowStartIso
      ?? (input.locationTruthV2?.diagnostics.date
        ? `${input.locationTruthV2.diagnostics.date}T00:00:00.000Z`
        : null),
    nowIso: input.nowIso ?? null,
  });

  const wd = input.activeWorkday ?? null;

  // ── Time Engine 3 — same-day evidence check ─────────────────────────────
  // En öppen/stale timer utan same-day evidence får INTE skapa en synlig
  // workday-envelope (annars renderas hela dagen som "Glapp i dagen").
  const dayEv: any = input.dayEvidence ?? null;
  const gpsPingCount =
    (dayEv?.gps?.locationLogicPingCount as number | undefined) ??
    (dayEv?.diagnostics?.gps?.locationLogicPingCount as number | undefined) ??
    (dayEv?.diagnostics?.counts?.pings as number | undefined) ??
    0;
  const ltSegmentCount = ltSegments.length;
  const assignmentItemCount = (dayEv?.assignments?.items?.length as number | undefined) ?? 0;
  const hasSameDayEvidence =
    gpsPingCount > 0 || ltSegmentCount > 0 || assignmentItemCount > 0;

  // Hitta tidigaste same-day evidence-tidpunkt för att kunna trimma stale start.
  const firstEvidenceMs: number | null = (() => {
    const candidates: number[] = [];
    const firstPing = toMs(dayEv?.gps?.firstPingAt ?? dayEv?.gps?.firstRecordedAt ?? null);
    if (firstPing !== null) candidates.push(firstPing);
    const firstLt = ltSegments.length > 0
      ? Math.min(...ltSegments.map((s) => toMs(s.startAt) ?? Infinity).filter((n) => Number.isFinite(n)))
      : null;
    if (firstLt !== null && Number.isFinite(firstLt)) candidates.push(firstLt as number);
    return candidates.length > 0 ? Math.min(...candidates) : null;
  })();

  // Effektiv start — kan justeras nedåt om stale open timer + evidence finns.
  let effectiveStartMs = toMs(envelope.startAt);
  let workdayStartAdjusted = false;
  let suppressForOpenTimerNoEvidence = false;

  if (envelope.isOpen && !hasSameDayEvidence) {
    // Inget bevis för dagen → ingen renderbar workday.
    suppressForOpenTimerNoEvidence = true;
    effectiveStartMs = null;
  } else if (
    envelope.isOpen &&
    hasSameDayEvidence &&
    envelope.startWasClippedToDay &&
    firstEvidenceMs !== null &&
    effectiveStartMs !== null &&
    firstEvidenceMs > effectiveStartMs
  ) {
    // Stale open timer (startade före dagen) men dagen HAR evidence →
    // använd första same-day evidence som effektiv start. Aldrig 00:00.
    effectiveStartMs = firstEvidenceMs;
    workdayStartAdjusted = true;
  }

  const wdStartMs = effectiveStartMs;
  const effectiveStartIso = effectiveStartMs !== null
    ? new Date(effectiveStartMs).toISOString()
    : null;

  const segments: WorkdayAllocationSegment[] = [];
  const proposals: WorkdayAllocationProposal[] = [];
  const diag: WorkdayAllocationDiagnostics = {
    staffId: wd?.staffId ?? input.locationTruthV2?.diagnostics.staffId ?? null,
    date: wd?.date ?? input.locationTruthV2?.diagnostics.date ?? null,
    builtAtIso: new Date().toISOString(),
    buildDurationMs: 0,
    hasActiveWorkday: !!wdStartMs && !suppressForOpenTimerNoEvidence,
    workdayStartAt: suppressForOpenTimerNoEvidence ? null : (effectiveStartIso ?? envelope.startAt),
    workdayEndAt: suppressForOpenTimerNoEvidence
      ? null
      : (envelope.isOpen ? null : envelope.endAt),
    workdayDurationMinutes: 0,
    inputSegmentCount: ltSegments.length,
    segmentsInsideWorkday: 0,
    segmentsOutsideWorkday: 0,
    segmentsPartiallyClipped: 0,
    allocationCounts: emptyAllocCounts(),
    warningsByType: emptyWarningCounts(),
    warnings: [...envelope.warnings],
    uncoveredWorkdayMinutes: 0,
    workdayEnvelopeFound: !!wdStartMs && !suppressForOpenTimerNoEvidence,
    openWorkday: envelope.isOpen,
    workdayStartSource: envelope.startSource,
    workdayEndSource: envelope.endSource,
    envelopeWarnings: [...envelope.warnings],
    workdayEnvelope: {
      timerStartedAt: envelope.timerStartedAt ?? null,
      timerStoppedAt: envelope.timerStoppedAt ?? null,
      timerIsOpen: envelope.isOpen,
      effectiveWorkdayStartAt: suppressForOpenTimerNoEvidence
        ? null
        : (effectiveStartIso ?? envelope.effectiveWorkdayStartAt ?? envelope.startAt ?? null),
      effectiveWorkdayEndAt: suppressForOpenTimerNoEvidence
        ? null
        : (envelope.effectiveWorkdayEndAt ?? envelope.endAt ?? null),
      analysisDayStartAt: envelope.analysisDayStartAt ?? null,
      analysisDayEndAt: envelope.analysisDayEndAt ?? null,
      startWasClippedToDay: envelope.startWasClippedToDay ?? false,
      endWasClippedToDay: envelope.endWasClippedToDay ?? false,
      endWasClippedToNow: envelope.endWasClippedToNow ?? false,
      warnings: [...envelope.warnings],
    },
    segmentsInsideEnvelope: 0,
    segmentsOutsideEnvelope: 0,
    projectWorkCount: 0,
    largeProjectWorkCount: 0,
    bookingWorkCount: 0,
    warehouseWorkCount: 0,
    supplierVisitCount: 0,
    unlinkedWorkAddressCount: 0,
    unassignedButPresentCount: 0,
    planningMismatchCount: 0,
    workTravelCount: 0,
    commuteTravelCount: 0,
    longTravelOver150kmCount: 0,
    movementReviewCount: 0,
    supplierVisits: 0,
    supplierVisitsLinkedToProjectCandidate: 0,
    supplierVisitsWithoutProjectContext: 0,
    homeSegmentsAfterWork: 0,
    homeOver90MinutesCount: 0,
    suggestedWorkdayEndCount: 0,
    temporaryHomePresenceCount: 0,
    uncoveredGapCount: 0,
    uncoveredGapMinutesTotal: 0,
    shortUncoveredGapsIgnoredCount: 0,
    uncoveredGapsProposedCount: 0,
    examples: [],
    // Time Engine Core Fix 2 — initial counters.
    businessContextFromAssignmentCount: 0,
    targetMissingGeoCount: 0,
    competingTargetsCount: 0,
    stableAddressNoTargetCount: 0,
    businessContextFallbackCounts: {
      none: 0,
      assignment_without_geo: 0,
      stable_address_no_target: 0,
      unknown_location: 0,
    },
  };

  // ── Time Engine Core Fix 1 — HÅRD GUARD: raw GPS finns men LT V2 saknas ──
  // Om dagen har faktiska raw GPS-pings men 0 LocationTruth-segment har byggts
  // får vi INTE skapa allocation/private/unlinked/uncovered-segment. Hela kedjan
  // måste stoppas så att display/Gantt inte ritar falska heldags-block.
  // LocationTruth är obligatorisk mellan raw GPS och WorkdayAllocation.
  const rawPingCount: number =
    (dayEv?.gps?.rawPingCount as number | undefined) ??
    (dayEv?.diagnostics?.gps?.rawPingCount as number | undefined) ??
    0;
  diag.rawPingCount = rawPingCount;
  diag.locationTruthV2SegmentCount = ltSegmentCount;
  if (rawPingCount > 0 && ltSegmentCount === 0) {
    diag.hasRawPingsButNoLocationTruth = true;
    diag.engineBlockedBecauseLocationTruthMissing = true;
    diag.hasActiveWorkday = false;
    diag.workdayEnvelopeFound = false;
    diag.workdayStartAt = null;
    diag.workdayEndAt = null;
    diag.workdayDurationMinutes = 0;
    diag.uncoveredWorkdayMinutes = 0;
    diag.workdayEnvelope.effectiveWorkdayStartAt = null;
    diag.workdayEnvelope.effectiveWorkdayEndAt = null;
    if (!diag.warnings.includes('raw_pings_exist_but_location_truth_missing')) {
      diag.warnings.push('raw_pings_exist_but_location_truth_missing');
    }
    diag.warningsByType.raw_pings_exist_but_location_truth_missing += 1;
    diag.buildDurationMs = Date.now() - startedAt;
    return { segments, proposals, diagnostics: diag };
  }

  // Time Engine 3 — suppress workday helt om open timer + ingen evidence.
  if (suppressForOpenTimerNoEvidence) {
    diag.warnings.push('no_active_workday');
    diag.warningsByType.no_active_workday += 1;
    if (!diag.warnings.includes('open_timer_without_same_day_evidence')) {
      diag.warnings.push('open_timer_without_same_day_evidence');
    }
    diag.warningsByType.open_timer_without_same_day_evidence += 1;
    diag.buildDurationMs = Date.now() - startedAt;
    return { segments, proposals, diagnostics: diag };
  }

  if (!wdStartMs) {
    diag.warnings.push('no_active_workday');
    diag.warningsByType.no_active_workday += 1;
    diag.buildDurationMs = Date.now() - startedAt;
    return { segments, proposals, diagnostics: diag };
  }

  if (workdayStartAdjusted) {
    diag.warnings.push('workday_start_adjusted_to_first_evidence');
    diag.warningsByType.workday_start_adjusted_to_first_evidence += 1;
  }

  // Använd envelope-end (täcker både stängd och öppen dagtimer).
  // Men klippt mot ev. justerad start så vi aldrig genererar negativ duration.
  const envelopeEndMs = toMs(envelope.endAt) ?? Date.now();
  let wdEnd = Math.max(envelopeEndMs, wdStartMs);

  // ── Time Engine STOP 1 / STOP 1.1 — clampa wdEnd om non-work efter sista jobb > 90m ──
  // Pure helper, läser bara LocationTruth-segment. Skriver INGENTING.
  // STOP 1.1: clampen appliceras FÖRE allocation-loopen så att segment efter
  // inferred end aldrig blir insideWorkday eller skapar synliga display-block.
  // Layer 3.6:s home/private-proposals täcks i STOP 1.1 av STOP1:s egna
  // suggest_workday_end-proposal (Layer 3.6 ser inte segmenten längre).
  const stopDecision = resolveEffectiveWorkdayEndFromEvidence({
    ltSegments,
    workdayStartMs: wdStartMs,
    envelopeEndMs: wdEnd,
    envelopeIsOpen: envelope.isOpen,
    thresholdMinutes: 90,
  });

  const stopClampEndMs: number | null =
    stopDecision.shouldClamp && stopDecision.effectiveWorkdayEndMs !== null
      ? Math.max(stopDecision.effectiveWorkdayEndMs, wdStartMs)
      : null;

  if (stopDecision.shouldClamp && stopClampEndMs !== null) {
    // ── STOP 1.1: applicera clamp DIREKT (före allocation-loopen) ──
    wdEnd = stopClampEndMs;
    const newEndIso = new Date(stopClampEndMs).toISOString();
    diag.workdayEndAt = newEndIso;
    diag.workdayEnvelope.effectiveWorkdayEndAt = newEndIso;
    diag.workdayEnvelope.endWasInferredFromNonWorkPresence = true;
    diag.workdayEnvelope.openTimerIgnoredAfterEnd = stopDecision.shouldClampOpenTimer;
    diag.workdayEnvelope.nonWorkAfterLastWorkMinutes = stopDecision.nonWorkDurationMinutes;
    diag.workdayEnvelope.clampedBeforeAllocation = true;
    diag.workdayEnvelope.segmentsIgnoredAfterInferredDayEnd = 0;
    diag.workdayEnvelope.minutesIgnoredAfterInferredDayEnd = 0;
    diag.dayEndDecision = {
      dayEnded: true,
      endedAt: newEndIso,
      endReason: stopDecision.endReason as DayEndStopReason,
      confidence: stopDecision.confidence,
      evidence: stopDecision.evidence,
    };
    if (!diag.warnings.includes('day_end_inferred_from_non_work_presence')) {
      diag.warnings.push('day_end_inferred_from_non_work_presence');
    }
    diag.warningsByType.day_end_inferred_from_non_work_presence += 1;
    if (stopDecision.shouldClampOpenTimer) {
      if (!diag.warnings.includes('open_timer_ignored_after_inferred_day_end')) {
        diag.warnings.push('open_timer_ignored_after_inferred_day_end');
      }
      diag.warningsByType.open_timer_ignored_after_inferred_day_end += 1;
    }
    // STOP 1.1: Layer 3.6 ser inte längre home-segmenten (de blir outsideWorkday).
    // Därför äger STOP1 nu ALLTID suggest_workday_end-proposalen — annars tappas
    // den helt för private/home-fallen.
    proposals.push({
      segmentId: `inferred-day-end-${newEndIso}`,
      proposalType: 'suggest_workday_end',
      proposedAllocationType: 'private_time',
      targetType: null,
      targetId: null,
      label: 'Arbetsdagen verkar ha slutat',
      startAt: newEndIso,
      endAt: newEndIso,
      suggestedEndAt: newEndIso,
      confidence: stopDecision.confidence === 'low' ? 'medium' : stopDecision.confidence,
      reason: stopDecision.endReason ?? 'non_work_location_after_last_work_over_90m',
    });
    diag.suggestedWorkdayEndCount += 1;
  } else {
    diag.dayEndDecision = null;
    diag.workdayEnvelope.endWasInferredFromNonWorkPresence = false;
    diag.workdayEnvelope.openTimerIgnoredAfterEnd = false;
    diag.workdayEnvelope.nonWorkAfterLastWorkMinutes = stopDecision.nonWorkDurationMinutes;
    diag.workdayEnvelope.clampedBeforeAllocation = false;
  }

  diag.workdayDurationMinutes = Math.max(0, Math.round((wdEnd - wdStartMs) / 60_000));

  // Track coverage för uncoveredWorkdayMinutes.
  const coveredIntervals: Array<[number, number]> = [];

  // ── Lager 3.4 — pre-pass: bygg MovementContext per movement-segment ──
  // Vi använder movementMeta från Lager 2.5 (fromTarget/toTarget/distanceMeters).
  // Faller tillbaka till föregående/efterföljande segment när meta saknas.
  const sortedLt = [...ltSegments].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
  const movementCtxById = new Map<string, MovementContext>();
  // Hitta första hem→arbete och sista arbete→hem.
  let firstCommuteWorkboundIdx = -1;
  let lastCommuteHomeboundIdx = -1;
  const tentative: Array<{ idx: number; ctx: MovementContext; id: string }> = [];

  for (let i = 0; i < sortedLt.length; i++) {
    const seg = sortedLt[i];
    if (seg.finalType !== 'movement') continue;
    // movementMeta från detectTrueMovement.
    const meta = (seg.diagnostics as { movementMeta?: {
      fromTarget?: LocationTruthMatchedTargetLike;
      toTarget?: LocationTruthMatchedTargetLike;
      distanceMeters?: number;
    } }).movementMeta;

    let fromT: LocationTruthMatchedTargetLike | null = meta?.fromTarget ?? null;
    let toT: LocationTruthMatchedTargetLike | null = meta?.toTarget ?? null;

    // Fallback: läs grannsegmentens matchedTarget/finalType.
    if (!fromT) {
      for (let k = i - 1; k >= 0; k--) {
        const p = sortedLt[k];
        if (p.finalType === 'movement') continue;
        const mt = p.businessContext?.matchedTarget ?? p.matchedTarget;
        if (mt) { fromT = mt; break; }
        if (p.finalType === 'private_residence') { fromT = { targetType: 'private_zone' }; break; }
        break;
      }
    }
    if (!toT) {
      for (let k = i + 1; k < sortedLt.length; k++) {
        const n = sortedLt[k];
        if (n.finalType === 'movement') continue;
        const mt = n.businessContext?.matchedTarget ?? n.matchedTarget;
        if (mt) { toT = mt; break; }
        if (n.finalType === 'private_residence') { toT = { targetType: 'private_zone' }; break; }
        break;
      }
    }

    const ctx: MovementContext = {
      fromSide: classifyMovementSide(fromT),
      toSide: classifyMovementSide(toT),
      distanceMeters: typeof meta?.distanceMeters === 'number' ? meta!.distanceMeters! : null,
      isFirstWorkboundCommuteOfDay: false,
      isLastHomeboundCommuteOfDay: false,
    };
    movementCtxById.set(seg.id, ctx);
    tentative.push({ idx: i, ctx, id: seg.id });

    if (ctx.fromSide === 'home_or_private' && isWorkSide(ctx.toSide) && firstCommuteWorkboundIdx === -1) {
      firstCommuteWorkboundIdx = i;
    }
    if (isWorkSide(ctx.fromSide) && ctx.toSide === 'home_or_private') {
      lastCommuteHomeboundIdx = i; // overskrivs → blir sista
    }
  }
  for (const t of tentative) {
    if (t.idx === firstCommuteWorkboundIdx) t.ctx.isFirstWorkboundCommuteOfDay = true;
    if (t.idx === lastCommuteHomeboundIdx) t.ctx.isLastHomeboundCommuteOfDay = true;
  }

  // ── Time Engine Core Fix 2 — overlap-helper + knownTargets för business context ──
  const allAssignments: AssignmentEvidenceItem[] =
    (input.dayEvidence?.assignments?.items as AssignmentEvidenceItem[] | undefined) ?? [];
  const allKnownTargets: KnownTargetEvidenceItem[] =
    (input.dayEvidence?.knownTargets?.items as KnownTargetEvidenceItem[] | undefined) ?? [];

  function getOverlappingAssignmentsForInterval(
    startMs: number,
    endMs: number,
  ): AssignmentEvidenceItem[] {
    const out: AssignmentEvidenceItem[] = [];
    for (const a of allAssignments) {
      const aS = toMs(a.startAt ?? null);
      const aE = toMs(a.endAt ?? null);
      if (aS === null || aE === null) continue;
      if (aS < endMs && aE > startMs) out.push(a);
    }
    return out;
  }

  function resolveSegBusinessContext(
    seg: LocationTruthSegment,
  ): BusinessContextResolution | null {
    if (seg.finalType === 'movement' || seg.finalType === 'private_residence') {
      return null;
    }
    const sMs = toMs(seg.startAt);
    const eMs = toMs(seg.endAt);
    if (sMs === null || eMs === null) return null;
    const overlap = getOverlappingAssignmentsForInterval(sMs, eMs);
    const physicallyStable =
      seg.finalType === 'known_site' || seg.finalType === 'known_address';
    return resolveBusinessContextForAllocation({
      seg,
      overlappingAssignments: overlap,
      knownTargets: allKnownTargets,
      physicallyStable,
    });
  }

  /**
   * Time Engine Core Fix 2.1 — välj effektiv target.
   * businessContextResolution vinner över råa matchedTarget för
   * project/booking/large_project/warehouse/supplier/organization_location.
   * 'unlinked_address'/'unknown' faller tillbaka på matchedTarget eller fysisk plats.
   */
  function pickEffectiveTarget(
    bcr: BusinessContextResolution | null | undefined,
    matched: { targetType?: LocationTruthTargetType | null; targetId?: string | null; label?: string | null; address?: string | null } | null | undefined,
    seg: LocationTruthSegment,
  ): {
    targetType: LocationTruthTargetType | null;
    targetId: string | null;
    label: string | null;
    address: string | null;
  } {
    const bcrTypeUsable =
      !!bcr &&
      bcr.selectedTargetType !== null &&
      bcr.selectedTargetType !== 'unlinked_address' &&
      bcr.selectedTargetType !== 'unknown';
    const targetType: LocationTruthTargetType | null = bcrTypeUsable
      ? (bcr!.selectedTargetType as LocationTruthTargetType)
      : (matched?.targetType ?? null);
    const targetId: string | null = bcrTypeUsable
      ? (bcr!.selectedTargetId ?? matched?.targetId ?? null)
      : (matched?.targetId ?? null);
    const label: string | null = bcrTypeUsable
      ? (bcr!.selectedTargetLabel ?? matched?.label ?? seg.physicalLocation?.label ?? null)
      : (matched?.label ?? seg.physicalLocation?.label ?? null);
    const address: string | null =
      matched?.address ?? seg.physicalLocation?.address ?? null;
    return { targetType, targetId, label, address };
  }

  for (const seg of ltSegments) {
    const sMs = toMs(seg.startAt);
    const eMs = toMs(seg.endAt);
    if (sMs === null || eMs === null || eMs <= sMs) continue;

    const overlapsWorkday = sMs < wdEnd && eMs > wdStartMs;
    if (!overlapsWorkday) {
      diag.segmentsOutsideWorkday += 1;
      diag.segmentsOutsideEnvelope += 1;
      // STOP 1.1 — räkna segment som ignorerats pga inferred day end (ligger
      // efter clampad wdEnd men skulle annars ha varit innanför envelope).
      if (stopClampEndMs !== null && sMs >= stopClampEndMs) {
        diag.workdayEnvelope.segmentsIgnoredAfterInferredDayEnd =
          (diag.workdayEnvelope.segmentsIgnoredAfterInferredDayEnd ?? 0) + 1;
        diag.workdayEnvelope.minutesIgnoredAfterInferredDayEnd =
          (diag.workdayEnvelope.minutesIgnoredAfterInferredDayEnd ?? 0) +
          Math.max(0, Math.round((eMs - sMs) / 60_000));
      }
      // Vi tar fortfarande med segmentet i debug-output men markerar det.
      const bcrOutside = resolveSegBusinessContext(seg);
      const allocOutside = deriveAllocation(
        seg,
        !!seg.evidence.assignmentSupportsTarget,
        seg.finalType === 'movement' ? movementCtxById.get(seg.id) ?? null : null,
        bcrOutside,
      );
      const matchedOutside = seg.businessContext?.matchedTarget ?? seg.matchedTarget;
      const effOutside = pickEffectiveTarget(bcrOutside, matchedOutside, seg);
      const item: WorkdayAllocationSegment = {
        id: `wda_${seg.id}`,
        startAt: seg.startAt,
        endAt: seg.endAt,
        sourceLocationTruthSegmentIds: [seg.id],
        allocationType: allocOutside.type,
        targetType: effOutside.targetType,
        targetId: effOutside.targetId,
        label: effOutside.label,
        address: effOutside.address,
        confidence: allocOutside.confidence,
        warnings: ['segment_outside_workday'],
        assignmentStatus: 'unknown',
        assignmentMatch: 'unknown',
        businessContextStatus: seg.businessContext?.status ?? null,
        rawSegmentStartAt: seg.startAt,
        rawSegmentEndAt: seg.endAt,
        outsideWorkday: true,
        businessContextResolution: bcrOutside ?? null,
        physicalLocationLabel: seg.physicalLocation?.label ?? null,
        physicalLocationAddress: seg.physicalLocation?.address ?? null,
        physicalLocationLat: seg.physicalLocation?.lat ?? null,
        physicalLocationLng: seg.physicalLocation?.lng ?? null,
        physicalLocationSource: seg.physicalLocation?.source ?? null,
        physicalLocationConfidence: seg.physicalLocation?.confidence ?? null,
        locationMatchDiagnostics: (seg.diagnostics as any)?.match ?? null,
      };
      segments.push(item);
      diag.warningsByType.segment_outside_workday += 1;
      continue;
    }

    const clippedStartMs = Math.max(sMs, wdStartMs);
    const clippedEndMs = Math.min(eMs, wdEnd);
    const clipped = clippedStartMs !== sMs || clippedEndMs !== eMs;
    if (clipped) diag.segmentsPartiallyClipped += 1;
    diag.segmentsInsideWorkday += 1;
    diag.segmentsInsideEnvelope += 1;

    const hasOverlap = !!seg.evidence.assignmentSupportsTarget;
    const movementCtx = seg.finalType === 'movement'
      ? movementCtxById.get(seg.id) ?? null
      : null;
    const bcr = resolveSegBusinessContext(seg);
    const alloc = deriveAllocation(seg, hasOverlap, movementCtx, bcr);

    // private_residence INNE i workday → fortfarande private_time, men kan
    // föreslås som workday-slut. Vi flaggar warning.
    if (seg.finalType === 'private_residence') {
      proposals.push({
        segmentId: seg.id,
        // Lager 3.10 — fix 1: proposalType saknades och loggades som undefined.
        proposalType: 'consider_workday_end_from_private',
        proposedAllocationType: 'private_time',
        targetType: 'private_zone',
        targetId: (seg.businessContext?.matchedTarget ?? seg.matchedTarget)?.targetId ?? null,
        label: (seg.businessContext?.matchedTarget ?? seg.matchedTarget)?.label
          ?? seg.physicalLocation?.label ?? 'Hem',
        startAt: new Date(clippedStartMs).toISOString(),
        endAt: new Date(clippedEndMs).toISOString(),
        confidence: 'medium',
        reason: 'private_residence_inside_active_workday_consider_workday_end',
      });
    }

    if (alloc.confidence === 'low' && !alloc.warnings.includes('allocation_low_confidence')) {
      alloc.warnings.push('allocation_low_confidence');
    }

    const matched = seg.businessContext?.matchedTarget ?? seg.matchedTarget;
    // Time Engine Core Fix 2.1 — använd businessContextResolution som faktisk target.
    const eff = pickEffectiveTarget(bcr, matched, seg);
    // Lager 3.11B + Core Fix 2.1 — assignmentStatus mot effektiv target.
    const effIsNoAssignmentRequired = !!eff.targetType && (
      eff.targetType === 'supplier' ||
      eff.targetType === 'warehouse' ||
      eff.targetType === 'organization_location'
    );
    const effIsAssignableWork = !!eff.targetType && (
      eff.targetType === 'project' ||
      eff.targetType === 'booking' ||
      eff.targetType === 'large_project'
    );
    let assignmentStatus: WorkdayAllocationAssignmentStatus;
    let assignmentMatch: WorkdayAllocationAssignmentMatch;
    if (effIsNoAssignmentRequired) {
      assignmentStatus = 'no_assignment_required';
      assignmentMatch = 'not_required';
    } else if (effIsAssignableWork && (hasOverlap || bcr?.fallbackUsed === 'assignment_without_geo')) {
      assignmentStatus = 'assigned';
      assignmentMatch = hasOverlap ? 'overlap' : 'no_overlap';
    } else if (effIsAssignableWork) {
      assignmentStatus = 'unassigned_but_present';
      assignmentMatch = 'no_overlap';
    } else {
      assignmentStatus = 'unknown';
      assignmentMatch = 'missing';
    }

    const item: WorkdayAllocationSegment = {
      id: `wda_${seg.id}`,
      startAt: new Date(clippedStartMs).toISOString(),
      endAt: new Date(clippedEndMs).toISOString(),
      sourceLocationTruthSegmentIds: [seg.id],
      allocationType: alloc.type,
      targetType: eff.targetType,
      targetId: eff.targetId,
      label: eff.label,
      address: eff.address,
      confidence: alloc.confidence,
      warnings: alloc.warnings,
      assignmentStatus,
      assignmentMatch,
      businessContextStatus: seg.businessContext?.status ?? null,
      rawSegmentStartAt: seg.startAt,
      rawSegmentEndAt: seg.endAt,
      outsideWorkday: false,
      businessContextResolution: bcr ?? null,
      physicalLocationLabel: seg.physicalLocation?.label ?? null,
      physicalLocationAddress: seg.physicalLocation?.address ?? null,
      physicalLocationLat: seg.physicalLocation?.lat ?? null,
      physicalLocationLng: seg.physicalLocation?.lng ?? null,
      physicalLocationSource: seg.physicalLocation?.source ?? null,
      physicalLocationConfidence: seg.physicalLocation?.confidence ?? null,
      locationMatchDiagnostics: (seg.diagnostics as any)?.match ?? null,
    };
    // Time Engine Core Fix 2 — counter-uppdatering.
    if (bcr) {
      if (diag.businessContextFallbackCounts) {
        diag.businessContextFallbackCounts[bcr.fallbackUsed] =
          (diag.businessContextFallbackCounts[bcr.fallbackUsed] ?? 0) + 1;
      }
      if (bcr.fallbackUsed === 'assignment_without_geo') {
        diag.businessContextFromAssignmentCount =
          (diag.businessContextFromAssignmentCount ?? 0) + 1;
      }
      if (bcr.fallbackUsed === 'stable_address_no_target') {
        diag.stableAddressNoTargetCount =
          (diag.stableAddressNoTargetCount ?? 0) + 1;
      }
      if (bcr.extraWarnings.includes('target_missing_geo')) {
        diag.targetMissingGeoCount = (diag.targetMissingGeoCount ?? 0) + 1;
      }
      if (bcr.competingTargets) {
        diag.competingTargetsCount = (diag.competingTargetsCount ?? 0) + 1;
      }
    }
    if (clipped) item.warnings.push('segment_partially_outside_workday');

    segments.push(item);
    diag.allocationCounts[alloc.type] += 1;
    for (const w of item.warnings) {
      if (w in diag.warningsByType) diag.warningsByType[w] += 1;
    }

    // Lager 3.3 — spegla per-targetType count
    switch (alloc.type) {
      case 'project_work': diag.projectWorkCount += 1; break;
      case 'large_project_work': diag.largeProjectWorkCount += 1; break;
      case 'booking_work': diag.bookingWorkCount += 1; break;
      case 'warehouse_work': diag.warehouseWorkCount += 1; break;
      case 'supplier_visit': diag.supplierVisitCount += 1; break;
      case 'unlinked_work_address': diag.unlinkedWorkAddressCount += 1; break;
      // Lager 3.4 — movement-räknare
      case 'work_travel': diag.workTravelCount += 1; break;
      case 'commute_travel': diag.commuteTravelCount += 1; break;
      case 'needs_work_allocation_review':
        if (seg.finalType === 'movement') diag.movementReviewCount += 1;
        break;
    }
    if (assignmentStatus === 'unassigned_but_present') diag.unassignedButPresentCount += 1;
    if (item.warnings.includes('planning_geo_mismatch')) diag.planningMismatchCount += 1;
    if (item.warnings.includes('long_travel_over_150km')) {
      diag.longTravelOver150kmCount += 1;
      // Lager 3.4 — read-only proposal: paid_travel_possible. Skriver inget.
      proposals.push({
        segmentId: seg.id,
        proposedAllocationType: alloc.type,
        targetType: matched?.targetType ?? null,
        targetId: matched?.targetId ?? null,
        label: matched?.label ?? seg.physicalLocation?.label ?? null,
        startAt: new Date(clippedStartMs).toISOString(),
        endAt: new Date(clippedEndMs).toISOString(),
        confidence: 'medium',
        reason: 'paid_travel_possible:long_travel_over_150km',
      });
    }

    coveredIntervals.push([clippedStartMs, clippedEndMs]);

    if (diag.examples.length < 8) {
      diag.examples.push({
        id: item.id,
        allocationType: item.allocationType,
        label: item.label,
        startAt: item.startAt,
        endAt: item.endAt,
        confidence: item.confidence,
        warnings: item.warnings,
      });
    }
  }

  // ── Lager 3.5 — Supplier project candidate (deterministisk) ─────────
  // För varje supplier_visit: försök hitta en rimlig projekt-/booking-
  // /large_project-kandidat via (a) överlappande assignment, (b) projekt
  // före, (c) projekt efter, plus mönster warehouse→supplier→project,
  // project→supplier→project, project→supplier→warehouse.
  // Skriver ALDRIG någonstans — bara segment.linkedProjectCandidate +
  // proposal supplier_visit_linked_to_project_candidate.
  const assignmentItems = input.dayEvidence?.assignments?.items ?? [];
  const innerSegments = segments.filter((s) => !s.outsideWorkday);

  for (let i = 0; i < innerSegments.length; i++) {
    const sup = innerSegments[i];
    if (sup.allocationType !== 'supplier_visit') continue;
    diag.supplierVisits += 1;

    const supStartMs = Date.parse(sup.startAt);
    const supEndMs = Date.parse(sup.endAt);
    const prevWork = findNeighborWork(innerSegments, i, -1);
    const nextWork = findNeighborWork(innerSegments, i, +1);

    let candidate: SupplierProjectCandidate | null =
      pickAssignmentCandidate(assignmentItems, supStartMs, supEndMs);

    if (!candidate && prevWork && nextWork) {
      if (isProjectLike(prevWork) && isProjectLike(nextWork) && sameTarget(prevWork, nextWork)) {
        candidate = toCandidate(prevWork, 'pattern_project_supplier_project', 'high');
      } else if (isWarehouseLike(prevWork) && isProjectLike(nextWork)) {
        candidate = toCandidate(nextWork, 'pattern_warehouse_supplier_project', 'high');
      } else if (isProjectLike(prevWork) && isWarehouseLike(nextWork)) {
        candidate = toCandidate(prevWork, 'pattern_project_supplier_warehouse', 'medium');
      }
    }
    if (!candidate && prevWork && isProjectLike(prevWork)) {
      candidate = toCandidate(prevWork, 'project_before', 'medium');
    }
    if (!candidate && nextWork && isProjectLike(nextWork)) {
      candidate = toCandidate(nextWork, 'project_after', 'medium');
    }

    if (candidate) {
      sup.linkedProjectCandidate = candidate;
      if (sup.confidence === 'low') sup.confidence = 'medium';
      diag.supplierVisitsLinkedToProjectCandidate += 1;
      // Lager 3.10B — explicit reason-mapping från candidate.source.
      const linkReason: SupplierLinkProposalReason =
        candidate.source === 'overlapping_assignment'
          ? 'supplier_near_overlapping_assignment'
          : candidate.source === 'pattern_warehouse_supplier_project'
            ? 'supplier_between_warehouse_and_project'
            : candidate.source === 'pattern_project_supplier_project'
              ? 'supplier_between_project_and_project'
              : 'supplier_visit_linked_to_project_candidate';
      proposals.push({
        segmentId: sup.sourceLocationTruthSegmentIds[0] ?? sup.id,
        proposalType: 'link_supplier_to_project_candidate',
        proposedAllocationType: 'supplier_visit',
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        label: candidate.label,
        startAt: sup.startAt,
        endAt: sup.endAt,
        confidence: candidate.confidence,
        reason: linkReason,
        sourceSegmentIds:
          sup.sourceLocationTruthSegmentIds.length > 0
            ? [...sup.sourceLocationTruthSegmentIds]
            : [sup.id],
        supplierTargetId: sup.targetId,
        supplierLabel: sup.label,
        candidateTargetType: candidate.targetType,
        candidateTargetId: candidate.targetId,
        candidateLabel: candidate.label,
        // Read-only Lager 3 — alla supplier-länkar måste granskas av människa
        // innan de skrivs till time_reports / display_blocks.
        requiresHumanApproval: true,
      });
    } else {
      sup.linkedProjectCandidate = null;
      if (!sup.warnings.includes('supplier_visit_without_project_context')) {
        sup.warnings.push('supplier_visit_without_project_context');
        diag.warningsByType.supplier_visit_without_project_context += 1;
      }
      diag.supplierVisitsWithoutProjectContext += 1;
    }
  }

  // ── Lager 3.6 — Hem/private som stop-förslag (read-only) ────────────
  // Identifiera private_time-segment som ligger efter sista arbetsrelaterade
  // platsen. Om personen är hemma > 90 min utan att återgå → proposal
  // suggest_workday_end. Om personen återgår inom 90 min → temporary
  // home presence (ingen stop-proposal).
  // Skriver INGENTING — varken active_time_registrations, timer eller
  // workday-stopp ändras. Bara proposals + warnings + diagnostik.
  const HOME_THRESHOLD_MS = 90 * 60_000;
  const sortedInner = [...innerSegments].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
  const isWorkLocation = (s: WorkdayAllocationSegment): boolean =>
    s.allocationType === 'project_work' ||
    s.allocationType === 'large_project_work' ||
    s.allocationType === 'booking_work' ||
    s.allocationType === 'warehouse_work' ||
    s.allocationType === 'supplier_visit' ||
    s.allocationType === 'unlinked_work_address';

  // Hitta sista arbetsplatsen i kronologisk ordning.
  let lastWorkIdx = -1;
  let lastWorkEndAt: string | null = null;
  for (let i = sortedInner.length - 1; i >= 0; i--) {
    if (isWorkLocation(sortedInner[i])) {
      lastWorkIdx = i;
      lastWorkEndAt = sortedInner[i].endAt;
      break;
    }
  }

  if (lastWorkIdx >= 0) {
    for (let i = lastWorkIdx + 1; i < sortedInner.length; i++) {
      const seg = sortedInner[i];
      if (seg.allocationType !== 'private_time') continue;

      // Markera home_after_last_work_location.
      if (!seg.warnings.includes('home_after_last_work_location')) {
        seg.warnings.push('home_after_last_work_location');
        diag.warningsByType.home_after_last_work_location += 1;
      }
      diag.homeSegmentsAfterWork += 1;

      const arrivalMs = Date.parse(seg.startAt);
      const segEndMs = Date.parse(seg.endAt);

      // Återvänder personen till en arbetsplats inom 90 min från ankomst hem?
      let returnedToWorkWithin90 = false;
      for (let k = i + 1; k < sortedInner.length; k++) {
        const later = sortedInner[k];
        if (!isWorkLocation(later)) continue;
        const laterStartMs = Date.parse(later.startAt);
        if (laterStartMs - arrivalMs <= HOME_THRESHOLD_MS) {
          returnedToWorkWithin90 = true;
        }
        break;
      }

      if (returnedToWorkWithin90) {
        if (!seg.warnings.includes('temporary_home_presence')) {
          seg.warnings.push('temporary_home_presence');
          diag.warningsByType.temporary_home_presence += 1;
        }
        diag.temporaryHomePresenceCount += 1;
        continue; // inget stop-förslag
      }

      const homeDurationMs = Math.max(0, segEndMs - arrivalMs);
      if (homeDurationMs > HOME_THRESHOLD_MS) {
        diag.homeOver90MinutesCount += 1;
        // suggestedEndAt = arrivalAtHome (befintlig policy: tiden hemma räknas inte).
        // Fallback till lastWorkLocationEndAt om arrivalMs ligger orimligt sent.
        const suggestedEnd = seg.startAt ?? lastWorkEndAt ?? seg.startAt;
        proposals.push({
          segmentId: seg.sourceLocationTruthSegmentIds[0] ?? seg.id,
          proposalType: 'suggest_workday_end',
          proposedAllocationType: 'private_time',
          targetType: seg.targetType,
          targetId: seg.targetId,
          label: seg.label,
          startAt: seg.startAt,
          endAt: seg.endAt,
          suggestedEndAt: suggestedEnd,
          confidence: 'medium',
          reason: 'home_private_over_90_minutes_after_last_work_location',
        });
        diag.suggestedWorkdayEndCount += 1;
      }
    }
  }

  // ── Lager 3.10C — Uncovered workday time (mjuk policy) ──────────────────
  // Gap = signalfrånvaro, INTE bevis på fel. Lager 2 ska bridgea riktiga
  // signalgap. Vi markerar bara försiktigt:
  //   < 30 min            → endast diagnostics (shortUncoveredGapsIgnoredCount)
  //   30–120 min          → proposal severity 'low'
  //   > 120 min           → proposal severity 'medium'
  //   review-villkor      → severity 'high' + proposedAllocationType=
  //                         'needs_work_allocation_review'
  // Review kräver: långt gap (>120 min) OCH ingen LT-segment-täckning för dagen
  // OCH inga bridge-relaterade LT-warnings.
  // STOP 1.1: wdEnd är redan klampad ovan (före allocation-loopen). coveredIntervals
  // byggdes mot den klampade wdEnd, så de behöver inte filtreras igen här.
  const effectiveCovered = coveredIntervals.slice().sort((a, b) => a[0] - b[0]);
  let cursor = wdStartMs;
  let uncoveredMs = 0;
  const SHORT_GAP_MS = 30 * 60_000;
  const MEDIUM_GAP_MS = 120 * 60_000;

  // Review-förutsättningar (samma för alla gaps på samma dag).
  const ltAll = input.locationTruthV2?.segments ?? [];
  const hasAnyLtCoverageInWorkday = effectiveCovered.length > 0;
  const hasBridgeWarnings = ltAll.some((s: any) =>
    Array.isArray(s?.warnings) &&
    s.warnings.some((w: string) =>
      typeof w === 'string' && (w.includes('bridge') || w.includes('signal_gap')),
    ),
  );

  const emitGap = (s: number, e: number) => {
    const dur = e - s;
    if (dur <= 0) return;
    diag.uncoveredGapCount += 1;
    if (dur < SHORT_GAP_MS) {
      diag.shortUncoveredGapsIgnoredCount += 1;
      return; // endast diagnostics
    }
    const isLong = dur > MEDIUM_GAP_MS;
    const reviewCase = isLong && !hasAnyLtCoverageInWorkday && !hasBridgeWarnings;
    const severity: WorkdayAllocationProposalSeverity = reviewCase
      ? 'high'
      : isLong
        ? 'medium'
        : 'low';
    proposals.push({
      segmentId: `workday-gap-${new Date(s).toISOString()}`,
      proposalType: 'uncovered_workday_time',
      // Standard: INGEN review — bara markera som unlinked tidsfönster.
      // Endast review-fallet sätter needs_work_allocation_review.
      proposedAllocationType: reviewCase
        ? 'needs_work_allocation_review'
        : 'unlinked_work_address',
      targetType: null,
      targetId: null,
      label: null,
      startAt: new Date(s).toISOString(),
      endAt: new Date(e).toISOString(),
      confidence: reviewCase ? 'medium' : 'low',
      reason: 'uncovered_workday_time',
      severity,
      requiresHumanApproval: reviewCase,
    });
    diag.uncoveredGapsProposedCount += 1;
  };

  for (const [s, e] of effectiveCovered) {
    if (s > cursor) { uncoveredMs += s - cursor; emitGap(cursor, s); }
    if (e > cursor) cursor = e;
  }
  if (cursor < wdEnd) { uncoveredMs += wdEnd - cursor; emitGap(cursor, wdEnd); }

  diag.uncoveredWorkdayMinutes = Math.round(uncoveredMs / 60_000);
  diag.uncoveredGapMinutesTotal = diag.uncoveredWorkdayMinutes;
  // Mjuk varning — inte gap_in_workday review-warning. Bara om proposal skapats.
  if (diag.uncoveredGapsProposedCount > 0) {
    if (!diag.warnings.includes('workday_time_without_location_truth_segment')) {
      diag.warnings.push('workday_time_without_location_truth_segment');
    }
    diag.warningsByType.workday_time_without_location_truth_segment += 1;
  }

  diag.buildDurationMs = Date.now() - startedAt;
  return { segments, proposals, diagnostics: diag };
}

// ── Lager 3.5 — Supplier project candidate helpers ──────────────────────

const PROJECT_LIKE_TYPES = new Set<WorkdayAllocationType>([
  'project_work', 'large_project_work', 'booking_work',
]);
const WAREHOUSE_LIKE_TYPES = new Set<WorkdayAllocationType>([
  'warehouse_work',
]);

function isProjectLike(s: WorkdayAllocationSegment): boolean {
  return PROJECT_LIKE_TYPES.has(s.allocationType);
}
function isWarehouseLike(s: WorkdayAllocationSegment): boolean {
  return WAREHOUSE_LIKE_TYPES.has(s.allocationType);
}
function sameTarget(a: WorkdayAllocationSegment, b: WorkdayAllocationSegment): boolean {
  return !!a.targetId && !!b.targetId &&
    a.targetType === b.targetType && a.targetId === b.targetId;
}

function findNeighborWork(
  list: WorkdayAllocationSegment[],
  fromIdx: number,
  step: -1 | 1,
): WorkdayAllocationSegment | null {
  for (let k = fromIdx + step; k >= 0 && k < list.length; k += step) {
    const s = list[k];
    if (s.allocationType === 'supplier_visit') continue;
    if (s.allocationType === 'private_time') return null; // hem stoppar sökningen
    if (isProjectLike(s) || isWarehouseLike(s)) return s;
    // movement/unlinked/review hoppas över utan att stoppa
    continue;
  }
  return null;
}

function toCandidate(
  s: WorkdayAllocationSegment,
  source: SupplierProjectCandidateSource,
  confidence: WorkdayAllocationConfidence,
): SupplierProjectCandidate | null {
  if (!s.targetType || !s.targetId) return null;
  return {
    targetType: s.targetType,
    targetId: s.targetId,
    label: s.label,
    source,
    confidence,
  };
}

interface AssignmentItemLike {
  projectId: string | null;
  largeProjectId: string | null;
  bookingId: string | null;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
}

function pickAssignmentCandidate(
  items: AssignmentItemLike[],
  supStartMs: number,
  supEndMs: number,
): SupplierProjectCandidate | null {
  for (const it of items) {
    const sMs = toMs(it.startAt);
    const eMs = toMs(it.endAt);
    // Kräv tidsöverlapp om assignmenten har tid; annars hoppa.
    if (sMs === null || eMs === null) continue;
    const overlaps = sMs < supEndMs && eMs > supStartMs;
    if (!overlaps) continue;
    if (it.largeProjectId) {
      return {
        targetType: 'large_project', targetId: it.largeProjectId,
        label: it.title ?? null, source: 'overlapping_assignment', confidence: 'high',
      };
    }
    if (it.projectId) {
      return {
        targetType: 'project', targetId: it.projectId,
        label: it.title ?? null, source: 'overlapping_assignment', confidence: 'high',
      };
    }
    if (it.bookingId) {
      return {
        targetType: 'booking', targetId: it.bookingId,
        label: it.title ?? null, source: 'overlapping_assignment', confidence: 'high',
      };
    }
  }
  return null;
}
