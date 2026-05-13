import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLocationTruthTimeline,
  type BuildLocationTruthTimelineInput,
  type LocationTruthGpsPing,
} from "../buildLocationTruthTimeline.ts";
import type { WorkTarget } from "../contracts.ts";

const STAFF = "11111111-1111-1111-1111-111111111111";
const DATE = "2026-05-13";
const DAY = {
  startUtc: "2026-05-12T22:00:00.000Z",
  endUtc:   "2026-05-13T22:00:00.000Z",
};

// Helper — circle-target factory.
function circleTarget(opts: {
  refId: string;
  kind: WorkTarget["kind"];
  label: string;
  lat: number;
  lng: number;
  radiusM?: number;
  isPrivateResidence?: boolean;
}): WorkTarget {
  return {
    key: `wt:${opts.kind}:${opts.refId}`,
    kind: opts.kind,
    refId: opts.refId,
    label: opts.label,
    center: { lat: opts.lat, lng: opts.lng },
    radiusM: opts.radiusM ?? 75,
    polygon: null,
    isPrivateResidence: opts.isPrivateResidence ?? false,
    validFrom: null,
    validUntil: null,
  };
}

function ping(ts: string, lat: number, lng: number, opts: Partial<LocationTruthGpsPing> = {}): LocationTruthGpsPing {
  return { ts, lat, lng, ...opts };
}

function baseInput(over: Partial<BuildLocationTruthTimelineInput> = {}): BuildLocationTruthTimelineInput {
  return {
    staffId: STAFF,
    date: DATE,
    gpsPings: [],
    resolvedTargets: [],
    locations: [],
    privateResidenceLocations: [],
    assignments: [],
    stockholmDayWindow: DAY,
    ...over,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. No pings → empty timeline.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: no pings → empty segments", () => {
  const r = buildLocationTruthTimeline(baseInput());
  assertEquals(r.locationTruthSegments.length, 0);
  assertEquals(r.diagnostics.inputPingCount, 0);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Project inside → segment kind=project, label from project.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: pings inside a project geofence → project segment", () => {
  const project = circleTarget({ refId: "p1", kind: "project", label: "Bygge Centralen", lat: 59.33, lng: 18.06 });
  const pings = [
    ping("2026-05-13T08:00:00Z", 59.330, 18.060),
    ping("2026-05-13T08:01:00Z", 59.3301, 18.0601),
    ping("2026-05-13T08:02:00Z", 59.3300, 18.0600),
  ];
  const r = buildLocationTruthTimeline(baseInput({ resolvedTargets: [project], gpsPings: pings }));
  const placeSegs = r.locationTruthSegments.filter((s) => s.kind === "project");
  assertEquals(placeSegs.length, 1);
  assertEquals(placeSegs[0].label, "Bygge Centralen");
  assertEquals(placeSegs[0].projectId, "p1");
  assertEquals(placeSegs[0].targetType, "project");
  assert(placeSegs[0].insidePolygon === true);
  assertEquals(r.diagnostics.pingMatch.matchedProjectCount, 3);
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Private residence wins over warehouse at the same address.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: private_residence wins over warehouse at same coordinates", () => {
  const warehouse = circleTarget({ refId: "w1", kind: "warehouse", label: "FA Warehouse", lat: 59.33, lng: 18.06 });
  const r = buildLocationTruthTimeline(baseInput({
    resolvedTargets: [warehouse],
    privateResidenceLocations: [{ id: "h1", label: "Hemma", center: { lat: 59.33, lng: 18.06 }, radiusM: 75 }],
    gpsPings: [
      ping("2026-05-13T20:30:00Z", 59.33, 18.06),
      ping("2026-05-13T20:31:00Z", 59.33, 18.06),
    ],
  }));
  const seg = r.locationTruthSegments.find((s) => s.kind === "private_residence");
  assert(seg, "expected private_residence segment");
  assertEquals(seg!.targetType, "private_residence");
  assertEquals(seg!.label, "Hemma");
  // No warehouse segment must be emitted.
  assertEquals(r.locationTruthSegments.filter((s) => s.kind === "warehouse").length, 0);
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Unknown place when no targets match.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: ping with no matching target → unknown_place segment", () => {
  const r = buildLocationTruthTimeline(baseInput({
    gpsPings: [
      ping("2026-05-13T10:00:00Z", 60.0, 18.0),
      ping("2026-05-13T10:01:00Z", 60.0, 18.0),
    ],
  }));
  const segs = r.locationTruthSegments;
  assertEquals(segs.length, 1);
  assertEquals(segs[0].kind, "unknown_place");
  assertEquals(r.diagnostics.pingMatch.unknownPingCount, 2);
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Sticky 150 m tolerance — only continues an already active session, never originates.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: sticky tolerance continues prior session, does not originate", () => {
  const project = circleTarget({ refId: "p1", kind: "project", label: "Bygge", lat: 59.33, lng: 18.06, radiusM: 50 });
  const pings = [
    ping("2026-05-13T08:00:00Z", 59.330, 18.060),                // INSIDE
    ping("2026-05-13T08:05:00Z", 59.330, 18.060),                // INSIDE
    ping("2026-05-13T08:10:00Z", 59.3308, 18.060),               // ~89 m N — outside but within 150 m sticky
    ping("2026-05-13T08:15:00Z", 59.3309, 18.060),               // still within sticky
  ];
  const r = buildLocationTruthTimeline(baseInput({ resolvedTargets: [project], gpsPings: pings }));
  const segs = r.locationTruthSegments.filter((s) => s.kind === "project");
  assertEquals(segs.length, 1);
  assertEquals(segs[0].rawEvidence.pingCount, 4);
  assert(segs[0].withinTolerance === true);
});

