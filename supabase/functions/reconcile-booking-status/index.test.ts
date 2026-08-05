// Deno test for the cancellation handler shared by import-bookings and
// reconcile-booking-status. STEG 2J: handlern delegerar hela cleanup:en till
// den atomiska RPC:n `apply_booking_cancellation_atomic` — inga egna
// tabellmutationer får förekomma.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { applyBookingCancellation } from "../_shared/cancellation-handler.ts";

function rpcClient(reply: unknown, error: unknown = null) {
  const calls: Array<{ fn: string; args: any }> = [];
  return {
    calls,
    client: {
      from() {
        throw new Error("handler must not touch tables directly");
      },
      rpc: (fn: string, args: any) => {
        calls.push({ fn, args });
        return Promise.resolve({ data: reply, error });
      },
    },
  };
}

const evidence = {
  reason: "cancelled",
  source_status: "CANCELLED",
  source_revision: "2026-08-01T10:00:00Z",
  organization_id: "org-1",
};

Deno.test("applyBookingCancellation calls the atomic RPC exactly once", async () => {
  const { client, calls } = rpcClient({
    success: true,
    outcome: "cancelled",
    mutations: { bookings: 1, calendar_events: 2, audit: 1 },
  });

  const result = await applyBookingCancellation(client as any, {
    id: "booking-1",
    version: 3,
    organization_id: "org-1",
    assigned_to_project: false,
    assigned_project_id: null,
    assigned_project_name: null,
  }, evidence);

  assertEquals(result.status, "cancelled");
  assertEquals(result.booking_id, "booking-1");
  assertEquals(result.source_logged, true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, "apply_booking_cancellation_atomic");
  assertEquals(calls[0].args.p_organization_id, "org-1");
  assertEquals(calls[0].args.p_booking_id, "booking-1");
});

Deno.test("applyBookingCancellation reports error when the transaction fails", async () => {
  const { client } = rpcClient(null, { message: "boom" });

  const result = await applyBookingCancellation(client as any, {
    id: "booking-x",
    version: 1,
    organization_id: "org-1",
  }, evidence);

  assertEquals(result.status, "error");
  assertEquals(result.booking_id, "booking-x");
});

Deno.test("applyBookingCancellation is idempotent (already_cancelled)", async () => {
  const { client } = rpcClient({ success: true, outcome: "already_cancelled", already_current: true });

  const result = await applyBookingCancellation(client as any, {
    id: "booking-1",
    version: 3,
    organization_id: "org-1",
  }, evidence);

  assertEquals(result.status, "skipped_already_cancelled");
  assertEquals(result.source_logged, false);
});
