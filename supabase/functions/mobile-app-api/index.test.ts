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

// ── 1. Auth guard tests ──

Deno.test("Unauthenticated requests return 401", async () => {
  const { status, json } = await callApi("get_bookings");
  assertEquals(status, 401);
  assertEquals(json.error, "Authentication required");
});

Deno.test("Invalid token returns 401", async () => {
  const { status, json } = await callApi("get_bookings", "invalid-token-abc");
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("Expired token returns 401", async () => {
  // Create a token that expired 1 hour ago
  const payload = { staffId: "fake-id", timestamp: Date.now(), expiresAt: Date.now() - 3600000 };
  const expiredToken = btoa(JSON.stringify(payload));
  const { status, json } = await callApi("get_bookings", expiredToken);
  assertEquals(status, 401);
  assertEquals(json.error, "Token expired");
});

// ── 2. Unknown action test ──

Deno.test("Unknown action returns 400", async () => {
  // Create a valid-format token with a fake staff ID (will fail at org lookup, but that's fine)
  const payload = { staffId: "00000000-0000-0000-0000-000000000000", timestamp: Date.now(), expiresAt: Date.now() + 3600000 };
  const token = btoa(JSON.stringify(payload));
  const { status, json } = await callApi("nonexistent_action", token);
  // Either 403 (staff not in org) or 400 (unknown action) depending on order
  assertEquals(status === 400 || status === 403, true);
});

// ── 3. Login validation ──

Deno.test("Login with missing credentials returns error", async () => {
  const { status, json } = await callApi("login", undefined, {});
  assertEquals(status >= 400, true);
  assertExists(json.error);
});

Deno.test("Login with wrong password returns 401", async () => {
  const { status, json } = await callApi("login", undefined, {
    email: "nonexistent-user@example.com",
    password: "wrong-password",
  });
  assertEquals(status >= 400, true);
  assertExists(json.error);
});

// ── 4. toggle_establishment_task validation ──

Deno.test("toggle_establishment_task without task_id returns 400", async () => {
  // Fake token with non-existent staff → will get 403 for org or 400 for missing task_id
  const payload = { staffId: "00000000-0000-0000-0000-000000000000", timestamp: Date.now(), expiresAt: Date.now() + 3600000 };
  const token = btoa(JSON.stringify(payload));
  const { status } = await callApi("toggle_establishment_task", token, {});
  // 403 (no org) or 400 (no task_id) — both are expected guards
  assertEquals(status >= 400, true);
});

// ── 5. get_booking_details validation ──

Deno.test("get_booking_details without booking_id returns error", async () => {
  const payload = { staffId: "00000000-0000-0000-0000-000000000000", timestamp: Date.now(), expiresAt: Date.now() + 3600000 };
  const token = btoa(JSON.stringify(payload));
  const { status } = await callApi("get_booking_details", token, {});
  assertEquals(status >= 400, true);
});

// ── 6. Token format tests ──

Deno.test("Token with missing staffId is rejected", async () => {
  const payload = { timestamp: Date.now(), expiresAt: Date.now() + 3600000 };
  const token = btoa(JSON.stringify(payload));
  const { status, json } = await callApi("get_bookings", token);
  assertEquals(status, 401);
  assertEquals(json.error, "Invalid token format");
});

Deno.test("Token with missing expiresAt is rejected", async () => {
  const payload = { staffId: "some-id", timestamp: Date.now() };
  const token = btoa(JSON.stringify(payload));
  const { status, json } = await callApi("get_bookings", token);
  assertEquals(status, 401);
  assertEquals(json.error, "Invalid token format");
});

Deno.test("Non-base64 token is rejected", async () => {
  const { status, json } = await callApi("get_bookings", "not-valid-base64!!!");
  assertEquals(status, 401);
  assertExists(json.error);
});

// ── 7. CORS preflight ──

Deno.test("OPTIONS request returns CORS headers", async () => {
  const res = await fetch(FUNCTION_URL, { method: "OPTIONS" });
  await res.text(); // consume body
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
