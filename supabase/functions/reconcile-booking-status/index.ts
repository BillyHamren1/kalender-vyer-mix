// reconcile-booking-status
// ------------------------------------------------------------------
// Active reconciler that catches CANCELLED bookings the incremental
// ?since-sync misses. Loops over locally-CONFIRMED bookings in a
// rolling window, asks the external Booking API for current status
// per booking, and runs applyBookingCancellation on mismatches.
//
// Trigger: pg_cron every 10 min via cron.schedule (separate from
// incremental-sync-all-orgs).
//
// Reads: bookings, organizations, external export_bookings API
// Writes: bookings, calendar_events, warehouse_calendar_events,
//         projects, jobs, packing_projects, booking_products,
//         sync_state (history row only).
//
// All writes go through applyBookingCancellation in
// _shared/cancellation-handler.ts — keep that single source of truth.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyBookingCancellation } from "../_shared/cancellation-handler.ts";
import { normalizeBookingStatus } from "../_shared/booking-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPORT_BASE = "https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings";
const PER_RUN_LIMIT_DEFAULT = 80;
const WINDOW_PAST_DAYS = 7;
const WINDOW_FUTURE_DAYS = 90;

interface RunSummary {
  organizations_checked: number;
  bookings_inspected: number;
  external_fetch_failed: number;
  status_mismatches: number;
  cancellations_applied: number;
  errors: Array<{ booking_id?: string; org_id?: string; error: string }>;
}

async function fetchExternalStatus(
  bookingId: string,
  organizationId: string,
  importApiKey: string,
): Promise<{ ok: true; status: string | null; raw: any } | { ok: false; error: string }> {
  const params = new URLSearchParams({ organization_id: organizationId, booking_id: bookingId });
  const url = `${EXPORT_BASE}?${params.toString()}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${importApiKey}`,
        "x-api-key": importApiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: `HTTP ${resp.status}: ${text.substring(0, 200)}` };
    }
    const json = await resp.json();
    // export_bookings returns either { data: [..] } or { data: {...} } depending on filter.
    const row = Array.isArray(json?.data) ? json.data[0] : json?.data;
    if (!row) {
      // External API does not return the booking — most likely truly cancelled / hard-deleted.
      // Treat as CANCELLED so local copy is cleaned up.
      return { ok: true, status: "CANCELLED", raw: null };
    }
    const status = normalizeBookingStatus(row.status ?? row.booking_status ?? null);
    return { ok: true, status, raw: row };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const importApiKey = Deno.env.get("IMPORT_API_KEY");

  if (!importApiKey) {
    return new Response(JSON.stringify({ error: "IMPORT_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Allow narrowing per-request (manual trigger from admin tool).
  let limit = PER_RUN_LIMIT_DEFAULT;
  let onlyOrgId: string | undefined;
  let onlyBookingId: string | undefined;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.limit === "number") limit = Math.max(1, Math.min(500, body.limit));
      if (typeof body?.organization_id === "string") onlyOrgId = body.organization_id;
      if (typeof body?.booking_id === "string") onlyBookingId = body.booking_id;
    }
  } catch (_) {}

  const summary: RunSummary = {
    organizations_checked: 0,
    bookings_inspected: 0,
    external_fetch_failed: 0,
    status_mismatches: 0,
    cancellations_applied: 0,
    errors: [],
  };

  const today = new Date();
  const minDate = new Date(today.getTime() - WINDOW_PAST_DAYS * 86400_000).toISOString().slice(0, 10);
  const maxDate = new Date(today.getTime() + WINDOW_FUTURE_DAYS * 86400_000).toISOString().slice(0, 10);

  let candidatesQuery = supabase
    .from("bookings")
    .select("id, organization_id, booking_number, status, version, assigned_to_project, assigned_project_id, assigned_project_name, rigdaydate, eventdate, rigdowndate")
    .in("status", ["CONFIRMED", "OFFER"])
    .or(
      `and(rigdaydate.gte.${minDate},rigdaydate.lte.${maxDate}),and(eventdate.gte.${minDate},eventdate.lte.${maxDate})`,
    )
    .order("eventdate", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (onlyOrgId) candidatesQuery = candidatesQuery.eq("organization_id", onlyOrgId);
  if (onlyBookingId) candidatesQuery = candidatesQuery.eq("id", onlyBookingId);

  const { data: candidates, error: candErr } = await candidatesQuery;
  if (candErr) {
    return new Response(JSON.stringify({ error: candErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orgIds = new Set<string>();
  for (const b of candidates ?? []) {
    summary.bookings_inspected++;
    orgIds.add(b.organization_id);

    const ext = await fetchExternalStatus(b.id, b.organization_id, importApiKey);
    if (!ext.ok) {
      summary.external_fetch_failed++;
      summary.errors.push({ booking_id: b.id, org_id: b.organization_id, error: ext.error });
      continue;
    }

    const externalStatus = ext.status;
    const localStatus = b.status;

    if (externalStatus === "CANCELLED" && localStatus !== "CANCELLED") {
      summary.status_mismatches++;
      console.log(
        `[reconcile] Booking ${b.booking_number ?? b.id} (org ${b.organization_id}) — local=${localStatus} external=CANCELLED → applying cancellation`,
      );
      const result = await applyBookingCancellation(supabase, {
        id: b.id,
        version: b.version,
        assigned_to_project: b.assigned_to_project,
        assigned_project_id: b.assigned_project_id,
        assigned_project_name: b.assigned_project_name,
      });
      if (result.status === "cancelled") {
        summary.cancellations_applied++;
      } else if (result.status === "error") {
        summary.errors.push({ booking_id: b.id, error: result.error || "unknown" });
      }
    }
  }
  summary.organizations_checked = orgIds.size;

  // Record run in sync_state for history (best-effort; non-fatal).
  try {
    await supabase.from("sync_state").insert({
      sync_type: "cancellation_reconcile",
      last_sync_timestamp: new Date().toISOString(),
      last_sync_status: summary.errors.length === 0 ? "success" : "partial",
      last_sync_mode: "reconcile",
      metadata: summary as any,
    });
  } catch (err) {
    console.error("[reconcile] failed to record sync_state row:", err);
  }

  return new Response(JSON.stringify({ success: true, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
