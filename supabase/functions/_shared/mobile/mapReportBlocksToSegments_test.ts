// Contract: mobile day-report mapper mirrors admin web 1:1.
//   - display_blocks_json takes priority over report_candidate_blocks_json
//   - raw engine-debug kinds (signal_gap, uncertain_transition,
//     missing_transition_evidence, micro_movement, internal_transport) are
//     dropped — they must NEVER reach the mobile UI as their own segments
//   - displayLabel is preferred over targetLabel/title
//   - warningReasons[] collapses into a single warningLabel
import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  mapReportBlocksToSegments,
  pickCacheBlocks,
  selectCacheBlockSource,
} from "./mapReportBlocksToSegments.ts";

// ─────────────────────────────────────────────────────────────────────
// Time Reporting Fix 6 — source selection + per-segment source stamping
// ─────────────────────────────────────────────────────────────────────

Deno.test("Fix6: selectCacheBlockSource — V2 with blocks → display_timeline_v2 (Eduards)", () => {
  const res = selectCacheBlockSource({
    display_blocks_json: [{ id: "lager", kind: "work", targetType: "warehouse" }],
    report_candidate_blocks_json: [{ id: "legacy" }],
  });
  assertEquals(res.source, "display_timeline_v2");
  assertEquals(res.selection.fallbackReason, "v2_present");
  assertEquals(res.selection.hasDisplayTimelineV2Field, true);
  assertEquals(res.selection.displayTimelineV2Count, 1);
  assertEquals(res.selection.reportCandidateCount, 1);
});

Deno.test("Fix6: selectCacheBlockSource — V2 empty (Billy) → none, NO legacy fallback", () => {
  const res = selectCacheBlockSource({
    display_blocks_json: [],
    report_candidate_blocks_json: [
      { id: "westmans", kind: "work", targetType: "project" },
      { id: "transport", kind: "transport" },
    ],
  });
  assertEquals(res.source, "none");
  assertEquals(res.blocks.length, 0);
  assertEquals(res.selection.fallbackReason, "v2_present_empty_no_fallback");
  assertEquals(res.selection.hasDisplayTimelineV2Field, true);
  assertEquals(res.selection.displayTimelineV2Count, 0);
  assertEquals(res.selection.reportCandidateCount, 2);
  assertEquals(res.selection.selectedSegmentSource, "none");
});

Deno.test("Fix6: selectCacheBlockSource — V2 field missing → report_candidate_legacy_fallback", () => {
  const res = selectCacheBlockSource({
    report_candidate_blocks_json: [{ id: "legacy", kind: "work", targetType: "project" }],
  } as any);
  assertEquals(res.source, "report_candidate_legacy_fallback");
  assertEquals(res.selection.fallbackReason, "v2_missing_used_legacy");
  assertEquals(res.selection.hasDisplayTimelineV2Field, false);
});

Deno.test("Fix6: selectCacheBlockSource — workday_allocation_segments_json fallback", () => {
  const res = selectCacheBlockSource({
    workday_allocation_segments_json: [
      { id: "wa1", kind: "work", targetType: "project", startAt: "x", endAt: "y" },
    ],
    report_candidate_blocks_json: [{ id: "legacy" }],
  } as any);
  assertEquals(res.source, "workday_allocation_fallback");
  assertEquals(res.selection.selectedSegmentSource, "workday_allocation_fallback");
});

Deno.test("Fix6: mapReportBlocksToSegments stamps source on every segment", () => {
  const segs = mapReportBlocksToSegments(
    [{
      id: "x", kind: "work", targetType: "warehouse", targetLabel: "Lager",
      startAt: "2026-05-13T08:00:00Z", endAt: "2026-05-13T09:00:00Z",
      durationMinutes: 60,
    }],
    { source: "report_candidate_legacy_fallback" },
  );
  assertEquals(segs.length, 1);
  assertEquals(segs[0].source, "report_candidate_legacy_fallback");
});

Deno.test("Fix6: mapReportBlocksToSegments default source = display_timeline_v2", () => {
  const segs = mapReportBlocksToSegments([{
    id: "x", kind: "work", targetType: "project",
    startAt: "2026-05-13T08:00:00Z", endAt: "2026-05-13T09:00:00Z",
    durationMinutes: 60,
  }]);
  assertEquals(segs[0].source, "display_timeline_v2");
});

// ─────────────────────────────────────────────────────────────────────
// Legacy pickCacheBlocks wrapper — kept for backwards compatibility
// ─────────────────────────────────────────────────────────────────────

Deno.test("pickCacheBlocks prefers display_blocks_json", () => {
  const blocks = pickCacheBlocks({
    display_blocks_json: [{ id: "d1" }],
    report_candidate_blocks_json: [{ id: "c1" }],
  });
  assertEquals((blocks[0] as any).id, "d1");
});

