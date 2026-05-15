// @ts-nocheck
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectGpsOutliers } from "./detectGpsOutliers.ts";
import type { NormalizedGpsPing } from "./normalizeGpsEvidence.ts";

// Plats A ligger i Stockholm, ~5 km bort = +0.045 lat (~5 km).
const A_LAT = 59.3293, A_LNG = 18.0686;
const FAR_LAT = A_LAT + 0.045, FAR_LNG = A_LNG;

function p(id: string, ts: string, lat: number, lng: number): NormalizedGpsPing {
  return {
    id, ts, lat, lng,
    accuracyM: 30,
    speedMps: null,
    accuracyQuality: 'excellent',
    confidenceWeight: 1,
    hardRejected: false as const,
    ignoredForLocationLogic: false,
  };
}

Deno.test("A: ensam far-ping mellan två stabila → ignored", () => {
  const pings = [
    p("1", "2026-05-15T08:00:00Z", A_LAT, A_LNG),
    p("2", "2026-05-15T08:12:00Z", FAR_LAT, FAR_LNG),
    p("3", "2026-05-15T08:13:00Z", A_LAT, A_LNG),
  ];
  const { pings: out, diagnostics } = detectGpsOutliers(pings);
  assertEquals(out[0].ignoredForLocationLogic, false);
  assertEquals(out[1].ignoredForLocationLogic, true);
  assertEquals(out[2].ignoredForLocationLogic, false);
  assertEquals(diagnostics.outlierIgnoredCount, 1);
  assertEquals(diagnostics.returnedToSameStableAreaCount, 1);
  assertEquals(diagnostics.examples[0].reason, "returned_to_same_stable_area_after_impossible_jump");
});

Deno.test("B: ensam far-ping utan next → INTE ignored, men candidate", () => {
  const pings = [
    p("1", "2026-05-15T08:00:00Z", A_LAT, A_LNG),
    p("2", "2026-05-15T08:12:00Z", FAR_LAT, FAR_LNG),
  ];
  const { pings: out, diagnostics } = detectGpsOutliers(pings);
  assertEquals(out[1].ignoredForLocationLogic, false);
  assertEquals(diagnostics.outlierCandidateCount, 1);
  assertEquals(diagnostics.outlierIgnoredCount, 0);
  assertEquals(diagnostics.examples[0].reason, "isolated_far_ping_no_next_evidence");
});

Deno.test("C: flera far-pings under 30 min → behålls (retainedFarCluster)", () => {
  const pings = [
    p("1", "2026-05-15T08:00:00Z", A_LAT, A_LNG),
    p("2", "2026-05-15T08:12:00Z", FAR_LAT, FAR_LNG),
    p("3", "2026-05-15T08:25:00Z", FAR_LAT, FAR_LNG),
    p("4", "2026-05-15T08:42:00Z", FAR_LAT, FAR_LNG),
    p("5", "2026-05-15T08:55:00Z", A_LAT, A_LNG),
  ];
  const { pings: out, diagnostics } = detectGpsOutliers(pings);
  assert(out.slice(1, 4).every((x) => !x.ignoredForLocationLogic));
  assertEquals(diagnostics.retainedFarClusterCount, 1);
  assertEquals(diagnostics.outlierIgnoredCount, 0);
});

Deno.test("D: vanlig resa 5 km med rimlig tidsserie → inte outlier", () => {
  // 30 min mellan A och destination, sedan 30 min på destination — destinationen
  // är ett far-kluster med >20min varaktighet → behålls.
  const pings = [
    p("1", "2026-05-15T08:00:00Z", A_LAT, A_LNG),
    p("2", "2026-05-15T08:30:00Z", FAR_LAT, FAR_LNG),
    p("3", "2026-05-15T09:00:00Z", FAR_LAT, FAR_LNG),
  ];
  const { pings: out, diagnostics } = detectGpsOutliers(pings);
  assert(out.every((x) => !x.ignoredForLocationLogic));
  assertEquals(diagnostics.outlierIgnoredCount, 0);
});

Deno.test("Idempotent: körning två gånger ger samma resultat", () => {
  const pings = [
    p("1", "2026-05-15T08:00:00Z", A_LAT, A_LNG),
    p("2", "2026-05-15T08:12:00Z", FAR_LAT, FAR_LNG),
    p("3", "2026-05-15T08:13:00Z", A_LAT, A_LNG),
  ];
  const r1 = detectGpsOutliers(pings);
  const r2 = detectGpsOutliers(r1.pings);
  assertEquals(r2.diagnostics.outlierIgnoredCount, 0); // redan markerade
  assertEquals(r2.pings[1].ignoredForLocationLogic, true);
});
