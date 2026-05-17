// Time Reporting Fix 2 — segments får ALDRIG flippa dagen till "ended".
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMobileSnapshot, type SubmissionRow } from "./buildMobileSnapshot.ts";

const baseSub: SubmissionRow = {
  status: "submitted",
  requested_start_at: "2026-05-15T07:00:00.000Z",
  requested_end_at: "2026-05-15T15:30:00.000Z",
  break_minutes: 30,
  comment: null,
  submitted_at: "2026-05-15T16:00:00.000Z",
  reviewed_at: null,
  review_comment: null,
};

Deno.test("manual submission without cache → submitted_day", () => {
  const snap = buildMobileSnapshot({
    date: "2026-05-15", staffId: "s1", cache: null, submission: baseSub,
  });
  assertEquals(snap.summary.payableMinutes, 480);
  assertEquals(snap.workdayStatus, "ended");
  assertEquals(snap.workday?.isOpen, false);
  assertEquals(snap.dayStatus, "submitted_day");
});

Deno.test("approved submission → submitted_day", () => {
  const snap = buildMobileSnapshot({
    date: "2026-05-15", staffId: "s1", cache: null,
    submission: { ...baseSub, status: "approved" },
  });
  assertEquals(snap.submission?.status, "approved");
  assertEquals(snap.dayStatus, "submitted_day");
});

Deno.test("empty day → empty_day", () => {
  const snap = buildMobileSnapshot({
    date: "2026-05-15", staffId: "s1", cache: null, submission: null,
  });
  assertEquals(snap.workdayStatus, "inactive");
  assertEquals(snap.workday, null);
  assertEquals(snap.dayStatus, "empty_day");
});

Deno.test("Billy: alla segment har endedAt, ingen submission → has_time_not_submitted (INTE ended_day)", () => {
  const cache = {
    engine_version: "v2",
    summary_json: { workMinutes: 143, transportMinutes: 18, breakMinutes: 0 },
    report_candidate_blocks_json: null,
    display_blocks_json: [
      {
        id: "b1", kind: "work", targetType: "project", targetId: "p-westmans",
        startAt: "2026-05-17T07:56:00.000Z", endAt: "2026-05-17T10:22:00.000Z",
        durationMinutes: 146, displayLabel: "Westmans",
      },
      {
        id: "b2", kind: "transport",
        startAt: "2026-05-17T10:22:00.000Z", endAt: "2026-05-17T10:40:00.000Z",
        durationMinutes: 18, displayLabel: "Resa",
      },
    ],
    diagnostics_json: null,
    built_at: "2026-05-17T11:00:00.000Z",
    stale: false, error: null,
  };
  const snap = buildMobileSnapshot({
    date: "2026-05-17", staffId: "billy", cache, submission: null,
  });
  // Workday-objektet får INTE rapportera endedAt eller status="ended".
  assertEquals(snap.workday?.endedAt, null);
  assertEquals(snap.workdayStatus !== "ended", true);
  // DayStatus är has_time_not_submitted — INTE ended_day.
  assertEquals(snap.dayStatus, "has_time_not_submitted");
  assertEquals(snap.debugDayStatus.hasSubmission, false);
  assertEquals(snap.debugDayStatus.hasExplicitStoppedAt, false);
  assertEquals(snap.debugDayStatus.lastSegmentKind, "travel");
});

Deno.test("Transport som sista segment avslutar INTE arbetsdagen", () => {
  const cache = {
    engine_version: "v2",
    summary_json: {},
    report_candidate_blocks_json: null,
    display_blocks_json: [
      {
        id: "t1", kind: "transport",
        startAt: "2025-05-17T14:00:00.000Z", endAt: "2025-05-17T14:30:00.000Z",
        durationMinutes: 30,
      },
    ],
    diagnostics_json: null, built_at: null, stale: false, error: null,
  };
  const snap = buildMobileSnapshot({
    date: "2026-05-17", staffId: "x", cache, submission: null,
  });
  assertEquals(snap.dayStatus, "has_time_not_submitted");
  assertEquals(snap.workday?.endedAt, null);
});

Deno.test("Aktivt segment → active_day", () => {
  const cache = {
    engine_version: "v2", summary_json: {},
    report_candidate_blocks_json: null,
    display_blocks_json: [
      {
        id: "a1", kind: "work", targetType: "project", targetId: "p1",
        startAt: "2099-05-17T07:00:00.000Z", endAt: "2099-05-17T23:00:00.000Z",
        durationMinutes: 960,
      },
    ],
    diagnostics_json: null, built_at: null, stale: false, error: null,
  };
  const snap = buildMobileSnapshot({
    date: "2099-05-17", staffId: "x", cache, submission: null,
  });
  assertEquals(snap.dayStatus, "active_day");
  assertEquals(snap.workday?.isOpen, true);
});
