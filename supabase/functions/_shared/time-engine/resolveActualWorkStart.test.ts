// @ts-nocheck
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveActualWorkStartIso } from "./resolveActualWorkStart.ts";

function makeAdmin(workdays: any[], regs: any[]) {
  function chain(rows: any[]) {
    const obj: any = {
      _rows: rows,
      select: () => obj,
      eq: () => obj,
      lte: () => obj,
      or: () => obj,
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };
    return obj;
  }
  return {
    from(table: string) {
      if (table === "workdays") return chain(workdays);
      if (table === "active_time_registrations") return chain(regs);
      return chain([]);
    },
  };
}

const dayStart = "2026-05-13T00:00:00Z";
const dayEnd = "2026-05-13T23:59:59Z";

Deno.test("returns null when no workday and no timer", async () => {
  const admin = makeAdmin([], []);
  const r = await resolveActualWorkStartIso(admin, "org", "u1", dayStart, dayEnd);
  assertEquals(r, null);
});

Deno.test("uses workday started_at when present", async () => {
  const admin = makeAdmin([{ started_at: "2026-05-13T07:30:00Z", ended_at: null }], []);
  const r = await resolveActualWorkStartIso(admin, "org", "u1", dayStart, dayEnd);
  assertEquals(r, "2026-05-13T07:30:00.000Z");
});

Deno.test("clamps a workday started before day window to day start", async () => {
  const admin = makeAdmin([{ started_at: "2026-05-12T22:00:00Z", ended_at: null }], []);
  const r = await resolveActualWorkStartIso(admin, "org", "u1", dayStart, dayEnd);
  assertEquals(r, "2026-05-13T00:00:00.000Z");
});

Deno.test("takes MIN of workday and timer", async () => {
  const admin = makeAdmin(
    [{ started_at: "2026-05-13T08:00:00Z", ended_at: null }],
    [{ started_at: "2026-05-13T07:15:00Z", stopped_at: null }],
  );
  const r = await resolveActualWorkStartIso(admin, "org", "u1", dayStart, dayEnd);
  assertEquals(r, "2026-05-13T07:15:00.000Z");
});

Deno.test("falls back to timer when no workday", async () => {
  const admin = makeAdmin([], [{ started_at: "2026-05-13T09:00:00Z", stopped_at: null }]);
  const r = await resolveActualWorkStartIso(admin, "org", "u1", dayStart, dayEnd);
  assertEquals(r, "2026-05-13T09:00:00.000Z");
});
