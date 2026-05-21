import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateAutoApply, type ApplyContext } from "./applySuggestion.ts";

const baseCtx: ApplyContext = {
  blockId: "tr-1",
  staffId: "s1",
  organizationId: "org-1",
  reportDate: "2026-05-21",
  currentBlock: {
    start_time: "08:00",
    end_time: "16:00",
    approved: false,
    is_subdivision: false,
    booking_id: null,
    large_project_id: null,
    location_id: null,
  },
};

Deno.test("blocks auto-apply on approved", () => {
  const d = evaluateAutoApply(
    { verdict: "auto_apply", confidence: 0.95, reasoning: "x", action: { suggestion_type: "trim_end", suggested_end_time: "15:55", apply_rule: "geofence_exit_trim_10min", human_readable: "x" } },
    { ...baseCtx, currentBlock: { ...baseCtx.currentBlock, approved: true } },
  );
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "approved_lock");
});

Deno.test("blocks auto-apply on subdivision", () => {
  const d = evaluateAutoApply(
    { verdict: "auto_apply", confidence: 0.95, reasoning: "x", action: { suggestion_type: "trim_end", suggested_end_time: "15:55", apply_rule: "geofence_exit_trim_10min", human_readable: "x" } },
    { ...baseCtx, currentBlock: { ...baseCtx.currentBlock, is_subdivision: true } },
  );
  assertEquals(d.allowed, false);
});

Deno.test("blocks trim > 10 min", () => {
  const d = evaluateAutoApply(
    { verdict: "auto_apply", confidence: 0.95, reasoning: "x", action: { suggestion_type: "trim_end", suggested_end_time: "15:30", apply_rule: "geofence_exit_trim_10min", human_readable: "x" } },
    baseCtx,
  );
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "trim_exceeds_10min");
});

Deno.test("allows trim ≤ 10 min", () => {
  const d = evaluateAutoApply(
    { verdict: "auto_apply", confidence: 0.95, reasoning: "x", action: { suggestion_type: "trim_end", suggested_end_time: "15:55", apply_rule: "geofence_exit_trim_10min", human_readable: "x" } },
    baseCtx,
  );
  assertEquals(d.allowed, true);
  assertEquals(d.patch?.end_time, "15:55");
});

Deno.test("blocks confidence < 0.85", () => {
  const d = evaluateAutoApply(
    { verdict: "auto_apply", confidence: 0.7, reasoning: "x", action: { suggestion_type: "trim_end", suggested_end_time: "15:55", apply_rule: "geofence_exit_trim_10min", human_readable: "x" } },
    baseCtx,
  );
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "confidence_too_low");
});

Deno.test("blocks rule not in allowlist", () => {
  const d = evaluateAutoApply(
    { verdict: "auto_apply", confidence: 0.95, reasoning: "x", action: { suggestion_type: "delete_block", apply_rule: "delete_anything", human_readable: "x" } as never },
    baseCtx,
  );
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "rule_not_in_allowlist");
});

Deno.test("merge requires human", () => {
  const d = evaluateAutoApply(
    { verdict: "auto_apply", confidence: 0.95, reasoning: "x", action: { suggestion_type: "merge_with_next", apply_rule: "merge_same_target_gap_5min", human_readable: "x" } },
    baseCtx,
  );
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "merge_requires_human_for_now");
});

Deno.test("unknown_target sets large_project_id", () => {
  const d = evaluateAutoApply(
    { verdict: "auto_apply", confidence: 0.92, reasoning: "x", action: { suggestion_type: "change_target_to_project", target_project_id: "lp-1", apply_rule: "unknown_target_inside_geofence", human_readable: "x" } },
    baseCtx,
  );
  assertEquals(d.allowed, true);
  assertEquals(d.patch?.large_project_id, "lp-1");
});
