import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cleanupNeedsReviewFromLocationTruth } from '../cleanupNeedsReviewFromLocationTruth.ts';
import type { ReportBlock } from '../buildReportBlocksFromLocationTruth.ts';

function rb(p: Partial<ReportBlock> & { id: string; kind: ReportBlock['kind']; title: string; reviewState: ReportBlock['reviewState'] }): ReportBlock {
  return {
    startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T09:00:00Z',
    category: null, countsAsWork: p.kind === 'work',
    sourceLocationTruthSegmentIds: ['lts1'], sourceTransportSegmentIds: [],
    locationTruthConfidence: 0.9, locationTruthReasons: [],
    resolvedFrom: 'project',
    centerLat: null, centerLng: null,
    ...p,
  } as ReportBlock;
}

Deno.test('cleanup: signal_gap inside same location → ok + warning', () => {
  const block = rb({ id: 'b', kind: 'work', title: 'GOPA', reviewState: 'needs_review' });
  block.locationTruthReasons = ['signal_gap_inside_same_location'];
  const r = cleanupNeedsReviewFromLocationTruth([block]);
  assertEquals(r.blocks[0].reviewState, 'ok');
  assertEquals(r.diagnostics.convertedToWarningCount, 1);
});

Deno.test('cleanup: unknown_place without anchor stays needs_review', () => {
  const block = rb({ id: 'b', kind: 'unknown', title: 'Okänd plats', reviewState: 'needs_review' });
  const r = cleanupNeedsReviewFromLocationTruth([block]);
  assertEquals(r.blocks[0].reviewState, 'needs_review');
  assertEquals(r.diagnostics.unresolvedUnknownCount, 1);
});

Deno.test('cleanup: explicit private_home_conflict kept', () => {
  const block = rb({ id: 'b', kind: 'work', title: 'X', reviewState: 'needs_review' });
  block.locationTruthReasons = ['private_home_conflict'];
  const r = cleanupNeedsReviewFromLocationTruth([block]);
  assertEquals(r.blocks[0].reviewState, 'needs_review');
});

Deno.test('cleanup: medium_confidence + transport<500 + team_label_replaced all downgraded', () => {
  const blocks = [
    rb({ id: 'a', kind: 'work', title: 'A', reviewState: 'needs_review' }),
    rb({ id: 'b', kind: 'transport', title: 'Resa', reviewState: 'needs_review' }),
    rb({ id: 'c', kind: 'work', title: 'C', reviewState: 'needs_review' }),
  ];
  blocks[0].locationTruthReasons = ['medium_confidence'];
  blocks[1].locationTruthReasons = ['below_transport_min_distance'];
  blocks[2].locationTruthReasons = ['team_label_replaced'];
  const r = cleanupNeedsReviewFromLocationTruth(blocks);
  assertEquals(r.diagnostics.needsReviewBefore, 3);
  assertEquals(r.diagnostics.convertedToWarningCount, 3);
  assertEquals(r.diagnostics.needsReviewAfter, 0);
  for (const b of r.blocks) assert((b as any).warningReasons?.length > 0);
});