Deno.test("pickCacheBlocks: V2 explicit empty wins — NO fallback to candidate (Billy)", () => {
  // Time Reporting Fix 1: when displayTimelineBlocksV2 (display_blocks_json)
  // is an Array (even empty) it is an explicit V2 decision. Mobile must
  // mirror admin-Gantt and NOT fall back to legacy candidate blocks.
  const blocks = pickCacheBlocks({
    display_blocks_json: [],
    report_candidate_blocks_json: [{ id: "westmans" }, { id: "transport" }],
  });
  assertEquals(blocks.length, 0);
});

Deno.test("pickCacheBlocks falls back to candidate ONLY when V2 field is missing entirely", () => {
  const blocks = pickCacheBlocks({
    // display_blocks_json intentionally undefined (legacy backend)
    report_candidate_blocks_json: [{ id: "c1" }],
  } as any);
  assertEquals((blocks[0] as any).id, "c1");
});

Deno.test("pickCacheBlocks returns [] when both empty/missing", () => {
  assertEquals(pickCacheBlocks(null), []);
  assertEquals(pickCacheBlocks({}), []);
  assertEquals(
    pickCacheBlocks({ display_blocks_json: [], report_candidate_blocks_json: [] }),
    [],
  );
});

Deno.test("mapper drops raw engine-debug kinds", () => {
  const segs = mapReportBlocksToSegments([
    { id: "a", kind: "signal_gap", startAt: "2026-05-13T08:00:00Z", endAt: "2026-05-13T08:05:00Z", durationMinutes: 5 },
    { id: "b", kind: "uncertain_transition", startAt: "2026-05-13T08:05:00Z", endAt: "2026-05-13T08:10:00Z", durationMinutes: 5 },
    { id: "c", kind: "micro_movement", startAt: "2026-05-13T08:10:00Z", endAt: "2026-05-13T08:11:00Z", durationMinutes: 1 },
    { id: "d", kind: "internal_transport", startAt: "2026-05-13T08:11:00Z", endAt: "2026-05-13T08:13:00Z", durationMinutes: 2 },
    { id: "e", kind: "missing_transition_evidence", startAt: "2026-05-13T08:13:00Z", endAt: "2026-05-13T08:15:00Z", durationMinutes: 2 },
    { id: "f", kind: "work", targetType: "project", targetId: "p1", startAt: "2026-05-13T09:00:00Z", endAt: "2026-05-13T10:00:00Z", durationMinutes: 60 },
  ]);
  assertEquals(segs.length, 1);
  assertEquals(segs[0].id, "f");
});

Deno.test("mapper prefers displayLabel over targetLabel/title", () => {
  const segs = mapReportBlocksToSegments([{
    id: "x", kind: "work", targetType: "project", targetId: "p1",
    startAt: "2026-05-13T09:00:00Z", endAt: "2026-05-13T10:00:00Z",
    displayLabel: "Display!", targetLabel: "Target!", title: "Title!",
  }]);
  assertEquals(segs[0].label, "Display!");
});

Deno.test("mapper collapses warningReasons[] into warningLabel", () => {
  const segs = mapReportBlocksToSegments([{
    id: "x", kind: "work", targetType: "project", targetId: "p1",
    startAt: "2026-05-13T09:00:00Z", endAt: "2026-05-13T10:00:00Z",
    warningReasons: ["short_signal_gap", "low_gps_confidence", "ignored"],
  }]);
  assertEquals(segs[0].warningLabel, "short_signal_gap • low_gps_confidence");
});

Deno.test("explicit warningLabel wins over warningReasons", () => {
  const segs = mapReportBlocksToSegments([{
    id: "x", kind: "work", targetType: "project", targetId: "p1",
    startAt: "2026-05-13T09:00:00Z", endAt: "2026-05-13T10:00:00Z",
    warningLabel: "Pre-formatted",
    warningReasons: ["a", "b"],
  }]);
  assertEquals(segs[0].warningLabel, "Pre-formatted");
});

Deno.test("transport kind maps to travel; needs_review preserved", () => {
  const segs = mapReportBlocksToSegments([
    { id: "t", kind: "transport", startAt: "2026-05-13T09:00:00Z", endAt: "2026-05-13T09:30:00Z", durationMinutes: 30 },
    { id: "n", kind: "work", reviewState: "needs_review", targetType: "project", targetId: "p1", startAt: "2026-05-13T10:00:00Z", endAt: "2026-05-13T11:00:00Z", durationMinutes: 60 },
  ]);
  assertEquals(segs[0].kind, "travel");
  assertEquals(segs[1].kind, "needs_review");
});

Deno.test("only the last segment may be active", () => {
  const segs = mapReportBlocksToSegments([
    { id: "1", kind: "work", targetType: "project", targetId: "p", startAt: "2099-01-01T08:00:00Z", endAt: "2099-01-01T09:00:00Z", durationMinutes: 60 },
    { id: "2", kind: "work", targetType: "project", targetId: "p", startAt: "2099-01-01T09:00:00Z", endAt: "2099-01-01T10:00:00Z", durationMinutes: 60 },
  ]);
  assertEquals(segs[0].isActive, false);
  assertExists(segs[1]);
  // The last one is allowed to be active depending on `now`, but never the first.
});
