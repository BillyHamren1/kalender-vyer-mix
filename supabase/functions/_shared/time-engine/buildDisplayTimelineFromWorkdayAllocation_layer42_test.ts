/**
 * Lager 4.2 — Konsolideringstester för Display Timeline.
 *
 * Verifierar:
 *   A. Merge-regler: samma allocationType+target+label+address slås ihop
 *      även med ett mindre gap (≤30 min) — absorbedGapCount räknas
 *   B. Gap-hantering: korta uncovered_workday_time döljs, långa visas mjukt
 *   C. Antal block före/efter
 *   D. Korta supplier vikts in i grannprojekt via linkedProjectCandidate
 *   E. Korta travel mellan samma projekt vikts in
 *   F. Trailing private kollapsas till ett "Hemma"-block med action
 *   G. Diagnostics-fält finns
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

Deno.test('4.2 A — samma projekt med 15 min gap absorberas till 1 block', () => {
  const segs = [
    seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:00:00Z' }),
    seg({ id: 'b', startAt: '2026-05-15T09:15:00Z', endAt: '2026-05-15T10:00:00Z' }),
  ];
  const r = run(wda(segs));
  assertEquals(r.diagnostics.inputAllocationSegmentCount, 2);
  assertEquals(r.blocks.length, 1, 'ETT block efter konsolidering');
  assertEquals(r.diagnostics.outputDisplayBlockCount, 1);
  assertEquals(r.diagnostics.absorbedGapCount, 1);
  assertEquals(r.blocks[0].metadata.absorbedGapMinutes, 15);
});

Deno.test('4.2 A — olika label på samma projekt → INTE merge (label ingår i nyckeln)', () => {
  const segs = [
    seg({ id: 'a', label: 'Acme Project', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:00:00Z' }),
    seg({ id: 'b', label: 'Acme Project — fas 2', startAt: '2026-05-15T09:01:00Z', endAt: '2026-05-15T10:00:00Z' }),
  ];
  const r = run(wda(segs));
  assertEquals(r.blocks.length, 2);
});

Deno.test('4.2 B — kort uncovered gap (≤10 min) döljs från huvudvyn', () => {
  const segs = [seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:00:00Z' })];
  const proposals: WorkdayAllocationProposal[] = [
    {
      proposalType: 'uncovered_workday_time',
      segmentId: 'gap',
      startAt: '2026-05-15T09:00:00Z',
      endAt: '2026-05-15T09:05:00Z',
    } as any,
  ];
  const r = run(wda(segs, proposals));
  assertEquals(r.blocks.length, 1, 'kort gap visas inte som block');
  assertEquals(r.diagnostics.hiddenTechnicalWarningCount >= 1, true);
});

Deno.test('TE4 — gap 11–30 min vikts in i föregående block (ingen review)', () => {
  const segs = [seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:00:00Z' })];
  const proposals: WorkdayAllocationProposal[] = [
    {
      proposalType: 'uncovered_workday_time',
      segmentId: 'gap',
      startAt: '2026-05-15T09:00:00Z',
      endAt: '2026-05-15T09:25:00Z',
    } as any,
  ];
  const r = run(wda(segs, proposals));
  // Inget gap-block ska skapas — vikt in på 'a'.
  const gapBlock = r.blocks.find((b) => b.displayType === 'break_or_gap');
  assertEquals(gapBlock, undefined, 'kort gap ska INTE bli huvudblock');
  const host = r.blocks.find((b) => b.id.includes('_a'));
  assert(host, 'host-block för "a" ska finnas');
  assertEquals(host!.metadata.absorbedGapMinutes, 25);
  assert(host!.humanWarnings.some((w) => /Signalbortfall/.test(w)));
});

Deno.test('4.2 D — kort supplier (10 min) med linkedProjectCandidate vikts in i grannprojektet', () => {
  const segs = [
    seg({ id: 'p1', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
    seg({
      id: 'sup',
      allocationType: 'supplier_visit',
      targetType: 'organization_location',
      targetId: 'sup1',
      label: 'Bauhaus',
      address: 'Hammarby 5',
      startAt: '2026-05-15T10:05:00Z',
      endAt: '2026-05-15T10:15:00Z',
      linkedProjectCandidate: {
        targetType: 'project',
        targetId: 'p1',
        label: 'Acme Project',
        source: 'overlapping_assignment',
        confidence: 'high',
      },
    }),
    seg({ id: 'p1b', startAt: '2026-05-15T10:20:00Z', endAt: '2026-05-15T12:00:00Z' }),
  ];
  const r = run(wda(segs));
  // Supplier ska vara vikt in, men de två projektsegmenten kan ha mergats också.
  const projectBlocks = r.blocks.filter((b) => b.displayType === 'project');
  assertEquals(r.blocks.find((b) => b.displayType === 'supplier'), undefined,
    'supplier-block ska inte finnas kvar');
  assert(projectBlocks.some((b) => b.metadata.absorbedSupplierVisits.length >= 1),
    'supplier ska finnas i absorbedSupplierVisits');
});

Deno.test('4.2 E — kort travel mellan samma projekt vikts in i föregående block', () => {
  const segs = [
    seg({ id: 'p1', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
    seg({
      id: 'tr',
      allocationType: 'work_travel',
      targetType: null,
      targetId: null,
      label: null,
      address: null,
      startAt: '2026-05-15T10:00:00Z',
      endAt: '2026-05-15T10:05:00Z',
    }),
    seg({ id: 'p1b', startAt: '2026-05-15T10:05:00Z', endAt: '2026-05-15T12:00:00Z' }),
  ];
  const r = run(wda(segs));
  assertEquals(r.blocks.find((b) => b.displayType === 'travel'), undefined,
    'kort travel ska inte vara eget block');
  const project = r.blocks.find((b) => b.displayType === 'project');
  assert(project);
  assertEquals(project!.metadata.absorbedTravelSegments.length, 1);
});

Deno.test('4.2 F — trailing private kollapsas till "Hemma" med action', () => {
  const segs = [
    seg({ id: 'p1', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T16:00:00Z' }),
    seg({
      id: 'h1',
      allocationType: 'private_time',
      targetType: 'private_zone',
      targetId: 'home',
      label: 'Hem',
      address: 'Hem 1',
      startAt: '2026-05-15T16:30:00Z',
      endAt: '2026-05-15T18:00:00Z',
    }),
    seg({
      id: 'h2',
      allocationType: 'private_time',
      targetType: 'private_zone',
      targetId: 'home',
      label: 'Hem',
      address: 'Hem 1',
      startAt: '2026-05-15T19:00:00Z',
      endAt: '2026-05-15T22:00:00Z',
    }),
  ];
  const r = run(wda(segs));
  const privates = r.blocks.filter((b) => b.displayType === 'private');
  assertEquals(privates.length, 1, 'trailing private kollapsas till ETT block');
  assertEquals(privates[0].title, 'Hemma');
  assert(privates[0].actions.find((a) => a.type === 'open_correction_dialog'));
});

Deno.test('4.2 G — diagnostics innehåller alla nya fält', () => {
  const r = run(wda([seg({ id: 'a' })]));
  assertEquals(typeof r.diagnostics.inputAllocationSegmentCount, 'number');
  assertEquals(typeof r.diagnostics.outputDisplayBlockCount, 'number');
  assertEquals(typeof r.diagnostics.mergedSegmentCount, 'number');
  assertEquals(typeof r.diagnostics.absorbedGapCount, 'number');
  assertEquals(typeof r.diagnostics.hiddenTechnicalWarningCount, 'number');
  assert(Array.isArray(r.diagnostics.examples));
});

Deno.test('4.2 C — många small-segment blir få block', () => {
  // 6 segment på samma projekt, alla med 1-min gap mellan
  const segs: WorkdayAllocationSegment[] = [];
  let t = Date.parse('2026-05-15T08:00:00Z');
  for (let i = 0; i < 6; i++) {
    const startAt = new Date(t).toISOString();
    const endAt = new Date(t + 10 * 60_000).toISOString();
    segs.push(seg({ id: `s${i}`, startAt, endAt }));
    t += 11 * 60_000; // 1 min gap
  }
  const r = run(wda(segs));
  assertEquals(r.diagnostics.inputAllocationSegmentCount, 6);
  assertEquals(r.blocks.length, 1, 'Alla 6 segment slås ihop till 1');
});
