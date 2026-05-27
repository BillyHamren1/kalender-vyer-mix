// Live verification test for Raivis 2026-05-26.
// Run with: deno test --allow-net --allow-env supabase/functions/get-staff-day-gps-result/verify_raivis.test.ts
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCanonicalStaffDayGpsResult } from "../_shared/staff-gps/canonicalStaffDayGpsResult.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STAFF_ID = "staff_1775736348370_e5mua0yum";
const DATE = "2026-05-26";
const ORG_ID = "f5e5cade-f08b-4833-a105-56461f15b191";

Deno.test("Raivis 2026-05-26 canonical verification", async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  console.log("\n========== CANONICAL ==========");
  const canonical = await buildCanonicalStaffDayGpsResult(admin, {
    organizationId: ORG_ID,
    staffId: STAFF_ID,
    date: DATE,
    forceRefresh: true,
  });
  console.log(JSON.stringify({
    firstIso: canonical.firstIso,
    lastIso: canonical.lastIso,
    totals: canonical.totals,
    segmentCount: canonical.segments.length,
    geofenceVisits: canonical.geofenceVisits.map(v => ({
      label: v.label, start: v.startIso, end: v.endIso, min: v.durationMinutes, pings: v.pingCount,
    })),
    segments: canonical.segments.map(s => ({
      type: s.type, label: s.label, start: s.startIso, end: s.endIso, min: s.durationMinutes,
    })),
    debug: canonical.debug,
  }, null, 2));

  // Note: get-staff-gps-week-summary delegates to the same builder, so its
  // workMin/travelMin/etc. are byte-for-byte equal to canonical.totals.
  // We surface the projected DaySummary shape here to make that explicit.
  const projectedWeek = {
    date: DATE,
    pingsCount: canonical.map.pings.length,
    firstIso: canonical.firstIso,
    lastIso: canonical.lastIso,
    workMin: canonical.totals.workMinutes,
    travelMin: canonical.totals.travelMinutes,
    privateMin: canonical.totals.privateMinutes,
    unknownMin: canonical.totals.unknownMinutes,
    gapMin: canonical.totals.gpsGapMinutes,
    idleMin: canonical.totals.idleMinutes,
    windowMin: canonical.totals.visibleWindowMinutes,
    segmentCount: canonical.segments.length,
  };
  console.log("\n========== WEEK-SUMMARY PROJECTION (delegated) ==========");
  console.log(JSON.stringify(projectedWeek, null, 2));

  // Compare against Time Engine cache that get-mobile-gps-day-view currently
  // serves (display_blocks_json). Helps identify the divergent source.
  console.log("\n========== MOBILE-GPS-DAY-VIEW SOURCE (Time Engine cache) ==========");
  const { data: cache } = await admin
    .from("staff_day_report_cache")
    .select("display_blocks_json, report_candidate_blocks_json, generated_at, source")
    .eq("staff_id", STAFF_ID)
    .eq("date", DATE)
    .maybeSingle();
  if (!cache) {
    console.log("→ NO Time Engine cache row. mobile-gps-day-view falls back to GPS-only timeline.");
  } else {
    const display = (cache.display_blocks_json as any[]) ?? [];
    console.log(JSON.stringify({
      generated_at: cache.generated_at,
      source: cache.source,
      displayBlockCount: display.length,
      displayBlocks: display.map((b: any) => ({
        kind: b.kind ?? b.type,
        label: b.label ?? b.title ?? b.target_label,
        start: b.start ?? b.start_iso ?? b.startIso,
        end: b.end ?? b.end_iso ?? b.endIso,
      })),
    }, null, 2));
  }

  console.log("\n========== EXPECTED (from satellite map) ==========");
  console.log(JSON.stringify([
    { label: "FA Warehouse", approx: "08:58–09:49" },
    { label: "Resa", approx: "09:49–11:00" },
    { label: "Swedish game fair", approx: "11:00–19:29" },
    { label: "Resa", approx: "19:29–20:02" },
    { label: "FA Warehouse", approx: "20:02–20:08" },
  ], null, 2));
});
