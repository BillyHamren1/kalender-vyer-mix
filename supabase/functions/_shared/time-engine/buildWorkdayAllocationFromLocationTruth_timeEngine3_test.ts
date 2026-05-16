// Time Engine 3 — open/stale timer utan same-day evidence får INTE skapa
// synlig workday-envelope eller heldagsglapp.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { buildWorkdayAllocationFromLocationTruth } from "./buildWorkdayAllocationFromLocationTruth.ts";

const DAY_START = "2026-05-16T00:00:00.000Z";
const DAY_END = "2026-05-16T23:59:59.999Z";

const NO_DIAGNOSTICS_LT = {
  segments: [],
  diagnostics: { date: "2026-05-16", staffId: "staff-x" },
} as any;

function fakeDayEvidence(opts: { pings?: number; firstPingAt?: string | null } = {}) {
  return {
    gps: {
      locationLogicPingCount: opts.pings ?? 0,
      firstPingAt: opts.firstPingAt ?? null,
      firstRecordedAt: opts.firstPingAt ?? null,
    },
    assignments: { items: [] },
  } as any;
}

Deno.test("TE3: Raivis-case — open timer + 0 pings → ingen synlig workday, ingen uncovered", () => {
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: fakeDayEvidence({ pings: 0 }),
    locationTruthV2: NO_DIAGNOSTICS_LT,
    activeWorkday: { startedAt: "2026-05-15T18:00:00.000Z", stoppedAt: null, staffId: "raivis", date: "2026-05-16" },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
    nowIso: "2026-05-16T20:59:00.000Z",
  });
  const d = wda.diagnostics;
  assertEquals(d.hasActiveWorkday, false);
  assertEquals(d.workdayEnvelopeFound, false);
  assertEquals(d.workdayStartAt, null);
  assertEquals(d.workdayEndAt, null);
  assertEquals(d.uncoveredWorkdayMinutes, 0);
  assertEquals(d.uncoveredGapsProposedCount, 0);
  assert(d.warnings.includes("open_timer_without_same_day_evidence"));
  assert(d.warnings.includes("no_active_workday"));
  // Inga proposals → ingen "Glapp i dagen" i display timeline.
  assertEquals(wda.proposals.length, 0);
});

Deno.test("TE3: Stale open timer + pings börjar 08:15 → effektiv start = 08:15, inte 00:00", () => {
  const firstPing = "2026-05-16T08:15:00.000Z";
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: fakeDayEvidence({ pings: 250, firstPingAt: firstPing }),
    locationTruthV2: NO_DIAGNOSTICS_LT,
    activeWorkday: { startedAt: "2026-05-15T18:00:00.000Z", stoppedAt: null, staffId: "markuss", date: "2026-05-16" },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
    nowIso: "2026-05-16T20:59:00.000Z",
  });
  const d = wda.diagnostics;
  assertEquals(d.hasActiveWorkday, true);
  assertEquals(d.workdayStartAt, firstPing);
  assertEquals(d.workdayEnvelope.effectiveWorkdayStartAt, firstPing);
  assert(d.warnings.includes("workday_start_adjusted_to_first_evidence"));
  assert(!d.warnings.includes("open_timer_without_same_day_evidence"));
});

Deno.test("TE3: Riktig same-day open timer med pings → normal envelope, ingen suppression", () => {
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: fakeDayEvidence({ pings: 100, firstPingAt: "2026-05-16T07:05:00.000Z" }),
    locationTruthV2: NO_DIAGNOSTICS_LT,
    activeWorkday: { startedAt: "2026-05-16T07:00:00.000Z", stoppedAt: null, staffId: "alice", date: "2026-05-16" },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
    nowIso: "2026-05-16T15:00:00.000Z",
  });
  const d = wda.diagnostics;
  assertEquals(d.hasActiveWorkday, true);
  assertEquals(d.workdayStartAt, "2026-05-16T07:00:00.000Z");
  assert(!d.warnings.includes("open_timer_without_same_day_evidence"));
  assert(!d.warnings.includes("workday_start_adjusted_to_first_evidence"));
});

Deno.test("TE3: Stängd timer utan evidence → ingen suppression (gammal beteende bevaras)", () => {
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: fakeDayEvidence({ pings: 0 }),
    locationTruthV2: NO_DIAGNOSTICS_LT,
    activeWorkday: {
      startedAt: "2026-05-16T08:00:00.000Z",
      stoppedAt: "2026-05-16T16:00:00.000Z",
      staffId: "bob",
      date: "2026-05-16",
    },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
  });
  const d = wda.diagnostics;
  assertEquals(d.hasActiveWorkday, true);
  assert(!d.warnings.includes("open_timer_without_same_day_evidence"));
});
