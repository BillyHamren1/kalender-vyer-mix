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
import { buildTrackingPolicy } from "../_shared/trackingPolicy.ts";
import { maybeRequestWake } from "../_shared/wakeRequest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// CRON_SECRET — required header on every invocation. Set via Supabase secrets
// and injected by the pg_cron schedule (see migration). Without it the
// function refuses to run, so a leaked anon key alone cannot trigger
// service-role processing.
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

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

  // ── Auth gate ────────────────────────────────────────────────────────────
  // Accept either:
  //   (a) x-cron-secret header matching CRON_SECRET (used by pg_cron), or
  //   (b) Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> (manual ops).
  // The public anon key is NOT accepted — this function performs service-role
  // mutations and must never be triggerable by unauthenticated callers.
  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const okCronSecret = CRON_SECRET.length > 0 && headerSecret === CRON_SECRET;
  const okServiceRole = SERVICE_ROLE.length > 0 && bearer === SERVICE_ROLE;
  if (!okCronSecret && !okServiceRole) {
    console.warn("[location-update-cron] unauthorized invocation rejected");
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

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
  const openWorkdayStaff: Array<{ staffId: string; organizationId: string }> = [];
  try {
    const { data: openWds } = await supabase
      .from("workdays")
      .select("staff_id, organization_id, started_at")
      .is("ended_at", null)
      .limit(500);
    const today = new Date().toISOString().slice(0, 10);
    for (const w of openWds ?? []) {
      addPair(w.staff_id, w.organization_id, today, "open_workday");
      openWorkdayStaff.push({ staffId: w.staff_id, organizationId: w.organization_id });
    }
  } catch (err) {
    console.warn("[location-update-cron] open workday scan failed:", err);
  }

  // ── 2b) Auto wake-request for stale signal during open workday ───────────
  // Per policy (mem://features/field-staff/...): a silent phone may NEVER
  // close a workday or deduct time, but the backend MAY ask the device to
  // send a fresh sample. The wake helper enforces:
  //   • max 1 wake / 10 min / staff
  //   • max 3 wakes /  60 min / staff
  //   • silent FCM data payload (no user-visible alert)
  //   • full audit trail in staff_wake_requests
  // If the app doesn't respond, the snapshot keeps showing "Signal saknas"
  // — the workday stays open.
  let wakesDispatched = 0;
  let wakesSkipped = 0;
  if (openWorkdayStaff.length > 0) {
    const nowMs = Date.now();
    // Latest ping per staff in one query (filter by recent superset to keep small).
    const lookbackIso = new Date(nowMs - 60 * 60_000).toISOString();
    const { data: latestPings } = await supabase
      .from("staff_location_history")
      .select("staff_id, recorded_at")
      .in("staff_id", openWorkdayStaff.map((s) => s.staffId))
      .gte("recorded_at", lookbackIso)
      .order("recorded_at", { ascending: false })
      .limit(2000);
    const latestByStaff = new Map<string, string>();
    for (const p of latestPings ?? []) {
      if (!latestByStaff.has(p.staff_id)) latestByStaff.set(p.staff_id, p.recorded_at);
    }

    for (const { staffId, organizationId } of openWorkdayStaff) {
      const lastPingAt = latestByStaff.get(staffId) ?? null;
      const policy = buildTrackingPolicy({
        hasActiveTimer: false, // unknown here; "normal" maxSilenceMs is the lower bound
        workdayOpen: true,
        activeBoosts: [],
        lastPingAt,
        now: new Date(nowMs),
      });
      if (!policy.isSignalStale) continue;

      const result = await maybeRequestWake({
        supabase,
        staffId,
        organizationId,
        reason: "signal_stale_workday_open",
        silenceMs: policy.silenceMs ?? null,
        context: {
          last_ping_at: lastPingAt,
          max_silence_ms: policy.maxSilenceMs,
        },
        now: new Date(nowMs),
      });
      if (result.dispatched) wakesDispatched++;
      else wakesSkipped++;
    }
  }

  if (pairs.size === 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        pairs: 0,
        wakes_dispatched: wakesDispatched,
        wakes_skipped: wakesSkipped,
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
      wakes_dispatched: wakesDispatched,
      wakes_skipped: wakesSkipped,
      elapsed_ms: Date.now() - startedAt,
      summaries: summaries.slice(0, 50),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
