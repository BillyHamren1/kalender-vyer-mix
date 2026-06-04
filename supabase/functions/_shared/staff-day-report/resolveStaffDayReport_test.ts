// Deno unit-test för resolveStaffDayReport — verifierar prioritet och
// förbjudna läsningar. Kör med: deno test supabase/functions/_shared/staff-day-report/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  projectCacheToResolved,
  projectSubmissionToResolved,
  resolveStaffDayReport,
  resolveStaffDayReportsBatch,
  type ResolvedSubmissionRow,
} from "./resolveStaffDayReport.ts";
import type { CacheRow } from "../mobile/buildMobileSnapshot.ts";

const SUBMISSION: ResolvedSubmissionRow = {
  id: "sub-1",
  status: "submitted",
  requested_start_at: "2026-06-01T07:00:00Z",
  requested_end_at: "2026-06-01T15:00:00Z",
  start_time: "09:00:00",
  end_time: "17:00:00",
  break_minutes: 30,
  comment: null,
  review_comment: null,
  submitted_at: "2026-06-01T16:00:00Z",
  reviewed_at: null,
  source_summary_json: { workMinutes: 450 },
  display_timeline_snapshot_json: [
    { type: "work", label: "Bygge A", start: "2026-06-01T07:00:00Z", end: "2026-06-01T11:00:00Z", minutes: 240 },
    { type: "travel", label: "Resa", start: "2026-06-01T11:00:00Z", end: "2026-06-01T11:30:00Z", minutes: 30 },
    { type: "work", label: "Bygge B", start: "2026-06-01T11:30:00Z", end: "2026-06-01T15:00:00Z", minutes: 210 },
  ],
};

const CACHE: CacheRow = {
  engine_version: "v1.2",
  summary_json: { workMinutes: 480, transportMinutes: 20, breakMinutes: 60 },
  report_candidate_blocks_json: [],
  display_blocks_json: [
    {
      id: "blk-1", kind: "project", startAt: "2026-06-01T08:00:00Z", endAt: "2026-06-01T16:00:00Z",
      durationMinutes: 480, title: "Projekt X",
    },
  ],
  diagnostics_json: {},
  built_at: "2026-06-01T17:00:00Z",
  stale: false,
  error: null,
};

Deno.test("projectSubmissionToResolved: status och totals", () => {
  const r = projectSubmissionToResolved({ staffId: "s1", date: "2026-06-01", submission: SUBMISSION });
  assertEquals(r.source, "submission");
  assertEquals(r.status, "submitted_waiting_approval");
  assertEquals(r.submissionId, "sub-1");
  assertEquals(r.workMinutes, 450);
  assertEquals(r.travelMinutes, 30);
  assertEquals(r.breakMinutes, 30);
  assertEquals(r.rows.length, 3);
});

Deno.test("projectSubmissionToResolved: approved/payroll_approved mappas till approved", () => {
  const r1 = projectSubmissionToResolved({
    staffId: "s1", date: "2026-06-01",
    submission: { ...SUBMISSION, status: "approved" },
  });
  const r2 = projectSubmissionToResolved({
    staffId: "s1", date: "2026-06-01",
    submission: { ...SUBMISSION, status: "payroll_approved" },
  });
  assertEquals(r1.status, "approved");
  assertEquals(r2.status, "approved");
});

Deno.test("projectCacheToResolved: status=gps_proposal och bygger mobileSegments", () => {
  const r = projectCacheToResolved({ staffId: "s1", date: "2026-06-01", cache: CACHE });
  assertEquals(r.source, "cache");
  assertEquals(r.status, "gps_proposal");
  assertEquals(r.engineVersion, "v1.2");
  assertEquals(r.cacheBuiltAt, "2026-06-01T17:00:00Z");
  assert(r.mobileSegments.length > 0);
  assertEquals(r.workMinutes, 480);
});

