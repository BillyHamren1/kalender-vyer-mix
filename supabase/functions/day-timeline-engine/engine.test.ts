// Deno tests for the day timeline engine pure functions.
// Run: deno test --allow-net --allow-env --allow-read supabase/functions/day-timeline-engine/engine.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clusterPings } from "../_shared/timeline/cluster.ts";
import { matchSegmentsToPlaces } from "../_shared/timeline/matcher.ts";
import { buildEvents } from "../_shared/timeline/eventBuilder.ts";
import { buildSuggestions } from "../_shared/timeline/suggestionEngine.ts";
import { isUnknownStopReportable } from "../_shared/timeline/smartFilter.ts";
import type { KnownPlace, Ping, Segment, TimeReportRow, WorkdayRow } from "../_shared/timeline/types.ts";

const HOME = { lat: 59.5102, lng: 17.9106 }; // David Adrians väg approx
const VENNGARN = { lat: 59.6310, lng: 17.6890 };

function ping(min: number, lat: number, lng: number): Ping {
  return {
    ts: new Date(`2026-04-29T${String(6 + Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00+02:00`).toISOString(),
    lat, lng, accuracy: 10,
  };
}

Deno.test("cluster: 3 pattern → expected segment counts", () => {
  // Pattern 1: stationary 30 min at home
  const home30 = Array.from({ length: 30 }, (_, i) => ping(i, HOME.lat, HOME.lng));
  const segs1 = clusterPings(home30);
  assertEquals(segs1.filter((s) => s.isStationary).length, 1);

  // Pattern 2: stationary at home, then move, then stationary at venngarn
  const both = [
    ...Array.from({ length: 30 }, (_, i) => ping(i, HOME.lat, HOME.lng)),
    ...Array.from({ length: 60 }, (_, i) => ping(120 + i, VENNGARN.lat, VENNGARN.lng)),
  ];
  const segs2 = clusterPings(both);
  const stationary2 = segs2.filter((s) => s.isStationary);
  assertEquals(stationary2.length, 2);

  // Pattern 3: only short blip <5 min — no stationary segment
  const blip = Array.from({ length: 3 }, (_, i) => ping(i, HOME.lat, HOME.lng));
  const segs3 = clusterPings(blip);
  assertEquals(segs3.filter((s) => s.isStationary).length, 0);
});

Deno.test("matcher: segment near place → matched, far → unmatched", () => {
  const segments: Segment[] = [
    { startTs: "2026-04-29T06:00:00Z", endTs: "2026-04-29T07:00:00Z",
      centerLat: VENNGARN.lat, centerLng: VENNGARN.lng,
      pingCount: 60, durationMin: 60, matchedPlace: null, isStationary: true },
    { startTs: "2026-04-29T08:00:00Z", endTs: "2026-04-29T09:00:00Z",
      centerLat: 60.0, centerLng: 18.5,
      pingCount: 30, durationMin: 60, matchedPlace: null, isStationary: true },
  ];
  const places: KnownPlace[] = [{
    id: "venngarn", type: "booking", name: "Venngarn",
    lat: VENNGARN.lat, lng: VENNGARN.lng, radiusM: 100,
  }];
  const matched = matchSegmentsToPlaces(segments, places);
  assertEquals(matched[0].matchedPlace?.id, "venngarn");
  assertEquals(matched[1].matchedPlace, null);
});

Deno.test("eventBuilder: workday + reports + venngarn segment → ordered events", () => {
  const wd: WorkdayRow = {
    id: "wd1", staff_id: "s1",
    started_at: "2026-04-29T04:51:00Z", ended_at: "2026-04-29T17:53:00Z",
  };
  const segments: Segment[] = [{
    startTs: "2026-04-29T05:48:00Z", endTs: "2026-04-29T16:04:00Z",
    centerLat: VENNGARN.lat, centerLng: VENNGARN.lng,
    pingCount: 600, durationMin: 616, matchedPlace: null, isStationary: true,
  }];
  const place: KnownPlace = {
    id: "b1", type: "booking", name: "FA Warehouse",
    lat: VENNGARN.lat, lng: VENNGARN.lng, radiusM: 100,
  };
  const matched = matchSegmentsToPlaces(segments, [place]);
  const reports: TimeReportRow[] = [{
    id: "r1", staff_id: "s1", organization_id: "o1",
    report_date: "2026-04-29", start_time: "06:51:00", end_time: "19:53:00",
    hours_worked: 12, booking_id: "b1", large_project_id: null, location_id: null, source: "manual",
  }];
  const events = buildEvents({
    segments: matched, reports, workdays: [wd], entries: [],
    knownPlaces: [place], homePlace: null,
    reportedPlaceForReport: () => place,
  });
  // Should contain workday_started, arrived_at_reported_site, left_reported_site, workday_ended
  const types = events.map((e) => e.eventType);
  assert(types.includes("workday_started"));
  assert(types.includes("workday_ended"));
  assert(types.includes("arrived_at_reported_site"));
  assert(types.includes("left_reported_site"));
  // Sorted
  for (let i = 1; i < events.length; i++) assert(events[i - 1].ts <= events[i].ts);
});

