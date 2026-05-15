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
  | 'warehouse_presence_during_planned_project';

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
    };
  }

  // ── Lager 3.11A — klipp start mot analysdag ──
  let effectiveStartMs = rawStartMs;
  if (analysisStartMs !== null && rawStartMs < analysisStartMs) {
    effectiveStartMs = analysisStartMs;
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
  if (analysisEndMs !== null && rawEndCandidateMs > analysisEndMs) {
    effectiveEndMs = analysisEndMs;
    endSource = 'analysis_window_end';
    warnings.push('workday_continues_after_analysis_day');
    if (isOpen) warnings.push('envelope_clipped_to_analysis_window');
  } else if (isOpen && analysisEndMs !== null && rawEndCandidateMs < analysisEndMs) {
    // Öppen timer mitt i dagen → endAt = now < analysisEnd.
    warnings.push('envelope_clipped_to_analysis_window');
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
  'supplier_visit_no_assignment', 'warehouse_presence_no_assignment',
  'needs_review_business_context', 'gap_in_workday', 'allocation_low_confidence',
  'normally_not_paid_commute', 'normally_not_paid_homebound',
  'long_travel_over_150km', 'movement_missing_anchor',
  'supplier_visit_without_project_context',
  'home_after_last_work_location', 'temporary_home_presence',
  'workday_time_without_location_truth_segment',
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
    // Fysisk plats stabil men ingen EventFlow-target → unlinked_work_address.
    // Lager 3.3: signalera tydligt att projektkoppling saknas.
    warnings.push('no_project_link');
    if (status === 'planning_geo_mismatch') warnings.push('planning_geo_mismatch');
    if (status === 'needs_review') warnings.push('needs_review_business_context');
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
  const wdStartMs = toMs(envelope.startAt);

  const segments: WorkdayAllocationSegment[] = [];
  const proposals: WorkdayAllocationProposal[] = [];
  const diag: WorkdayAllocationDiagnostics = {
    staffId: wd?.staffId ?? input.locationTruthV2?.diagnostics.staffId ?? null,
    date: wd?.date ?? input.locationTruthV2?.diagnostics.date ?? null,
    builtAtIso: new Date().toISOString(),
    buildDurationMs: 0,
    hasActiveWorkday: !!wdStartMs,
    workdayStartAt: envelope.startAt,
    workdayEndAt: envelope.isOpen ? null : envelope.endAt,
    workdayDurationMinutes: 0,
    inputSegmentCount: ltSegments.length,
    segmentsInsideWorkday: 0,
    segmentsOutsideWorkday: 0,
    segmentsPartiallyClipped: 0,
    allocationCounts: emptyAllocCounts(),
    warningsByType: emptyWarningCounts(),
    warnings: [...envelope.warnings],
    uncoveredWorkdayMinutes: 0,
    workdayEnvelopeFound: !!wdStartMs,
    openWorkday: envelope.isOpen,
    workdayStartSource: envelope.startSource,
    workdayEndSource: envelope.endSource,
    envelopeWarnings: [...envelope.warnings],
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
  };

  if (!wdStartMs) {
    diag.warnings.push('no_active_workday');
    diag.warningsByType.no_active_workday += 1;
    diag.buildDurationMs = Date.now() - startedAt;
    return { segments, proposals, diagnostics: diag };
  }
  // Använd envelope-end (täcker både stängd och öppen dagtimer).
  const wdEnd = toMs(envelope.endAt) ?? Date.now();
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

  for (const seg of ltSegments) {
    const sMs = toMs(seg.startAt);
    const eMs = toMs(seg.endAt);
    if (sMs === null || eMs === null || eMs <= sMs) continue;

    const overlapsWorkday = sMs < wdEnd && eMs > wdStartMs;
    if (!overlapsWorkday) {
      diag.segmentsOutsideWorkday += 1;
      diag.segmentsOutsideEnvelope += 1;
      // Vi tar fortfarande med segmentet i debug-output men markerar det.
      const allocOutside = deriveAllocation(
        seg,
        !!seg.evidence.assignmentSupportsTarget,
        seg.finalType === 'movement' ? movementCtxById.get(seg.id) ?? null : null,
      );
      const item: WorkdayAllocationSegment = {
        id: `wda_${seg.id}`,
        startAt: seg.startAt,
        endAt: seg.endAt,
        sourceLocationTruthSegmentIds: [seg.id],
        allocationType: allocOutside.type,
        targetType: (seg.businessContext?.matchedTarget ?? seg.matchedTarget)?.targetType ?? null,
        targetId: (seg.businessContext?.matchedTarget ?? seg.matchedTarget)?.targetId ?? null,
        label: (seg.businessContext?.matchedTarget ?? seg.matchedTarget)?.label
          ?? seg.physicalLocation?.label ?? null,
        address: seg.physicalLocation?.address ?? (seg.businessContext?.matchedTarget?.address ?? null),
        confidence: allocOutside.confidence,
        warnings: ['segment_outside_workday'],
        assignmentStatus: 'unknown',
        assignmentMatch: 'unknown',
        businessContextStatus: seg.businessContext?.status ?? null,
        rawSegmentStartAt: seg.startAt,
        rawSegmentEndAt: seg.endAt,
        outsideWorkday: true,
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
    const alloc = deriveAllocation(seg, hasOverlap, movementCtx);

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
    // Lager 3.11B — kanoniska assignmentStatus-värden:
    //   assigned                 = matchad project/booking/large_project + overlap
    //   unassigned_but_present   = matchad project/booking/large_project utan overlap
    //   no_assignment_required   = matchad supplier/warehouse/organization_location
    //   unknown                  = ingen target / kan ej avgöras
    // assignmentMatch ger detaljnivån (overlap/no_overlap/not_required/missing/unknown).
    const matchedNoAssignmentRequired = !!matched && (
      matched.targetType === 'supplier' ||
      matched.targetType === 'warehouse' ||
      matched.targetType === 'organization_location'
    );
    let assignmentStatus: WorkdayAllocationAssignmentStatus;
    let assignmentMatch: WorkdayAllocationAssignmentMatch;
    if (matchedNoAssignmentRequired) {
      assignmentStatus = 'no_assignment_required';
      assignmentMatch = 'not_required';
    } else if (matched && hasOverlap) {
      assignmentStatus = 'assigned';
      assignmentMatch = 'overlap';
    } else if (matched && !hasOverlap) {
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
      targetType: matched?.targetType ?? null,
      targetId: matched?.targetId ?? null,
      label: matched?.label ?? seg.physicalLocation?.label ?? null,
      address: seg.physicalLocation?.address ?? matched?.address ?? null,
      confidence: alloc.confidence,
      warnings: alloc.warnings,
      assignmentStatus,
      assignmentMatch,
      businessContextStatus: seg.businessContext?.status ?? null,
      rawSegmentStartAt: seg.startAt,
      rawSegmentEndAt: seg.endAt,
      outsideWorkday: false,
    };
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
  coveredIntervals.sort((a, b) => a[0] - b[0]);
  let cursor = wdStartMs;
  let uncoveredMs = 0;
  const SHORT_GAP_MS = 30 * 60_000;
  const MEDIUM_GAP_MS = 120 * 60_000;

  // Review-förutsättningar (samma för alla gaps på samma dag).
  const ltAll = input.locationTruthV2?.segments ?? [];
  const hasAnyLtCoverageInWorkday = coveredIntervals.length > 0;
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

  for (const [s, e] of coveredIntervals) {
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
