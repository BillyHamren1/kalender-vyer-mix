// @ts-nocheck
/**
 * location-update-cron
 * ────────────────────────────────────────────────────────────────────────────
 * Fallback-cron som garanterar att GPS → arbetsdagsstate alltid blir
 * processat, även när direktanropet i mobile-app-api/upload_location_batch
 * missas (offline-flush, crash, retry-fail, sen ping).
 *
 * KÖRS varje minut. Är INTE huvudmotor — bara safety net.
 *
 * Strategi (hellre litet och idempotent än smart):
 *   1. Hitta alla (staff, org, date) som har FÄRSK aktivitet senaste 10 min:
 *        a) ny ping i staff_location_history, ELLER
 *        b) öppen workday (ended_at IS NULL).
 *   2. För varje par → kör processStaffLocationUpdate (samma kodväg som
 *      direktprocessen, ingen egen tolkning).
 *   3. processStaffLocationUpdate äger:
 *        - lock-check (låsta dagar hoppas över)
 *        - anrop av process-location-auto-start (backfill_day, scoped)
 *        - audit i staff_day_decision_log
 *        - rebuild-kö i staff_day_rebuild_queue
 *
 * Acceptance:
 *   - Cron skapar ingen separat sanning. Allt går via samma funktion.
 *   - Lager → transport → projekt fångas upp inom 1–2 min utan manuell körning.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { processStaffLocationUpdate } from "../_shared/processStaffLocationUpdate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RECENT_WINDOW_MINUTES = 10;
const MAX_PAIRS_PER_RUN = 200;

interface Pair {
  staffId: string;
  organizationId: string;
  date: string;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const sinceIso = new Date(Date.now() - RECENT_WINDOW_MINUTES * 60_000)
    .toISOString();

  const pairs = new Map<string, Pair>();
  const addPair = (staffId: string, orgId: string, date: string, reason: string) => {
    if (!staffId || !orgId || !date) return;
    const key = `${staffId}::${date}`;
    if (!pairs.has(key)) {
      pairs.set(key, { staffId, organizationId: orgId, date, reason });
    }
  };

  // ── 1) Recent pings ───────────────────────────────────────────────────────
  try {
    const { data: pings } = await supabase
      .from("staff_location_history")
      .select("staff_id, organization_id, recorded_at")
      .gte("recorded_at", sinceIso)
      .order("recorded_at", { ascending: false })
      .limit(2000);
    for (const p of pings ?? []) {
      const date = String(p.recorded_at).slice(0, 10);
      addPair(p.staff_id, p.organization_id, date, "recent_ping");
    }
  } catch (err) {
    console.warn("[location-update-cron] ping scan failed:", err);
  }

  // ── 2) Open workdays (force-process today even if ping batcher is silent) ─
  try {
    const { data: openWds } = await supabase
      .from("workdays")
      .select("staff_id, organization_id, started_at")
      .is("ended_at", null)
      .limit(500);
    const today = new Date().toISOString().slice(0, 10);
    for (const w of openWds ?? []) {
      addPair(w.staff_id, w.organization_id, today, "open_workday");
    }
  } catch (err) {
    console.warn("[location-update-cron] open workday scan failed:", err);
  }

  if (pairs.size === 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        pairs: 0,
        elapsed_ms: Date.now() - startedAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const limited = Array.from(pairs.values()).slice(0, MAX_PAIRS_PER_RUN);

  // Group by (staff, org) so processStaffLocationUpdate can take a list of dates.
  const byStaff = new Map<string, { organizationId: string; dates: Set<string>; reasons: Set<string> }>();
  for (const p of limited) {
    const key = `${p.staffId}::${p.organizationId}`;
    let entry = byStaff.get(key);
    if (!entry) {
      entry = { organizationId: p.organizationId, dates: new Set(), reasons: new Set() };
      byStaff.set(key, entry);
    }
    entry.dates.add(p.date);
    entry.reasons.add(p.reason);
  }

  let processed = 0;
  let locked = 0;
  let errors = 0;
  const summaries: any[] = [];

  // Sequential per staff to avoid overwhelming the engine; the
  // fallback nature means we don't need bursts.
  for (const [key, entry] of byStaff) {
    const [staffId] = key.split("::");
    try {
      const results = await processStaffLocationUpdate(supabase, {
        staffId,
        organizationId: entry.organizationId,
        dates: Array.from(entry.dates),
        source: `cron:${Array.from(entry.reasons).join(",")}`,
      });
      for (const r of results) {
        processed += 1;
        if (r.locked) locked += 1;
        if (r.errors?.length) errors += 1;
      }
      summaries.push({ staffId, dates: Array.from(entry.dates), results });
    } catch (err: any) {
      errors += 1;
      console.warn("[location-update-cron] staff failed", staffId, err?.message ?? err);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      pairs: limited.length,
      staff: byStaff.size,
      processed,
      locked,
      errors,
      elapsed_ms: Date.now() - startedAt,
      summaries: summaries.slice(0, 50),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
