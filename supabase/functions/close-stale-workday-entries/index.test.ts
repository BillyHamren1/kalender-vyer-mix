// Smoke tests for close-stale-workday-entries.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/close-stale-workday-entries`;

Deno.test("rejects anonymous calls without x-cron-secret (401)", async () => {
  const res = await fetch(FN_URL, { method: "POST", body: "{}" });
  await res.text();
  assert(res.status === 401, `expected 401, got ${res.status}`);
});

Deno.test("rejects calls with wrong x-cron-secret (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "x-cron-secret": "definitely-not-the-secret" },
    body: "{}",
  });
  await res.text();
  assert(res.status === 401, `expected 401, got ${res.status}`);
});