Deno.test("buildLocationTruthTimeline: tolerance does NOT originate a session when first ping is outside", () => {
  const project = circleTarget({ refId: "p1", kind: "project", label: "Bygge", lat: 59.33, lng: 18.06, radiusM: 50 });
  const pings = [
    ping("2026-05-13T08:00:00Z", 59.3308, 18.060), // outside, no prior session → unknown
    ping("2026-05-13T08:05:00Z", 59.3308, 18.060),
  ];
  const r = buildLocationTruthTimeline(baseInput({ resolvedTargets: [project], gpsPings: pings }));
  // Should be unknown_place, not project.
  assert(r.locationTruthSegments.every((s) => s.kind !== "project"), "tolerance must not originate a session");
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Signal gap > maxPingIntervalSeconds emits a signal_gap segment.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: gap > policy emits signal_gap", () => {
  const project = circleTarget({ refId: "p1", kind: "project", label: "Bygge", lat: 59.33, lng: 18.06 });
  const pings = [
    ping("2026-05-13T08:00:00Z", 59.33, 18.06),
    ping("2026-05-13T08:01:00Z", 59.33, 18.06),
    // 30-min gap
    ping("2026-05-13T08:31:00Z", 59.33, 18.06),
    ping("2026-05-13T08:32:00Z", 59.33, 18.06),
  ];
  const r = buildLocationTruthTimeline(baseInput({ resolvedTargets: [project], gpsPings: pings }));
  const gaps = r.locationTruthSegments.filter((s) => s.kind === "signal_gap");
  assertEquals(gaps.length, 1);
  assert(gaps[0].signalGapMinutes >= 25);
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Movement classification via speed.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: high-speed ping with no target match → movement", () => {
  const r = buildLocationTruthTimeline(baseInput({
    gpsPings: [
      ping("2026-05-13T09:00:00Z", 60.10, 18.10, { speedMps: 20 }),
      ping("2026-05-13T09:00:30Z", 60.11, 18.11, { speedMps: 22 }),
    ],
  }));
  const movement = r.locationTruthSegments.filter((s) => s.kind === "movement");
  assertEquals(movement.length, 1);
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Team-named target (booking team_calendar_event) — label MUST come from
//    the WorkTarget.label as supplied. Builder MUST NOT invent "Team N".
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: never invents team-style labels", () => {
  const booking = circleTarget({ refId: "b1", kind: "booking", label: "Konsert Globen", lat: 59.29, lng: 18.08 });
  const r = buildLocationTruthTimeline(baseInput({
    resolvedTargets: [booking],
    gpsPings: [
      ping("2026-05-13T12:00:00Z", 59.29, 18.08),
      ping("2026-05-13T12:01:00Z", 59.29, 18.08),
    ],
  }));
  const seg = r.locationTruthSegments.find((s) => s.kind === "booking");
  assert(seg, "expected booking segment");
  assertEquals(seg!.label, "Konsert Globen");
  // Sanity: never the word "Team".
  assert(!/Team/i.test(seg!.label));
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. Assignment bumps confidence/reason to assigned_target_inside.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: assignment promotes match reason to assigned_target_inside", () => {
  const project = circleTarget({ refId: "p1", kind: "project", label: "Bygge", lat: 59.33, lng: 18.06 });
  const r = buildLocationTruthTimeline(baseInput({
    resolvedTargets: [project],
    assignments: [{ targetType: "project", targetId: "p1", assignmentId: "a1" }],
    gpsPings: [
      ping("2026-05-13T08:00:00Z", 59.33, 18.06),
      ping("2026-05-13T08:01:00Z", 59.33, 18.06),
    ],
  }));
  const seg = r.locationTruthSegments.find((s) => s.kind === "project");
  assert(seg);
  assertEquals(seg!.assignmentId, "a1");
  assert(seg!.confidenceReasons.includes("assigned_target"));
  assertEquals(seg!.confidence, 1);
});

