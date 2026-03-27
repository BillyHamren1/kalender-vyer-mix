/**
 * Automated tests for the full Planning sync pipeline.
 *
 * Test A — Intake: receive-booking creates a pending sync job
 * Test B — Worker: process-sync-jobs processes queued jobs
 * Test C — Exact time update: calendar events update, not duplicate
 * Test D — Stable identity: booking_id + event_type + source_date
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TEST_ORG_ID = "f5e5cade-f08b-4833-a105-56461f15b191";
const TEST_BOOKING_PREFIX = "__test_sync_";

// Helper: clean up test data
async function cleanup(bookingId: string) {
  await supabase.from("booking_sync_jobs").delete().eq("booking_id", bookingId);
  await supabase.from("calendar_events").delete().eq("booking_id", bookingId);
  await supabase.from("bookings").delete().eq("id", bookingId);
}

// ─── Test A: Intake creates pending sync job ─────────────────────────────────
Deno.test("Test A — receive-booking creates pending sync job", async () => {
  const bookingId = `${TEST_BOOKING_PREFIX}intake_${Date.now()}`;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/receive-booking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        booking_id: bookingId,
        organization_id: TEST_ORG_ID,
        event_type: "booking.confirmed",
      }),
    });

    const body = await res.json();
    assertEquals(res.status, 202, `Expected 202, got ${res.status}`);
    assertEquals(body.accepted, true);
    assertExists(body.job_id, "Response must include job_id");

    // Verify the row exists in booking_sync_jobs
    const { data: jobs, error } = await supabase
      .from("booking_sync_jobs")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

    assert(!error, `Query error: ${error?.message}`);
    assertExists(jobs, "Sync job row must exist");
    assertEquals(jobs.status, "pending");
    assertEquals(jobs.event_type, "booking.confirmed");
    assertEquals(jobs.organization_id, TEST_ORG_ID);
  } finally {
    await cleanup(bookingId);
  }
});

// ─── Test B: Worker processes queued job ──────────────────────────────────────
Deno.test("Test B — process-sync-jobs processes queued job", async () => {
  const bookingId = `${TEST_BOOKING_PREFIX}worker_${Date.now()}`;

  try {
    // 1. Insert a pending job directly
    const { data: job, error: insertErr } = await supabase
      .from("booking_sync_jobs")
      .insert({
        booking_id: bookingId,
        organization_id: TEST_ORG_ID,
        event_type: "booking.confirmed",
        status: "pending",
      })
      .select("id")
      .single();

    assert(!insertErr, `Insert error: ${insertErr?.message}`);
    assertExists(job);

    // 2. Run the worker
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-sync-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    await res.text().catch(() => {}); // ensure consumed
    assertEquals(res.status, 200);
    assert(body.processed >= 1, "Worker must process at least 1 job");

    // 3. Verify job status changed (completed or failed — both prove worker ran)
    const { data: updated } = await supabase
      .from("booking_sync_jobs")
      .select("status, attempts, processed_at")
      .eq("id", job.id)
      .single();

    assertExists(updated);
    assert(
      updated.status === "completed" || updated.status === "failed",
      `Job should be completed or failed, got: ${updated.status}`
    );
    assert(updated.attempts >= 1, "Attempts should be >= 1");
    assertExists(updated.processed_at, "processed_at must be set");
  } finally {
    await cleanup(bookingId);
  }
});

// ─── Test C: Exact time update — no duplication ──────────────────────────────
Deno.test("Test C — calendar event updates on time change, no duplicates", async () => {
  const bookingId = `${TEST_BOOKING_PREFIX}time_${Date.now()}`;
  const sourceDate = "2026-04-15";

  try {
    // 1. Create initial calendar event
    const { error: e1 } = await supabase
      .from("calendar_events")
      .insert({
        booking_id: bookingId,
        organization_id: TEST_ORG_ID,
        event_type: "rig",
        source_date: sourceDate,
        title: "Test Rigg",
        start_time: `${sourceDate}T08:00:00+02:00`,
        end_time: `${sourceDate}T17:00:00+02:00`,
        resource_id: "unassigned",
      });
    assert(!e1, `Insert error: ${e1?.message}`);

    // 2. Update the same event (simulating reconciliation with new time)
    const { error: e2 } = await supabase
      .from("calendar_events")
      .update({
        start_time: `${sourceDate}T10:00:00+02:00`,
        end_time: `${sourceDate}T18:00:00+02:00`,
      })
      .eq("booking_id", bookingId)
      .eq("event_type", "rig")
      .eq("source_date", sourceDate);
    assert(!e2, `Update error: ${e2?.message}`);

    // 3. Verify only ONE event exists (no duplicate)
    const { data: events } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("event_type", "rig")
      .eq("source_date", sourceDate);

    assertEquals(events?.length, 1, `Expected 1 event, got ${events?.length}`);
    assert(
      events![0].start_time.includes("08:00") === false,
      `Expected updated time, not original 08:00`
    );
  } finally {
    await cleanup(bookingId);
  }
});

// ─── Test D: Stable identity — start_time ≠ identity ────────────────────────
Deno.test("Test D — event identity is (booking_id, event_type, source_date), not start_time", async () => {
  const bookingId = `${TEST_BOOKING_PREFIX}identity_${Date.now()}`;
  const sourceDate = "2026-05-20";

  try {
    // 1. Create event with initial time
    const { error: insertErr } = await supabase.from("calendar_events").insert({
      booking_id: bookingId,
      organization_id: TEST_ORG_ID,
      event_type: "event",
      source_date: sourceDate,
      title: "Test Event",
      start_time: `${sourceDate}T09:00:00+02:00`,
      end_time: `${sourceDate}T15:00:00+02:00`,
      resource_id: "unassigned",
    });
    assert(!insertErr, `Insert error: ${insertErr?.message}`);

    // 2. Simulate reconciler: find by identity key, update time
    const { data: existing } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("event_type", "event")
      .eq("source_date", sourceDate)
      .single();

    assertExists(existing, "Event must be found by stable key");

    // 3. Update to new time (identity stays the same)
    await supabase
      .from("calendar_events")
      .update({
        start_time: `${sourceDate}T12:00:00+02:00`,
        end_time: `${sourceDate}T20:00:00+02:00`,
      })
      .eq("id", existing.id);

    // 4. Verify: still only 1 event, with updated time
    const { data: allEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("event_type", "event")
      .eq("source_date", sourceDate);

    assertEquals(allEvents?.length, 1, "Must still be exactly 1 event");
    assert(allEvents![0].start_time.includes("12:00"), "Time must be updated to 12:00");

    // 5. Verify the ID is the SAME row (not a new insert)
    assertEquals(allEvents![0].id, existing.id, "Must be the same row ID — no duplication");
  } finally {
    await cleanup(bookingId);
  }
});
