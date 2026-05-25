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

// ─────────────────────────────────────────────────────────────────────────────
// Nya tester: Boende vs Lager + döda fantomresor
// ─────────────────────────────────────────────────────────────────────────────

const HOME_LAT = 59.40;
const HOME_LNG = 18.10;
const LAGER_LAT = 59.4001;
const LAGER_LNG = 18.1003; // ~25 m bort
const PROJ_LAT = 59.33;
const PROJ_LNG = 18.06;

const dualTargets: KnownPlace[] = [
  { id: "proj-1", type: "project", name: "Projekt Alfa", lat: PROJ_LAT, lng: PROJ_LNG, radiusM: 100 },
  { id: "lager-1", type: "location", name: "Lager Stockholm", lat: LAGER_LAT, lng: LAGER_LNG, radiusM: 80 },
  { id: "boende-1", type: "home", name: "Boende Norra", lat: HOME_LAT, lng: HOME_LNG, radiusM: 15 },
];

function pingsAtMin(date: string, lat: number, lng: number, count: number, startMin: number, stepMin = 1): RawPingInput[] {
  const out: RawPingInput[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(`${date}T00:00:00Z`).getTime() + (startMin + i * stepMin) * 60_000;
    out.push({ recorded_at: new Date(t).toISOString(), lat, lng, accuracy: 10 });
  }
  return out;
}

Deno.test("Boende + lager bredvid varandra: lager vinner över home", () => {
  // Pings i lager-polygon (men nära boendet)
  const pings = pingsAtMin("2026-05-25", LAGER_LAT, LAGER_LNG, 30, 8 * 60);
  const v = buildDayView({
    staffId: "s1", organizationId: "org1", date: "2026-05-25",
    pings, knownTargets: dualTargets, manualOverrides: [],
  });
  const matched = v.segments.find((s) => s.type === "known_site");
  if (!matched) throw new Error("expected a known_site segment");
  assertEquals(matched.matched.kind, "location");
  assertEquals(matched.matched.id, "lager-1");
});

Deno.test("Inga 9h fantomresor: glesa pings långt från allt blir gps_gap/unknown_place, inte travel", () => {
  // Projekt 08–13 (klustrade)
  const projectPings = pingsAtMin("2026-05-25", PROJ_LAT, PROJ_LNG, 60, 8 * 60, 5);
  // Sedan glesa pings långt från allt 13–22 (1 ping var 30:e min, ~1 m drift)
  const farPings: RawPingInput[] = [];
  for (let i = 0; i < 18; i++) {
    const t = new Date(`2026-05-25T13:00:00Z`).getTime() + i * 30 * 60_000;
    farPings.push({
      recorded_at: new Date(t).toISOString(),
      lat: 59.80 + i * 0.00001,
      lng: 18.80 + i * 0.00001,
      accuracy: 10,
    });
  }
  const v = buildDayView({
    staffId: "s1", organizationId: "org1", date: "2026-05-25",
    pings: [...projectPings, ...farPings], knownTargets: dualTargets, manualOverrides: [],
  });
  // INGEN travel-segment får vara ≥ 60 min utan destination
  const longOpenTravel = v.segments.find(
    (s) => s.kind === "travel" && s.durationMinutes >= 60 && !s.matched.id,
  );
  if (longOpenTravel) {
    throw new Error(
      `Fantomresa kvar: ${longOpenTravel.durationMinutes} min, reason=${(longOpenTravel as any).type}`,
    );
  }
  // Vi förväntar oss antingen gps_gap eller unknown_place för eftermiddagen
  const hasGapOrUnknown = v.segments.some(
    (s) => s.kind === "gps_gap" || (s.kind === "stay" && s.type === "unknown_place"),
  );
  assertEquals(hasGapOrUnknown, true);
});

Deno.test("Hela eftermiddagen i boendet: visas som Boende-stay, INTE som Resa", () => {
  // Använd separata targets där boendet INTE överlappar något lager.
  const HOME_ONLY_LAT = 59.60;
  const HOME_ONLY_LNG = 18.20;
  const isolatedTargets: KnownPlace[] = [
    { id: "proj-1", type: "project", name: "Projekt Alfa", lat: PROJ_LAT, lng: PROJ_LNG, radiusM: 100 },
    { id: "boende-iso", type: "home", name: "Boende Isolerad", lat: HOME_ONLY_LAT, lng: HOME_ONLY_LNG, radiusM: 15 },
  ];
  const projectPings = pingsAtMin("2026-05-25", PROJ_LAT, PROJ_LNG, 60, 8 * 60, 5);
  const homePings = pingsAtMin("2026-05-25", HOME_ONLY_LAT, HOME_ONLY_LNG, 60, 14 * 60, 8);
  const v = buildDayView({
    staffId: "s1", organizationId: "org1", date: "2026-05-25",
    pings: [...projectPings, ...homePings], knownTargets: isolatedTargets, manualOverrides: [],
  });
  const homeStay = v.segments.find(
    (s) => s.kind === "stay" && s.matched.kind === "home" && s.matched.id === "boende-iso",
  );
  if (!homeStay) {
    throw new Error(
      `Förväntade Boende-stay. Segments: ${JSON.stringify(v.segments.map((s) => ({ k: s.kind, t: s.type, m: s.matched.kind, lbl: s.label, dur: s.durationMinutes })))}`,
    );
  }
  if (!v.subtitle.includes("Boende")) {
    throw new Error(`Subtitle saknar Boende: ${v.subtitle}`);
  }
  // Hem räknas inte som Arbete
  assertEquals(v.totals.workMinutes < homeStay.durationMinutes + 60, true);
});
