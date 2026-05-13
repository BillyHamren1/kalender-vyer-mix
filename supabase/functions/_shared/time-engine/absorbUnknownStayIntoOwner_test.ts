/**
 * Unit tests for absorbUnknownStayIntoOwner — verifies that unknown_place
 * stays sandwiched between (or following) the same known target are
 * reclassified into that target with proper confidence + diagnostics.
 *
 * Read-only: pure function, no DB.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { absorbUnknownStayIntoOwner } from "./absorbUnknownStayIntoOwner.ts";
import type { GpsTimelineSegment } from "./buildGpsDayTimeline.ts";
import type { WorkTarget } from "./contracts.ts";

const FA: WorkTarget = {
  key: "warehouse:wh-fa",
  kind: "warehouse",
  refId: "wh-fa",
  label: "FA Warehouse",
  center: { lat: 59.3330, lng: 18.0630 },
  radiusM: 200,
};
const PROJ: WorkTarget = {
  key: "project:p1",
  kind: "project",
  refId: "p1",
  label: "Projekt Solna",
  center: { lat: 59.5000, lng: 18.2000 },
  radiusM: 150,
};

function known(id: string, target: WorkTarget, start: string, end: string, lat = target.center.lat, lng = target.center.lng): GpsTimelineSegment {
  return {
    id, startTs: start, endTs: end, durationMin: (Date.parse(end) - Date.parse(start)) / 60000,
    kind: "stay", type: "known_site", label: target.label,
    matchedTargetId: target.refId, matchedTargetType: target.kind, matchedTargetName: target.label,
    centerLat: lat, centerLng: lng, startLat: lat, startLng: lng, endLat: lat, endLng: lng,
    pingCount: 5, distanceMeters: 0, avgKmh: 0, confidence: 0.9, reason: "matched_valid_target",
  };
}
function unknown(id: string, start: string, end: string, lat: number, lng: number): GpsTimelineSegment {
  return {
    id, startTs: start, endTs: end, durationMin: (Date.parse(end) - Date.parse(start)) / 60000,
    kind: "stay", type: "unknown_place", label: "Okänd plats",
    matchedTargetId: null, matchedTargetType: null, matchedTargetName: null,
    centerLat: lat, centerLng: lng, startLat: lat, startLng: lng, endLat: lat, endLng: lng,
    pingCount: 4, distanceMeters: 0, avgKmh: 0, confidence: 0.4, reason: "no_target_match",
  };
}
function travel(id: string, start: string, end: string): GpsTimelineSegment {
  return {
    id, startTs: start, endTs: end, durationMin: (Date.parse(end) - Date.parse(start)) / 60000,
    kind: "travel", type: "transport", label: "Transport",
    matchedTargetId: null, matchedTargetType: null, matchedTargetName: null,
    centerLat: 59.40, centerLng: 18.10, startLat: 59.33, startLng: 18.06, endLat: 59.50, endLng: 18.20,
    pingCount: 6, distanceMeters: 12000, avgKmh: 40, confidence: 0.7, reason: "movement_cluster",
  };
}

Deno.test("absorbs unknown sandwiched between two FA Warehouse stays", () => {
  const segs = [
    known("a", FA, "2026-05-15T08:00:00Z", "2026-05-15T09:00:00Z"),
    unknown("u", "2026-05-15T09:00:00Z", "2026-05-15T09:30:00Z", 59.3331, 18.0632),
    known("b", FA, "2026-05-15T09:30:00Z", "2026-05-15T11:00:00Z"),
  ];
  const diag = absorbUnknownStayIntoOwner(segs, [FA]);
  assertEquals(diag.absorbedUnknownStaysCount, 1);
  assertEquals(segs[1].type, "known_site");
  assertEquals(segs[1].matchedTargetId, "wh-fa");
  assertEquals(segs[1].label, "FA Warehouse");
  assertEquals(diag.absorbedExamples[0].reason, "sandwiched_same_target");
  assertEquals(diag.absorbedExamples[0].confidence, "high");
});

Deno.test("absorbs unknown that directly follows known_site (sticky owner) within tolerance", () => {
  // Centroid 250m from center → outside 200m radius but within +150m tolerance.
  const segs = [
    known("a", FA, "2026-05-15T08:00:00Z", "2026-05-15T09:00:00Z"),
    unknown("u", "2026-05-15T09:00:00Z", "2026-05-15T09:20:00Z", 59.3352, 18.0635),
    travel("t", "2026-05-15T09:20:00Z", "2026-05-15T09:50:00Z"),
  ];
  const diag = absorbUnknownStayIntoOwner(segs, [FA]);
  assertEquals(diag.absorbedUnknownStaysCount, 1);
  assertEquals(segs[1].matchedTargetId, "wh-fa");
  assertEquals(diag.absorbedExamples[0].reason, "preceded_by_same_target");
  assertEquals(diag.absorbedExamples[0].confidence, "medium");
  assert(segs[1].targetDiagnostics?.warningLabel?.includes("delvis utanför"));
});

Deno.test("does NOT absorb unknown that is far from owner (preserves unknown)", () => {
  // Centroid 5 km from FA → outside radius+tolerance.
  const segs = [
    known("a", FA, "2026-05-15T08:00:00Z", "2026-05-15T09:00:00Z"),
    unknown("u", "2026-05-15T09:00:00Z", "2026-05-15T09:30:00Z", 59.40, 18.10),
    known("b", FA, "2026-05-15T09:30:00Z", "2026-05-15T11:00:00Z"),
  ];
  const diag = absorbUnknownStayIntoOwner(segs, [FA, PROJ]);
  assertEquals(diag.absorbedUnknownStaysCount, 0);
  assertEquals(diag.preservedUnknownCount, 1);
  assertEquals(segs[1].type, "unknown_place");
  // Preserved unknown gets nearestKnownTarget* diagnostics
  const td = segs[1].targetDiagnostics!;
  assertEquals(td.nearestTargetLabel, "FA Warehouse");
  assert((td.nearestTargetDistanceMeters ?? 0) > 1000);
  assertEquals(td.insideNearestTarget, false);
});

Deno.test("does NOT absorb when neighbouring stays are different targets", () => {
  const segs = [
    known("a", FA, "2026-05-15T08:00:00Z", "2026-05-15T09:00:00Z"),
    unknown("u", "2026-05-15T09:00:00Z", "2026-05-15T09:10:00Z", 59.40, 18.10),
    known("b", PROJ, "2026-05-15T10:00:00Z", "2026-05-15T11:00:00Z"),
  ];
  const diag = absorbUnknownStayIntoOwner(segs, [FA, PROJ]);
  // unknown's centroid ~7km from FA — too far → preserved
  assertEquals(diag.absorbedUnknownStaysCount, 0);
  assertEquals(segs[1].type, "unknown_place");
});

Deno.test("does NOT absorb private_residence-tagged unknown", () => {
  const segs = [
    known("a", FA, "2026-05-15T08:00:00Z", "2026-05-15T09:00:00Z"),
    unknown("u", "2026-05-15T09:00:00Z", "2026-05-15T09:30:00Z", 59.3331, 18.0631),
    known("b", FA, "2026-05-15T09:30:00Z", "2026-05-15T11:00:00Z"),
  ];
  segs[1].targetDiagnostics = { privateResidence: true };
  const diag = absorbUnknownStayIntoOwner(segs, [FA]);
  assertEquals(diag.absorbedUnknownStaysCount, 0);
  assertEquals(segs[1].type, "unknown_place");
});

Deno.test("ignores gps_gap when looking for neighbours (still absorbs)", () => {
  const segs: GpsTimelineSegment[] = [
    known("a", FA, "2026-05-15T08:00:00Z", "2026-05-15T09:00:00Z"),
    {
      id: "g", startTs: "2026-05-15T09:00:00Z", endTs: "2026-05-15T09:05:00Z", durationMin: 5,
      kind: "gps_gap", type: "gps_gap", label: "GPS-glapp",
      matchedTargetId: null, matchedTargetType: null, matchedTargetName: null,
      centerLat: null, centerLng: null, startLat: null, startLng: null, endLat: null, endLng: null,
      pingCount: 0, distanceMeters: 0, avgKmh: 0, confidence: 0, reason: "gap_exceeds_threshold",
    },
    unknown("u", "2026-05-15T09:05:00Z", "2026-05-15T09:30:00Z", 59.3331, 18.0631),
    known("b", FA, "2026-05-15T09:30:00Z", "2026-05-15T11:00:00Z"),
  ];
  const diag = absorbUnknownStayIntoOwner(segs, [FA]);
  assertEquals(diag.absorbedUnknownStaysCount, 1);
  assertEquals(segs[2].matchedTargetId, "wh-fa");
});
