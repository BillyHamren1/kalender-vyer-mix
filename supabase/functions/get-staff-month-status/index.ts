// Edge Function: get-staff-month-status
// Returns per-day status across a calendar month (YYYY-MM) for a staff member.
// Auth: JWT required. Self OR admin/manager-ish roles. Strict org-isolation.
//
// Output shape mirrors `StaffMonthStatus` in the frontend hook:
// {
//   month, staffId,
//   days: [{ date, workdayMinutes, allocatedProjectMinutes, travelMinutes,
//            unallocatedMinutes, isWorkdayOpen, hasFlags, reviewStatus,
//            approved, status }],
//   totals: { workdayMinutes, allocatedProjectMinutes, travelMinutes,
//             unallocatedMinutes, approvedMinutes, pendingReviewMinutes,
//             daysWithFlags }
// }
//
// `status` values: 'open' | 'approved' | 'review_required' | 'closed'
//                | 'missing' | 'off' | 'locked'. UI keeps the truth here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function thisMonthInStockholm(): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
  });
  return fmt.format(new Date()); // "YYYY-MM"
}

function eachDay(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

function diffMin(start: string, end: string | null, now: Date): number {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : now.getTime();
  return Math.max(0, Math.round((e - s) / 60_000));
}

function hToMin(h: number | null | undefined): number {
  if (!h || !isFinite(h)) return 0;
  return Math.round(h * 60);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return bad(401, "Unauthorized");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return bad(401, "Unauthorized");
  const userId = claimsData.claims.sub as string;

  let body: { staffId?: string; month?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }
  const staffId = (body.staffId ?? "").trim();
  if (!staffId) return bad(400, "staffId is required");
  const month = (body.month ?? thisMonthInStockholm()).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return bad(400, "month must be YYYY-MM");

  // Caller org + role
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  const orgId = profile?.organization_id as string | undefined;
  if (!orgId) return bad(403, "No organization for caller");

  const { data: targetStaff } = await admin
    .from("staff_members")
    .select("id, user_id, organization_id")
    .eq("id", staffId)
    .maybeSingle();
  if (!targetStaff || targetStaff.organization_id !== orgId) {
    return bad(404, "Staff not found in your organization");
  }

  const isSelf = targetStaff.user_id === userId;
  let isPrivileged = false;
  if (!isSelf) {
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = new Set(["admin", "projekt", "lager"]);
    isPrivileged = (roles ?? []).some((r) => allowed.has(r.role as string));
  }
  if (!isSelf && !isPrivileged) return bad(403, "Forbidden");

  // Window — pad ±1 day to cover overlap rows.
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  const padStart = new Date(new Date(`${monthStart}T00:00:00Z`).getTime() - 24 * 3600 * 1000).toISOString();
  const padEnd = new Date(new Date(`${monthEnd}T23:59:59Z`).getTime() + 24 * 3600 * 1000).toISOString();

  const [workdayRes, trRes, travelRes, flagRes] = await Promise.all([
    admin
      .from("workdays")
      .select("id, started_at, ended_at, review_status, approved_at")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("started_at", padStart)
      .lte("started_at", padEnd),
    admin
      .from("time_reports")
      .select("report_date, hours_worked, large_project_id, booking_id")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("report_date", monthStart)
      .lte("report_date", monthEnd),
    admin
      .from("travel_time_logs")
      .select("start_time, end_time, hours_worked, report_date")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("start_time", padStart)
      .lte("start_time", padEnd),
    admin
      .from("workday_flags")
      .select("flag_date, severity, resolved")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("flag_date", monthStart)
      .lte("flag_date", monthEnd),
  ]);

  const errs = [workdayRes.error, trRes.error, travelRes.error, flagRes.error].filter(Boolean);
  if (errs.length) {
    console.error("[get-staff-month-status] db errors", errs);
    return bad(500, "Database error", { details: errs.map((e) => e?.message) });
  }

  const now = new Date();

  // Bucket per day
  type Bucket = {
    workdayMinutes: number;
    allocatedProjectMinutes: number;
    travelMinutes: number;
    isWorkdayOpen: boolean;
    reviewStatus: string | null;
    approved: boolean;
    hasFlags: boolean;
    hasUnresolvedFlag: boolean;
    hasWorkday: boolean;
  };
  const buckets = new Map<string, Bucket>();
  const ensure = (date: string): Bucket => {
    let b = buckets.get(date);
    if (!b) {
      b = {
        workdayMinutes: 0,
        allocatedProjectMinutes: 0,
        travelMinutes: 0,
        isWorkdayOpen: false,
        reviewStatus: null,
        approved: false,
        hasFlags: false,
        hasUnresolvedFlag: false,
        hasWorkday: false,
      };
      buckets.set(date, b);
    }
    return b;
  };

  for (const w of workdayRes.data ?? []) {
    const date = (w.started_at as string).slice(0, 10);
    const b = ensure(date);
    b.hasWorkday = true;
    b.workdayMinutes += diffMin(w.started_at as string, w.ended_at as string | null, now);
    if (!w.ended_at) b.isWorkdayOpen = true;
    if (w.review_status && !b.reviewStatus) b.reviewStatus = w.review_status as string;
    if (w.approved_at) b.approved = true;
  }
  for (const r of trRes.data ?? []) {
    const b = ensure(r.report_date as string);
    b.allocatedProjectMinutes += hToMin(r.hours_worked as number | null);
  }
  for (const t of travelRes.data ?? []) {
    const date = ((t.report_date as string | null) ?? (t.start_time as string).slice(0, 10));
    const b = ensure(date);
    b.travelMinutes += hToMin(t.hours_worked as number | null) || diffMin(t.start_time as string, t.end_time as string | null, now);
  }
  for (const f of flagRes.data ?? []) {
    const b = ensure(f.flag_date as string);
    b.hasFlags = true;
    if (!f.resolved) b.hasUnresolvedFlag = true;
  }

  // Build per-day output for entire month
  const days = eachDay(month).map((date) => {
    const b = buckets.get(date);
    const wm = b?.workdayMinutes ?? 0;
    const allocated = b?.allocatedProjectMinutes ?? 0;
    const travel = b?.travelMinutes ?? 0;
    const unallocated = Math.max(0, wm - allocated - travel);

    let status: 'open' | 'approved' | 'review_required' | 'closed' | 'missing' | 'off' | 'locked';
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun
    const isWeekend = dow === 0 || dow === 6;

    if (b?.isWorkdayOpen) status = 'open';
    else if (b?.approved) status = 'approved';
    else if (b?.reviewStatus === 'review_required' || b?.hasUnresolvedFlag) status = 'review_required';
    else if (b?.hasWorkday) status = 'closed';
    else if (isWeekend) status = 'off';
    else if (date > new Date().toISOString().slice(0, 10)) status = 'off';
    else status = 'missing';

    return {
      date,
      workdayMinutes: wm,
      allocatedProjectMinutes: allocated,
      travelMinutes: travel,
      unallocatedMinutes: unallocated,
      isWorkdayOpen: b?.isWorkdayOpen ?? false,
      hasFlags: b?.hasFlags ?? false,
      reviewStatus: b?.reviewStatus ?? null,
      approved: b?.approved ?? false,
      status,
    };
  });

  // Totals
  const totals = days.reduce(
    (acc, d) => {
      acc.workdayMinutes += d.workdayMinutes;
      acc.allocatedProjectMinutes += d.allocatedProjectMinutes;
      acc.travelMinutes += d.travelMinutes;
      acc.unallocatedMinutes += d.unallocatedMinutes;
      if (d.approved) acc.approvedMinutes += d.workdayMinutes;
      else if (d.status === 'review_required') acc.pendingReviewMinutes += d.workdayMinutes;
      else if (d.status === 'closed') acc.pendingReviewMinutes += d.workdayMinutes;
      if (d.hasFlags) acc.daysWithFlags += 1;
      return acc;
    },
    {
      workdayMinutes: 0,
      allocatedProjectMinutes: 0,
      travelMinutes: 0,
      unallocatedMinutes: 0,
      approvedMinutes: 0,
      pendingReviewMinutes: 0,
      daysWithFlags: 0,
    },
  );

  const payload = {
    month,
    staffId,
    days,
    totals,
    lastUpdatedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
