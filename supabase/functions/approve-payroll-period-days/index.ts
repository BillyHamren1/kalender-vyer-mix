import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timeToMin(t: string | null): number | null {
  if (!t || t.length < 5) return null;
  const [hh, mm] = t.split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function totalMin(row: {
  start_time: string | null;
  end_time: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number | null;
}): number {
  let startMs: number | null = null;
  let endMs: number | null = null;
  if (row.requested_start_at) startMs = new Date(row.requested_start_at).getTime();
  if (row.requested_end_at) endMs = new Date(row.requested_end_at).getTime();
  if (startMs != null && endMs != null) {
    return Math.max(0, Math.round((endMs - startMs) / 60_000) - (row.break_minutes ?? 0));
  }
  const s = timeToMin(row.start_time);
  const e = timeToMin(row.end_time);
  if (s == null || e == null) return 0;
  return Math.max(0, e - s - (row.break_minutes ?? 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "missing_auth" }, 401);

  const authed = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await authed.auth.getUser();
  if (ue || !u?.user) return json({ error: "unauthorized" }, 401);
  const userId = u.user.id;
  const admin = createClient(URL_, SR);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const period_id = typeof body?.payroll_period_id === "string"
    ? body.payroll_period_id
    : typeof body?.period_id === "string" ? body.period_id : null;
  if (!period_id) return json({ error: "payroll_period_id_required" }, 400);

  const { data: prof } = await admin
    .from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  const orgId = prof?.organization_id as string | undefined;
  if (!orgId) return json({ error: "no_org" }, 403);

  const { data: rolesData } = await admin
    .from("user_roles").select("role").eq("user_id", userId);
  const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("projekt"))
    return json({ error: "forbidden_role" }, 403);

  const { data: period, error: pe } = await admin
    .from("staff_payroll_periods")
    .select("id, organization_id, period_start, period_end, status")
    .eq("id", period_id)
    .maybeSingle();
  if (pe) return json({ error: "load_failed", detail: pe.message }, 500);
  if (!period) return json({ error: "not_found" }, 404);
  if (period.organization_id !== orgId) return json({ error: "forbidden_org" }, 403);

  const { data: subs, error: se } = await admin
    .from("staff_day_submissions")
    .select("id, staff_id, date, status, start_time, end_time, requested_start_at, requested_end_at, break_minutes")
    .eq("organization_id", orgId)
    .gte("date", period.period_start)
    .lte("date", period.period_end)
    .limit(10000);
  if (se) return json({ error: "subs_failed", detail: se.message }, 500);

  const all = subs ?? [];
  const eligible = all.filter((r) => r.status === "submitted" || r.status === "approved" || r.status === "edited");
  const excludedNeedsControl = all.filter((r) => r.status === "needs_control").length;
  const alreadyApproved = all.filter((r) => r.status === "payroll_approved").length;

  const nowIso = new Date().toISOString();

  // Insert period_days rows (skip duplicates via upsert on (payroll_period_id, day_submission_id))
  if (eligible.length > 0) {
    const rows = eligible.map((r) => ({
      organization_id: orgId,
      payroll_period_id: period_id,
      day_submission_id: r.id,
      staff_id: r.staff_id,
      report_date: r.date,
      included_at: nowIso,
    }));
    const { error: ie } = await admin
      .from("staff_payroll_period_days")
      .upsert(rows, { onConflict: "payroll_period_id,day_submission_id", ignoreDuplicates: true });
    if (ie) return json({ error: "insert_period_days_failed", detail: ie.message }, 500);

    const ids = eligible.map((r) => r.id);
    const { error: ue2 } = await admin
      .from("staff_day_submissions")
      .update({
        status: "payroll_approved",
        reviewed_at: nowIso,
        reviewed_by: userId,
      })
      .in("id", ids);
    if (ue2) return json({ error: "status_update_failed", detail: ue2.message }, 500);
  }

  // Mark period approved_for_payout
  await admin
    .from("staff_payroll_periods")
    .update({
      status: "approved_for_payout",
      approved_for_payout_at: nowIso,
      approved_for_payout_by: userId,
    })
    .eq("id", period_id);

  const includedDays = eligible.length;
  const totalMinutes = eligible.reduce((acc, r) => acc + totalMin(r as any), 0);
  const staffCount = new Set(eligible.map((r) => r.staff_id)).size;

  return json({
    ok: true,
    summary: {
      includedDays,
      excludedNeedsControl,
      alreadyApproved,
      staffCount,
      totalMinutes,
      periodStart: period.period_start,
      periodEnd: period.period_end,
    },
  });
});
