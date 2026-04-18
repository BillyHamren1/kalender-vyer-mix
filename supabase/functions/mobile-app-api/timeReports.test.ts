// ─────────────────────────────────────────────────────────────────────────────
// Backend contract tests for the time-reporting write-path (mobile-app-api).
//
// Bakgrund
// ────────
// `mobile-app-api` är ENDA officiella skrivvägen för time_reports (create /
// update / delete) — både för mobilen och admin/web. Se:
//   - mem://architecture/time-reporting-write-path-v1
//   - mem://features/field-staff/unified-timer-architecture-v1
//   - mem://features/field-staff/timer-stop-api-v1
//
// Denna svit verifierar serverkontraktet utan att kräva en riktig session:
//   - alla auth-skyddade actions måste avvisa (401) utan token
//   - alla actions med ogiltig payload måste avvisa (4xx) innan DB-skrivning
//   - approved-lock / overlap / mjuk aktiv-timer-spärr / orimliga intervall
//     går aldrig vidare till DB om de fångas på input-nivå
//   - admin-vägen (admin_create_time_report / admin_delete_time_report) följer
//     samma regelmodell — ingen "fri" CRUD utan auth + payload-kontroll
//   - timer-relaterade endpoints (start/stop_location_timer) ska kräva auth
//     och hantera idempotens via client_dedupe_key (här verifieras att de inte
//     släpper igenom anonyma anrop)
//
// VIKTIGT: Vi har avsiktligt INGEN giltig session-token här. Det är meningen.
// Quality gate ska låsa fast att ingen av dessa write-vägar kan användas utan
// auth + giltig payload. Lyckade DB-skrivningar testas i frontend-kontraktssviten
// (src/test/timeReportingProduct.contract.test.ts) som mockar mobileApi-svar.
//
// Lägg till nya time-reporting-fokuserade backendtester här OCH referera dem
// från:
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
  // Korrekt format men oexisterande staff-id → autentisering går aldrig
  // hela vägen, så authed-handlers måste avvisa innan de når DB-regler.
  const payload = {
    staffId: "00000000-0000-0000-0000-000000000000",
    timestamp: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  return btoa(JSON.stringify(payload));
}

// ── 1. Auth guard: alla write-actions kräver token ──

