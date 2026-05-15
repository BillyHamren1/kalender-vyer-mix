/**
 * Lager 4.3 — Svenska rubriker + warning-texter.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildDisplayTimelineFromWorkdayAllocation,
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
    label: 'Acme',
    address: 'Sveavägen 1',
    confidence: 'high',
    warnings: [],
    assignmentStatus: 'assigned',
    assignmentMatch: 'overlap',
    businessContextStatus: null,
    ...over,
  };
}

function wda(
  segments: WorkdayAllocationSegment[],
  proposals: WorkdayAllocationProposal[] = [],
): WorkdayAllocationResult {
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

// ── Rubriker ─────────────────────────────────────────────────────────────

Deno.test('4.3 large_project utan fas → "Projektarbete — {namn}"', () => {
  const r = run(wda([seg({ allocationType: 'large_project_work', targetType: 'large_project', label: 'Mässa 2026' })]));
  assertEquals(r.blocks[0].title, 'Projektarbete — Mässa 2026');
});

Deno.test('4.3 large_project med fas RIGG → "RIGG — {namn}"', () => {
  const r = run(wda([seg({
    allocationType: 'large_project_work', targetType: 'large_project',
    label: 'Mässa 2026 - Rigg',
  })]));
  assertEquals(r.blocks[0].title, 'RIGG — Mässa 2026');
});

Deno.test('4.3 large_project med fas EVENT → "EVENT — {namn}"', () => {
  const r = run(wda([seg({
    allocationType: 'large_project_work', targetType: 'large_project',
    label: 'Mässa 2026 (Event)',
  })]));
  assertEquals(r.blocks[0].title, 'EVENT — Mässa 2026');
});

Deno.test('4.3 large_project med fas RIGDOWN → "RIGDOWN — {namn}"', () => {
  const r = run(wda([seg({
    allocationType: 'large_project_work', targetType: 'large_project',
    label: 'Mässa 2026 - Rigdown',
  })]));
  assertEquals(r.blocks[0].title, 'RIGDOWN — Mässa 2026');
});

Deno.test('4.3 project_work → "Projektarbete — {namn}"', () => {
  const r = run(wda([seg({ allocationType: 'project_work', label: 'Acme Project' })]));
  assertEquals(r.blocks[0].title, 'Projektarbete — Acme Project');
});

Deno.test('4.3 booking_work → "Bokning — {namn}"', () => {
  const r = run(wda([seg({
    allocationType: 'booking_work', targetType: 'booking', label: 'BOK-123',
  })]));
  assertEquals(r.blocks[0].title, 'Bokning — BOK-123');
});

Deno.test('4.3 warehouse → "Lager", subtitle = adress', () => {
  const r = run(wda([seg({
    allocationType: 'warehouse_work', targetType: 'warehouse',
    label: 'Huvudlager', address: 'Lagervägen 5',
  })]));
  assertEquals(r.blocks[0].title, 'Lager');
  assert(r.blocks[0].subtitle?.includes('Lagervägen 5'));
});

Deno.test('4.3 supplier_visit → "Leverantörsbesök — {namn}"', () => {
  const r = run(wda([seg({
    allocationType: 'supplier_visit', targetType: 'organization_location',
    label: 'Bauhaus', address: 'Hammarby 5',
  })]));
  assertEquals(r.blocks[0].title, 'Leverantörsbesök — Bauhaus');
});

Deno.test('4.3 supplier_visit med linkedProjectCandidate → subtitle "Trolig koppling: ..."', () => {
  const r = run(wda([seg({
    allocationType: 'supplier_visit', targetType: 'organization_location',
    label: 'Bauhaus', address: 'Hammarby 5',
    linkedProjectCandidate: {
      targetType: 'project', targetId: 'p1', label: 'Acme Project',
      source: 'overlapping_assignment', confidence: 'high',
    },
  })]));
  assert(r.blocks[0].subtitle?.includes('Trolig koppling: Acme Project'),
    `Förväntar "Trolig koppling: Acme Project" i subtitle, fick: ${r.blocks[0].subtitle}`);
});

Deno.test('4.3 work_travel → "Arbetsresa"', () => {
  const r = run(wda([seg({
    allocationType: 'work_travel', targetType: null, targetId: null, label: null, address: null,
  })]));
  assertEquals(r.blocks[0].title, 'Arbetsresa');
});

Deno.test('4.3 commute mellan bostad och arbete → "Resa till arbete"', () => {
  const r = run(wda([
    seg({ id: 'c', allocationType: 'commute_travel', targetType: null, targetId: null, label: null, address: null,
      startAt: '2026-05-15T07:00:00Z', endAt: '2026-05-15T07:30:00Z' }),
    seg({ id: 'p', allocationType: 'project_work', label: 'Acme',
      startAt: '2026-05-15T07:30:00Z', endAt: '2026-05-15T16:00:00Z' }),
  ]));
  const commute = r.blocks.find((b) => b.displayType === 'commute');
  assertEquals(commute?.title, 'Resa till arbete');
});

Deno.test('4.3 commute efter arbete → "Hemresa"', () => {
  const r = run(wda([
    seg({ id: 'p', allocationType: 'project_work', label: 'Acme',
      startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T16:00:00Z' }),
    seg({ id: 'c', allocationType: 'commute_travel', targetType: null, targetId: null, label: null, address: null,
      startAt: '2026-05-15T16:00:00Z', endAt: '2026-05-15T16:30:00Z' }),
  ]));
  const commute = r.blocks.find((b) => b.displayType === 'commute');
  assertEquals(commute?.title, 'Hemresa');
});

Deno.test('4.3 unlinked_work_address → "Arbete på okopplad adress"', () => {
  const r = run(wda([seg({
    allocationType: 'unlinked_work_address', targetType: null, targetId: null,
    label: null, address: 'Okänd gatan 1',
  })]));
  assertEquals(r.blocks[0].title, 'Arbete på okopplad adress');
  assert(r.blocks[0].subtitle?.includes('Okänd gatan 1'));
});

Deno.test('4.3 private_time → "Hemma"', () => {
  const r = run(wda([seg({
    allocationType: 'private_time', targetType: 'private_zone',
    label: 'Hem', address: 'Hem 1',
  })]));
  assertEquals(r.blocks[0].title, 'Hemma');
});

Deno.test('4.3 needs_work_allocation_review → "Behöver kontrolleras"', () => {
  const r = run(wda([seg({
    allocationType: 'needs_work_allocation_review',
    targetType: null, targetId: null, label: null,
  })]));
  assertEquals(r.blocks[0].title, 'Behöver kontrolleras');
});

// ── humanWarnings ────────────────────────────────────────────────────────

Deno.test('4.3 staff_not_assigned_to_matched_target → svensk text', () => {
  const r = run(wda([seg({ warnings: ['staff_not_assigned_to_matched_target'] })]));
  assert(r.blocks[0].humanWarnings.includes('Du var på plats men saknade assignment.'));
});

Deno.test('4.3 planning_geo_mismatch → svensk text', () => {
  const r = run(wda([seg({ warnings: ['planning_geo_mismatch'] })]));
  assert(r.blocks[0].humanWarnings.includes('Planeringen säger annan plats än GPS.'));
});

Deno.test('4.3 supplier_visit_without_project_context → svensk text', () => {
  const r = run(wda([seg({
    allocationType: 'supplier_visit', targetType: 'organization_location',
    label: 'Bauhaus', warnings: ['supplier_visit_without_project_context'],
  })]));
  assert(r.blocks[0].humanWarnings.includes('Leverantörsbesöket saknar tydlig projektkoppling.'));
});

Deno.test('4.3 inga warnings → tom humanWarnings', () => {
  const r = run(wda([seg({ warnings: [] })]));
  assertEquals(r.blocks[0].humanWarnings, []);
});
