/**
 * Lager 3.1 — Workday Allocation Layer (initial coverage).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildWorkdayAllocationFromLocationTruth,
  type ActiveWorkdayInput,
} from './buildWorkdayAllocationFromLocationTruth.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthSegmentType,
  FinalLocationTruthSegmentType,
  LocationTruthTargetType,
  BusinessContextStatus,
} from './buildLocationTruthFromDayEvidence.ts';

function seg(opts: {
  id: string;
  start: string;
  end: string;
  finalType: FinalLocationTruthSegmentType;
  type?: LocationTruthSegmentType;
  matchedTargetType?: LocationTruthTargetType;
  matchedTargetId?: string;
  matchedLabel?: string;
  businessStatus?: BusinessContextStatus;
  assignmentSupportsTarget?: boolean;
  confidence?: 'high' | 'medium' | 'low';
}): LocationTruthSegment {
  const matched = opts.matchedTargetType
    ? { targetType: opts.matchedTargetType, targetId: opts.matchedTargetId ?? 'tgt', label: opts.matchedLabel ?? 'Label' }
    : undefined;
  return {
    id: opts.id,
    staffId: 'staff-1',
    startAt: opts.start,
    endAt: opts.end,
    type: opts.type ?? (opts.finalType === 'movement' ? 'movement' :
      opts.finalType === 'private_residence' ? 'private_residence' :
      opts.finalType === 'unresolved_location' ? 'unresolved_location' :
      opts.finalType === 'known_address' ? 'known_address' :
      opts.finalType === 'needs_location_review' ? 'needs_location_review' :
      'known_target'),
    finalType: opts.finalType,
    matchedTarget: matched,
    physicalLocation: { label: opts.matchedLabel ?? null, address: null, source: 'cluster_centroid' } as any,
    businessContext: opts.businessStatus
      ? { status: opts.businessStatus, matchedTarget: matched }
      : (matched ? { status: 'matched_eventflow_target', matchedTarget: matched } : undefined),
    confidence: opts.confidence ?? 'high',
    evidence: { pingCount: 10, assignmentSupportsTarget: opts.assignmentSupportsTarget ?? false },
    warnings: [],
    diagnostics: {},
  };
}

function ltResult(segments: LocationTruthSegment[], date = '2026-05-13'): LocationTruthResult {
  return {
    segments,
    diagnostics: {
      staffId: 'staff-1', date, builtAtIso: '', buildDurationMs: 0,
      hasUsableEvidence: true,
      counts: { locationLogicPings: 0, knownTargets: 0, knownTargetsWithCoordinates: 0,
        largeProjects: 0, privateZones: 0, assignments: 0, segments: segments.length,
        segmentsByType: {} as any },
      warnings: [], skippedReason: null,
      stableClusterDiagnostics: null, targetMatchDiagnostics: null,
      physicalLocationDiagnostics: null, supplierMatchDiagnostics: null,
      gapBridgeDiagnostics: null, movementDiagnostics: null, locationTruthSummary: null,
    } as any,
    stableClusters: [],
    clusterMatches: [],
  };
}

const wd = (start: string, stop: string | null = null): ActiveWorkdayInput => ({
  startedAt: start, stoppedAt: stop, staffId: 'staff-1', date: '2026-05-13',
});

Deno.test('Lager 3.1: ingen aktiv workday → no_active_workday warning, 0 segment', () => {
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([]), activeWorkday: null,
  });
  assertEquals(r.segments.length, 0);
  assert(r.diagnostics.warnings.includes('no_active_workday'));
  assertEquals(r.diagnostics.hasActiveWorkday, false);
});

Deno.test('Lager 3.1: project known_site inom workday → project_work', () => {
  const s = seg({
    id: 's1', start: '2026-05-13T08:00:00Z', end: '2026-05-13T12:00:00Z',
    finalType: 'known_site', matchedTargetType: 'project', matchedTargetId: 'p1',
    matchedLabel: 'Projekt A', assignmentSupportsTarget: true,
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:00:00Z'),
  });
  assertEquals(r.segments.length, 1);
  assertEquals(r.segments[0].allocationType, 'project_work');
  assertEquals(r.segments[0].targetId, 'p1');
  assertEquals(r.segments[0].assignmentStatus, 'assigned_overlap');
  assertEquals(r.diagnostics.allocationCounts.project_work, 1);
});

Deno.test('Lager 3.1: large_project, booking, warehouse, supplier mappas korrekt', () => {
  const segments = [
    seg({ id: 's1', start: '2026-05-13T08:00:00Z', end: '2026-05-13T09:00:00Z',
      finalType: 'known_site', matchedTargetType: 'large_project' }),
    seg({ id: 's2', start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z',
      finalType: 'known_site', matchedTargetType: 'booking' }),
    seg({ id: 's3', start: '2026-05-13T10:00:00Z', end: '2026-05-13T11:00:00Z',
      finalType: 'known_site', matchedTargetType: 'warehouse',
      businessStatus: 'warehouse_presence' }),
    seg({ id: 's4', start: '2026-05-13T11:00:00Z', end: '2026-05-13T12:00:00Z',
      finalType: 'known_site', matchedTargetType: 'supplier',
      businessStatus: 'supplier_visit' }),
  ];
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult(segments),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:00:00Z'),
  });
  const types = r.segments.map((s) => s.allocationType);
  assertEquals(types, ['large_project_work', 'booking_work', 'warehouse_work', 'supplier_visit']);
  // Lager 3.10A: warehouse + supplier kräver INGEN assignment.
  assertEquals(r.segments[2].assignmentStatus, 'no_assignment_required');
  assertEquals(r.segments[3].assignmentStatus, 'no_assignment_required');
});

Deno.test('Lager 3.1: known_address → unlinked_work_address', () => {
  const s = seg({
    id: 's1', start: '2026-05-13T08:00:00Z', end: '2026-05-13T09:00:00Z',
    finalType: 'known_address',
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:00:00Z'),
  });
  assertEquals(r.segments[0].allocationType, 'unlinked_work_address');
});

Deno.test('Lager 3.1: movement utan anchor → needs_work_allocation_review (Lager 3.4)', () => {
  // Sedan Lager 3.4 kräver work_travel tydlig from/to-anchor.
  // En naken movement utan from/to klassas som needs_work_allocation_review
  // med warning movement_missing_anchor.
  const s = seg({
    id: 's1', start: '2026-05-13T08:00:00Z', end: '2026-05-13T08:30:00Z',
    finalType: 'movement',
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:00:00Z'),
  });
  assertEquals(r.segments[0].allocationType, 'needs_work_allocation_review');
  assert(r.segments[0].warnings.includes('movement_missing_anchor'));
});

Deno.test('Lager 3.1: unresolved_location → needs_work_allocation_review (low)', () => {
  const s = seg({
    id: 's1', start: '2026-05-13T08:00:00Z', end: '2026-05-13T09:00:00Z',
    finalType: 'unresolved_location',
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:00:00Z'),
  });
  assertEquals(r.segments[0].allocationType, 'needs_work_allocation_review');
  assertEquals(r.segments[0].confidence, 'low');
  assert(r.segments[0].warnings.includes('unresolved_location_inside_workday'));
});

Deno.test('Lager 3.1: private_residence inom workday → private_time + proposal', () => {
  const s = seg({
    id: 's1', start: '2026-05-13T15:00:00Z', end: '2026-05-13T17:00:00Z',
    finalType: 'private_residence', matchedTargetType: 'private_zone',
    matchedLabel: 'Hem',
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:30:00Z'),
  });
  assertEquals(r.segments[0].allocationType, 'private_time');
  // Lager 3.10: private_residence inom workday genererar nu
  // consider_workday_end_from_private + ev. suggest_workday_end + gap_in_workday.
  // Vi verifierar bara att minst en private-proposal finns.
  const privateProps = r.proposals.filter((p) => p.proposedAllocationType === 'private_time');
  assert(privateProps.length >= 1);
  assertEquals(privateProps[0].proposedAllocationType, 'private_time');
});

Deno.test('Lager 3.1: segment helt utanför workday → markeras outsideWorkday', () => {
  const s = seg({
    id: 's1', start: '2026-05-13T05:00:00Z', end: '2026-05-13T06:00:00Z',
    finalType: 'known_site', matchedTargetType: 'project',
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:00:00Z'),
  });
  assertEquals(r.segments[0].outsideWorkday, true);
  assert(r.segments[0].warnings.includes('segment_outside_workday'));
  assertEquals(r.diagnostics.segmentsOutsideWorkday, 1);
  assertEquals(r.diagnostics.allocationCounts.project_work, 0);
});

Deno.test('Lager 3.1: segment delvis utanför workday → klipps + warning', () => {
  const s = seg({
    id: 's1', start: '2026-05-13T06:30:00Z', end: '2026-05-13T08:00:00Z',
    finalType: 'known_site', matchedTargetType: 'project',
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:00:00Z'),
  });
  assertEquals(r.segments[0].startAt, '2026-05-13T07:00:00.000Z');
  assertEquals(r.segments[0].endAt, '2026-05-13T08:00:00.000Z');
  assert(r.segments[0].warnings.includes('segment_partially_outside_workday'));
  assertEquals(r.diagnostics.segmentsPartiallyClipped, 1);
});

Deno.test('Lager 3.1: gap i workday räknas i uncoveredWorkdayMinutes', () => {
  const s = seg({
    id: 's1', start: '2026-05-13T08:00:00Z', end: '2026-05-13T09:00:00Z',
    finalType: 'known_site', matchedTargetType: 'project',
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T11:00:00Z'),
  });
  // workday 240 min, segment täcker 60 min → 180 min uncovered
  assertEquals(r.diagnostics.uncoveredWorkdayMinutes, 180);
  assert(r.diagnostics.warnings.includes('gap_in_workday'));
});

Deno.test('Lager 3.1: planning_geo_mismatch → warning bibehålls', () => {
  const s = seg({
    id: 's1', start: '2026-05-13T08:00:00Z', end: '2026-05-13T09:00:00Z',
    finalType: 'known_address', businessStatus: 'planning_geo_mismatch',
  });
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: ltResult([s]),
    activeWorkday: wd('2026-05-13T07:00:00Z', '2026-05-13T17:00:00Z'),
  });
  assert(r.segments[0].warnings.includes('planning_geo_mismatch'));
});