Deno.test("suggestionEngine: left site at 16:04, report ends 19:53 → shorten_end", () => {
  const segments: Segment[] = [{
    startTs: "2026-04-29T05:48:00Z", endTs: "2026-04-29T14:04:00Z", // 16:04 local CEST
    centerLat: VENNGARN.lat, centerLng: VENNGARN.lng,
    pingCount: 500, durationMin: 496, matchedPlace: null, isStationary: true,
  }];
  const place: KnownPlace = {
    id: "b1", type: "booking", name: "FA Warehouse",
    lat: VENNGARN.lat, lng: VENNGARN.lng, radiusM: 100,
  };
  const matched = matchSegmentsToPlaces(segments, [place]);
  const reports: TimeReportRow[] = [{
    id: "r1", staff_id: "s1", organization_id: "o1",
    report_date: "2026-04-29", start_time: "06:51:00", end_time: "19:53:00",
    hours_worked: 12, booking_id: "b1", large_project_id: null, location_id: null, source: "manual",
  }];
  const sugs = buildSuggestions({
    reports, segments: matched, events: [],
    reportedPlaceForReport: () => place,
  });
  const shorten = sugs.find((s) => s.suggestionType === "shorten_end");
  assert(shorten, "expected shorten_end suggestion");
  assertEquals(shorten!.suggestedEndTime, "16:04:00");
  assert(shorten!.differenceMin && shorten!.differenceMin > 200, `expected diff >200min, got ${shorten!.differenceMin}`);
});

Deno.test("suggestionEngine: never present at site → mark_as_unclear", () => {
  // Person was elsewhere all day.
  const segments: Segment[] = [{
    startTs: "2026-04-29T06:00:00Z", endTs: "2026-04-29T16:00:00Z",
    centerLat: 60.5, centerLng: 18.5, // far from Venngarn
    pingCount: 600, durationMin: 600, matchedPlace: null, isStationary: true,
  }];
  const place: KnownPlace = {
    id: "b1", type: "booking", name: "FA Warehouse",
    lat: VENNGARN.lat, lng: VENNGARN.lng, radiusM: 100,
  };
  const matched = matchSegmentsToPlaces(segments, [place]);
  const reports: TimeReportRow[] = [{
    id: "r1", staff_id: "s1", organization_id: "o1",
    report_date: "2026-04-29", start_time: "06:51:00", end_time: "19:53:00",
    hours_worked: 12, booking_id: "b1", large_project_id: null, location_id: null, source: "manual",
  }];
  const sugs = buildSuggestions({
    reports, segments: matched, events: [],
    reportedPlaceForReport: () => place,
  });
  assertEquals(sugs.find((s) => s.suggestionType === "mark_as_unclear")?.reason, "no_gps_at_reported_site");
});

Deno.test("smartFilter: home stop is filtered, lunch stop is kept", () => {
  const homePlace: KnownPlace = {
    id: "home", type: "home", name: "Hem",
    lat: HOME.lat, lng: HOME.lng, radiusM: 100,
  };
  const wd: WorkdayRow = {
    id: "wd1", staff_id: "s1",
    started_at: "2026-04-29T04:51:00Z", ended_at: "2026-04-29T17:53:00Z",
  };
  const homeStop: Segment = {
    startTs: "2026-04-29T05:00:00Z", endTs: "2026-04-29T05:30:00Z",
    centerLat: HOME.lat, centerLng: HOME.lng,
    pingCount: 30, durationMin: 30, matchedPlace: null, isStationary: true,
  };
  const lunchStop: Segment = {
    startTs: "2026-04-29T10:00:00Z", endTs: "2026-04-29T10:45:00Z",
    centerLat: 59.6000, centerLng: 17.7000,
    pingCount: 30, durationMin: 45, matchedPlace: null, isStationary: true,
  };
  assertEquals(isUnknownStopReportable(homeStop, { workdays: [wd], homePlace }), false);
  assertEquals(isUnknownStopReportable(lunchStop, { workdays: [wd], homePlace }), true);
});
