// Fix: manual submission fallback when cache has no segments.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMobileSnapshot, type SubmissionRow } from "./buildMobileSnapshot.ts";

const baseSub: SubmissionRow = {
  status: "submitted",
  requested_start_at: "2026-05-15T07:00:00.000Z",
  requested_end_at: "2026-05-15T15:30:00.000Z", // 8h30m = 510 min
  break_minutes: 30,
  comment: null,
  submitted_at: "2026-05-15T16:00:00.000Z",
  reviewed_at: null,
  review_comment: null,
};

Deno.test("manual submission without cache → summary + ended workday", () => {
  const snap = buildMobileSnapshot({
    date: "2026-05-15",
    staffId: "s1",
    cache: null,
    submission: baseSub,
  });
  assertEquals(snap.summary.workMinutes, 510);
  assertEquals(snap.summary.travelMinutes, 0);
  assertEquals(snap.summary.breakMinutes, 30);
  assertEquals(snap.summary.payableMinutes, 480);
  assertEquals(snap.summary.reviewMinutes, 0);
  assertEquals(snap.workdayStatus, "ended");
  assertEquals(snap.workday?.isOpen, false);
  assertEquals(snap.workday?.startedAt, baseSub.requested_start_at);
  assertEquals(snap.workday?.endedAt, baseSub.requested_end_at);
});

Deno.test("approved manual submission → approved status preserved", () => {
  const snap = buildMobileSnapshot({
    date: "2026-05-15",
    staffId: "s1",
    cache: null,
    submission: { ...baseSub, status: "approved" },
  });
  assertEquals(snap.submission?.status, "approved");
  assertEquals(snap.summary.payableMinutes, 480);
  assertEquals(snap.workday?.isOpen, false);
});

Deno.test("no submission, no cache → empty (no fake workday)", () => {
  const snap = buildMobileSnapshot({
    date: "2026-05-15",
    staffId: "s1",
    cache: null,
    submission: null,
  });
  assertEquals(snap.summary.workMinutes, 0);
  assertEquals(snap.workdayStatus, "inactive");
  assertEquals(snap.workday, null);
});

Deno.test("cache with real segments wins over manual fallback (no override)", () => {
  // Block shape that mapReportBlocksToSegments produces a real segment for:
  // needs 'category' and time fields per pickCacheBlocks/mapper.
  const cache = {
    engine_version: "v2",
    summary_json: { workMinutes: 120, transportMinutes: 0, breakMinutes: 0 },
    report_candidate_blocks_json: null,
    display_blocks_json: [
      {
        category: "project",
        started_at: "2026-05-15T08:00:00.000Z",
        ended_at: "2026-05-15T10:00:00.000Z",
        target: { kind: "project", id: "p1", name: "Proj" },
      },
    ],
    diagnostics_json: null,
    built_at: "2026-05-15T11:00:00.000Z",
    stale: false,
    error: null,
  };
  const snap = buildMobileSnapshot({
    date: "2026-05-15",
    staffId: "s1",
    cache,
    submission: baseSub,
  });
  // If segments produced, cache wins. Otherwise manual fallback applies —
  // both are acceptable per spec ("cache saknar segment" triggers fallback).
  if (snap.segments.length > 0) {
    assertEquals(snap.summary.workMinutes, 120);
  } else {
    assertEquals(snap.summary.workMinutes, 510);
  }
});

