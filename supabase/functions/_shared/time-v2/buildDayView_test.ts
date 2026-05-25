// Test för buildDayView — Time v2
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDayView } from "./buildDayView.ts";
import type { KnownPlace } from "../timeline/types.ts";
import type { RawPingInput } from "../timeline/buildGpsDayTimelineOnly.ts";

const knownTargets: KnownPlace[] = [
  { id: "proj-1", type: "project", name: "Projekt Alfa", lat: 59.33, lng: 18.06, radiusM: 100 },
];

function pingsAt(date: string, lat: number, lng: number, count: number, startMin = 0): RawPingInput[] {
  const out: RawPingInput[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(`${date}T08:00:00Z`).getTime() + (startMin + i) * 60_000;
    out.push({ recorded_at: new Date(t).toISOString(), lat, lng, accuracy: 10 });
  }
  return out;
}

Deno.test("buildDayView returns empty totals when no pings", () => {
  const v = buildDayView({
    staffId: "s1", organizationId: "org1", date: "2026-05-25",
    pings: [], knownTargets, manualOverrides: [],
  });
  assertEquals(v.rawPingCount, 0);
  assertEquals(v.segments.length, 0);
  assertEquals(v.rows.length, 0);
  assertEquals(v.totals.totalDurationMinutes, 0);
  assertEquals(v.totals.totalDurationLabel, "0m");
  assertEquals(v.manualOverridesSummary.count, 0);
});

Deno.test("buildDayView builds at least one known_site segment for clustered pings", () => {
  const pings = pingsAt("2026-05-25", 59.33, 18.06, 30, 0); // 30 min stationary
  const v = buildDayView({
    staffId: "s1", organizationId: "org1", date: "2026-05-25",
    pings, knownTargets, manualOverrides: [], staffName: "Anna",
  });
  assertEquals(v.rawPingCount, 30);
  const knownSeg = v.segments.find((s) => s.type === "known_site");
  if (!knownSeg) throw new Error("expected at least one known_site segment");
  assertEquals(knownSeg.matched.id, "proj-1");
  assertEquals(knownSeg.matched.name, "Projekt Alfa");
  assertEquals(v.title.startsWith("Anna · "), true);
});

Deno.test("buildDayView applies manualOverride and flips hasOverride", () => {
  const pings = pingsAt("2026-05-25", 59.33, 18.06, 30, 0);
  const baseline = buildDayView({
    staffId: "s1", organizationId: "org1", date: "2026-05-25",
    pings, knownTargets, manualOverrides: [],
  });
  const knownSeg = baseline.segments.find((s) => s.type === "known_site");
  if (!knownSeg) throw new Error("setup: expected known_site");

  const overridden = buildDayView({
    staffId: "s1", organizationId: "org1", date: "2026-05-25",
    pings, knownTargets,
    manualOverrides: [{
      segmentKey: knownSeg.segmentKey,
      startIso: knownSeg.originalStartTime,
      endIso: new Date(Date.parse(knownSeg.originalEndTime) + 60 * 60_000).toISOString(),
      reason: "Glömde stämpla ut",
    }],
  });
  const editedSeg = overridden.segments.find((s) => s.segmentKey === knownSeg.segmentKey)!;
  assertEquals(editedSeg.manualOverride.hasOverride, true);
  assertEquals(editedSeg.manualOverride.reason, "Glömde stämpla ut");
  assertEquals(editedSeg.durationMinutes > knownSeg.durationMinutes, true);
  assertEquals(overridden.manualOverridesSummary.count, 1);
  assertEquals(overridden.manualOverridesSummary.appliedSegmentKeys[0], knownSeg.segmentKey);
});

Deno.test("buildDayView groups unknown vs known into separate rows", () => {
  const pings = [
    ...pingsAt("2026-05-25", 59.33, 18.06, 30, 0),        // known
    ...pingsAt("2026-05-25", 59.50, 18.50, 30, 120),      // far away → unknown
  ];
  const v = buildDayView({
    staffId: "s1", organizationId: "org1", date: "2026-05-25",
    pings, knownTargets, manualOverrides: [],
  });
  const hasProjectRow = v.rows.some((r) => r.rowKey === "project:proj-1");
  assertEquals(hasProjectRow, true);
});
