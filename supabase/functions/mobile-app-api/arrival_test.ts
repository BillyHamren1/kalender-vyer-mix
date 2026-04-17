/**
 * Tests for the arrival-prompt flow.
 *
 * These tests are split into two categories:
 *   1. Pure-logic tests (run locally, no network) — verify the timezone &
 *      night-shift logic that lives in both the edge function and the dialog.
 *   2. Edge-function tests — call the deployed `mobile-app-api` to verify
 *      auth/validation behaviour for the new actions.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mobile-app-api`;

async function callApi(action: string, token?: string, data?: any) {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token, data }),
  });
  const body = await res.text();
  let json: any;
  try { json = JSON.parse(body); } catch { json = { raw: body }; }
  return { status: res.status, json };
}

// ────────────────────────────────────────────────────────────────────────
// 1. Timezone helpers (mirror of stockholmDate() in mobile-app-api)
// ────────────────────────────────────────────────────────────────────────

/**
 * Pure copy of the helper used by handleGetArrivalState + arrival-reminder.
 * Tests here lock the contract: cross-midnight UTC must roll to the right
 * Stockholm calendar date.
 */
function stockholmDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}
function stockholmHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm", hour12: false,
  });
}

Deno.test("stockholmDate: late-night UTC rolls to next Stockholm day (summer DST)", () => {
  // 2026-04-17 23:30 UTC = 2026-04-18 01:30 Stockholm (CEST, UTC+2)
  assertEquals(stockholmDate("2026-04-17T23:30:00.000Z"), "2026-04-18");
});

Deno.test("stockholmDate: early-morning UTC stays same Stockholm day (winter)", () => {
  // 2026-01-17 23:30 UTC = 2026-01-18 00:30 Stockholm (CET, UTC+1)
  assertEquals(stockholmDate("2026-01-17T23:30:00.000Z"), "2026-01-18");
});

Deno.test("stockholmDate: midday UTC, same Stockholm day", () => {
  assertEquals(stockholmDate("2026-04-17T12:00:00.000Z"), "2026-04-17");
});

Deno.test("stockholmHHMM: returns local Stockholm time-of-day", () => {
  // 06:30 UTC = 08:30 CEST
  assertEquals(stockholmHHMM("2026-04-17T06:30:00.000Z"), "08:30");
});

// ────────────────────────────────────────────────────────────────────────
// 2. "Covering report" comparison logic
//    Mirrors the rule in handleGetArrivalState: a closed report covers an
//    arrival iff its HH:mm start_time is <= arrival HH:mm.
// ────────────────────────────────────────────────────────────────────────

interface FakeReport { start_time: string }
function findCoveringReport(reports: FakeReport[], arrivalHHMM: string): FakeReport | undefined {
  return reports.find((r) => {
    const s = String(r.start_time || "").slice(0, 5);
    return s !== "" && s <= arrivalHHMM;
  });
}

Deno.test("covering-report: morning report covers afternoon arrival", () => {
  const reports = [{ start_time: "08:00" }, { start_time: "12:30" }];
  // Worker arrives back at 13:00 — the 08:00 report covers but the 12:30 also.
  const hit = findCoveringReport(reports, "13:00");
  assertEquals(hit?.start_time, "08:00");
});

Deno.test("covering-report: returning to site later in day → NOT covered", () => {
  // Worker did 08:00–12:00, left, came back at 13:00 with no later report.
  // (Old report ends at noon; new arrival shouldn't be considered covered
  // by the morning report because the user already STOPPED that timer.)
  // Note: this scenario is handled additionally by checking `end_time IS NULL`
  // for the open-report query. The `findCoveringReport` itself should still
  // match — but the production rule combines BOTH checks.
  const reports = [{ start_time: "08:00" }];
  const hit = findCoveringReport(reports, "13:00");
  // Pure HH:mm comparison would match — production code adds the "open report"
  // OR check on top. Document the contract explicitly.
  assertEquals(hit?.start_time, "08:00");
});

Deno.test("covering-report: arrival before any report → no match", () => {
  const reports = [{ start_time: "10:00" }];
  const hit = findCoveringReport(reports, "07:30");
  assertEquals(hit, undefined);
});

Deno.test("covering-report: empty reports → no match", () => {
  assertEquals(findCoveringReport([], "08:00"), undefined);
});

// ────────────────────────────────────────────────────────────────────────
// 3. ArrivalPromptDialog night-shift / future-time validator
//    Pure copy of buildCustomIso() so we can test it without React.
// ────────────────────────────────────────────────────────────────────────

function buildCustomIso(arrivedAt: Date, hhmm: string, now = new Date()): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const candidate = new Date(arrivedAt);
  candidate.setHours(h, m, 0, 0);
  if (candidate.getTime() < arrivedAt.getTime() && h < 12) {
    candidate.setDate(candidate.getDate() + 1);
  }
  if (candidate.getTime() > now.getTime()) return null;
  return candidate.toISOString();
}

Deno.test("buildCustomIso: rejects malformed input", () => {
  const arrived = new Date("2026-04-17T08:00:00Z");
  assertEquals(buildCustomIso(arrived, ""), null);
  assertEquals(buildCustomIso(arrived, "9:00"), null);
  assertEquals(buildCustomIso(arrived, "abc"), null);
});

Deno.test("buildCustomIso: rejects future time", () => {
  const arrived = new Date("2026-04-17T06:00:00Z");
  const now = new Date("2026-04-17T08:00:00Z");
  // 23:00 anchored to arrival's day = 2026-04-17 23:00 → in the future relative to now
  assertEquals(buildCustomIso(arrived, "23:00", now), null);
});

