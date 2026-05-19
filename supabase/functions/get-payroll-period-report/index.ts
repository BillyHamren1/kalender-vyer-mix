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
}): number | null {
  let startMs: number | null = null;
  let endMs: number | null = null;
  if (row.requested_start_at) startMs = new Date(row.requested_start_at).getTime();
  if (row.requested_end_at) endMs = new Date(row.requested_end_at).getTime();
  if (startMs == null || endMs == null) {
    const s = timeToMin(row.start_time);
    const e = timeToMin(row.end_time);
    if (s == null || e == null) return null;
    return Math.max(0, e - s - (row.break_minutes ?? 0));
  }
  return Math.max(0, Math.round((endMs - startMs) / 60_000) - (row.break_minutes ?? 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET")
    return json({ error: "method_not_allowed" }, 405);

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

  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  } else {
    const url = new URL(req.url);
    body = Object.fromEntries(url.searchParams.entries());
  }

  const period_id = typeof body?.period_id === "string" ? body.period_id : null;
  if (!period_id) return json({ error: "period_id_required" }, 400);

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
    .select("id, organization_id, name, period_start, period_end, status, approved_for_payout_at")
    .eq("id", period_id)
    .maybeSingle();
  if (pe) return json({ error: "load_failed", detail: pe.message }, 500);
  if (!period) return json({ error: "not_found" }, 404);
  if (period.organization_id !== orgId) return json({ error: "forbidden_org" }, 403);

  const { data: subs, error: se } = await admin
    .from("staff_day_submissions")
    .select(
      "id, staff_id, date, status, start_time, end_time, requested_start_at, requested_end_at, break_minutes, comment, review_comment",
    )
    .eq("organization_id", orgId)
    .gte("date", period.period_start)
    .lte("date", period.period_end)
    .order("date", { ascending: true })
    .limit(5000);

  if (se) return json({ error: "subs_failed", detail: se.message }, 500);

  const submissions = subs ?? [];

  const staffIds = Array.from(new Set(submissions.map((r) => r.staff_id))).filter(Boolean);
  let staffMap: Record<string, { id: string; name: string }> = {};
  if (staffIds.length) {
    const { data: staff } = await admin
      .from("staff_members")
      .select("id, name")
      .in("id", staffIds)
      .eq("organization_id", orgId);
    for (const s of staff ?? []) staffMap[s.id] = { id: s.id, name: s.name };
  }

  // Group + summarize per staff
  const byStaff = new Map<string, {
    staff_id: string;
    staff_name: string;
    days_reported: number;
    total_minutes: number;
    total_break_minutes: number;
    rows: any[];
  }>();

  for (const r of submissions) {
    const key = r.staff_id;
    if (!byStaff.has(key)) {
      byStaff.set(key, {
        staff_id: key,
        staff_name: staffMap[key]?.name ?? key,
        days_reported: 0,
        total_minutes: 0,
        total_break_minutes: 0,
        rows: [],
      });
    }
    const g = byStaff.get(key)!;
    const minutes = totalMin(r) ?? 0;
    g.days_reported += 1;
    g.total_minutes += minutes;
    g.total_break_minutes += r.break_minutes ?? 0;
    g.rows.push({
      id: r.id,
      date: r.date,
      status: r.status,
      start_time: r.start_time,
      end_time: r.end_time,
      requested_start_at: r.requested_start_at,
      requested_end_at: r.requested_end_at,
      break_minutes: r.break_minutes ?? 0,
      total_minutes: minutes,
      comment: r.comment,
      review_comment: r.review_comment,
    });
  }

  const groups = Array.from(byStaff.values()).sort((a, b) =>
    a.staff_name.localeCompare(b.staff_name, "sv"),
  );

  return json({
    period: {
      id: period.id,
      name: period.name,
      period_start: period.period_start,
      period_end: period.period_end,
      status: period.status,
    },
    totals: {
      staff_count: groups.length,
      submissions_count: submissions.length,
      total_minutes: groups.reduce((acc, g) => acc + g.total_minutes, 0),
    },
    groups,
  });
});