Deno.test("resolveStaffDayReport: submission VINNER över cache", async () => {
  // Mocka admin-client som returnerar BÅDE submission och cache.
  // Resolvern får aldrig ens nå cache-queryn när submission finns.
  let cacheRead = false;
  const admin = {
    from(table: string) {
      const isSubmissions = table === "staff_day_submissions";
      const isCache = table === "staff_day_report_cache";
      if (!isSubmissions && !isCache) {
        throw new Error(`FORBIDDEN TABLE READ: ${table}`);
      }
      if (isCache) cacheRead = true;
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        in() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() {
          if (isSubmissions) return Promise.resolve({ data: { ...SUBMISSION, staff_id: "s1", date: "2026-06-01" }, error: null });
          return Promise.resolve({ data: CACHE, error: null });
        },
      };
      return builder;
    },
  } as any;

  const r = await resolveStaffDayReport({
    admin, organizationId: "org", staffId: "s1", date: "2026-06-01",
  });
  assertEquals(r.source, "submission");
  assertEquals(cacheRead, false, "Cache får inte läsas när submission finns");
});

Deno.test("resolveStaffDayReport: empty när varken submission eller cache finns", async () => {
  const admin = {
    from(table: string) {
      if (table !== "staff_day_submissions" && table !== "staff_day_report_cache") {
        throw new Error(`FORBIDDEN TABLE READ: ${table}`);
      }
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      };
      return builder;
    },
  } as any;

  const r = await resolveStaffDayReport({
    admin, organizationId: "org", staffId: "s1", date: "2026-06-01",
  });
  assertEquals(r.source, "empty");
  assertEquals(r.status, "empty");
  assertEquals(r.rows.length, 0);
});

Deno.test("resolveStaffDayReport: läser ALDRIG staff_location_history", async () => {
  const reads: string[] = [];
  const admin = {
    from(table: string) {
      reads.push(table);
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      };
      return builder;
    },
  } as any;
  await resolveStaffDayReport({ admin, organizationId: "org", staffId: "s1", date: "2026-06-01" });
  for (const t of reads) {
    assert(t !== "staff_location_history", `staff_location_history får ALDRIG läsas av resolvern`);
    assert(t !== "time_reports", `time_reports får ALDRIG läsas av resolvern`);
    assert(t !== "workdays", `workdays får ALDRIG läsas av resolvern`);
    assert(t !== "location_time_entries", `location_time_entries får ALDRIG läsas av resolvern`);
    assert(t !== "travel_time_logs", `travel_time_logs får ALDRIG läsas av resolvern`);
    assert(t !== "day_attestations", `day_attestations får ALDRIG läsas av resolvern`);
  }
});

Deno.test("resolveStaffDayReportsBatch: submission VINNER per (staff,date)", async () => {
  const admin = {
    from(table: string) {
      if (table !== "staff_day_submissions" && table !== "staff_day_report_cache") {
        throw new Error(`FORBIDDEN TABLE READ: ${table}`);
      }
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        order() { return builder; },
        limit() {
          if (table === "staff_day_submissions") {
            return Promise.resolve({
              data: [
                { ...SUBMISSION, id: "sub-A", staff_id: "s1", date: "2026-06-01" },
              ],
              error: null,
            });
          }
          return Promise.resolve({
            data: [
              { ...CACHE, staff_id: "s1", date: "2026-06-01" }, // ska ignoreras pga submission
              { ...CACHE, staff_id: "s2", date: "2026-06-01" }, // ska användas (ingen submission)
            ],
            error: null,
          });
        },
      };
      return builder;
    },
  } as any;

  const map = await resolveStaffDayReportsBatch({
    admin, organizationId: "org",
    staffIds: ["s1", "s2"], dates: ["2026-06-01"],
  });
  assertEquals(map.get("s1|2026-06-01")?.source, "submission");
  assertEquals(map.get("s2|2026-06-01")?.source, "cache");
});