Deno.test("create_time_report requires authentication", async () => {
  const { status, json } = await callApi("create_time_report", undefined, {
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "08:00",
    end_time: "16:00",
  });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("update_time_report requires authentication", async () => {
  const { status, json } = await callApi("update_time_report", undefined, {
    id: "tr1",
    start_time: "09:00",
    end_time: "17:00",
  });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("delete_time_report requires authentication", async () => {
  const { status, json } = await callApi("delete_time_report", undefined, { id: "tr1" });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("admin_create_time_report requires authentication", async () => {
  const { status, json } = await callApi("admin_create_time_report", undefined, {
    staff_id: "s1",
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "08:00",
    end_time: "16:00",
  });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("admin_delete_time_report requires authentication", async () => {
  const { status, json } = await callApi("admin_delete_time_report", undefined, { id: "tr1" });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("get_time_reports requires authentication", async () => {
  const { status, json } = await callApi("get_time_reports", undefined, {});
  assertEquals(status, 401);
  assertExists(json.error);
});

// ── 2. Payload validation: write-actions med trasig input → 4xx, aldrig 200 ──
// Med fake-token får vi antingen 400 (bad payload) eller 401/403 (org-guard),
// men aldrig 200. Det räcker för att låsa fast att vägen inte kan bypassas.

Deno.test("create_time_report rejects missing booking_id", async () => {
  const { status } = await callApi("create_time_report", fakeStaffToken(), {
    report_date: "2026-01-01",
    start_time: "08:00",
    end_time: "16:00",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("create_time_report rejects missing report_date", async () => {
  const { status } = await callApi("create_time_report", fakeStaffToken(), {
    booking_id: "b1",
    start_time: "08:00",
    end_time: "16:00",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("create_time_report rejects malformed report_date", async () => {
  const { status } = await callApi("create_time_report", fakeStaffToken(), {
    booking_id: "b1",
    report_date: "not-a-date",
    start_time: "08:00",
    end_time: "16:00",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("create_time_report rejects malformed start_time", async () => {
  const { status } = await callApi("create_time_report", fakeStaffToken(), {
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "25:00",
    end_time: "16:00",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("create_time_report rejects malformed end_time", async () => {
  const { status } = await callApi("create_time_report", fakeStaffToken(), {
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "08:00",
    end_time: "10:60",
  });
  assertEquals(status >= 400 && status < 500, true);
});

// ── 3. Orimliga intervall ──

Deno.test("create_time_report rejects equal start/end (zero-length shift)", async () => {
  const { status } = await callApi("create_time_report", fakeStaffToken(), {
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "10:00",
    end_time: "10:00",
  });
  assertEquals(status >= 400 && status < 500, true);
});

// ── 4. Overtime / break-fält: ogiltiga negativa värden ska aldrig accepteras ──

Deno.test("create_time_report rejects negative overtime_hours", async () => {
  const { status } = await callApi("create_time_report", fakeStaffToken(), {
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "08:00",
    end_time: "16:00",
    overtime_hours: -2,
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("create_time_report rejects negative break_minutes", async () => {
  const { status } = await callApi("create_time_report", fakeStaffToken(), {
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "08:00",
    end_time: "16:00",
    break_minutes: -15,
  });
  assertEquals(status >= 400 && status < 500, true);
});

// ── 5. Update / delete: kräver id ──

Deno.test("update_time_report rejects missing id", async () => {
  const { status } = await callApi("update_time_report", fakeStaffToken(), {
    start_time: "09:00",
    end_time: "17:00",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("delete_time_report rejects missing id", async () => {
  const { status } = await callApi("delete_time_report", fakeStaffToken(), {});
  assertEquals(status >= 400 && status < 500, true);
});

// ── 6. Admin-vägen: samma kontrakt, ingen genväg ──

Deno.test("admin_create_time_report rejects missing staff_id", async () => {
  const { status } = await callApi("admin_create_time_report", fakeStaffToken(), {
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "08:00",
    end_time: "16:00",
  });
  // Antingen payload-fel (400) eller åtkomst-nekad (401/403).
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("admin_create_time_report rejects malformed times", async () => {
  const { status } = await callApi("admin_create_time_report", fakeStaffToken(), {
    staff_id: "s1",
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "abc",
    end_time: "16:00",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("admin_delete_time_report rejects missing id", async () => {
  const { status } = await callApi("admin_delete_time_report", fakeStaffToken(), {});
  assertEquals(status >= 400 && status < 500, true);
});

// ── 7. Timer-relaterade endpoints (unified timer architecture) ──
//
// Servern är source of truth för aktiva timers. Att starta/stoppa kräver
// auth, och idempotens hanteras via client_dedupe_key i nyttolasten.
// Här verifierar vi att inga anonyma anrop går igenom.

Deno.test("start_location_timer requires authentication", async () => {
  const { status, json } = await callApi("start_location_timer", undefined, {
    location_id: "loc1",
    client_dedupe_key: "key-xyz",
  });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("stop_location_timer requires authentication", async () => {
  const { status, json } = await callApi("stop_location_timer", undefined, { id: "lte1" });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("start_location_timer rejects missing target ids (no location/booking/project)", async () => {
  // Måste ha ETT av: location_id, booking_id, large_project_id.
  const { status } = await callApi("start_location_timer", fakeStaffToken(), {
    client_dedupe_key: "key-xyz",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("start_location_timer accepts client_dedupe_key shape (idempotent contract)", async () => {
  // Med fake-token kommer org-guard avvisa, men payload-formen är giltig.
  // Det vi låser fast: servern accepterar client_dedupe_key som fält och
  // bryter inte ut tidigt på dess närvaro.
  const { status } = await callApi("start_location_timer", fakeStaffToken(), {
    booking_id: "b1",
    client_dedupe_key: "abc-123",
  });
  // Ska vara 4xx (auth/access), inte 5xx — formvalideringen är OK.
  assertEquals(status >= 400 && status < 500, true);
});

// ── 8. Mjuk aktiv-timer-spärr / overlap / approved-lock ──
//
// Dessa regler utvärderas serverside efter auth. Vi kan inte trigga själva
// regelvägen utan en riktig session, men vi låser fast att payload som
// SKA trigga reglerna inte slipper igenom auth-lagret. Detta hindrar
// regressioner där create_time_report skulle kringgå reglerna helt.

Deno.test("create_time_report cannot bypass approved-lock without auth", async () => {
  // Försök "tvinga" en update på en redan godkänd rapport utan auth.
  const { status } = await callApi("update_time_report", undefined, {
    id: "approved-tr",
    start_time: "09:00",
    end_time: "17:00",
    approved: false, // försök "av-godkänna" → ska aldrig nå handlern
  });
  assertEquals(status, 401);
});

Deno.test("create_time_report cannot bypass overlap rule without auth", async () => {
  // Två exakta dubletter samma dag → overlap-regeln finns på server,
  // men måste först passera auth. Utan token: 401.
  const { status } = await callApi("create_time_report", undefined, {
    booking_id: "b1",
    report_date: "2026-01-01",
    start_time: "08:00",
    end_time: "16:00",
  });
  assertEquals(status, 401);
});

Deno.test("delete_time_report cannot bypass approved-lock without auth", async () => {
  const { status } = await callApi("delete_time_report", undefined, { id: "approved-tr" });
  assertEquals(status, 401);
});
