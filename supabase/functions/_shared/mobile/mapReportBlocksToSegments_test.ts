// Contract: mobile day-report mapper mirrors admin web 1:1.
//   - display_blocks_json takes priority over report_candidate_blocks_json
//   - raw engine-debug kinds (signal_gap, uncertain_transition,
//     missing_transition_evidence, micro_movement, internal_transport) are
//     dropped — they must NEVER reach the mobile UI as their own segments
//   - displayLabel is preferred over targetLabel/title
//   - warningReasons[] collapses into a single warningLabel
import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { mapReportBlocksToSegments, pickCacheBlocks } from "./mapReportBlocksToSegments.ts";

Deno.test("pickCacheBlocks prefers display_blocks_json", () => {
  const blocks = pickCacheBlocks({
    display_blocks_json: [{ id: "d1" }],
    report_candidate_blocks_json: [{ id: "c1" }],
  });
  assertEquals((blocks[0] as any).id, "d1");
});

Deno.test("pickCacheBlocks falls back to report_candidate_blocks_json", () => {
  const blocks = pickCacheBlocks({
    display_blocks_json: [],
    report_candidate_blocks_json: [{ id: "c1" }],
  });
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
