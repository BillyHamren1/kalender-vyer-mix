import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildUnknownLocationDiagnostics } from "./buildUnknownLocationDiagnostics.ts";

Deno.test("returns empty diagnostics when there are no unknown blocks", () => {
  const out = buildUnknownLocationDiagnostics({
    staffId: "s1", staffName: "Test", date: "2026-05-11",
    reportCandidateBlocks: [{ kind: "work", title: "FA Warehouse", startAt: "2026-05-11T08:00:00Z", endAt: "2026-05-11T16:00:00Z" }],
    locationTruthBlocks: [], gpsSegments: [], resolvedTargets: [], pings: [],
  });
  assertEquals(out.totalUnknownWorkBlocks, 0);
  assertEquals(out.examples.length, 0);
});

Deno.test("flags unknown report block and reports nearest warehouse + reason", () => {
  const start = "2026-05-11T10:00:00Z";
  const end = "2026-05-11T10:30:00Z";
  const out = buildUnknownLocationDiagnostics({
    staffId: "s1", staffName: "Elvijs", date: "2026-05-11",
    reportCandidateBlocks: [{ id: "b1", kind: "unknown", title: "Arbete – okänd plats", startAt: start, endAt: end, durationMinutes: 30 }],
    locationTruthBlocks: [],
    gpsSegments: [{
      id: "g1", startTs: start, endTs: end, kind: "stay", type: "unknown_place",
      label: "Okänd plats", matchedTargetId: null, matchedTargetType: null, matchedTargetName: null,
      centerLat: 59.33, centerLng: 18.06, pingCount: 5, reason: "no_target_match",
      targetDiagnostics: { nearestTargetLabel: "FA Warehouse", nearestTargetDistanceMeters: 412, nearestTargetRadiusMeters: 200, insideNearestTarget: false },
    }],
    resolvedTargets: [{
      id: "wh1", type: "warehouse", name: "FA Warehouse",
      latitude: 59.333, longitude: 18.063, radiusMeters: 200,
      targetSource: "organization_locations", targetValidity: "valid",
      timeTrackingAllowed: true, matchRole: "primary", canAutoMatchAsWork: true,
    }],
    pings: [
      { ts: "2026-05-11T10:05:00Z", lat: 59.33, lng: 18.06, accuracyM: 25 },
      { ts: "2026-05-11T10:15:00Z", lat: 59.33, lng: 18.06, accuracyM: 30 },
    ],
  });
  assertEquals(out.totalUnknownWorkBlocks, 1);
  assertEquals(out.countsByStage.report_candidate, 1);
  assertEquals(out.countsByStage.gps_timeline, 1);
  const ex = out.examples[0];
  assertEquals(ex.matchingStageWhereUnknownWasAssigned, "gps_timeline");
  assert(ex.hadWarehouseCandidate);
  assert(ex.nearestWarehouseDistanceMeters! > 0);
  assertEquals(ex.rawPingCount, 2);
  assertEquals(ex.rawAccuracy, 25);
  assert(ex.reasonWhyUnknown.includes("no_target_match") || ex.reasonWhyUnknown.includes("outside"));
  assert(ex.nearestKnownTargets.length >= 1);
});

Deno.test("rejects targets missing coordinates and surfaces matchRejectedReason", () => {
  const out = buildUnknownLocationDiagnostics({
    staffId: "s1", staffName: null, date: "2026-05-09",
    reportCandidateBlocks: [{ id: "b1", kind: "unknown", title: "Okänd plats", startAt: "2026-05-09T09:00:00Z", endAt: "2026-05-09T09:20:00Z" }],
    gpsSegments: [{ id: "g1", startTs: "2026-05-09T09:00:00Z", endTs: "2026-05-09T09:20:00Z", kind: "stay", type: "unknown_place", centerLat: 59.0, centerLng: 18.0, reason: "no_target_match" }],
    resolvedTargets: [
      { id: "p1", type: "project", name: "Stora Projekt", latitude: null, longitude: null, radiusMeters: 200, matchRole: "primary", canAutoMatchAsWork: true, targetValidity: "valid", timeTrackingAllowed: true },
      { id: "p2", type: "project", name: "Cancellerat Projekt", latitude: 59.001, longitude: 18.001, radiusMeters: 200, targetValidity: "cancelled", canAutoMatchAsWork: false },
    ],
    pings: [{ ts: "2026-05-09T09:05:00Z", lat: 59.0, lng: 18.0, accuracyM: 50 }],
  });
  const ex = out.examples[0];
  const missingCoord = ex.nearestKnownTargets.find((t) => t.targetId === "p1");
  assertEquals(missingCoord?.matchRejectedReason, "missing_coordinates");
  const cancelled = ex.nearestKnownTargets.find((t) => t.targetId === "p2");
  assertEquals(cancelled?.matchRejectedReason, "cancelled");
});
