/**
 * Lager 2.4 tests — försiktig gap-policy.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { bridgeSignalGaps } from './bridgeSignalGaps.ts';
import type { LocationTruthSegment } from './buildLocationTruthFromDayEvidence.ts';

function seg(opts: {
  id: string;
  start: string;
  end: string;
  type?: LocationTruthSegment['type'];
  targetId?: string;
  targetType?: 'project' | 'large_project' | 'booking' | 'warehouse' | 'supplier' | 'organization_location' | 'private_zone';
  lat?: number;
  lng?: number;
}): LocationTruthSegment {
  return {
    id: opts.id,
    staffId: 's1',
    startAt: opts.start,
    endAt: opts.end,
    type: opts.type ?? 'known_target',
    matchedTarget: opts.targetId
      ? {
          targetType: opts.targetType ?? 'project',
          targetId: opts.targetId,
          label: opts.targetId,
        }
      : undefined,
    physicalLocation: {
      lat: opts.lat ?? 59.0,
      lng: opts.lng ?? 18.0,
      source: 'centroid',
      confidence: 'medium',
    },
    confidence: 'medium',
    evidence: { pingCount: 5 },
    warnings: [], finalType: 'unresolved_location' as any,
    diagnostics: {},
  };
}

Deno.test('A. Same target 15 min gap → silent bridge, ett segment', () => {
  const a = seg({ id: 'A', start: '2026-05-15T08:00:00Z', end: '2026-05-15T09:00:00Z', targetId: 'P1' });
  const b = seg({ id: 'B', start: '2026-05-15T09:15:00Z', end: '2026-05-15T10:00:00Z', targetId: 'P1' });
  const r = bridgeSignalGaps([a, b]);
  assertEquals(r.segments.length, 1);
  assertEquals(r.segments[0].diagnostics.bridgedSignalGapMinutes, 15);
  assert(!r.segments[0].warnings.includes('signal_gap_bridged'));
  assert(!r.segments[0].warnings.includes('long_signal_gap'));
  assertEquals(r.diagnostics.gapsBridgedSameTarget, 1);
});

Deno.test('B. Same target 2h gap → bridged + signal_gap_bridged warning', () => {
  const a = seg({ id: 'A', start: '2026-05-15T08:00:00Z', end: '2026-05-15T09:00:00Z', targetId: 'P1' });
  const b = seg({ id: 'B', start: '2026-05-15T11:00:00Z', end: '2026-05-15T12:00:00Z', targetId: 'P1' });
  const r = bridgeSignalGaps([a, b]);
  assertEquals(r.segments.length, 1);
  assert(r.segments[0].warnings.includes('signal_gap_bridged'));
  assertEquals(r.segments[0].diagnostics.bridgedSignalGapMinutes, 120);
});

Deno.test('C. Same target 4h gap → bridged + long_signal_gap', () => {
  const a = seg({ id: 'A', start: '2026-05-15T08:00:00Z', end: '2026-05-15T09:00:00Z', targetId: 'P1' });
  const b = seg({ id: 'B', start: '2026-05-15T13:00:00Z', end: '2026-05-15T14:00:00Z', targetId: 'P1' });
  const r = bridgeSignalGaps([a, b]);
  assertEquals(r.segments.length, 1);
  assert(r.segments[0].warnings.includes('long_signal_gap'));
  assertEquals(r.diagnostics.longGapsBridged, 1);
});

Deno.test('D. Target A → Target B: ingen bridge, transition_candidate markerat', () => {
  const a = seg({ id: 'A', start: '2026-05-15T08:00:00Z', end: '2026-05-15T09:00:00Z', targetId: 'P1' });
  const b = seg({ id: 'B', start: '2026-05-15T09:30:00Z', end: '2026-05-15T10:30:00Z', targetId: 'P2' });
  const r = bridgeSignalGaps([a, b]);
  assertEquals(r.segments.length, 2);
  assert(r.segments[0].warnings.includes('transition_candidate'));
  assert(r.segments[1].warnings.includes('transition_candidate'));
  assertEquals(r.diagnostics.transitionCandidatesMarked, 1);
  // Ingen transport ska skapas i Lager 2.4.
  for (const s of r.segments) assert(s.type !== 'movement');
});

Deno.test('E. Outlier i mitten + same target före/efter → outlier absorberas, ett segment', () => {
  const a = seg({ id: 'A', start: '2026-05-15T08:00:00Z', end: '2026-05-15T09:00:00Z', targetId: 'P1' });
  const outlier = seg({
    id: 'O',
    start: '2026-05-15T09:05:00Z',
    end: '2026-05-15T09:08:00Z',
    type: 'unresolved_location',
  });
  const b = seg({ id: 'B', start: '2026-05-15T09:20:00Z', end: '2026-05-15T10:00:00Z', targetId: 'P1' });
  const r = bridgeSignalGaps([a, outlier, b]);
  assertEquals(r.segments.length, 1);
  assertEquals(r.diagnostics.outliersAbsorbed, 1);
});

Deno.test('F. private_residence emellan jobbpass → bryt, ingen bridge', () => {
  const a = seg({ id: 'A', start: '2026-05-15T08:00:00Z', end: '2026-05-15T11:00:00Z', targetId: 'P1' });
  const home = seg({
    id: 'H',
    start: '2026-05-15T11:30:00Z',
    end: '2026-05-15T17:00:00Z',
    type: 'private_residence',
  });
  const b = seg({ id: 'B', start: '2026-05-15T17:30:00Z', end: '2026-05-15T19:00:00Z', targetId: 'P1' });
  const r = bridgeSignalGaps([a, home, b]);
  assertEquals(r.segments.length, 3);
  assertEquals(r.diagnostics.gapsThatCausedBreak >= 1, true);
});

Deno.test('known_address: nära centroid bridgeas, långt bort gör inte', () => {
  const a = seg({
    id: 'A',
    start: '2026-05-15T08:00:00Z',
    end: '2026-05-15T09:00:00Z',
    type: 'known_address',
    lat: 59.0,
    lng: 18.0,
  });
  const b = seg({
    id: 'B',
    start: '2026-05-15T09:20:00Z',
    end: '2026-05-15T10:00:00Z',
    type: 'known_address',
    lat: 59.00005,
    lng: 18.00005,
  });
  const r = bridgeSignalGaps([a, b]);
  assertEquals(r.segments.length, 1);
});
