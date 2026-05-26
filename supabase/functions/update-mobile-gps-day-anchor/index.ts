// update-mobile-gps-day-anchor
// =============================================================================
// Time v2 — bekräfta / justera systemets föreslagna start- eller sluttid.
//
// Detta är ENBART ett ankare i staff_gps_day_anchors. Det är inte:
//   - workday
//   - timer
//   - active_time_registration
//   - time_report
//   - location_time_entry
//   - travel_time_log
//
// Funktionen rör ALDRIG: workdays, time_reports, active_time_registrations,
// location_time_entries, travel_time_logs, staff_day_report_cache,
// report_candidate_blocks_json, display_blocks_json, staff_location_history,
// geofences, routes.
//
// Returnerar uppdaterad get-mobile-gps-day-view-response så appen kan
// rendera om utan extra round-trip.

import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANCHOR_TYPES = new Set(["start", "end"]);
const CONFIRMATION_MODES = new Set(["confirmed", "adjusted", "dismissed"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isIsoTimestamp(s: unknown): s is string {
  if (typeof s !== "string" || !s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

interface AnchorBody {
  staffId?: string;
  date?: string;
  anchorType?: string;
  suggestedAt?: string | null;
  confirmedAt?: string | null;
  confirmationMode?: string;
  reason?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: AnchorBody;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const staffId = String(body.staffId ?? "").trim();
  const date = String(body.date ?? "").trim();
  const anchorType = String(body.anchorType ?? "").trim();
  const confirmationMode = String(body.confirmationMode ?? "").trim();
  const suggestedAt = body.suggestedAt ?? null;
  const confirmedAtRaw = body.confirmedAt ?? null;
  const reason = body.reason ? String(body.reason).slice(0, 1000) : null;

  if (!staffId) return json({ error: "staffId required" }, 400);
  if (!ISO_DATE.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);
  if (!ANCHOR_TYPES.has(anchorType)) {
    return json({ error: "anchorType must be 'start' or 'end'" }, 400);
  }
  if (!CONFIRMATION_MODES.has(confirmationMode)) {
    return json({ error: "confirmationMode must be confirmed|adjusted|dismissed" }, 400);
  }

  // Validate confirmedAt according to mode
  let confirmedAt: string | null = null;
  if (confirmationMode === "dismissed") {
    confirmedAt = null;
  } else {
    if (!isIsoTimestamp(confirmedAtRaw)) {
      return json({ error: "confirmedAt must be a valid ISO timestamp" }, 400);
    }
    confirmedAt = new Date(confirmedAtRaw as string).toISOString();
    // Sanity: timestamp ska tillhöra dagen (eller natt-span: ±1 dag)
    const d0 = new Date(`${date}T00:00:00Z`).getTime();
    const dEnd = d0 + 48 * 3600 * 1000;
    const dStart = d0 - 12 * 3600 * 1000;
    const t = new Date(confirmedAt).getTime();
    if (t < dStart || t > dEnd) {
      return json({ error: "confirmedAt outside reasonable day span" }, 400);
    }
  }

  if (suggestedAt !== null && !isIsoTimestamp(suggestedAt)) {
    return json({ error: "suggestedAt must be null or a valid ISO timestamp" }, 400);
  }

  // ── Auth ───────────────────────────────────────────────────────────────
  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return json({ error: authResult.err.error }, authResult.err.status);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return json({ error: access.err.error }, access.err.status);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;
  const actorUserId =
    authResult.auth.mode === "jwt" ? authResult.auth.userId : null;

  // ── Block read-only när dagen är approved/payroll_approved ─────────────
  try {
    const { data: sub } = await admin
      .from("staff_day_submissions")
      .select("status")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle();
    const status = String((sub as any)?.status ?? "");
    if (status === "approved" || status === "payroll_approved") {
      return json({ error: "Day is locked", status }, 409);
    }
  } catch (e) {
    console.warn("[update-mobile-gps-day-anchor] submission status read failed", e);
  }

  // ── Upsert anchor ──────────────────────────────────────────────────────
  const upsertRow = {
    organization_id: orgId,
    staff_id: staffId,
    date,
    anchor_type: anchorType,
    suggested_at: suggestedAt ?? null,
    confirmed_at: confirmedAt,
    confirmation_mode: confirmationMode,
    source: "mobile_time_v2",
    reason,
    updated_by: actorUserId,
    created_by: actorUserId,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await admin
    .from("staff_gps_day_anchors")
    .upsert(upsertRow, { onConflict: "staff_id,date,anchor_type" });

  if (upsertError) {
    console.error("[update-mobile-gps-day-anchor] upsert failed", upsertError);
    return json({ error: upsertError.message }, 500);
  }

  // ── Refresh GPS Day View ───────────────────────────────────────────────
  // Vi anropar get-mobile-gps-day-view via internt fetch så app:en får
  // hela det nya kontraktet (inkl anchors) tillbaka i ett svar.
  const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const internalKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const incomingAuth = req.headers.get("authorization");
    const incomingApiKey = req.headers.get("apikey");
    const res = await fetch(`${supaUrl}/functions/v1/get-mobile-gps-day-view`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: incomingAuth ?? `Bearer ${internalKey}`,
        ...(incomingApiKey ? { apikey: incomingApiKey } : {}),
      },
      body: JSON.stringify({ staffId, date }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[update-mobile-gps-day-anchor] refresh non-ok", res.status, text);
      return json({ ok: true, refreshed: false });
    }
    const view = await res.json();
    return json(view);
  } catch (e) {
    console.warn("[update-mobile-gps-day-anchor] refresh fetch failed", e);
    return json({ ok: true, refreshed: false });
  }
});
