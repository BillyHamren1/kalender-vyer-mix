import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
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

  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  const period_start = body?.period_start;
  const period_end = body?.period_end;

  if (!name) return json({ error: "name_required" }, 400);
  if (!isIsoDate(period_start) || !isIsoDate(period_end))
    return json({ error: "invalid_dates" }, 400);
  if (period_end < period_start) return json({ error: "end_before_start" }, 400);

  const { data: prof } = await admin
    .from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  const orgId = prof?.organization_id as string | undefined;
  if (!orgId) return json({ error: "no_org" }, 403);

  const { data: rolesData } = await admin
    .from("user_roles").select("role").eq("user_id", userId);
  const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("projekt"))
    return json({ error: "forbidden_role" }, 403);

  const { data, error } = await admin
    .from("staff_payroll_periods")
    .insert({
      organization_id: orgId,
      name,
      period_start,
      period_end,
      status: "draft",
    })
    .select("id, name, period_start, period_end, status, created_at")
    .single();

  if (error) return json({ error: "insert_failed", detail: error.message }, 500);
  return json({ ok: true, period: data });
});
