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

export type WorkdayAllocationAssignmentStatus =
  | 'assigned_overlap'
  | 'assigned_no_overlap'
  | 'no_assignment'
  | 'unassigned_but_present'
  | 'unknown';

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
  | 'supplier_visit_no_assignment'
  | 'warehouse_presence_no_assignment'
  | 'needs_review_business_context'
  | 'gap_in_workday'
  | 'allocation_low_confidence'
  // ── Lager 3.4 — movement-warnings ─────────────────────────────────────
  | 'normally_not_paid_commute'
  | 'normally_not_paid_homebound'
  | 'long_travel_over_150km'
  | 'movement_missing_anchor'
  // ── Lager 3.5 — supplier-warning ──────────────────────────────────────
  | 'supplier_visit_without_project_context';

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
  proposedAllocationType: WorkdayAllocationType;
  targetType: LocationTruthTargetType | null;
  targetId: string | null;
  label: string | null;
  startAt: string;
  endAt: string;
  confidence: WorkdayAllocationConfidence;
  reason: string;
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
  | 'envelope_clipped_to_analysis_window';

export interface WorkdayEnvelope {
  /** Arbetsdagens startsanning. null = ingen aktiv dagtimer. */
  startAt: string | null;
  /** Arbetsdagens slutsanning. Om isOpen=true är detta analysfönster/now. */
  endAt: string | null;
  /** True om dagtimern fortfarande är öppen (ingen stopp registrerad). */
  isOpen: boolean;
  startSource: WorkdayEnvelopeStartSource;
  endSource: WorkdayEnvelopeEndSource;
  warnings: WorkdayEnvelopeWarning[];
}

export interface ResolveWorkdayEnvelopeInput {
  activeWorkday: ActiveWorkdayInput | null;
  /** Yttre slut för analysfönstret (t.ex. dayEnd UTC eller now-iso). Optional. */
  analysisWindowEndIso?: string | null;
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
  const startMs = toMs(wd?.startedAt ?? null);
  const stopMs = toMs(wd?.stoppedAt ?? null);
  const nowMs = toMs(input.nowIso ?? null) ?? Date.now();
  const analysisEndMs = toMs(input.analysisWindowEndIso ?? null);
  const warnings: WorkdayEnvelopeWarning[] = [];

  if (startMs === null) {
    return {
      startAt: null,
      endAt: null,
      isOpen: false,
      startSource: 'unknown',
      endSource: 'unknown',
      warnings: ['workday_start_missing'],
    };
  }

  const startSource: WorkdayEnvelopeStartSource = 'active_time_registration';

  // Sluten dagtimer.
  if (stopMs !== null) {
    if (stopMs <= startMs) warnings.push('workday_end_before_start');
    return {
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(stopMs).toISOString(),
      isOpen: false,
      startSource,
      endSource: 'active_time_registration_stop',
      warnings,
    };
  }

  // Öppen dagtimer → analysfönstrets slut, annars now. Aldrig framåt i tiden.
  warnings.push('workday_timer_open');
  let endMs: number;
  let endSource: WorkdayEnvelopeEndSource;
  if (analysisEndMs !== null) {
    endMs = Math.min(analysisEndMs, nowMs);
    endSource = endMs < analysisEndMs ? 'now' : 'analysis_window_end';
    if (endMs < analysisEndMs) warnings.push('envelope_clipped_to_analysis_window');
  } else {
    endMs = nowMs;
    endSource = 'now';
  }
  if (endMs < startMs) endMs = startMs;
  return {
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    isOpen: true,
    startSource,
    endSource,
    warnings,
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
        if (status === 'warehouse_presence' && !hasOverlapWithAssignment) {
          warnings.push('warehouse_presence_no_assignment');
        }
        return { type: 'warehouse_work', warnings, confidence: seg.confidence };
      case 'supplier':
        if (!hasOverlapWithAssignment) warnings.push('supplier_visit_no_assignment');
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
    // Lager 3.3 — assignmentStatus:
    //   assigned_overlap = planerad på rätt target i intervallet
    //   unassigned_but_present = matchad target finns men ingen assignment
    //                            (GPS/plats vinner — kopplingen behålls)
    //   no_assignment = ingen target alls
    let assignmentStatus: WorkdayAllocationAssignmentStatus;
    if (matched && hasOverlap) assignmentStatus = 'assigned_overlap';
    else if (matched && !hasOverlap) assignmentStatus = 'unassigned_but_present';
    else assignmentStatus = 'no_assignment';

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

  // Beräkna uncovered minutes inom workday.
  coveredIntervals.sort((a, b) => a[0] - b[0]);
  let cursor = wdStartMs;
  let uncoveredMs = 0;
  for (const [s, e] of coveredIntervals) {
    if (s > cursor) uncoveredMs += s - cursor;
    if (e > cursor) cursor = e;
  }
  if (cursor < wdEnd) uncoveredMs += wdEnd - cursor;
  diag.uncoveredWorkdayMinutes = Math.round(uncoveredMs / 60_000);
  if (diag.uncoveredWorkdayMinutes > 0) {
    diag.warnings.push('gap_in_workday');
    diag.warningsByType.gap_in_workday += 1;
  }

  diag.buildDurationMs = Date.now() - startedAt;
  return { segments, proposals, diagnostics: diag };
}