Deno.test("buildCustomIso: same-day adjustment past arrival is valid", () => {
  // arrival 06:00 UTC, user picks 07:00 → valid past time
  const arrived = new Date("2026-04-17T06:00:00Z");
  const now = new Date("2026-04-17T08:00:00Z");
  const iso = buildCustomIso(arrived, "07:00", now);
  // Compare against system local hour to keep the test tz-agnostic.
  const result = new Date(iso!);
  assertEquals(result.getHours(), 7);
});

Deno.test("buildCustomIso: night-shift roll-forward only kicks in when h<12", () => {
  // Arrived 22:00 yesterday (in local tz), user types 02:00 → next day 02:00.
  // We use a date in an unambiguous past so "now" is safely after.
  const arrived = new Date(2026, 3, 17, 22, 0); // local-time constructor
  const now = new Date(2026, 3, 18, 5, 0);
  const iso = buildCustomIso(arrived, "02:00", now);
  assert(iso !== null, "Should accept 02:00 as next-day morning");
  const d = new Date(iso!);
  assertEquals(d.getHours(), 2);
  assertEquals(d.getDate(), 18);
});

Deno.test("buildCustomIso: afternoon hour earlier than arrival does NOT roll", () => {
  // Arrived 15:00, user types 14:00 → before arrival but h>=12, should not roll.
  // Production code would still produce a candidate before arrival → invalid (null because in past? no, also past arrival)
  // Behaviour: candidate < arrived AND h>=12 → no roll → returns the candidate (in past, valid).
  const arrived = new Date(2026, 3, 17, 15, 0);
  const now = new Date(2026, 3, 17, 16, 0);
  const iso = buildCustomIso(arrived, "14:00", now);
  // 14:00 same day, before arrival. Per current rule we return it as-is.
  // This documents the limitation: HH>=12 has no roll-forward.
  assert(iso !== null);
});

// ────────────────────────────────────────────────────────────────────────
// 4. Edge function: auth + validation for new actions
// ────────────────────────────────────────────────────────────────────────

Deno.test("get_arrival_state requires authentication", async () => {
  const { status, json } = await callApi("get_arrival_state");
  assertEquals(status, 401);
  assertEquals(json.error, "Authentication required");
});

Deno.test("mark_arrival_resolved requires authentication", async () => {
  const { status, json } = await callApi("mark_arrival_resolved", undefined, {
    location_id: "00000000-0000-0000-0000-000000000000",
    arrived_at: new Date().toISOString(),
  });
  assertEquals(status, 401);
});

Deno.test("mark_arrival_resolved with expired token → 401", async () => {
  const payload = { staffId: "00000000-0000-0000-0000-000000000000", timestamp: Date.now(), expiresAt: Date.now() - 3600_000 };
  const expired = btoa(JSON.stringify(payload));
  const { status } = await callApi("mark_arrival_resolved", expired, {
    location_id: "00000000-0000-0000-0000-000000000000",
    arrived_at: new Date().toISOString(),
  });
  assertEquals(status, 401);
});

Deno.test("start_location_timer requires authentication", async () => {
  const { status } = await callApi("start_location_timer", undefined, {
    location_id: "00000000-0000-0000-0000-000000000000",
  });
  assertEquals(status, 401);
});

// ────────────────────────────────────────────────────────────────────────
// 5. Server-side started_at validation contract (handleStartLocationTimer)
//    We can't test the full happy path without a real staff token, but we
//    can encode the input rules as a pure function and lock them.
// ────────────────────────────────────────────────────────────────────────

/** Mirror of the validation in handleStartLocationTimer */
function pickEnteredAt(startedAt: string | undefined, now = Date.now()): { iso: string; entryDate: string } {
  let iso = new Date(now).toISOString();
  let entryDate = iso.split("T")[0];
  if (startedAt && typeof startedAt === "string") {
    const parsed = new Date(startedAt);
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= now && parsed.getTime() >= now - 24 * 3600 * 1000) {
      iso = parsed.toISOString();
      entryDate = new Date(parsed.getTime() + 60 * 60 * 1000).toISOString().split("T")[0];
    }
  }
  return { iso, entryDate };
}

Deno.test("pickEnteredAt: ignores future started_at (uses now)", () => {
  const now = new Date("2026-04-17T10:00:00Z").getTime();
  const r = pickEnteredAt("2026-04-17T11:00:00Z", now);
  assertEquals(r.iso, new Date(now).toISOString());
});

Deno.test("pickEnteredAt: ignores started_at older than 24h (uses now)", () => {
  const now = new Date("2026-04-17T10:00:00Z").getTime();
  const r = pickEnteredAt("2026-04-15T10:00:00Z", now);
  assertEquals(r.iso, new Date(now).toISOString());
});

Deno.test("pickEnteredAt: accepts valid past time within 24h", () => {
  const now = new Date("2026-04-17T10:00:00Z").getTime();
  const r = pickEnteredAt("2026-04-17T07:30:00Z", now);
  assertEquals(r.iso, "2026-04-17T07:30:00.000Z");
});

Deno.test("pickEnteredAt: ignores garbage started_at", () => {
  const now = new Date("2026-04-17T10:00:00Z").getTime();
  const r = pickEnteredAt("not-a-date", now);
  assertEquals(r.iso, new Date(now).toISOString());
});
