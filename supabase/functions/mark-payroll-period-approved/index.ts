import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  const confirm = body?.confirm === true;

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
  if (period.status === "approved_for_payout")
    return json({ error: "already_approved", message: "Perioden är redan godkänd för utbetalning." }, 409);

  // Check included days
  const { count: includedCount, error: ce } = await admin
    .from("staff_payroll_period_days")
    .select("id", { count: "exact", head: true })
    .eq("payroll_period_id", period_id)
    .eq("organization_id", orgId);
  if (ce) return json({ error: "count_failed", detail: ce.message }, 500);
  if (!includedCount || includedCount === 0) {
    return json({
      error: "no_included_days",
      message: "Inga dagar är godkända i perioden. Klicka 'Godkänn alla dagar' först.",
    }, 409);
  }

  // Check needs_control within period
  const { data: needs, error: ne } = await admin
    .from("staff_day_submissions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "needs_control")
    .gte("date", period.period_start)
    .lte("date", period.period_end)
    .limit(1000);
  if (ne) return json({ error: "needs_control_failed", detail: ne.message }, 500);
  const needsControlCount = needs?.length ?? 0;

  if (needsControlCount > 0 && !confirm) {
    return json({
      ok: false,
      warning: "needs_control_present",
      message: `${needsControlCount} dagar är markerade för kontroll. Bekräfta för att låsa perioden ändå.`,
      needsControlCount,
      includedCount,
    }, 200);
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await admin
    .from("staff_payroll_periods")
    .update({
      status: "approved_for_payout",
      approved_for_payout_at: nowIso,
      approved_for_payout_by: userId,
    })
    .eq("id", period_id);
  if (upErr) return json({ error: "update_failed", detail: upErr.message }, 500);

  return json({
    ok: true,
    summary: {
      periodId: period_id,
      status: "approved_for_payout",
      approvedAt: nowIso,
      includedCount,
      needsControlCount,
    },
  });
});
