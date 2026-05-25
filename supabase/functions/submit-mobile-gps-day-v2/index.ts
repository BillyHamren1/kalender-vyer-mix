// submit-mobile-gps-day-v2
// =============================================================================
// Time v2 — användaren skickar in dagen exakt som hen ser GPS Day View.
//
// Skriver till staff_day_submissions (delas med nya admin/attestflödet).
// Rör ALDRIG: time_reports, workdays, location_time_entries, travel_time_logs,
// staff_day_report_cache, report_candidate_blocks_json, display_blocks_json.
//
// Status-modell:
//   - approved / payroll_approved  → låst, blockerar (409)
//   - correction_requested + ny submit → status = submitted ("resubmitted" semantiskt,
//     men databasen håller sig till 'submitted' enligt aktuell constraint)
//   - allt annat → status = submitted

import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  fetchPingsForDayV2,
  loadKnownTargetsV2,
} from "../_shared/time-v2/loaders.ts";
import {
  buildDayView,
  type ManualSegmentOverride,
} from "../_shared/time-v2/buildDayView.ts";

interface SubmitBody {
  staffId?: string;
  date?: string;
  userComment?: string | null;
  manualOverrides?: ManualSegmentOverride[];
  /** Klient skickar med sourceSnapshotId hen såg (för spårbarhet). */
  expectedSourceSnapshotId?: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: SubmitBody;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const staffId = String(body.staffId ?? "").trim();
  const date = String(body.date ?? "").trim();
  if (!staffId) return json({ error: "staffId required" }, 400);
  if (!ISO_DATE.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);

  const userComment = body.userComment ? String(body.userComment).slice(0, 4000) : null;
  const manualOverrides: ManualSegmentOverride[] = Array.isArray(body.manualOverrides)
    ? body.manualOverrides.filter((o) => o && typeof o.segmentKey === "string")
    : [];

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return json({ error: authResult.err.error }, authResult.err.status);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return json({ error: access.err.error }, access.err.status);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;
  const isPrivilegedAdmin =
    authResult.auth.mode === "jwt" && authResult.auth.isPrivileged === true;

  // ── Lock-check ───────────────────────────────────────────────
  let priorStatus: string | null = null;
  let priorId: string | null = null;
  try {
    const { data } = await admin
      .from("staff_day_submissions")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle();
    if (data) {
      priorStatus = String((data as any).status ?? "");
      priorId = String((data as any).id);
    }
  } catch (e) {
    console.error("[submit-mobile-gps-day-v2] prior fetch failed", e);
  }
  if ((priorStatus === "approved" || priorStatus === "payroll_approved") && !isPrivilegedAdmin) {
    return json(
      { error: "Dagen är låst (godkänd / utbetald) och kan inte ändras av användaren" },
      409,
    );
  }

  // ── Hämta staff name + bygg vyn på exakt samma sätt som get-mobile-gps-day-view ──
  let staffName: string | null = null;
  try {
    const { data } = await admin
      .from("staff").select("first_name, last_name, name").eq("id", staffId).maybeSingle();
    if (data) {
      const full = `${(data as any).first_name ?? ""} ${(data as any).last_name ?? ""}`.trim();
      staffName = full || (data as any).name || null;
    }
  } catch (_e) { /* ignore */ }

  let knownTargets: any[] = [];
  try { knownTargets = await loadKnownTargetsV2(admin, orgId); }
  catch (e) { console.error("[submit-mobile-gps-day-v2] target load failed", e); return json({ error: "target load failed" }, 500); }

  let pings: any[] = [];
  try { pings = await fetchPingsForDayV2(admin, staffId, date); }
  catch (e) { console.error("[submit-mobile-gps-day-v2] ping fetch failed", e); return json({ error: "ping fetch failed" }, 500); }

  const view = buildDayView({
    staffId, organizationId: orgId, date, pings, knownTargets, manualOverrides, staffName,
  });

  const sourceSnapshotId = `${date}:${staffId}:${view.rawPingCount}:${view.firstPingAt ?? "-"}:${view.lastPingAt ?? "-"}`;

  // Status: lås submitted (även för "resubmitted" semantiskt) — DB-constraint
  // tillåter inte 'resubmitted'. Adminflödet vet att review_comment != null +
  // correction_requested_at != null betyder "återinskickad efter komplettering".
  const nextStatus = "submitted";

  const submittedPayload = {
    source: "mobile_gps_day_view_v2",
    date,
    staffId,
    sourceSnapshotId,
    segments: view.segments,
    rows: view.rows,
    totals: view.totals,
    manualOverridesSummary: view.manualOverridesSummary,
    rawPingCount: view.rawPingCount,
    submittedAt: new Date().toISOString(),
    submittedBy: authResult.auth.userId ?? null,
  };

  const upsertPayload: Record<string, unknown> = {
    organization_id: orgId,
    staff_id: staffId,
    date,
    status: nextStatus,
    source: "mobile_gps_day_view_v2",
    source_snapshot_id: sourceSnapshotId,
    submitted_at: new Date().toISOString(),
    submitted_by: authResult.auth.userId ?? null,
    submitted_payload_json: submittedPayload,
    comment: userComment,
    break_minutes: 0, // appens GPS Day View hanterar inte rast separat
  };

  const { data, error } = await admin
    .from("staff_day_submissions")
    .upsert(upsertPayload, { onConflict: "organization_id,staff_id,date" })
    .select()
    .single();

  if (error) {
    console.error("[submit-mobile-gps-day-v2] upsert failed", error);
    return json({ error: error.message }, 500);
  }

  // Spegla user_comment som staff-message så att admin ser hela konversationen
  if (userComment) {
    try {
      await admin.from("staff_day_submission_messages").insert({
        organization_id: orgId,
        submission_id: (data as any).id,
        staff_id: staffId,
        date,
        author_role: "staff",
        author_id: authResult.auth.userId ?? null,
        body: userComment,
      });
    } catch (e) {
      console.error("[submit-mobile-gps-day-v2] message insert failed", e);
    }
  }

  return json({
    ok: true,
    source: "mobile_gps_day_view_v2",
    staffId,
    date,
    sourceSnapshotId,
    submission: {
      id: (data as any).id,
      status: nextStatus,
      submittedAt: (data as any).submitted_at,
      userComment,
    },
    view: {
      title: view.title,
      subtitle: view.subtitle,
      segments: view.segments,
      rows: view.rows,
      totals: view.totals,
      manualOverridesSummary: view.manualOverridesSummary,
      rawPingCount: view.rawPingCount,
    },
    priorStatus,
  });
});
