// Validation contract for submit-staff-day-v3.
// Tests the pure helpers used by the edge function — start/end/break/payable
// rules + Stockholm-day match. No DB calls, no auth.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const TZ = "Europe/Stockholm";
const MAX_GROSS_MIN = 16 * 60;
const MAX_BREAK_MIN = 600;

function stockholmDateOf(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(t));
  return /^\d{4}-\d{2}-\d{2}$/.test(parts) ? parts : null;
}

// Pure replica of edge-function validation flow.
function validateSubmission(input: {
  date: string;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  breakMinutes: number;
}): { ok: true } | { ok: false; error: string } {
  const { date, requestedStartAt: reqStart, requestedEndAt: reqEnd } = input;
  const breakMin = Math.max(0, Math.round(Number(input.breakMinutes ?? 0)));
  if (!reqStart || !reqEnd) return { ok: false, error: "requestedStartAt och requestedEndAt krävs" };
  const startMs = Date.parse(reqStart);
  const endMs = Date.parse(reqEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, error: "Ogiltig start- eller sluttid" };
  }
  if (startMs >= endMs) return { ok: false, error: "Starttid måste vara före sluttid" };
  const grossMin = Math.round((endMs - startMs) / 60000);
  if (grossMin > MAX_GROSS_MIN) return { ok: false, error: "gross>16h" };
  if (breakMin < 0 || breakMin > MAX_BREAK_MIN) return { ok: false, error: "break out of range" };
  if (grossMin - breakMin <= 0) return { ok: false, error: "payable<=0" };
  const dateOfStart = stockholmDateOf(reqStart);
  if (!dateOfStart || dateOfStart !== date) {
    return { ok: false, error: `date mismatch (${dateOfStart})` };
  }
  return { ok: true };
}

Deno.test("happy path → ok", () => {
  const r = validateSubmission({
    date: "2026-05-15",
    requestedStartAt: "2026-05-15T07:00:00Z", // 09:00 Stockholm (summer)
    requestedEndAt: "2026-05-15T15:00:00Z",
    breakMinutes: 30,
  });
  assertEquals(r.ok, true);
});

Deno.test("missing start → reject", () => {
  const r = validateSubmission({
    date: "2026-05-15", requestedStartAt: null, requestedEndAt: "2026-05-15T15:00:00Z", breakMinutes: 30,
  });
  assertEquals(r.ok, false);
});

Deno.test("start >= end → reject", () => {
  const r = validateSubmission({
    date: "2026-05-15",
    requestedStartAt: "2026-05-15T10:00:00Z",
    requestedEndAt: "2026-05-15T10:00:00Z",
    breakMinutes: 0,
  });
  assertEquals(r.ok, false);
});

Deno.test("gross > 16h → reject", () => {
  const r = validateSubmission({
    date: "2026-05-15",
    requestedStartAt: "2026-05-15T00:00:00Z",
    requestedEndAt: "2026-05-15T17:00:00Z", // 17h
    breakMinutes: 0,
  });
  assertEquals(r.ok, false);
});

Deno.test("break > 600 → reject", () => {
  const r = validateSubmission({
    date: "2026-05-15",
    requestedStartAt: "2026-05-15T07:00:00Z",
    requestedEndAt: "2026-05-15T17:00:00Z",
    breakMinutes: 601,
  });
  assertEquals(r.ok, false);
});

Deno.test("payable <= 0 (break swallows gross) → reject", () => {
  const r = validateSubmission({
    date: "2026-05-15",
    requestedStartAt: "2026-05-15T08:00:00Z",
    requestedEndAt: "2026-05-15T08:30:00Z", // 30 min gross
    breakMinutes: 30,
  });
  assertEquals(r.ok, false);
});

Deno.test("Stockholm date mismatch → reject", () => {
  // 23:30 UTC = 01:30 Stockholm next day (summer) → datumet i payload borde
  // matcha den lokala dagen, inte UTC-dagen.
  const r = validateSubmission({
    date: "2026-05-15", // fel: lokal dag är 2026-05-16
    requestedStartAt: "2026-05-15T23:30:00Z",
    requestedEndAt: "2026-05-16T06:00:00Z",
    breakMinutes: 0,
  });
  assertEquals(r.ok, false);
});

Deno.test("Stockholm date match across DST → ok", () => {
  const r = validateSubmission({
    date: "2026-05-16",
    requestedStartAt: "2026-05-15T23:30:00Z", // 01:30 Stockholm den 16:e
    requestedEndAt: "2026-05-16T06:00:00Z",
    breakMinutes: 0,
  });
  assertEquals(r.ok, true);
});
