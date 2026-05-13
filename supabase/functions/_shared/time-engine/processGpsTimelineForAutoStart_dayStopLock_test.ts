// Contract: a stopped day timer for the local Stockholm date locks GPS-driven
// auto-start for the rest of that day. Manual `start_time_registration` does
// NOT go through this engine and is therefore unaffected.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { processGpsTimelineForAutoStart } from "./processGpsTimelineForAutoStart.ts";

function stubAdmin(rows: Record<string, any[]>): any {
  function table(name: string) {
    let data = [...(rows[name] ?? [])];
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => { data = data.filter(r => r[col] === val); return builder; },
      gte: () => builder,
      lte: () => builder,
      gt: () => builder,
      is: (col: string, val: any) => { if (val === null) data = data.filter(r => r[col] == null); return builder; },
      lt: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
      insert: async () => ({ data: null, error: null }),
    };
    return builder;
  }
  return { from: (n: string) => table(n) };
}

Deno.test("stopped day timer locks GPS auto-start (synthetic suppression)", async () => {
  const admin = stubAdmin({
    active_time_registrations: [
      // Latest row for the day is stopped → must lock.
      {
        id: "11111111-1111-1111-1111-111111111111",
        status: "stopped",
        started_at: "2026-05-13T07:00:00.000Z",
        stopped_at: "2026-05-13T15:00:00.000Z",
        stop_source: "gps_home_auto_stop",
        stopped_by: "system_day_auto_stop",
      },
    ],
    time_auto_start_suppressions: [],
  });

  const result = await processGpsTimelineForAutoStart({
    organizationId: "00000000-0000-0000-0000-000000000001",
    staffId: "00000000-0000-0000-0000-000000000002",
    date: "2026-05-13",
    gpsDayTimeline: {
      staffId: "00000000-0000-0000-0000-000000000002",
      organizationId: "00000000-0000-0000-0000-000000000001",
      date: "2026-05-13",
      segments: [],
      diagnostics: {} as any,
    } as any,
    targets: [],
    supabaseAdmin: admin,
  });

  assertEquals(result.createdRegistrationId, null);
  assertEquals(result.dayStopLock?.dayWasAlreadyStopped, true);
  assertEquals(result.dayStopLock?.preventedLegacyReopen, true);
  assertEquals(result.dayStopLock?.activeRegistrationStatus, "stopped");
  assertEquals(result.dayStopLock?.stopSource, "gps_home_auto_stop");
  assertEquals(result.dayStopLock?.finalDayEnd, "2026-05-13T15:00:00.000Z");
  assertEquals(result.suppression?.reason, "day_already_stopped");
});

Deno.test("no stopped row → no day-stop lock", async () => {
  const admin = stubAdmin({
    active_time_registrations: [],
    time_auto_start_suppressions: [],
  });
  const result = await processGpsTimelineForAutoStart({
    organizationId: "00000000-0000-0000-0000-000000000001",
    staffId: "00000000-0000-0000-0000-000000000002",
    date: "2026-05-13",
    gpsDayTimeline: {
      staffId: "00000000-0000-0000-0000-000000000002",
      organizationId: "00000000-0000-0000-0000-000000000001",
      date: "2026-05-13",
      segments: [],
      diagnostics: {} as any,
    } as any,
    targets: [],
    supabaseAdmin: admin,
  });
  assertEquals(result.dayStopLock, null);
  assertEquals(result.suppression, null);
});
