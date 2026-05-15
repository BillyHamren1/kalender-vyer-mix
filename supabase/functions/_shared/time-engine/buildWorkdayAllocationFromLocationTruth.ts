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
  | 'planning_geo_mismatch'
  | 'supplier_visit_no_assignment'
  | 'warehouse_presence_no_assignment'
  | 'needs_review_business_context'
  | 'gap_in_workday'
  | 'allocation_low_confidence';

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

export interface BuildWorkdayAllocationInput {
  dayEvidence: DayEvidence | null;
  locationTruthV2: LocationTruthResult | null;
  activeWorkday: ActiveWorkdayInput | null;
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
  'unassigned_known_target_presence', 'planning_geo_mismatch',
  'supplier_visit_no_assignment', 'warehouse_presence_no_assignment',
  'needs_review_business_context', 'gap_in_workday', 'allocation_low_confidence',
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

/** Beslutar allocationType utifrån LocationTruth-segmentet. */
function deriveAllocation(
  seg: LocationTruthSegment,
  hasOverlapWithAssignment: boolean,
): {
  type: WorkdayAllocationType;
  warnings: WorkdayAllocationWarning[];
  confidence: WorkdayAllocationConfidence;
} {
  const warnings: WorkdayAllocationWarning[] = [];
  const matched = seg.businessContext?.matchedTarget ?? seg.matchedTarget;
  const status = seg.businessContext?.status ?? null;

  // Movement → work_travel om någon ände är arbetsplats inom workday.
  if (seg.finalType === 'movement') {
    return {
      type: 'work_travel',
      warnings: ['movement_classified_as_work_travel'],
      confidence: seg.confidence,
    };
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
    // Fysisk plats stabil men ingen EventFlow-target.
    if (status === 'planning_geo_mismatch') warnings.push('planning_geo_mismatch');
    if (status === 'needs_review') warnings.push('needs_review_business_context');
    return {
      type: 'unlinked_work_address',
      warnings,
      confidence: seg.confidence === 'high' ? 'medium' : seg.confidence,
    };
  }

  // known_site → mappa per matchedTarget.targetType
  if (matched) {
    switch (matched.targetType) {
      case 'large_project':
        return { type: 'large_project_work', warnings, confidence: seg.confidence };
      case 'project':
        return { type: 'project_work', warnings, confidence: seg.confidence };
      case 'booking':
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

  // known_site utan matched target → unassigned presence.
  if (status === 'unassigned_known_target_presence') {
    warnings.push('unassigned_known_target_presence');
  }
  return { type: 'unlinked_work_address', warnings, confidence: 'low' };
}

// ── Main ─────────────────────────────────────────────────────────────────

export function buildWorkdayAllocationFromLocationTruth(
  input: BuildWorkdayAllocationInput,
): WorkdayAllocationResult {
  const startedAt = Date.now();
  const ltSegments = input.locationTruthV2?.segments ?? [];
  const wd = input.activeWorkday;
  const wdStartMs = toMs(wd?.startedAt ?? null);
  const wdStopMs = toMs(wd?.stoppedAt ?? null);

  const segments: WorkdayAllocationSegment[] = [];
  const proposals: WorkdayAllocationProposal[] = [];
  const diag: WorkdayAllocationDiagnostics = {
    staffId: wd?.staffId ?? input.locationTruthV2?.diagnostics.staffId ?? null,
    date: wd?.date ?? input.locationTruthV2?.diagnostics.date ?? null,
    builtAtIso: new Date().toISOString(),
    buildDurationMs: 0,
    hasActiveWorkday: !!wdStartMs,
    workdayStartAt: wd?.startedAt ?? null,
    workdayEndAt: wd?.stoppedAt ?? null,
    workdayDurationMinutes: 0,
    inputSegmentCount: ltSegments.length,
    segmentsInsideWorkday: 0,
    segmentsOutsideWorkday: 0,
    segmentsPartiallyClipped: 0,
    allocationCounts: emptyAllocCounts(),
    warningsByType: emptyWarningCounts(),
    warnings: [],
    uncoveredWorkdayMinutes: 0,
    examples: [],
  };

  if (!wdStartMs) {
    diag.warnings.push('no_active_workday');
    diag.warningsByType.no_active_workday += 1;
    diag.buildDurationMs = Date.now() - startedAt;
    return { segments, proposals, diagnostics: diag };
  }
  // Pågående workday: använd dagslut eller "nu" som fönsterslut.
  const fallbackEnd = toMs(input.locationTruthV2?.diagnostics.date
    ? `${input.locationTruthV2!.diagnostics.date}T23:59:59.999Z`
    : null) ?? Date.now();
  const wdEnd = wdStopMs ?? fallbackEnd;
  diag.workdayDurationMinutes = Math.max(0, Math.round((wdEnd - wdStartMs) / 60_000));

  // Track coverage för uncoveredWorkdayMinutes.
  const coveredIntervals: Array<[number, number]> = [];

  for (const seg of ltSegments) {
    const sMs = toMs(seg.startAt);
    const eMs = toMs(seg.endAt);
    if (sMs === null || eMs === null || eMs <= sMs) continue;

    const overlapsWorkday = sMs < wdEnd && eMs > wdStartMs;
    if (!overlapsWorkday) {
      diag.segmentsOutsideWorkday += 1;
      // Vi tar fortfarande med segmentet i debug-output men markerar det.
      const allocOutside = deriveAllocation(seg, !!seg.evidence.assignmentSupportsTarget);
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

    const hasOverlap = !!seg.evidence.assignmentSupportsTarget;
    const alloc = deriveAllocation(seg, hasOverlap);

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
      assignmentStatus: hasOverlap ? 'assigned_overlap' : 'no_assignment',
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
