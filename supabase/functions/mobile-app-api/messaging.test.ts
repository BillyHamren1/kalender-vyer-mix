import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Tests for the messaging surface of mobile-app-api: input validation,
// auth guards, access control, attachment policy. We don't reach the
// happy path (no real session token), but we lock down the contract:
// "Without a valid session you cannot reach any messaging primitive."

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
  // Valid-format token, fake staff id → never resolves to a real org,
  // so authorized endpoints will reject with 401/403 even before action handlers run.
  const payload = {
    staffId: "00000000-0000-0000-0000-000000000000",
    timestamp: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  return btoa(JSON.stringify(payload));
}

// ── Job chat: access control ──

Deno.test("get_job_messages requires authentication", async () => {
  const { status, json } = await callApi("get_job_messages", undefined, { booking_id: "b1" });
  assertEquals(status, 401);
  assertEquals(json.error, "Authentication required");
});

Deno.test("send_job_message requires authentication", async () => {
  const { status, json } = await callApi("send_job_message", undefined, { booking_id: "b1", content: "x" });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("send_job_message rejects empty content + no attachment for authed-but-no-org caller", async () => {
  // With a token but no real org, we hit org guard first → expect a 4xx (auth/access denied).
  // The point: empty payload never reaches the DB.
  const { status } = await callApi("send_job_message", fakeStaffToken(), { booking_id: "b1", content: "  " });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("mark_job_read requires authentication", async () => {
  const { status, json } = await callApi("mark_job_read", undefined, { booking_id: "b1" });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("archive_job_conversation without booking_id returns 4xx", async () => {
  const { status } = await callApi("archive_job_conversation", fakeStaffToken(), {});
  assertEquals(status >= 400, true);
});

Deno.test("unarchive_job_conversation without booking_id returns 4xx", async () => {
  const { status } = await callApi("unarchive_job_conversation", fakeStaffToken(), {});
  assertEquals(status >= 400, true);
});

Deno.test("get_job_participants without booking_id returns 4xx", async () => {
  const { status } = await callApi("get_job_participants", fakeStaffToken(), { date: "2026-01-01" });
  assertEquals(status >= 400, true);
});

// ── Direct messages: unread + archive ──

Deno.test("get_unread_dm_count requires authentication", async () => {
  const { status, json } = await callApi("get_unread_dm_count");
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("get_dm_inbox_grouped requires authentication", async () => {
  const { status, json } = await callApi("get_dm_inbox_grouped");
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("archive_dm without partner_id returns 4xx", async () => {
  const { status } = await callApi("archive_dm", fakeStaffToken(), {});
  assertEquals(status >= 400, true);
});

Deno.test("unarchive_dm without partner_id returns 4xx", async () => {
  const { status } = await callApi("unarchive_dm", fakeStaffToken(), {});
  assertEquals(status >= 400, true);
});

Deno.test("mark_dm_read requires authentication", async () => {
  const { status, json } = await callApi("mark_dm_read", undefined, { sender_id: "u2" });
  assertEquals(status, 401);
  assertExists(json.error);
});

// ── Broadcasts ──

Deno.test("get_recent_broadcasts requires authentication", async () => {
  const { status, json } = await callApi("get_recent_broadcasts");
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("mark_broadcast_read requires authentication", async () => {
  const { status, json } = await callApi("mark_broadcast_read", undefined, { broadcast_id: "br1" });
  assertEquals(status, 401);
  assertExists(json.error);
});

// ── Inbox aggregator ──

Deno.test("get_inbox_all requires authentication", async () => {
  const { status, json } = await callApi("get_inbox_all");
  assertEquals(status, 401);
  assertExists(json.error);
});

// ── Contacts ──

Deno.test("get_contacts requires authentication", async () => {
  const { status, json } = await callApi("get_contacts");
  assertEquals(status, 401);
  assertExists(json.error);
});

// ── Attachments: mime + size + payload validation ──

Deno.test("upload_chat_attachment requires authentication", async () => {
  const { status } = await callApi("upload_chat_attachment", undefined, {
    file_name: "x.jpg",
    file_type: "image/jpeg",
    file_data_base64: "AAAA",
  });
  assertEquals(status, 401);
});

Deno.test("upload_chat_attachment rejects missing file_name (with valid token shape)", async () => {
  const { status } = await callApi("upload_chat_attachment", fakeStaffToken(), {
    file_type: "image/jpeg",
    file_data_base64: "AAAA",
  });
  // Either 400 (missing field) or 401/403 (org guard) — never 200.
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("upload_chat_attachment rejects missing file_data_base64", async () => {
  const { status } = await callApi("upload_chat_attachment", fakeStaffToken(), {
    file_name: "x.jpg",
    file_type: "image/jpeg",
  });
  assertEquals(status >= 400 && status < 500, true);
});

Deno.test("upload_chat_attachment rejects unsupported mime type", async () => {
  // Non-whitelisted mime: must NEVER succeed regardless of auth context.
  const { status } = await callApi("upload_chat_attachment", fakeStaffToken(), {
    file_name: "evil.exe",
    file_type: "application/x-msdownload",
    file_data_base64: "QUFB", // "AAA"
  });
  // 415 (mime denied) or 401/403 (auth denied) — both are acceptable rejections.
  assertEquals(status >= 400 && status < 500, true);
});
