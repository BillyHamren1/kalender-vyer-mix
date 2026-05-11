// Edge Function: attest-staff-day
// User/admin attests their workday with a break value (in minutes).
// Hard rule: system never auto-deducts break — only stored attest values count.
// After upsert, the next get-staff-day-status call will recompute payableMinutes
// using day_attestations.break_minutes (overrides time_reports.break_time sum).

import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import { getStockholmDayWindowUtc } from "../_shared/stockholmDayWindow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: {
    staffId?: string;
    date?: string;
    breakMinutes?: number;
    comment?: string | null;
    requestedStartAt?: string | null;
    requestedEndAt?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }

  const staffId = (body.staffId ?? "").trim();
  const date = (body.date ?? "").trim();
  const breakMinutes = Number(body.breakMinutes);
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : null;

  if (!staffId) return bad(400, "staffId is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(400, "date must be YYYY-MM-DD");
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) {
    return bad(400, "breakMinutes must be 0..600");
  }

  function parseIso(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v !== "string" || !v.trim()) return null;
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    return new Date(t).toISOString();
  }
  const requestedStartAt = parseIso(body.requestedStartAt);
  const requestedEndAt = parseIso(body.requestedEndAt);
  if (
    requestedStartAt && requestedEndAt &&
    Date.parse(requestedStartAt) >= Date.parse(requestedEndAt)
  ) {
    return bad(400, "requestedStartAt must be before requestedEndAt");
  }

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);

  const orgId = access.orgId;
  const admin = authResult.auth.admin;
  const isAdmin = authResult.auth.mode === "jwt" && authResult.auth.isPrivileged;
  const attestedBy = authResult.auth.mode === "jwt" ? authResult.auth.userId : null;

  // Check existing attestation: locked rows can only be changed by admins.
  const { data: existing, error: existingErr } = await admin
    .from("day_attestations")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .eq("date", date)
    .maybeSingle();
  if (existingErr) return bad(500, `Lookup failed: ${existingErr.message}`);

  if (existing?.status === "locked" && !isAdmin) {
    return bad(409, "Day is locked — admin override required");
  }

  // Also block if workday is approved and caller isn't admin.
  // Attest gäller svensk kalenderdag (Stockholm) — använd Stockholm day window
  // och hämta workdays som ÖVERLAPPAR fönstret (inte bara started_at i fönstret),
  // så att pass över midnatt fångas. Om flera matchar, välj den med störst överlapp.
  const { startUtc, endUtc, startUtcMs, endUtcMs } = getStockholmDayWindowUtc(date);
  const { data: workdayRows } = await admin
    .from("workdays")
    .select("id, approved_at, ended_at, started_at")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .lte("started_at", endUtc)
    .or(`ended_at.is.null,ended_at.gte.${startUtc}`);

  let workday: { id: string; approved_at: string | null; ended_at: string | null; started_at: string } | null = null;
  if (workdayRows && workdayRows.length) {
    let bestOverlap = -1;
    for (const w of workdayRows as Array<{ id: string; approved_at: string | null; ended_at: string | null; started_at: string }>) {
      const s = new Date(w.started_at).getTime();
      const e = w.ended_at ? new Date(w.ended_at).getTime() : endUtcMs;
      const ov = Math.max(0, Math.min(e, endUtcMs) - Math.max(s, startUtcMs));
      if (ov > bestOverlap) { bestOverlap = ov; workday = w; }
    }
  }
  if (workday?.approved_at && !isAdmin) {
    return bad(409, "Workday is approved — admin override required");
  }

  const upsertRow = {
    organization_id: orgId,
    staff_id: staffId,
    date,
    break_minutes: Math.round(breakMinutes),
    comment,
    status: "attested" as const,
    attested_at: new Date().toISOString(),
    attested_by: attestedBy,
  };

  const { data: row, error: upsertErr } = await admin
    .from("day_attestations")
    .upsert(upsertRow, { onConflict: "organization_id,staff_id,date" })
    .select("id, staff_id, date, break_minutes, comment, status, attested_at, attested_by, locked_at, locked_by")
    .single();
  if (upsertErr) return bad(500, `Attest failed: ${upsertErr.message}`);

  return ok({
    attestation: {
      id: row.id,
      staffId: row.staff_id,
      date: row.date,
      breakMinutes: row.break_minutes,
      comment: row.comment,
      status: row.status,
      attestedAt: row.attested_at,
      attestedBy: row.attested_by,
      locked: row.status === "locked",
    },
  });
});
