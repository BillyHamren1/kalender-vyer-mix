// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeGpsEvidence } from './normalizeGpsEvidence.ts';

const ts = (i: number) => new Date(Date.UTC(2026, 4, 15, 8, 0, i)).toISOString();

Deno.test('normalizeGpsEvidence: ping with accuracy 500m is kept as weak', () => {
  const r = normalizeGpsEvidence([{ id: '1', recorded_at: ts(0), lat: 59.3, lng: 18.0, accuracy: 500 }]);
  assertEquals(r.normalizedPings.length, 1);
  assertEquals(r.normalizedPings[0].accuracyQuality, 'weak');
  assertEquals(r.normalizedPings[0].hardRejected, false);
  assertEquals(r.diagnostics.weakCount, 1);
  assertEquals(r.diagnostics.retainedLowAccuracyCount, 1);
  assert(r.normalizedPings[0].confidenceWeight < 1 && r.normalizedPings[0].confidenceWeight > 0);
});

Deno.test('normalizeGpsEvidence: ping with accuracy 1500m is kept as very_weak', () => {
  const r = normalizeGpsEvidence([{ id: '2', recorded_at: ts(1), lat: 59.3, lng: 18.0, accuracy: 1500 }]);
  assertEquals(r.normalizedPings.length, 1);
  assertEquals(r.normalizedPings[0].accuracyQuality, 'very_weak');
  assertEquals(r.diagnostics.veryWeakCount, 1);
  assertEquals(r.diagnostics.retainedLowAccuracyCount, 1);
});

Deno.test('normalizeGpsEvidence: ping > 2000m flagged as outlier_candidate but still retained', () => {
  const r = normalizeGpsEvidence([{ id: '3', recorded_at: ts(2), lat: 59.3, lng: 18.0, accuracy: 5000 }]);
  assertEquals(r.normalizedPings.length, 1);
  assertEquals(r.normalizedPings[0].accuracyQuality, 'outlier_candidate');
  assertEquals(r.diagnostics.outlierCandidateCount, 1);
});

Deno.test('normalizeGpsEvidence: ping without lat/lng hard rejected', () => {
  const r = normalizeGpsEvidence([
    { id: 'a', recorded_at: ts(3), lat: null, lng: 18.0 },
    { id: 'b', recorded_at: ts(4), lat: 59.3, lng: undefined },
  ]);
  assertEquals(r.normalizedPings.length, 0);
  assertEquals(r.hardRejectedPings.length, 2);
  assertEquals(r.hardRejectedPings[0].reason, 'missing_lat_or_lng');
});

Deno.test('normalizeGpsEvidence: NaN coords hard rejected', () => {
  const r = normalizeGpsEvidence([{ id: 'n', recorded_at: ts(5), lat: 'abc' as any, lng: 18.0 }]);
  assertEquals(r.normalizedPings.length, 0);
  assertEquals(r.hardRejectedPings[0].reason, 'lat_or_lng_nan');
});

Deno.test('normalizeGpsEvidence: out-of-range coords hard rejected', () => {
  const r = normalizeGpsEvidence([{ id: 'x', recorded_at: ts(6), lat: 200, lng: 18.0 }]);
  assertEquals(r.hardRejectedPings[0].reason, 'lat_or_lng_out_of_range');
});

Deno.test('normalizeGpsEvidence: invalid timestamp hard rejected', () => {
  const r = normalizeGpsEvidence([
    { id: 'm', recorded_at: null, lat: 59.3, lng: 18.0 },
    { id: 'm2', recorded_at: 'not-a-date', lat: 59.3, lng: 18.0 },
  ]);
  assertEquals(r.normalizedPings.length, 0);
  assertEquals(r.hardRejectedPings.length, 2);
  assertEquals(r.hardRejectedPings[0].reason, 'missing_timestamp');
  assertEquals(r.hardRejectedPings[1].reason, 'unparsable_timestamp');
});

Deno.test('normalizeGpsEvidence: no pings dropped solely for accuracy > 200', () => {
  const accs = [30, 100, 200, 250, 400, 700, 1200, 3000];
  const rows = accs.map((a, i) => ({ id: String(i), recorded_at: ts(i), lat: 59.3, lng: 18.0, accuracy: a }));
  const r = normalizeGpsEvidence(rows);
  // ALL retained — none rejected for accuracy alone
  assertEquals(r.normalizedPings.length, accs.length);
  assertEquals(r.hardRejectedPings.length, 0);
  assertEquals(r.diagnostics.normalizedPingCount, accs.length);
  // Median + p90 populated
  assert(r.diagnostics.medianAccuracyMeters !== null);
  assert(r.diagnostics.p90AccuracyMeters !== null);
});

Deno.test('normalizeGpsEvidence: classification thresholds', () => {
  const rows = [
    { recorded_at: ts(0), lat: 59, lng: 18, accuracy: 50 },   // excellent
    { recorded_at: ts(1), lat: 59, lng: 18, accuracy: 150 },  // good
    { recorded_at: ts(2), lat: 59, lng: 18, accuracy: 300 },  // usable
    { recorded_at: ts(3), lat: 59, lng: 18, accuracy: 800 },  // weak
    { recorded_at: ts(4), lat: 59, lng: 18, accuracy: 2000 }, // very_weak
    { recorded_at: ts(5), lat: 59, lng: 18, accuracy: 2001 }, // outlier_candidate
    { recorded_at: ts(6), lat: 59, lng: 18, accuracy: null }, // unknown
  ];
  const r = normalizeGpsEvidence(rows);
  assertEquals(r.diagnostics.excellentCount, 1);
  assertEquals(r.diagnostics.goodCount, 1);
  assertEquals(r.diagnostics.usableCount, 1);
  assertEquals(r.diagnostics.weakCount, 1);
  assertEquals(r.diagnostics.veryWeakCount, 1);
  assertEquals(r.diagnostics.outlierCandidateCount, 1);
  assertEquals(r.qualityCounts.unknown, 1);
});
