import { describe, it, expect, vi, beforeEach } from "vitest";

// Track which tables the service touches so we can assert that the fast
// "core" path never broadcasts a wide `bookings .in('id', […])` query —
// that broad fetch is the slow part when opening Almedalen-class large
// projects and must be deferred to fetchLargeProjectBookingsFull.
const tablesTouched: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    tablesTouched.push(table);
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => Promise.resolve({ data: [], error: null }),
      single: () =>
        Promise.resolve({
          data: {
            id: "lp-1",
            name: "Test",
            status: "planning",
            large_project_bookings: [
              { id: "lpb-1", large_project_id: "lp-1", booking_id: "b-1", display_name: null, sort_order: 0, created_at: "" },
              { id: "lpb-2", large_project_id: "lp-1", booking_id: "b-2", display_name: null, sort_order: 1, created_at: "" },
            ],
          },
          error: null,
        }),
    };
    return chain;
  };
  return { supabase: { from: builder } };
});

import {
  fetchLargeProjectCore,
  fetchLargeProjectBookingsFull,
} from "@/services/largeProjectService";

beforeEach(() => {
  tablesTouched.length = 0;
});

describe("largeProjectService — core vs full split", () => {
  it("fetchLargeProjectCore reads only large_projects (with stubs join), never bookings", async () => {
    const core = await fetchLargeProjectCore("lp-1");
    expect(core).toBeTruthy();
    expect(core!.bookings).toHaveLength(2);
    // Stubs MUST be returned without booking.* hydration.
    expect(core!.bookings.every(b => b.booking === undefined)).toBe(true);
    expect(tablesTouched).toEqual(["large_projects"]);
    expect(tablesTouched).not.toContain("bookings");
  });

  it("fetchLargeProjectBookingsFull is the only path that touches bookings", async () => {
    await fetchLargeProjectBookingsFull(["b-1", "b-2"]);
    expect(tablesTouched).toEqual(["bookings"]);
  });

  it("fetchLargeProjectBookingsFull returns [] without query when ids are empty", async () => {
    const res = await fetchLargeProjectBookingsFull([]);
    expect(res).toEqual([]);
    expect(tablesTouched).toEqual([]);
  });
});
