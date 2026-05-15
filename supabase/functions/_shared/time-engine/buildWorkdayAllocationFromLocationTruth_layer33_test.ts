/**
 * Lager 3.3 — Fördela known targets till arbetskontext.
 *
 * Verifierar att:
 *   1. large_project / project / booking / warehouse / supplier mappas korrekt.
 *   2. private_zone matchedTarget → private_time.
 *   3. known_address utan target → unlinked_work_address + no_project_link warning.
 *   4. project utan assignment → assignmentStatus=unassigned_but_present
 *      + warning staff_not_assigned_to_matched_target. KOPPLINGEN BEHÅLLS.
 *   5. planning_geo_mismatch → GPS vinner, warning sätts.
 *   6. Diagnostics-räknare per targetType + unassignedButPresent + planningMismatch.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWorkdayAllocationFromLocationTruth } from './buildWorkdayAllocationFromLocationTruth.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
  BusinessContextStatus,
  FinalLocationTruthSegmentType,
} from './buildLocationTruthFromDayEvidence.ts';

const ENVELOPE = {
  startAt: '2026-05-15T07:00:00.000Z',
  endAt: '2026-05-15T16:00:00.000Z',
  isOpen: false,
  startSource: 'active_time_registration' as const,
  endSource: 'active_time_registration_stop' as const,
  warnings: [],
};

function fakeLT(segments: LocationTruthSegment[]): LocationTruthResult {
  return {
    segments,
    diagnostics: {
      staffId: 'staff-1', date: '2026-05-15', builtAtIso: '2026-05-15T00:00:00Z',
      buildDurationMs: 0, inputClusterCount: segments.length,
      outputSegmentCount: segments.length, warnings: [],
    } as any,
  } as LocationTruthResult;
}

function siteSeg(opts: {
  id: string;
  start: string;
  end: string;
  matchedTargetType: LocationTruthTargetType;
  hasAssignment?: boolean;
  businessStatus?: BusinessContextStatus;
  finalType?: FinalLocationTruthSegmentType;
}): LocationTruthSegment {
  const matched = {
    targetType: opts.matchedTargetType,
    targetId: `${opts.matchedTargetType}-1`,
    label: `${opts.matchedTargetType} A`,
  };
  const final: FinalLocationTruthSegmentType = opts.finalType
    ?? (opts.matchedTargetType === 'private_zone' ? 'private_residence' : 'known_site');
  return {
    id: opts.id,
    staffId: 'staff-1',
    startAt: opts.start,
    endAt: opts.end,
    type: final === 'private_residence' ? 'private_residence' : 'known_site',
    finalType: final,
    confidence: 'high',
    physicalLocation: { label: matched.label, address: 'Adress 1' },
    matchedTarget: matched,
    businessContext: { status: opts.businessStatus ?? 'work_confirmed', matchedTarget: matched },
    evidence: { assignmentSupportsTarget: !!opts.hasAssignment } as any,
  } as any;
}

function knownAddressSeg(id: string, start: string, end: string): LocationTruthSegment {
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: 'known_site',
    finalType: 'known_address',
    confidence: 'high',
    physicalLocation: { label: 'Stabil adress', address: 'Storgatan 1' },
    matchedTarget: undefined,
    businessContext: { status: 'work_confirmed', matchedTarget: undefined },
    evidence: { assignmentSupportsTarget: false } as any,
  } as any;
}

// ── 1. Mappning per targetType ─────────────────────────────────────────
Deno.test('Layer 3.3 — large_project → large_project_work', () => {
  const lt = fakeLT([siteSeg({
    id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T10:00:00Z',
    matchedTargetType: 'large_project', hasAssignment: true,
  })]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: lt, workdayEnvelope: ENVELOPE,
  });
  assertEquals(r.segments[0].allocationType, 'large_project_work');
  assertEquals(r.segments[0].assignmentStatus, 'assigned');
  assertEquals(r.diagnostics.largeProjectWorkCount, 1);
});

Deno.test('Layer 3.3 — project / booking / warehouse / supplier mapping', () => {
  const lt = fakeLT([
    siteSeg({ id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T09:00:00Z',
      matchedTargetType: 'project', hasAssignment: true }),
    siteSeg({ id: 's2', start: '2026-05-15T09:00:00Z', end: '2026-05-15T10:00:00Z',
      matchedTargetType: 'booking', hasAssignment: true }),
    siteSeg({ id: 's3', start: '2026-05-15T10:00:00Z', end: '2026-05-15T11:00:00Z',
      matchedTargetType: 'warehouse', hasAssignment: true,
      businessStatus: 'warehouse_presence' }),
    siteSeg({ id: 's4', start: '2026-05-15T11:00:00Z', end: '2026-05-15T12:00:00Z',
      matchedTargetType: 'supplier', hasAssignment: true }),
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: lt, workdayEnvelope: ENVELOPE,
  });
  const types = r.segments.map((s) => s.allocationType);
  assertEquals(types, ['project_work', 'booking_work', 'warehouse_work', 'supplier_visit']);
  assertEquals(r.diagnostics.projectWorkCount, 1);
  assertEquals(r.diagnostics.bookingWorkCount, 1);
  assertEquals(r.diagnostics.warehouseWorkCount, 1);
  assertEquals(r.diagnostics.supplierVisitCount, 1);
});

// ── 2. private_zone ─────────────────────────────────────────────────────
Deno.test('Layer 3.3 — private_zone matched → private_time', () => {
  const lt = fakeLT([siteSeg({
    id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T08:30:00Z',
    matchedTargetType: 'private_zone', hasAssignment: false,
    finalType: 'private_residence',
  })]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: lt, workdayEnvelope: ENVELOPE,
  });
  assertEquals(r.segments[0].allocationType, 'private_time');
});

// ── 3. known_address utan target ───────────────────────────────────────
Deno.test('Layer 3.3 — known_address without target → unlinked_work_address + no_project_link', () => {
  const lt = fakeLT([knownAddressSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z')]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: lt, workdayEnvelope: ENVELOPE,
  });
  assertEquals(r.segments[0].allocationType, 'unlinked_work_address');
  assert(r.segments[0].warnings.includes('no_project_link'));
  assertEquals(r.diagnostics.unlinkedWorkAddressCount, 1);
});

// ── 4. Unassigned but present (KOPPLINGEN BEHÅLLS, GPS vinner) ──────────
Deno.test('Layer 3.3 — project without assignment → unassigned_but_present, link kept', () => {
  const lt = fakeLT([siteSeg({
    id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T10:00:00Z',
    matchedTargetType: 'project', hasAssignment: false,
  })]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: lt, workdayEnvelope: ENVELOPE,
  });
  const seg = r.segments[0];
  // Kopplingen behålls
  assertEquals(seg.allocationType, 'project_work');
  assertEquals(seg.targetType, 'project');
  assertEquals(seg.targetId, 'project-1');
  // Statusen markerar att assignment saknades
  assertEquals(seg.assignmentStatus, 'unassigned_but_present');
  assert(seg.warnings.includes('staff_not_assigned_to_matched_target'));
  assertEquals(r.diagnostics.unassignedButPresentCount, 1);
  assertEquals(r.diagnostics.projectWorkCount, 1);
});

Deno.test('Layer 3.3 — booking without assignment → still booking_work + warning', () => {
  const lt = fakeLT([siteSeg({
    id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T10:00:00Z',
    matchedTargetType: 'booking', hasAssignment: false,
  })]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: lt, workdayEnvelope: ENVELOPE,
  });
  assertEquals(r.segments[0].allocationType, 'booking_work');
  assertEquals(r.segments[0].assignmentStatus, 'unassigned_but_present');
  assert(r.segments[0].warnings.includes('staff_not_assigned_to_matched_target'));
});

// ── 5. planning_geo_mismatch → GPS vinner ──────────────────────────────
Deno.test('Layer 3.3 — planning_geo_mismatch → GPS wins, warning preserved, link kept', () => {
  const lt = fakeLT([siteSeg({
    id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T10:00:00Z',
    matchedTargetType: 'project', hasAssignment: false,
    businessStatus: 'planning_geo_mismatch',
  })]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: lt, workdayEnvelope: ENVELOPE,
  });
  const seg = r.segments[0];
  // GPS vinner: vi mappar fortfarande till project_work mot den GPS-matchade target
  assertEquals(seg.allocationType, 'project_work');
  assertEquals(seg.targetId, 'project-1');
  assert(seg.warnings.includes('planning_geo_mismatch'));
  assertEquals(r.diagnostics.planningMismatchCount, 1);
});

// ── 6. Diagnostics summering ───────────────────────────────────────────
Deno.test('Layer 3.3 — diagnostics counts cover all categories', () => {
  const lt = fakeLT([
    siteSeg({ id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T09:00:00Z',
      matchedTargetType: 'project', hasAssignment: false }),
    siteSeg({ id: 's2', start: '2026-05-15T09:00:00Z', end: '2026-05-15T10:00:00Z',
      matchedTargetType: 'large_project', hasAssignment: true }),
    knownAddressSeg('s3', '2026-05-15T10:00:00Z', '2026-05-15T11:00:00Z'),
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null, locationTruthV2: lt, workdayEnvelope: ENVELOPE,
  });
  const d = r.diagnostics;
  assertEquals(d.projectWorkCount, 1);
  assertEquals(d.largeProjectWorkCount, 1);
  assertEquals(d.unlinkedWorkAddressCount, 1);
  assertEquals(d.unassignedButPresentCount, 1);
  assertEquals(d.planningMismatchCount, 0);
});
