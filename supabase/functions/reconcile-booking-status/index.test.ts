// Deno test for the cancellation handler shared by import-bookings and
// reconcile-booking-status. We mock the supabase client to assert the
// exact sequence of writes when an external CANCELLED is detected.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { applyBookingCancellation } from "../_shared/cancellation-handler.ts";

function createMockSupabase() {
  const calls: string[] = [];

  const builder = (table: string) => {
    const state: any = { table, op: null, payload: null };
    const chain: any = {
      select: (_cols: string) => ({
        eq: () => ({
          eq: () => ({ limit: async () => ({ data: [], error: null }) }),
          neq: () => ({ limit: async () => ({ data: [], error: null }) }),
          not: () => ({ limit: async () => ({ data: [], error: null }) }),
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      update: (payload: any) => {
        state.op = "update";
        state.payload = payload;
        return {
          eq: async (_col: string, _val: any) => {
            calls.push(`${table}.update`);
            return { error: null };
          },
        };
      },
      delete: () => ({
        eq: async (_col: string, _val: any) => {
          calls.push(`${table}.delete`);
          return { error: null };
        },
      }),
    };
    return chain;
  };

  return {
    client: { from: (table: string) => builder(table) },
    calls,
  };
}

Deno.test("applyBookingCancellation cleans calendar, projects, jobs, packing, products", async () => {
  const { client, calls } = createMockSupabase();

  const result = await applyBookingCancellation(client as any, {
    id: "booking-1",
    version: 3,
    assigned_to_project: false,
    assigned_project_id: null,
    assigned_project_name: null,
  });

  assertEquals(result.status, "cancelled");
  assertEquals(result.booking_id, "booking-1");
  // All side-effects ran
  assertEquals(calls.includes("bookings.update"), true);
  assertEquals(calls.includes("calendar_events.delete"), true);
  assertEquals(calls.includes("warehouse_calendar_events.delete"), true);
  assertEquals(calls.includes("projects.update"), true);
  assertEquals(calls.includes("jobs.update"), true);
  assertEquals(calls.includes("packing_projects.delete"), true);
  assertEquals(calls.includes("booking_products.delete"), true);
});

Deno.test("applyBookingCancellation reports error when booking update fails", async () => {
  const failingClient = {
    from: (table: string) => {
      if (table === "bookings") {
        return {
          update: () => ({ eq: async () => ({ error: { message: "boom" } }) }),
          select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), neq: () => ({ limit: async () => ({ data: [], error: null }) }), not: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), neq: () => ({ limit: async () => ({ data: [], error: null }) }), not: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  };

  const result = await applyBookingCancellation(failingClient as any, {
    id: "booking-x",
    version: 1,
  });

  assertEquals(result.status, "error");
  assertEquals(result.booking_id, "booking-x");
});
