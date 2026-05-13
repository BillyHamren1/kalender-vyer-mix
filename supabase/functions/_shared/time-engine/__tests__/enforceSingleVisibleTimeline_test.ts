import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enforceSingleVisibleTimeline } from '../enforceSingleVisibleTimeline.ts';
import type { ReportBlock } from '../buildReportBlocksFromLocationTruth.ts';

function rb(p: Partial<ReportBlock> & { id: string; startAt: string; endAt: string; kind: ReportBlock['kind']; title: string }): ReportBlock {
  return {
    category: null, countsAsWork: p.kind === 'work', reviewState: 'ok',
    sourceLocationTruthSegmentIds: ['lts1'], sourceTransportSegmentIds: [],
    locationTruthConfidence: 0.9, locationTruthReasons: [],
    resolvedFrom: 'project',
    centerLat: null, centerLng: null,
    ...p,
  } as ReportBlock;
}

Deno.test('single timeline: no overlap → unchanged', () => {
  const blocks = [
    rb({ id: 'a', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T10:00:00Z', kind: 'work', title: 'A' }),
    rb({ id: 'b', startAt: '2025-01-01T10:00:00Z', endAt: '2025-01-01T12:00:00Z', kind: 'work', title: 'B' }),
  ];
  const r = enforceSingleVisibleTimeline(blocks);
  assertEquals(r.diagnostics.overlapsDetectedCount, 0);
  assertEquals(r.diagnostics.remainingOverlapsCount, 0);
  assertEquals(r.blocks.length, 2);
});

Deno.test('single timeline: same place merges into one block', () => {
  const blocks = [
    rb({ id: 'a', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T10:00:00Z', kind: 'work', title: 'GOPA' }),
    rb({ id: 'b', startAt: '2025-01-01T09:30:00Z', endAt: '2025-01-01T11:00:00Z', kind: 'work', title: 'GOPA' }),
  ];
  const r = enforceSingleVisibleTimeline(blocks);
  assertEquals(r.blocks.length, 1);
  assertEquals(r.blocks[0].endAt, '2025-01-01T11:00:00Z');
  assert(r.diagnostics.overlapsResolvedCount >= 1);
});

Deno.test('single timeline: synthetic active timer block absorbed by real work', () => {
  const synthetic = rb({ id: 's', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T16:00:00Z',
    kind: 'work', title: 'Arbete – okänd plats' });
  synthetic.resolvedFrom = 'fallback';
  synthetic.sourceLocationTruthSegmentIds = [];
  const real = rb({ id: 'r', startAt: '2025-01-01T09:00:00Z', endAt: '2025-01-01T15:00:00Z',
    kind: 'work', title: 'Swedish Game Fair' });
  const r = enforceSingleVisibleTimeline([synthetic, real]);
  // Real wins / synthetic absorbed
  assert(r.blocks.find((b) => b.title === 'Swedish Game Fair'));
  assert(!r.blocks.find((b) => b.title === 'Arbete – okänd plats'));
});

Deno.test('single timeline: transport never parallel with work', () => {
  const blocks = [
    rb({ id: 'w', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T10:00:00Z', kind: 'work', title: 'A' }),
    rb({ id: 't', startAt: '2025-01-01T09:30:00Z', endAt: '2025-01-01T10:30:00Z', kind: 'transport', title: 'Resa' }),
  ];
  const r = enforceSingleVisibleTimeline(blocks);
  // Transport klippt så den börjar vid work.endAt
  const t = r.blocks.find((b) => b.kind === 'transport')!;
  assertEquals(t.startAt, '2025-01-01T10:00:00Z');
  assertEquals(r.diagnostics.remainingOverlapsCount, 0);
});

Deno.test('single timeline: invariant block[i].endAt <= block[i+1].startAt holds', () => {
  const blocks = [
    rb({ id: 'a', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T10:00:00Z', kind: 'work', title: 'A' }),
    rb({ id: 'b', startAt: '2025-01-01T09:00:00Z', endAt: '2025-01-01T11:00:00Z', kind: 'unknown', title: 'Okänd plats' }),
    rb({ id: 'c', startAt: '2025-01-01T10:30:00Z', endAt: '2025-01-01T12:00:00Z', kind: 'work', title: 'C' }),
  ];
  const r = enforceSingleVisibleTimeline(blocks);
  for (let i = 0; i + 1 < r.blocks.length; i++) {
    assert(Date.parse(r.blocks[i].endAt) <= Date.parse(r.blocks[i+1].startAt),
      `overlap at ${i}`);
  }
});
