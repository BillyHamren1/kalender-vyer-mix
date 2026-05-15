import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildStableLocationClusters } from './buildStableLocationClusters.ts';
import type { NormalizedGpsPing } from './normalizeGpsEvidence.ts';

function ping(
  id: string,
  tsIso: string,
  lat: number,
  lng: number,
  accuracyM: number | null = 15,
  opts: { ignored?: boolean; weight?: number } = {},
): NormalizedGpsPing {
  return {
    id,
    ts: tsIso,
    lat,
    lng,
    accuracyM,
    speedMps: null,
    accuracyQuality: 'good',
    confidenceWeight: opts.weight ?? 0.9,
    hardRejected: false,
    ignoredForLocationLogic: opts.ignored ?? false,
  };
}

const BASE = '2026-05-15T08:';
function t(min: number, sec = 0): string {
  const m = String(min).padStart(2, '0');
  const s = String(sec).padStart(2, '0');
  return `${BASE}${m}:${s}.000Z`;
}

Deno.test('A: many pings same place → one stable cluster', () => {
  const pings = Array.from({ length: 8 }, (_, i) =>
    ping(`p${i}`, t(i * 2), 59.3293 + i * 0.00001, 18.0686 + i * 0.00001, 12),
  );
  const { clusters, diagnostics } = buildStableLocationClusters(pings);
  assertEquals(clusters.length, 1);
  assert(clusters[0].isStable);
  assertEquals(clusters[0].confidence, 'high');
  assertEquals(diagnostics.stableClusterCount, 1);
  assertEquals(diagnostics.sparseClusterCount, 0);
});

Deno.test('B: low accuracy same area → one cluster, lower confidence', () => {
  const pings = Array.from({ length: 6 }, (_, i) =>
    ping(`p${i}`, t(i * 3), 59.3293 + i * 0.00005, 18.0686, 350, { weight: 0.3 }),
  );
  const { clusters } = buildStableLocationClusters(pings);
  assertEquals(clusters.length, 1);
  assertEquals(clusters[0].confidence, 'low');
  assert(clusters[0].reasons.includes('low_accuracy_signal'));
});

Deno.test('C: ignoredForLocationLogic outlier → not in cluster', () => {
  const pings = [
    ping('p0', t(0), 59.3293, 18.0686),
    ping('p1', t(2), 59.3294, 18.0687),
    ping('p2', t(4), 59.3293, 18.0686),
    // Outlier 3km bort men markerad ignored av Lager 1
    ping('outlier', t(6), 59.36, 18.10, 8, { ignored: true }),
    ping('p3', t(8), 59.3293, 18.0686),
  ];
  const { clusters, diagnostics } = buildStableLocationClusters(pings);
  assertEquals(clusters.length, 1);
  assertEquals(diagnostics.ignoredOutlierPingCount, 1);
  assert(!clusters[0].sourcePingIds.includes('outlier'));
});

Deno.test('D: two distinct places → two clusters', () => {
  const pings = [
    ping('a1', t(0), 59.3293, 18.0686),
    ping('a2', t(2), 59.3294, 18.0686),
    ping('a3', t(4), 59.3293, 18.0687),
    // ~1.5 km bort
    ping('b1', t(20), 59.3430, 18.0686),
    ping('b2', t(22), 59.3431, 18.0687),
    ping('b3', t(24), 59.3430, 18.0686),
  ];
  const { clusters } = buildStableLocationClusters(pings);
  assertEquals(clusters.length, 2);
  assert(clusters[0].isStable);
  assert(clusters[1].isStable);
});

Deno.test('E: few pings same place → sparse cluster, not unknown', () => {
  const pings = [
    ping('p0', t(0), 59.3293, 18.0686),
    ping('p1', t(15), 59.3294, 18.0686),
  ];
  const { clusters, diagnostics } = buildStableLocationClusters(pings);
  assertEquals(clusters.length, 1);
  assertEquals(clusters[0].isStable, false);
  assert(clusters[0].reasons.includes('sparse_signal'));
  assertEquals(diagnostics.sparseClusterCount, 1);
});

Deno.test('F: empty input → no clusters', () => {
  const { clusters, diagnostics } = buildStableLocationClusters([]);
  assertEquals(clusters.length, 0);
  assertEquals(diagnostics.inputPingCount, 0);
});
