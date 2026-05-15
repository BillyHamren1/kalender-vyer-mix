/**
 * Lager 3.10C — Uncovered workday time (mjuk policy).
 *
 *   < 30 min            → endast diagnostics, ingen proposal
 *   30–120 min          → proposal severity 'low'
 *   > 120 min           → proposal severity 'medium'
 *   long + ingen LT-täckning + inga bridge-warnings → severity 'high' + review
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWorkdayAllocationFromLocationTruth } from './buildWorkdayAllocationFromLocationTruth.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
} from './buildLocationTruthFromDayEvidence.ts';

const ENV = (start: string, end: string) => ({
  startAt: start, endAt: end, isOpen: false,
  startSource: 'active_time_registration' as const,
  endSource: 'active_time_registration_stop' as const,
  warnings: [],
});

function siteSeg(
  id: string, start: string, end: string,
  t: LocationTruthTargetType = 'project',
  warnings: string[] = [],
): LocationTruthSegment {
  const matched = { targetType: t, targetId: `${t}-1`, label: `${t} A` };
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: 'known_target', finalType: 'known_site', confidence: 'high',
    physicalLocation: { label: 'A', address: 'A 1' } as any,
    matchedTarget: matched,
    businessContext: { status: 'matched_eventflow_target', matchedTarget: matched },
    evidence: { assignmentSupportsTarget: true, pingCount: 5 } as any,
    warnings, diagnostics: {} as any,
  } as any;
}

function run(segments: LocationTruthSegment[], envStart: string, envEnd: string) {
  return buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { assignments: { items: [] } } as any,
    locationTruthV2: { segments, diagnostics: {} as any } as LocationTruthResult,
    workdayEnvelope: ENV(envStart, envEnd),
  });
}

Deno.test('3.10C — gap < 30 min → endast diagnostics, ingen proposal', () => {
  const r = run(
    [siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T08:45:00Z')],
    '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', // 15 min uncovered
  );
  const props = r.proposals.filter((p) => p.proposalType === 'uncovered_workday_time');
  assertEquals(props.length, 0);
  assertEquals(r.diagnostics.uncoveredGapCount, 1);
  assertEquals(r.diagnostics.shortUncoveredGapsIgnoredCount, 1);
  assertEquals(r.diagnostics.uncoveredGapsProposedCount, 0);
});

Deno.test('3.10C — gap 30–120 min → severity low', () => {
  const r = run(
    [siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z')],
    '2026-05-15T08:00:00Z', '2026-05-15T10:00:00Z', // 60 min uncovered
  );
  const props = r.proposals.filter((p) => p.proposalType === 'uncovered_workday_time');
  assertEquals(props.length, 1);
  assertEquals(props[0].severity, 'low');
  assertEquals(props[0].proposedAllocationType, 'unlinked_work_address');
  assertEquals(props[0].requiresHumanApproval, false);
  assertEquals(props[0].reason, 'uncovered_workday_time');
});

Deno.test('3.10C — gap > 120 min med LT-täckning → severity medium', () => {
  const r = run(
    [siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z')],
    '2026-05-15T08:00:00Z', '2026-05-15T13:00:00Z', // 240 min uncovered
  );
  const p = r.proposals.find((x) => x.proposalType === 'uncovered_workday_time')!;
  assertEquals(p.severity, 'medium');
  assertEquals(p.proposedAllocationType, 'unlinked_work_address');
  assertEquals(p.requiresHumanApproval, false);
});

Deno.test('3.10C — long gap + ingen LT-täckning + inga bridge-warnings → severity high + review', () => {
  // Inga LT-segment alls inom workday → coveredIntervals tom.
  const r = run([], '2026-05-15T08:00:00Z', '2026-05-15T13:00:00Z');
  const p = r.proposals.find((x) => x.proposalType === 'uncovered_workday_time')!;
  assert(p);
  assertEquals(p.severity, 'high');
  assertEquals(p.proposedAllocationType, 'needs_work_allocation_review');
  assertEquals(p.requiresHumanApproval, true);
});

Deno.test('3.10C — long gap MED bridge-warning → INTE review (severity medium)', () => {
  const seg = siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T08:30:00Z',
    'project', ['signal_gap_bridged']);
  const r = run([seg], '2026-05-15T08:00:00Z', '2026-05-15T13:00:00Z');
  const p = r.proposals.find((x) => x.proposalType === 'uncovered_workday_time')!;
  assertEquals(p.severity, 'medium');
  assertEquals(p.proposedAllocationType, 'unlinked_work_address');
});

Deno.test('3.10C — diagnostics: uncoveredGapMinutesTotal speglar workday-uncovered', () => {
  const r = run(
    [siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z')],
    '2026-05-15T08:00:00Z', '2026-05-15T10:00:00Z',
  );
  assertEquals(r.diagnostics.uncoveredGapMinutesTotal, 60);
  assertEquals(r.diagnostics.uncoveredWorkdayMinutes, 60);
  assertEquals(r.diagnostics.uncoveredGapsProposedCount, 1);
});

Deno.test('3.10C — gammal warning gap_in_workday emitteras INTE längre', () => {
  const r = run(
    [siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z')],
    '2026-05-15T08:00:00Z', '2026-05-15T11:00:00Z',
  );
  assert(!r.diagnostics.warnings.includes('gap_in_workday'));
  assert(r.diagnostics.warnings.includes('workday_time_without_location_truth_segment'));
});