// ──────────────────────────────────────────────────────────────────────────────
// 10. Diagnostics shape — ensure required counters are present.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: diagnostics expose expected counters", () => {
  const r = buildLocationTruthTimeline(baseInput({
    gpsPings: [
      ping("2026-05-13T08:00:00Z", 60.0, 18.0),
      ping("2026-05-13T08:01:00Z", 60.0, 18.0),
    ],
  }));
  const d = r.diagnostics;
  assert("inputPingCount" in d);
  assert("pingMatch" in d);
  assert("matchedByToleranceCount" in d.pingMatch);
  assert("examples" in d.pingMatch);
});

// ──────────────────────────────────────────────────────────────────────────────
// 11. Location Truth 1.3 — WORK_AREA_TOLERANCE_METERS exported and equal to 150.
// ──────────────────────────────────────────────────────────────────────────────
import { WORK_AREA_TOLERANCE_METERS } from "../buildLocationTruthTimeline.ts";

Deno.test("buildLocationTruthTimeline: exports WORK_AREA_TOLERANCE_METERS = 150", () => {
  assertEquals(WORK_AREA_TOLERANCE_METERS, 150);
});

// ──────────────────────────────────────────────────────────────────────────────
// 12. private_residence overrides warehouse AND tolerance, and is reported.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: residence diagnostics report shadowed warehouse + suppressed tolerance", () => {
  const warehouse = circleTarget({ refId: "w1", kind: "warehouse", label: "FA Warehouse", lat: 59.33, lng: 18.06, radiusM: 200 });
  const r = buildLocationTruthTimeline(baseInput({
    resolvedTargets: [warehouse],
    privateResidenceLocations: [{ id: "h1", label: "Hemma", center: { lat: 59.33, lng: 18.06 }, radiusM: 50 }],
    gpsPings: [
      ping("2026-05-13T20:30:00Z", 59.33, 18.06),
      ping("2026-05-13T20:31:00Z", 59.33, 18.06),
    ],
  }));
  const pr = r.diagnostics.privateResidenceMatch;
  assertEquals(pr.pingsInsideResidence, 2);
  assert(pr.residenceOverrodeWarehouseCount >= 2, "should report shadowed warehouse pings");
});

// ──────────────────────────────────────────────────────────────────────────────
// 13. Tolerance suppressed when no active session — diagnostic counter increments.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: tolerance blocked because no active session is reported", () => {
  const project = circleTarget({ refId: "p1", kind: "project", label: "Bygge", lat: 59.33, lng: 18.06, radiusM: 50 });
  // First ping outside (~89 m N) — within 150 m tolerance but no prior session.
  const r = buildLocationTruthTimeline(baseInput({
    resolvedTargets: [project],
    gpsPings: [
      ping("2026-05-13T08:00:00Z", 59.3308, 18.060),
      ping("2026-05-13T08:05:00Z", 59.3308, 18.060),
    ],
  }));
  const t = r.diagnostics.workAreaTolerance;
  assertEquals(t.toleranceMeters, 150);
  assert(t.blockedBecauseNoActiveSessionCount >= 2, "expected no_active_session suppression");
  assertEquals(t.continuedSessionByToleranceCount, 0);
});

// ──────────────────────────────────────────────────────────────────────────────
// 14. Tolerance fired diagnostic counts continued pings.
// ──────────────────────────────────────────────────────────────────────────────
Deno.test("buildLocationTruthTimeline: tolerance continuation increments continuedSessionByToleranceCount", () => {
  const project = circleTarget({ refId: "p1", kind: "project", label: "Bygge", lat: 59.33, lng: 18.06, radiusM: 50 });
  const r = buildLocationTruthTimeline(baseInput({
    resolvedTargets: [project],
    gpsPings: [
      ping("2026-05-13T08:00:00Z", 59.330, 18.060),  // INSIDE (originates)
      ping("2026-05-13T08:05:00Z", 59.3308, 18.060), // OUTSIDE within 150 m → tolerance
      ping("2026-05-13T08:10:00Z", 59.3309, 18.060), // OUTSIDE within 150 m → tolerance
    ],
  }));
  const t = r.diagnostics.workAreaTolerance;
  assert(t.continuedSessionByToleranceCount >= 2, "expected at least 2 continuation pings");
});
