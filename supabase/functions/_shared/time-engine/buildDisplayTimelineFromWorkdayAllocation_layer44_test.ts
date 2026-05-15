/**
 * Lager 4.4 — Användar-actions på display-block.
 *
 * Verifierar att rätt actions genereras med rätt actionType, severity,
 * requiresAiValidation och requiresUserNote enligt Lager 4.4-spec.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildDisplayTimelineFromWorkdayAllocation,
  type DisplayTimelineAction,
  type DisplayTimelineActionType,
  type DisplayTimelineResult,
} from './buildDisplayTimelineFromWorkdayAllocation.ts';
import type {
  WorkdayAllocationProposal,
  WorkdayAllocationResult,
  WorkdayAllocationSegment,
} from './buildWorkdayAllocationFromLocationTruth.ts';

function seg(over: Partial<WorkdayAllocationSegment>): WorkdayAllocationSegment {
  return {
    id: 'wda_x',
    startAt: '2026-05-15T08:00:00Z',
    endAt: '2026-05-15T09:00:00Z',
    sourceLocationTruthSegmentIds: ['lt_x'],
    allocationType: 'project_work',
    targetType: 'project',
    targetId: 'p1',
    label: 'Acme Project',
    address: 'Sveavägen 1',
    confidence: 'high',
    warnings: [],
    assignmentStatus: 'assigned',
    assignmentMatch: 'overlap',
    businessContextStatus: null,
    ...over,
  };
}

function wda(segments: WorkdayAllocationSegment[], proposals: WorkdayAllocationProposal[] = []): WorkdayAllocationResult {
  return {
    segments,
    proposals,
    diagnostics: { staffId: 'staff-1', date: '2026-05-15' } as any,
  };
}

function run(r: WorkdayAllocationResult): DisplayTimelineResult {
  return buildDisplayTimelineFromWorkdayAllocation({
    dayEvidence: null,
    locationTruthV2: null,
    workdayAllocation: r,
  });
}

function findAction(actions: DisplayTimelineAction[], t: DisplayTimelineActionType): DisplayTimelineAction | undefined {
  return actions.find((a) => a.actionType === t);
}

// ── Day actions ──────────────────────────────────────────────────────────

Deno.test('Lager 4.4 — dayActions innehåller approve_day, edit_day, add_note', () => {
  const r = run(wda([seg({})]));
  assertEquals(r.dayActions.map((a) => a.actionType), ['approve_day', 'edit_day', 'add_note']);
  const approve = findAction(r.dayActions, 'approve_day')!;
  assertEquals(approve.severity, 'primary');
  assertEquals(approve.requiresAiValidation, false);
  assertEquals(approve.requiresUserNote, false);
  const note = findAction(r.dayActions, 'add_note')!;
  assertEquals(note.requiresUserNote, true);
});

// ── Project utan assignment ──────────────────────────────────────────────

Deno.test('Lager 4.4 — projekt utan assignment ger confirm_worked_here + suggest_assignment_link + add_note', () => {
  const s = seg({ warnings: ['staff_not_assigned_to_matched_target'] });
  const r = run(wda([s]));
  const a = r.blocks[0].actions;
  assert(findAction(a, 'confirm_worked_here'), 'confirm_worked_here');
  const suggest = findAction(a, 'suggest_assignment_link')!;
  assert(suggest, 'suggest_assignment_link');
  assertEquals(suggest.requiresAiValidation, true);
  assert(findAction(a, 'add_note'), 'add_note');
  // Legacy bevarad.
  assert(findAction(a, 'confirm_allocation'), 'legacy confirm_allocation');
});

Deno.test('Lager 4.4 — projekt utan assignment + ai_review_candidate ger request_assignment_link', () => {
  const s = seg({ warnings: ['staff_not_assigned_to_matched_target'] });
  const proposal: WorkdayAllocationProposal = {
    segmentId: 'lt_x',
    proposalType: 'ai_review_candidate',
    startAt: s.startAt,
    endAt: s.endAt,
  } as any;
  const r = run(wda([s], [proposal]));
  const a = r.blocks[0].actions;
  const req = findAction(a, 'request_assignment_link')!;
  assert(req, 'request_assignment_link finns');
  assertEquals(req.requiresAiValidation, true);
  assertEquals(req.severity, 'warning');
  assertEquals(findAction(a, 'suggest_assignment_link'), undefined, 'inte både request och suggest');
});

// ── Unlinked address ─────────────────────────────────────────────────────

Deno.test('Lager 4.4 — unlinked_work_address: link_to_project + mark_as_other_work + add_note', () => {
  const s = seg({ allocationType: 'unlinked_work_address', targetType: null, targetId: null, label: null });
  const r = run(wda([s]));
  const a = r.blocks[0].actions;
  const link = findAction(a, 'link_to_project')!;
  assertEquals(link.requiresAiValidation, true);
  assertEquals(link.severity, 'warning');
  const other = findAction(a, 'mark_as_other_work')!;
  assertEquals(other.requiresUserNote, true);
  assert(findAction(a, 'add_note'));
});

// ── Supplier ─────────────────────────────────────────────────────────────

Deno.test('Lager 4.4 — supplier: link_supplier_visit_to_project + mark_as_pickup/dropoff + add_note', () => {
  const s = seg({ allocationType: 'supplier_visit', targetType: 'supplier', label: 'Cramo' });
  const r = run(wda([s]));
  const a = r.blocks[0].actions;
  const link = findAction(a, 'link_supplier_visit_to_project')!;
  assert(link, 'link_supplier_visit_to_project');
  assertEquals(link.requiresAiValidation, true);
  assert(findAction(a, 'mark_as_pickup'));
  assert(findAction(a, 'mark_as_dropoff'));
  assert(findAction(a, 'add_note'));
});

// ── Private + workday-end-förslag ────────────────────────────────────────

Deno.test('Lager 4.4 — private med suggest_workday_end-proposal: accept/edit/ignore', () => {
  const s = seg({
    allocationType: 'private_time',
    targetType: null,
    targetId: null,
    label: 'Hemma',
    sourceLocationTruthSegmentIds: ['lt_priv'],
  });
  const proposal: WorkdayAllocationProposal = {
    segmentId: 'lt_priv',
    proposalType: 'suggest_workday_end',
    startAt: s.startAt,
    endAt: s.endAt,
  } as any;
  const r = run(wda([s], [proposal]));
  const a = r.blocks[0].actions;
  const accept = findAction(a, 'accept_suggested_workday_end')!;
  assertEquals(accept.severity, 'primary');
  assertEquals(accept.requiresAiValidation, false);
  assert(findAction(a, 'edit_workday_end'));
  const ignore = findAction(a, 'ignore_private_time')!;
  assertEquals(ignore.requiresUserNote, true);
});

Deno.test('Lager 4.4 — private utan workday-end-förslag: inga accept/edit/ignore-actions', () => {
  const s = seg({ allocationType: 'private_time', targetType: null, targetId: null, label: 'Hemma' });
  const r = run(wda([s]));
  const a = r.blocks[0].actions;
  assertEquals(findAction(a, 'accept_suggested_workday_end'), undefined);
  assertEquals(findAction(a, 'edit_workday_end'), undefined);
  assertEquals(findAction(a, 'ignore_private_time'), undefined);
});

// ── Planning ↔ GPS-mismatch ──────────────────────────────────────────────

Deno.test('Lager 4.4 — planning_geo_mismatch: confirm_actual_location + edit_time_block + add_explanation', () => {
  const s = seg({ warnings: ['planning_geo_mismatch'] });
  const r = run(wda([s]));
  const a = r.blocks[0].actions;
  const confirm = findAction(a, 'confirm_actual_location')!;
  assertEquals(confirm.requiresAiValidation, true);
  assertEquals(confirm.requiresUserNote, true);
  assert(findAction(a, 'edit_time_block'));
  const expl = findAction(a, 'add_explanation')!;
  assertEquals(expl.requiresUserNote, true);
});

// ── Action-shape ─────────────────────────────────────────────────────────

Deno.test('Lager 4.4 — alla actions har actionType, label, severity, requiresAiValidation, requiresUserNote', () => {
  const s = seg({ allocationType: 'unlinked_work_address', targetType: null, targetId: null, label: null });
  const r = run(wda([s]));
  const all = [...r.dayActions, ...r.blocks.flatMap((b) => b.actions)];
  assert(all.length > 0);
  for (const a of all) {
    assert(typeof a.actionType === 'string');
    assert(typeof a.type === 'string');
    assertEquals(a.actionType, a.type, 'type ska vara alias för actionType');
    assert(typeof a.label === 'string' && a.label.length > 0);
    assert(typeof a.requiresAiValidation === 'boolean');
    assert(typeof a.requiresUserNote === 'boolean');
    assert(['info', 'primary', 'warning', 'critical'].includes(a.severity));
  }
});

// ── Inga skrivningar / read-only ─────────────────────────────────────────

Deno.test('Lager 4.4 — actions muterar inte input', () => {
  const s = seg({ warnings: ['staff_not_assigned_to_matched_target'] });
  const input = wda([s]);
  const snapshot = JSON.stringify(input);
  run(input);
  assertEquals(JSON.stringify(input), snapshot);
});
