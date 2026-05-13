/**
 * Read-only diagnostic test cases — "Why does Time Engine say
 * 'Arbete – okänd plats' for a known place?"
 * ──────────────────────────────────────────────────────────────────
 * These tests reproduce the 7 known failure modes against the pure
 * `buildUnknownLocationDiagnostics` inspector. They MUST stay read-only:
 *   - no DB calls
 *   - no time_reports / location_time_entries / workdays writes
 *   - no auto-start
 *   - all data is mock-only and isolated to this file
 *
 * Each test asserts the fields the audit report needs:
 *   matchedTargetId / matchedTargetType / matchedTargetLabel
 *   distanceMeters / radiusMeters / rejectedReason
 *   finalDisplayLabel (= block title) / finalKind / reviewState (= stage)
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildUnknownLocationDiagnostics,
  type UnknownDiagBlock,
  type UnknownDiagGpsSegment,
  type UnknownDiagPing,
  type UnknownDiagTarget,
} from "./buildUnknownLocationDiagnostics.ts";

// ───────────────────────── Mock fixtures ─────────────────────────
const FA_WAREHOUSE: UnknownDiagTarget = {
  id: "wh-fa", type: "warehouse", name: "FA Warehouse",
  latitude: 59.3330, longitude: 18.0630, radiusMeters: 200,
  targetSource: "organization_locations", targetValidity: "valid",
  timeTrackingAllowed: true, matchRole: "primary", canAutoMatchAsWork: true,
};
const PROJECT_NEAR_HOME: UnknownDiagTarget = {
  id: "p-home", type: "project", name: "Projekt Hemma",
  latitude: 59.4000, longitude: 18.1000, radiusMeters: 150,
  targetSource: "projects", targetValidity: "valid",
  timeTrackingAllowed: true, matchRole: "primary", canAutoMatchAsWork: true,
};
const ASSIGNED_PROJECT: UnknownDiagTarget = {
  id: "p-asg", type: "project", name: "Tilldelat Projekt",
  latitude: 59.5000, longitude: 18.2000, radiusMeters: 200,
  targetSource: "projects", targetValidity: "valid",
  timeTrackingAllowed: true, matchRole: "primary", canAutoMatchAsWork: true,
};

function ping(ts: string, lat: number, lng: number, accuracy = 25): UnknownDiagPing {
  return { ts, lat, lng, accuracyM: accuracy };
}
function unknownBlock(id: string, startAt: string, endAt: string, durationMinutes: number): UnknownDiagBlock {
  return { id, kind: "unknown", title: "Arbete – okänd plats", startAt, endAt, durationMinutes };
}
function unknownGps(id: string, startTs: string, endTs: string, lat: number, lng: number, td: Record<string, unknown> = {}): UnknownDiagGpsSegment {
  return { id, startTs, endTs, kind: "stay", type: "unknown_place", label: "Okänd plats",
    centerLat: lat, centerLng: lng, pingCount: 5, reason: "no_target_match", targetDiagnostics: td };
}

// ───────────────────────── Scenarios ─────────────────────────────

// 1) Stillastående vid FA Warehouse — nearest warehouse must be visible
//    with a small distance and known reason.
Deno.test("scenario#1 stillastående vid FA Warehouse → nearest warehouse with reason", () => {
  const start = "2026-05-11T08:00:00Z", end = "2026-05-11T11:00:00Z";
  const out = buildUnknownLocationDiagnostics({
    staffId: "elvijs", staffName: "Elvijs", date: "2026-05-11",
    reportCandidateBlocks: [unknownBlock("rb1", start, end, 180)],
    gpsSegments: [unknownGps("g1", start, end, 59.3331, 18.0631, {
      nearestTargetLabel: "FA Warehouse", nearestTargetDistanceMeters: 18,
      nearestTargetRadiusMeters: 200, insideNearestTarget: true,
    })],
    resolvedTargets: [FA_WAREHOUSE],
    pings: [ping("2026-05-11T08:30:00Z", 59.3331, 18.0631), ping("2026-05-11T10:30:00Z", 59.3330, 18.0630)],
  });
  const ex = out.examples[0];
  assertEquals(ex.matchingStageWhereUnknownWasAssigned, "gps_timeline");
  assert(ex.hadWarehouseCandidate);
  assert(ex.nearestWarehouseDistanceMeters! < 50, "warehouse should be < 50m away");
  // Winning target should be present (no rejection reason) — failure here
  // proves the GPS engine dropped a perfectly eligible warehouse hit.
  assert(ex.winningTarget !== null, "FA Warehouse should be eligible winning target");
  assertEquals(ex.winningTarget!.targetId, "wh-fa");
  assertEquals(ex.winningTarget!.matchRejectedReason, null);
});

// 2) Stillastående vid projektadress
Deno.test("scenario#2 stillastående vid projektadress → projekt-label, inte unknown", () => {
  const start = "2026-05-12T09:00:00Z", end = "2026-05-12T12:00:00Z";
  const out = buildUnknownLocationDiagnostics({
    staffId: "s1", staffName: "Tester", date: "2026-05-12",
    reportCandidateBlocks: [unknownBlock("rb1", start, end, 180)],
    gpsSegments: [unknownGps("g1", start, end, 59.5001, 18.2001, {
      nearestTargetLabel: "Tilldelat Projekt", nearestTargetDistanceMeters: 12,
      nearestTargetRadiusMeters: 200, insideNearestTarget: true,
    })],
    resolvedTargets: [ASSIGNED_PROJECT],
    pings: [ping("2026-05-12T10:00:00Z", 59.5001, 18.2001)],
  });
  const ex = out.examples[0];
  assert(ex.hadProjectCandidate);
  assert(ex.nearestProjectDistanceMeters! < 50);
  assertEquals(ex.winningTarget?.targetType, "project");
  assertEquals(ex.winningTarget?.label, "Tilldelat Projekt");
});

// 3) Dålig accuracy men alla pings runt samma kända plats
Deno.test("scenario#3 dålig accuracy runt FA Warehouse → diagnostics förklarar", () => {
  const start = "2026-05-13T08:00:00Z", end = "2026-05-13T09:00:00Z";
  const out = buildUnknownLocationDiagnostics({
    staffId: "s1", staffName: "Tester", date: "2026-05-13",
    reportCandidateBlocks: [unknownBlock("rb1", start, end, 60)],
    gpsSegments: [unknownGps("g1", start, end, 59.3335, 18.0640, {
      nearestTargetLabel: "FA Warehouse", nearestTargetDistanceMeters: 95,
      nearestTargetRadiusMeters: 200, insideNearestTarget: true,
      medianAccuracyMeters: 180,
    })],
    resolvedTargets: [FA_WAREHOUSE],
    pings: [ping("2026-05-13T08:15:00Z", 59.3335, 18.0640, 180), ping("2026-05-13T08:45:00Z", 59.3329, 18.0628, 220)],
  });
  const ex = out.examples[0];
  assert(ex.rawAccuracy !== null && ex.rawAccuracy >= 100, "should surface poor accuracy");
  // Warehouse is still nearest within radius — diagnostics must show it
  assert(ex.nearestWarehouseDistanceMeters! <= 200);
  assertEquals(ex.winningTarget?.targetId, "wh-fa");
});

// 4) Känd plats saknar koordinater
Deno.test("scenario#4 känd plats saknar koordinater → matchRejectedReason=missing_coordinates", () => {
  const start = "2026-05-14T08:00:00Z", end = "2026-05-14T09:00:00Z";
  const out = buildUnknownLocationDiagnostics({
    staffId: "s1", staffName: "Tester", date: "2026-05-14",
    reportCandidateBlocks: [unknownBlock("rb1", start, end, 60)],
    gpsSegments: [unknownGps("g1", start, end, 59.0, 18.0)],
    resolvedTargets: [{ ...FA_WAREHOUSE, latitude: null, longitude: null }],
    pings: [ping("2026-05-14T08:30:00Z", 59.0, 18.0)],
  });
  const ex = out.examples[0];
  const fa = ex.nearestKnownTargets.find((t) => t.targetId === "wh-fa");
  assert(fa, "FA Warehouse should still appear in nearestKnownTargets");
  assertEquals(fa!.hasCoordinates, false);
  assertEquals(fa!.matchRejectedReason, "missing_coordinates");
  assertEquals(ex.winningTarget, null);
  assertEquals(ex.whyWinningTargetWasNotUsed, "no_eligible_target_with_coordinates_and_primary_role");
});

// 5) FA Warehouse + transport + FA Warehouse — efter ett GPS-glapp får
//    nästa stay inte bli "okänd plats" om koordinaten fortfarande är samma.
Deno.test("scenario#5 FA Warehouse → transport → FA Warehouse: andra stay får inte bli unknown", () => {
  const startA = "2026-05-15T08:00:00Z", endA = "2026-05-15T09:00:00Z";
  const startB = "2026-05-15T09:30:00Z", endB = "2026-05-15T11:00:00Z";
  // Endast den andra stay läses som "unknown" i denna repro — om den
  // hamnar i unknown ska diagnostics säga att FA Warehouse är vinnaren.
  const out = buildUnknownLocationDiagnostics({
    staffId: "s1", staffName: "Tester", date: "2026-05-15",
    reportCandidateBlocks: [
      { id: "ok-a", kind: "work", title: "FA Warehouse", startAt: startA, endAt: endA, durationMinutes: 60 },
      unknownBlock("rb-b", startB, endB, 90),
    ],
    gpsSegments: [
      { id: "ga", startTs: startA, endTs: endA, kind: "stay", type: "known_site",
        label: "FA Warehouse", matchedTargetId: "wh-fa", matchedTargetType: "warehouse", matchedTargetName: "FA Warehouse",
        centerLat: 59.3331, centerLng: 18.0631 },
      unknownGps("gb", startB, endB, 59.3330, 18.0630, {
        nearestTargetLabel: "FA Warehouse", nearestTargetDistanceMeters: 15,
        nearestTargetRadiusMeters: 200, insideNearestTarget: true,
      }),
    ],
    resolvedTargets: [FA_WAREHOUSE],
    pings: [ping("2026-05-15T10:00:00Z", 59.3330, 18.0630)],
  });
  const ex = out.examples[0];
  assertEquals(ex.selectedTargetBeforeUnknown?.label, "FA Warehouse");
  // FA Warehouse är fortfarande inom radie — winningTarget måste finnas.
  assertEquals(ex.winningTarget?.targetId, "wh-fa");
});

// 6) Projekt nära hemadress — diagnostics måste visa båda kandidaterna.
Deno.test("scenario#6 projekt nära hem → diagnostics visar konkurrens", () => {
  const start = "2026-05-16T07:00:00Z", end = "2026-05-16T07:30:00Z";
  const out = buildUnknownLocationDiagnostics({
    staffId: "s1", staffName: "Tester", date: "2026-05-16",
    reportCandidateBlocks: [unknownBlock("rb1", start, end, 30)],
    gpsSegments: [unknownGps("g1", start, end, 59.4001, 18.1001)],
    resolvedTargets: [PROJECT_NEAR_HOME],
    homeAnchors: [{ id: "home1", kind: "home", lat: 59.4000, lng: 18.1000, radiusM: 80, label: "Hem" }],
    pings: [ping("2026-05-16T07:10:00Z", 59.4001, 18.1001)],
  });
  const ex = out.examples[0];
  assert(ex.hadPrivateResidenceCandidate, "private residence should compete");
  assert(ex.nearestPrivateResidenceDistanceMeters! < 50);
  assert(ex.hadProjectCandidate, "project should compete");
  assert(ex.nearestProjectDistanceMeters! < 50);
});

// 7) Assignment finns för dagen och GPS är vid rätt target.
Deno.test("scenario#7 assignment + GPS på target → assignment är primär kontext", () => {
  const start = "2026-05-17T08:00:00Z", end = "2026-05-17T16:00:00Z";
  const out = buildUnknownLocationDiagnostics({
    staffId: "markuss", staffName: "Markuss", date: "2026-05-17",
    reportCandidateBlocks: [unknownBlock("rb1", start, end, 480)],
    gpsSegments: [unknownGps("g1", start, end, 59.5001, 18.2001, {
      nearestTargetLabel: "Tilldelat Projekt", nearestTargetDistanceMeters: 8,
      nearestTargetRadiusMeters: 200, insideNearestTarget: true,
    })],
    resolvedTargets: [ASSIGNED_PROJECT],
    pings: [ping("2026-05-17T09:00:00Z", 59.5001, 18.2001)],
  });
  const ex = out.examples[0];
  assertEquals(ex.hadAssignmentForDay, true);
  assert(ex.nearestAssignment !== null);
  assertEquals(ex.nearestAssignment!.targetId, "p-asg");
  assert(ex.assignmentDistanceMeters! < 50);
  assertEquals(ex.winningTarget?.targetId, "p-asg");
  assertEquals(ex.whyWinningTargetWasNotUsed, null);
});
