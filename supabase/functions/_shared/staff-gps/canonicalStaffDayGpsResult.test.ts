// Pure tests for projectCanonicalResult — no DB required.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  projectCanonicalResult,
  CANONICAL_VERSION,
  CANONICAL_POLICY_VERSION,
} from "./canonicalStaffDayGpsResult.ts";
import type { DaySnapshot } from "./snapshotCache.ts";

function makePing(id: string, iso: string, lat = 59.33, lng = 18.07) {
  return { id, recorded_at: iso, lat, lng, accuracy: 10 };
}

Deno.test("empty snapshot → empty result, no crash", () => {
  const snapshot: DaySnapshot = {
    pings: [],
    geofences: [],
    visits: [],
    privateGeofenceIds: [],
    builtAt: "2026-05-26T00:00:00Z",
  };
  const r = projectCanonicalResult({
    organizationId: "org-1",
    staffId: "staff-1",
    date: "2026-05-26",
    snapshot,
    cacheHit: false,
  });
  assertEquals(r.version, CANONICAL_VERSION);
  assertEquals(r.segments.length, 0);
  assertEquals(r.geofenceVisits.length, 0);
  assertEquals(r.firstIso, null);
  assertEquals(r.totals.workMinutes, 0);
  assertEquals(r.totals.payableSuggestionMinutes, 0);
  assertEquals(r.payrollSuggestion.policyVersion, CANONICAL_POLICY_VERSION);
  assertEquals(r.dayWindow.timezone, "Europe/Stockholm");
});

Deno.test("visit clamps to exact inside-pings (08:58–09:49)", () => {
  // 5 pings inne i FA Warehouse 08:58–09:49 + 2 pings utanför.
  const visitPings = [
    makePing("p1", "2026-05-26T06:58:00Z"),
    makePing("p2", "2026-05-26T07:10:00Z"),
    makePing("p3", "2026-05-26T07:30:00Z"),
    makePing("p4", "2026-05-26T07:45:00Z"),
    makePing("p5", "2026-05-26T07:49:00Z"),
  ];
  const otherPings = [
    makePing("p0", "2026-05-26T06:00:00Z", 59.40, 18.20), // utanför, före
    makePing("p6", "2026-05-26T08:30:00Z", 59.40, 18.20), // utanför, efter
  ];
  const snapshot: DaySnapshot = {
    pings: [...otherPings.slice(0, 1), ...visitPings, ...otherPings.slice(1)],
    geofences: [],
    visits: [{
      placeKey: "site:fa:1",
      knownSite: { id: "fa", name: "FA Warehouse" },
      centre: { lat: 59.33, lng: 18.07 },
      start: "2026-05-26T06:58:00Z",
      end: "2026-05-26T07:49:00Z",
      durationMin: 51,
      pingCount: visitPings.length,
      pings: visitPings,
      subKind: "inside" as const,
    }],
    privateGeofenceIds: [],
    builtAt: "2026-05-26T00:00:00Z",
  };
  const r = projectCanonicalResult({
    organizationId: "org-1",
    staffId: "staff-1",
    date: "2026-05-26",
    snapshot,
    cacheHit: false,
  });
  assertEquals(r.geofenceVisits.length, 1);
  const gv = r.geofenceVisits[0];
  assertEquals(gv.startIso, "2026-05-26T06:58:00Z");
  assertEquals(gv.endIso, "2026-05-26T07:49:00Z");
  assertEquals(gv.clampSource, "exact_inside_pings");
  assertEquals(gv.label, "FA Warehouse");
  // Måste finnas minst ett work-segment med samma start/end
  const workSeg = r.segments.find((s) => s.type === "work" && s.knownSiteId === "fa");
  assert(workSeg, "work-segment för FA saknas");
  assertEquals(workSeg!.startIso, "2026-05-26T06:58:00Z");
  assertEquals(workSeg!.endIso, "2026-05-26T07:49:00Z");
});

Deno.test("totals invariant: window = work+private+travel+unknown+gap+idle (±1 min)", () => {
  const pings = [
    makePing("p1", "2026-05-26T06:00:00Z"),
    makePing("p2", "2026-05-26T08:00:00Z"),
    makePing("p3", "2026-05-26T14:00:00Z"),
  ];
  const snapshot: DaySnapshot = {
    pings,
    geofences: [],
    visits: [{
      placeKey: "site:p:1",
      knownSite: { id: "proj", name: "Projekt A" },
      centre: { lat: 59.33, lng: 18.07 },
      start: "2026-05-26T06:00:00Z",
      end: "2026-05-26T08:00:00Z",
      durationMin: 120,
      pingCount: 2,
      pings: [pings[0], pings[1]],
      subKind: "inside" as const,
    }],
    privateGeofenceIds: [],
    builtAt: "2026-05-26T00:00:00Z",
  };
  const r = projectCanonicalResult({
    organizationId: "org-1",
    staffId: "staff-1",
    date: "2026-05-26",
    snapshot,
    cacheHit: false,
  });
  const t = r.totals;
  const sumBuckets = t.workMinutes + t.privateMinutes + t.travelMinutes
    + t.unknownMinutes + t.gpsGapMinutes + t.idleMinutes;
  // visibleWindowMinutes ska exakt = summan (avrundning hanterad av visibleWindow)
  assertEquals(sumBuckets, t.visibleWindowMinutes);
  assertEquals(t.payableSuggestionMinutes, t.workMinutes + t.travelMinutes);
});

Deno.test("payroll suggestion includes only work + travel", () => {
  const snapshot: DaySnapshot = {
    pings: [makePing("p1", "2026-05-26T06:00:00Z"), makePing("p2", "2026-05-26T09:00:00Z")],
    geofences: [],
    visits: [{
      placeKey: "site:a:1",
      knownSite: { id: "a", name: "A" },
      centre: { lat: 59.33, lng: 18.07 },
      start: "2026-05-26T06:00:00Z",
      end: "2026-05-26T09:00:00Z",
      durationMin: 180,
      pingCount: 2,
      pings: [makePing("p1", "2026-05-26T06:00:00Z"), makePing("p2", "2026-05-26T09:00:00Z")],
      subKind: "inside" as const,
    }],
    privateGeofenceIds: [],
    builtAt: "2026-05-26T00:00:00Z",
  };
  const r = projectCanonicalResult({
    organizationId: "org-1",
    staffId: "staff-1",
    date: "2026-05-26",
    snapshot,
    cacheHit: true,
  });
  assertEquals(r.payrollSuggestion.payableMinutes, r.totals.payableSuggestionMinutes);
  for (const id of r.payrollSuggestion.includedSegmentIds) {
    const seg = r.segments.find((s) => s.id === id);
    assert(seg && (seg.type === "work" || seg.type === "travel"));
  }
});
