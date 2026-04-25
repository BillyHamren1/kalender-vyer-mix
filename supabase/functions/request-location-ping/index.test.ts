// supabase/functions/request-location-ping/index.test.ts
//
// Pure unit tests for the request-location-ping edge function.
//
// We exercise the *pure* helpers (validatePingBody, buildPingPushPayload)
// instead of spinning up the HTTP server, so this suite runs deterministically
// in CI without any FCM/Supabase round-trips.
//
// What this locks:
//   • Body validation rules (required fields, sane bounds, UUID-ish ids).
//   • The FCM payload shape the mobile app must be ready to receive
//     (notification_type=location_ping, organization_id present, etc.)

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validatePingBody, buildPingPushPayload } from "./index.ts";

const STAFF_A = "11111111-1111-1111-1111-111111111111";
const STAFF_B = "22222222-2222-2222-2222-222222222222";
const ORG = "99999999-9999-9999-9999-999999999999";

// ── validatePingBody ────────────────────────────────────────────────────────
Deno.test("validatePingBody: rejects non-object body", () => {
  for (const bad of [null, undefined, 42, "no", true]) {
    const r = validatePingBody(bad as unknown);
    assertEquals(r.ok, false);
  }
});

Deno.test("validatePingBody: rejects missing/empty/oversized staff_ids", () => {
  assertEquals(validatePingBody({}).ok, false);
  assertEquals(validatePingBody({ staff_ids: [] }).ok, false);
  const tooMany = { staff_ids: new Array(201).fill(STAFF_A) };
  assertEquals(validatePingBody(tooMany).ok, false);
});

Deno.test("validatePingBody: rejects malformed ids", () => {
  for (const bad of [[""], ["   "], ["not-a-uuid"], [STAFF_A, ""]]) {
    const r = validatePingBody({ staff_ids: bad });
    assertEquals(r.ok, false, `should reject ${JSON.stringify(bad)}`);
  }
});

Deno.test("validatePingBody: trims and accepts valid ids", () => {
  const r = validatePingBody({ staff_ids: [` ${STAFF_A}`, STAFF_B], reason: "manual ping" });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.data.staff_ids, [STAFF_A, STAFF_B]);
    assertEquals(r.data.reason, "manual ping");
  }
});

Deno.test("validatePingBody: defaults reason to admin_request", () => {
  const r = validatePingBody({ staff_ids: [STAFF_A] });
  assert(r.ok);
  if (r.ok) assertEquals(r.data.reason, "admin_request");
});

Deno.test("validatePingBody: caps reason at 200 chars", () => {
  const long = "x".repeat(500);
  const r = validatePingBody({ staff_ids: [STAFF_A], reason: long });
  assert(r.ok);
  if (r.ok) assertEquals(r.data.reason.length, 200);
});

// ── buildPingPushPayload ────────────────────────────────────────────────────
Deno.test("buildPingPushPayload: locks the FCM payload shape", () => {
  const p = buildPingPushPayload([STAFF_A, STAFF_B], ORG, "admin_request");
  assertEquals(p.staff_ids, [STAFF_A, STAFF_B]);
  assertEquals(p.organization_id, ORG);
  assertEquals(p.notification_type, "broadcast");
  assertEquals(p.data.notification_type, "location_ping");
  assertEquals(p.data.reason, "admin_request");
  assert(typeof p.data.requested_at === "string");
  assertStringIncludes(p.data.requested_at, "T"); // ISO timestamp
});

Deno.test("buildPingPushPayload: requested_at is a fresh ISO timestamp", () => {
  const before = Date.now();
  const p = buildPingPushPayload([STAFF_A], ORG, "x");
  const t = new Date(p.data.requested_at).getTime();
  assert(t >= before - 5);
  assert(t <= Date.now() + 5);
});
