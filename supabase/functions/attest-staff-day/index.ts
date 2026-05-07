// Edge Function: attest-staff-day
// User/admin attests their workday with a break value (in minutes).
// Hard rule: system never auto-deducts break — only stored attest values count.
// After upsert, the next get-staff-day-status call will recompute payableMinutes
// using day_attestations.break_minutes (overrides time_reports.break_time sum).

import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";

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

  let body: { staffId?: string; date?: string; breakMinutes?: number; comment?: string | null };
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

  // Also block if workday is approved and caller isn't admin
  const { data: workday } = await admin
    .from("workdays")
    .select("id, approved_at, ended_at")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .gte("started_at", `${date}T00:00:00Z`)
    .lte("started_at", `${date}T23:59:59.999Z`)
    .maybeSingle();
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
