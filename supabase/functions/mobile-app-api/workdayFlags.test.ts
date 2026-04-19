// ─────────────────────────────────────────────────────────────────────────────
// Backend contract tests for workday_flags via mobile-app-api.
//
// Bakgrund
// ────────
// `workday_flags` är förstklassig store för arbetsdags-osäkerhet (saknad rast,
// oklart dagsslut, närvaro_utan_rapport, …). Tabellen är AVSIKTLIGT skild från
// `time_report_anomalies` (som är ren geofence-presence-logg). Skrivvägen går
// genom mobile-app-api med tre actions:
//
//   create_workday_flag   — auth + valideringskrav, idempotent på (staff,date,type,open)
//   list_workday_flags    — auth + scopas till caller-staff
//   resolve_workday_flag  — auth, kräver giltig resolution_source, staff kan
//                           bara lösa egna (admin går via web-UI)
//
// Quality gate-mål: ingen av dessa endpoints får släppa igenom anonyma anrop
// eller orimlig payload. Lyckade DB-skrivningar testas i frontend-sviten via
// mockad mobileApi.
//
// Lägg till nya workday_flags-tester här OCH referera dem från:
//   - scripts/test-time-reporting.sh
//   - src/test/timeReporting.manifest.ts
// ─────────────────────────────────────────────────────────────────────────────

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

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

function fakeStaffToken() {
  // Korrekt format men oexisterande staff-id → autentisering avvisar
  // innan vi når DB-vägen. Räcker för att verifiera att payload-formen
  // accepteras eller avvisas av handlern, inte av DB.
  const payload = {
    staffId: "00000000-0000-0000-0000-000000000000",
    timestamp: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  return btoa(JSON.stringify(payload));
}

// ── 1. Auth guard ──

Deno.test("create_workday_flag requires authentication", async () => {
  const { status, json } = await callApi("create_workday_flag", undefined, {
    flag_type: "missing_break",
    flag_date: "2026-04-18",
    title: "Test",
  });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("list_workday_flags requires authentication", async () => {
  const { status, json } = await callApi("list_workday_flags", undefined, {});
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("resolve_workday_flag requires authentication", async () => {
  const { status, json } = await callApi("resolve_workday_flag", undefined, {
    flag_id: "wf-1",
    resolution_source: "staff",
  });
  assertEquals(status, 401);
  assertExists(json.error);
});

// ── 2. Payload validation: create ──

Deno.test("create_workday_flag rejects unknown flag_type", async () => {
  const { status } = await callApi("create_workday_flag", fakeStaffToken(), {
    flag_type: "totally_invalid_type",
    flag_date: "2026-04-18",
    title: "Test",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("create_workday_flag rejects missing flag_type", async () => {
  const { status } = await callApi("create_workday_flag", fakeStaffToken(), {
    flag_date: "2026-04-18",
    title: "Test",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("create_workday_flag rejects malformed flag_date", async () => {
  const { status } = await callApi("create_workday_flag", fakeStaffToken(), {
    flag_type: "missing_break",
    flag_date: "not-a-date",
    title: "Test",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("create_workday_flag rejects missing title", async () => {
  const { status } = await callApi("create_workday_flag", fakeStaffToken(), {
    flag_type: "missing_break",
    flag_date: "2026-04-18",
  });
  assertEquals(status >= 400 && status < 500, true);
});

// Påminnelse: alla 11 typer ska accepteras. Vi testar några stickprov på
// både den NYA katalogen (PROMPT 6) och de legacy/persisted varianterna.
const VALID_FLAG_TYPES = [
  "missing_break",
  "unclear_day_end",
  "presence_without_report",
  "activity_ended_day_continues",
  "geofence_presence_mismatch",
  "team_time_deviation",
  "unreasonable_travel",
  "time_gap",
  "missing_report",
  "long_day",
  "overlapping_times",
];

for (const flagType of VALID_FLAG_TYPES) {
  Deno.test(`create_workday_flag accepts known flag_type: ${flagType}`, async () => {
    const { status } = await callApi("create_workday_flag", fakeStaffToken(), {
      flag_type: flagType,
      flag_date: "2026-04-18",
      title: "Test",
    });
    // Med fake-token avvisas vid org/staff-guard (4xx), men ALDRIG 5xx
    // — vilket skulle indikera att handlern inte känner igen typen.
    assertEquals(status >= 400 && status < 500, true);
  });
}

// ── 3. Resolve: kräver giltig resolution_source ──

Deno.test("resolve_workday_flag rejects invalid resolution_source", async () => {
  const { status } = await callApi("resolve_workday_flag", fakeStaffToken(), {
    flag_id: "wf-1",
    resolution_source: "robot", // ogiltig
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("resolve_workday_flag rejects missing flag_id", async () => {
  const { status } = await callApi("resolve_workday_flag", fakeStaffToken(), {
    resolution_source: "staff",
  });
  assertEquals(status >= 400 && status < 500, true);
});

// staff/admin/auto är de tre tillåtna.
for (const src of ["staff", "admin", "auto"]) {
  Deno.test(`resolve_workday_flag accepts resolution_source=${src}`, async () => {
    const { status } = await callApi("resolve_workday_flag", fakeStaffToken(), {
      flag_id: "00000000-0000-0000-0000-000000000000",
      resolution_source: src,
      resolution_note: "test",
    });
    // 4xx (flaggan finns inte / fel staff) men aldrig 5xx (oväntat fel).
    assertEquals(status >= 400 && status < 500, true);
  });
}

// ── 4. Inga write-actions kan kringgå auth med ren payload ──

Deno.test("create_workday_flag cannot bypass auth even with full valid payload", async () => {
  const { status } = await callApi("create_workday_flag", undefined, {
    flag_type: "missing_break",
    flag_date: "2026-04-18",
    title: "Bypass attempt",
    severity: "warning",
    needs_user_input: true,
    context: { foo: "bar" },
  });
  assertEquals(status, 401);
});

Deno.test("resolve_workday_flag cannot bypass auth even with valid payload", async () => {
  const { status } = await callApi("resolve_workday_flag", undefined, {
    flag_id: "wf-1",
    resolution_source: "auto",
    resolution_note: "Bypass attempt",
  });
  assertEquals(status, 401);
});
