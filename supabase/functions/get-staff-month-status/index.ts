// Edge Function: get-staff-month-status
// Returns per-day status across a calendar month (YYYY-MM) for a staff member.
// Auth: JWT required. Self OR admin/manager-ish roles. Strict org-isolation.
// Backend owns the truth — UI must not re-aggregate raw tables.

import { buildMonthDays, eachDayOfMonth } from "../_shared/staff-month-status.ts";
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

function thisMonthInStockholm(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function todayInStockholm(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

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

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);
  const orgId = access.orgId;
  const admin = authResult.auth.admin;

  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  const padStart = new Date(new Date(`${monthStart}T00:00:00Z`).getTime() - 24 * 3600 * 1000).toISOString();
  const padEnd = new Date(new Date(`${monthEnd}T23:59:59Z`).getTime() + 24 * 3600 * 1000).toISOString();

  const [workdayRes, trRes, travelRes, flagRes] = await Promise.all([
    admin
      .from("workdays")
      .select("started_at, ended_at, review_status, approved_at")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("started_at", padStart)
      .lte("started_at", padEnd),
    admin
      .from("time_reports")
      .select("report_date, hours_worked")
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

  const todayYmd = todayInStockholm();
  const { days, totals } = buildMonthDays(
    eachDayOfMonth(month),
    {
      workdays: (workdayRes.data ?? []) as never,
      timeReports: (trRes.data ?? []) as never,
      travelLogs: (travelRes.data ?? []) as never,
      flags: (flagRes.data ?? []) as never,
    },
    todayYmd,
  );

  // Derived top-level status for the month
  const hasOpen = days.some((d) => d.isOngoing);
  const allApproved = days.every((d) => d.workdayMinutes === 0 || d.approved);
  const anyReview = days.some((d) => d.status === "review_required");
  const hasAny = days.some((d) => d.workdayMinutes > 0);
  const status = !hasAny
    ? "empty"
    : hasOpen
    ? "open"
    : anyReview
    ? "review_required"
    : allApproved
    ? "approved"
    : "closed";

  return new Response(
    JSON.stringify({
      month,
      staffId,
      days,
      totals,
      status,
      lastUpdatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
