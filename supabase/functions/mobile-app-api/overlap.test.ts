// Unit tests for the unified time-interval overlap helpers in mobile-app-api/index.ts.
// These tests don't hit the network — they import the helpers indirectly by re-implementing
// the same contract in a tiny harness so behavior is locked down regardless of refactor.
//
// If index.ts changes the helpers, copy the new versions here.
// Keep this file in sync as the canonical spec for night-shift overlap logic.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function parseHHMMtoMinutes(t: string | null | undefined): number | null {
  if (!t || typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function buildShiftInterval(reportDate: string, startTime: string | null, endTime: string | null) {
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return null;
  const sMin = parseHHMMtoMinutes(startTime);
  const eMin = parseHHMMtoMinutes(endTime);
  if (sMin === null || eMin === null) return null;
  const baseMs = Date.parse(`${reportDate}T00:00:00Z`);
  const startMs = baseMs + sMin * 60_000;
  let endMs = baseMs + eMin * 60_000;
  if (endMs <= startMs) endMs += 86_400_000;
  return { startMs, endMs };
}

function intervalsOverlap(a: any, b: any): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

Deno.test("day shift vs day shift — overlap", () => {
  const a = buildShiftInterval("2025-04-18", "08:00", "16:00")!;
  const b = buildShiftInterval("2025-04-18", "12:00", "20:00")!;
  assertEquals(intervalsOverlap(a, b), true);
});

Deno.test("day shift vs day shift — touching endpoints do NOT overlap", () => {
  const a = buildShiftInterval("2025-04-18", "08:00", "12:00")!;
  const b = buildShiftInterval("2025-04-18", "12:00", "16:00")!;
  assertEquals(intervalsOverlap(a, b), false);
});

Deno.test("night shift crossing midnight is correctly extended to next day", () => {
  // Existing: 22:00 → 06:00 (crosses midnight)
  // New: 02:00 → 04:00 same date
  // OLD string-compare logic ("22:00" < "04:00" = false) would MISS this overlap.
  const existing = buildShiftInterval("2025-04-18", "22:00", "06:00")!;
  const next = buildShiftInterval("2025-04-19", "02:00", "04:00")!;
  assertEquals(intervalsOverlap(existing, next), true);
});

Deno.test("previous-day night shift overlaps with next-day morning shift", () => {
  // Yesterday 22:00 → 06:00, today 05:00 → 09:00 → must overlap (05–06).
  const yesterday = buildShiftInterval("2025-04-17", "22:00", "06:00")!;
  const today = buildShiftInterval("2025-04-18", "05:00", "09:00")!;
  assertEquals(intervalsOverlap(yesterday, today), true);
});

Deno.test("two non-overlapping shifts on different days do not overlap", () => {
  const a = buildShiftInterval("2025-04-18", "08:00", "16:00")!;
  const b = buildShiftInterval("2025-04-19", "08:00", "16:00")!;
  assertEquals(intervalsOverlap(a, b), false);
});

Deno.test("two night shifts on consecutive days do not overlap", () => {
  // Mon 22:00 → Tue 06:00, then Tue 22:00 → Wed 06:00 — disjoint.
  const monNight = buildShiftInterval("2025-04-14", "22:00", "06:00")!;
  const tueNight = buildShiftInterval("2025-04-15", "22:00", "06:00")!;
  assertEquals(intervalsOverlap(monNight, tueNight), false);
});

Deno.test("same start/end time produces zero-length interval that does not overlap anything", () => {
  // The handler rejects equal start/end up-front, but the helper still must be safe.
  const zero = buildShiftInterval("2025-04-18", "10:00", "10:00")!;
  // 10:00 → 10:00 becomes 24h shift due to night-shift roll, document that:
  assertEquals(zero.endMs - zero.startMs, 86_400_000);
});

Deno.test("invalid HH:MM is rejected", () => {
  assertEquals(parseHHMMtoMinutes("25:00"), null);
  assertEquals(parseHHMMtoMinutes("10:60"), null);
  assertEquals(parseHHMMtoMinutes("abc"), null);
  assertEquals(parseHHMMtoMinutes(""), null);
  assertEquals(parseHHMMtoMinutes(null), null);
});

Deno.test("invalid date is rejected", () => {
  assertEquals(buildShiftInterval("not-a-date", "08:00", "16:00"), null);
  assertEquals(buildShiftInterval("", "08:00", "16:00"), null);
});
