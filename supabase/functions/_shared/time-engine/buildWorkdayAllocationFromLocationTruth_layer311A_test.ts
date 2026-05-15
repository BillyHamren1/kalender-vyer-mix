// Lager 3.11A — Workday envelope ska klippas mot analysdagen.
// resolveWorkdayEnvelope: max(timerStart, dayStart) / min(timerEnd ?? now, dayEnd).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { resolveWorkdayEnvelope } from "./buildWorkdayAllocationFromLocationTruth.ts";

const DAY_START = "2026-05-15T00:00:00.000Z";
const DAY_END   = "2026-05-15T23:59:59.999Z";

Deno.test("3.11A: stängd timer helt inom dagen — ingen klippning", () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: "2026-05-15T08:00:00Z", stoppedAt: "2026-05-15T17:00:00Z" },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
  });
  assertEquals(env.startAt, "2026-05-15T08:00:00.000Z");
  assertEquals(env.endAt, "2026-05-15T17:00:00.000Z");
  assertEquals(env.isOpen, false);
  assert(!env.warnings.includes("workday_started_before_analysis_day"));
  assert(!env.warnings.includes("workday_continues_after_analysis_day"));
  assertEquals(env.timerStartedAt, "2026-05-15T08:00:00.000Z");
  assertEquals(env.timerStoppedAt, "2026-05-15T17:00:00.000Z");
  assertEquals(env.effectiveWorkdayStartAt, env.startAt);
  assertEquals(env.effectiveWorkdayEndAt, env.endAt);
});

Deno.test("3.11A: timer startade dagen innan — startAt klipps till dayStart", () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: "2026-05-14T22:00:00Z", stoppedAt: "2026-05-15T10:00:00Z" },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
  });
  assertEquals(env.startAt, DAY_START);
  assertEquals(env.endAt, "2026-05-15T10:00:00.000Z");
  assert(env.warnings.includes("workday_started_before_analysis_day"));
  assertEquals(env.timerStartedAt, "2026-05-14T22:00:00.000Z");
  assertEquals(env.effectiveWorkdayStartAt, DAY_START);
});

Deno.test("3.11A: timer slutar nästa dag — endAt klipps till dayEnd", () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: "2026-05-15T18:00:00Z", stoppedAt: "2026-05-16T02:00:00Z" },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
  });
  assertEquals(env.startAt, "2026-05-15T18:00:00.000Z");
  assertEquals(env.endAt, DAY_END);
  assertEquals(env.endSource, "analysis_window_end");
  assert(env.warnings.includes("workday_continues_after_analysis_day"));
  assertEquals(env.timerStoppedAt, "2026-05-16T02:00:00.000Z");
});

Deno.test("3.11A: öppen timer, now mitt på dagen — endAt = now, warning workday_timer_open", () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: "2026-05-15T08:00:00Z", stoppedAt: null },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
    nowIso: "2026-05-15T14:30:00Z",
  });
  assertEquals(env.startAt, "2026-05-15T08:00:00.000Z");
  assertEquals(env.endAt, "2026-05-15T14:30:00.000Z");
  assertEquals(env.isOpen, true);
  assertEquals(env.endSource, "now");
  assert(env.warnings.includes("workday_timer_open"));
  assert(!env.warnings.includes("workday_continues_after_analysis_day"));
  assertEquals(env.timerStoppedAt, null);
});

Deno.test("3.11A: öppen timer som startade dagen innan — startAt klipps + open warning", () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: "2026-05-14T18:00:00Z", stoppedAt: null },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
    nowIso: "2026-05-15T09:00:00Z",
  });
  assertEquals(env.startAt, DAY_START);
  assertEquals(env.endAt, "2026-05-15T09:00:00.000Z");
  assertEquals(env.isOpen, true);
  assert(env.warnings.includes("workday_started_before_analysis_day"));
  assert(env.warnings.includes("workday_timer_open"));
});

Deno.test("3.11A: öppen timer, now efter dayEnd — endAt klipps till dayEnd", () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: "2026-05-15T08:00:00Z", stoppedAt: null },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
    nowIso: "2026-05-16T05:00:00Z",
  });
  assertEquals(env.endAt, DAY_END);
  assertEquals(env.endSource, "analysis_window_end");
  assert(env.warnings.includes("workday_continues_after_analysis_day"));
});

Deno.test("3.11A: ingen timer alls — workday_start_missing + null effectives", () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: null, stoppedAt: null },
    analysisWindowStartIso: DAY_START,
    analysisWindowEndIso: DAY_END,
  });
  assertEquals(env.startAt, null);
  assertEquals(env.endAt, null);
  assertEquals(env.isOpen, false);
  assert(env.warnings.includes("workday_start_missing"));
  assertEquals(env.effectiveWorkdayStartAt, null);
  assertEquals(env.analysisDayStartAt, DAY_START);
  assertEquals(env.analysisDayEndAt, DAY_END);
});
