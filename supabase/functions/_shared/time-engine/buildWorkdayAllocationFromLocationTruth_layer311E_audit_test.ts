/**
 * Lager 3.11E — Read-only kontroll efter envelope/assignment-fix (3.11A–D).
 *
 * 7 fall:
 *   1. Timer startade dagen innan, fortfarande öppen → envelope klipps mot dayStart, inga gigantiska gaps från igår
 *   2. Timer öppen idag → timerStoppedAt=null, effectiveWorkdayEndAt=min(now,dayEnd), warning workday_timer_open
 *   3. Supplier utan assignment → no_assignment_required, ingen supplier_visit_no_assignment
 *   4. Warehouse utan assignment → no_assignment_required, ingen warehouse_presence_no_assignment
 *   5. Projekt utan assignment → unassigned_but_present + staff_not_assigned_to_matched_target
 *   6. Projekt med assignment → assigned
 *   7. Uncovered gap → proposalType uncovered_workday_time, ingen warning gap_in_workday
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildWorkdayAllocationFromLocationTruth,
  resolveWorkdayEnvelope,
} from './buildWorkdayAllocationFromLocationTruth.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
  FinalLocationTruthSegmentType,
} from './buildLocationTruthFromDayEvidence.ts';

const DAY_START = '2026-05-15T00:00:00.000Z';
const DAY_END = '2026-05-15T23:59:59.999Z';

function siteSeg(
  id: string,
  start: string,
  end: string,
  t: LocationTruthTargetType,
  opts: { hasOverlap?: boolean; status?: string } = {},
): LocationTruthSegment {
  const matched = { targetType: t, targetId: `${t}-1`, label: `${t} A` };
  const finalType: FinalLocationTruthSegmentType = 'known_site';
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: 'known_target', finalType, confidence: 'high',
    physicalLocation: { label: `${t} A`, address: 'A 1' } as any,
    matchedTarget: matched,
    businessContext: { status: opts.status ?? 'matched_eventflow_target', matchedTarget: matched },
    evidence: { assignmentSupportsTarget: !!opts.hasOverlap, pingCount: 5 } as any,
    warnings: [], diagnostics: {} as any,
  } as any;
}

function runWithEnvelope(envelope: ReturnType<typeof resolveWorkdayEnvelope>, segments: LocationTruthSegment[] = []) {
  return buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { assignments: { items: [] } } as any,
    locationTruthV2: { segments, diagnostics: {} as any } as LocationTruthResult,
    workdayEnvelope: envelope,
  });
}

// ── Fall 1 ───────────────────────────────────────────────────────────────
Deno.test('3.11E#1 — timer startad dagen innan + öppen → klipps mot dayStart, inga jättegaps från igår', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-14T18:00:00Z', stoppedAt: null },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
    nowIso: '2026-05-15T09:00:00Z',
  });
  assertEquals(env.startAt, DAY_START, 'envelope.startAt klipps till dayStart');
  assertEquals(env.endAt, '2026-05-15T09:00:00.000Z');
  assert(env.warnings.includes('workday_started_before_analysis_day'));
  assert(env.warnings.includes('workday_timer_open'));
  assertEquals(env.timerStartedAt, '2026-05-14T18:00:00.000Z');

  // Inga uncovered gaps får sträcka sig in i gårdagen.
  const r = runWithEnvelope(env, [siteSeg('s', '2026-05-15T07:00:00Z', '2026-05-15T08:00:00Z', 'project', { hasOverlap: true })]);
  for (const p of r.proposals.filter((x) => x.proposalType === 'uncovered_workday_time')) {
    assert(p.startAt >= DAY_START, `gap startAt ${p.startAt} läcker in i gårdagen`);
    assert(p.endAt <= '2026-05-15T09:00:00.000Z', `gap endAt ${p.endAt} läcker över envelope-end`);
  }
});

// ── Fall 2 ───────────────────────────────────────────────────────────────
Deno.test('3.11E#2 — timer öppen idag → timerStoppedAt=null, effectiveWorkdayEndAt=min(now,dayEnd), warning workday_timer_open', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T08:00:00Z', stoppedAt: null },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
    nowIso: '2026-05-15T14:30:00Z',
  });
  assertEquals(env.timerStoppedAt, null);
  assertEquals(env.effectiveWorkdayEndAt, '2026-05-15T14:30:00.000Z');
  assertEquals(env.endSource, 'now');
  assert(env.warnings.includes('workday_timer_open'));
  assertEquals(env.isOpen, true);
});

// ── Fall 3 ───────────────────────────────────────────────────────────────
Deno.test('3.11E#3 — supplier utan assignment → no_assignment_required, inga gamla warnings', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T08:00:00Z', stoppedAt: '2026-05-15T17:00:00Z' },
    analysisWindowStartIso: DAY_START, analysisWindowEndIso: DAY_END,
  });
  const r = runWithEnvelope(env, [siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'supplier')]);
  const seg = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assert(seg, 'supplier_visit segment saknas');
  assertEquals(seg.assignmentStatus, 'no_assignment_required');
  assertEquals(seg.assignmentMatch, 'not_required');
  assert(!seg.warnings.includes('supplier_visit_no_assignment' as any));
});

// ── Fall 4 ───────────────────────────────────────────────────────────────
Deno.test('3.11E#4 — warehouse utan assignment → no_assignment_required', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T08:00:00Z', stoppedAt: '2026-05-15T17:00:00Z' },
    analysisWindowStartIso: DAY_START, analysisWindowEndIso: DAY_END,
  });
  const r = runWithEnvelope(env, [siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'warehouse', { status: 'warehouse_presence' })]);
  const seg = r.segments.find((s) => s.allocationType === 'warehouse_work')!;
  assert(seg, 'warehouse_work segment saknas');
  assertEquals(seg.assignmentStatus, 'no_assignment_required');
  assertEquals(seg.assignmentMatch, 'not_required');
  assert(!seg.warnings.includes('warehouse_presence_no_assignment' as any));
});

// ── Fall 5 ───────────────────────────────────────────────────────────────
Deno.test('3.11E#5 — projekt utan assignment → unassigned_but_present + staff_not_assigned_to_matched_target', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T08:00:00Z', stoppedAt: '2026-05-15T17:00:00Z' },
    analysisWindowStartIso: DAY_START, analysisWindowEndIso: DAY_END,
  });
  for (const tt of ['project', 'booking', 'large_project'] as const) {
    const r = runWithEnvelope(env, [siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', tt, { hasOverlap: false })]);
    const expected = tt === 'project' ? 'project_work' : tt === 'booking' ? 'booking_work' : 'large_project_work';
    const seg = r.segments.find((s) => s.allocationType === expected)!;
    assert(seg, `${tt} segment saknas`);
    assertEquals(seg.assignmentStatus, 'unassigned_but_present');
    assertEquals(seg.assignmentMatch, 'no_overlap');
    assert(seg.warnings.includes('staff_not_assigned_to_matched_target'));
  }
});

// ── Fall 6 ───────────────────────────────────────────────────────────────
Deno.test('3.11E#6 — projekt med assignment → assigned', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T08:00:00Z', stoppedAt: '2026-05-15T17:00:00Z' },
    analysisWindowStartIso: DAY_START, analysisWindowEndIso: DAY_END,
  });
  for (const tt of ['project', 'booking', 'large_project'] as const) {
    const r = runWithEnvelope(env, [siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', tt, { hasOverlap: true })]);
    const expected = tt === 'project' ? 'project_work' : tt === 'booking' ? 'booking_work' : 'large_project_work';
    const seg = r.segments.find((s) => s.allocationType === expected)!;
    assert(seg, `${tt} segment saknas`);
    assertEquals(seg.assignmentStatus, 'assigned');
    assertEquals(seg.assignmentMatch, 'overlap');
    assert(!seg.warnings.includes('staff_not_assigned_to_matched_target'));
  }
});

// ── Fall 7 ───────────────────────────────────────────────────────────────
Deno.test('3.11E#7 — uncovered gap → uncovered_workday_time, inte gap_in_workday', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T08:00:00Z', stoppedAt: '2026-05-15T17:00:00Z' },
    analysisWindowStartIso: DAY_START, analysisWindowEndIso: DAY_END,
  });
  const r = runWithEnvelope(env, [siteSeg('s1', '2026-05-15T11:00:00Z', '2026-05-15T12:00:00Z', 'project', { hasOverlap: true })]);
  const gaps = r.proposals.filter((p) => p.proposalType === 'uncovered_workday_time');
  assert(gaps.length > 0, 'uncovered_workday_time saknas');
  // Gamla warnings/proposals får inte finnas kvar.
  assert(!r.diagnostics.warnings.includes('gap_in_workday' as any), 'gammal gap_in_workday-warning finns kvar');
  for (const p of r.proposals) {
    assert(p.proposalType !== ('gap_in_workday' as any), 'gammal gap_in_workday-proposal finns kvar');
  }
});

// ── Slutkontroll: gamla värden + warnings finns inte i union ─────────────
Deno.test('3.11E#audit — gamla assignmentStatus & warnings finns inte i union', async () => {
  const src = await Deno.readTextFile(new URL('./buildWorkdayAllocationFromLocationTruth.ts', import.meta.url));
  // Hitta WARNING_TYPES-arrayblocket
  const warnArr = src.match(/WARNING_TYPES:[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
  for (const w of ['supplier_visit_no_assignment', 'warehouse_presence_no_assignment', 'gap_in_workday']) {
    assert(!warnArr.includes(`'${w}'`), `gammal warning ${w} finns kvar i WARNING_TYPES`);
  }
  // Hitta WorkdayAllocationAssignmentStatus-union
  const statusUnion = src.match(/WorkdayAllocationAssignmentStatus\s*=\s*([\s\S]*?);/)?.[1] ?? '';
  for (const s of ['assigned_overlap', 'assigned_no_overlap', "'no_assignment'"]) {
    assert(!statusUnion.includes(s), `gammalt assignmentStatus-värde ${s} finns kvar i union`);
  }
});
