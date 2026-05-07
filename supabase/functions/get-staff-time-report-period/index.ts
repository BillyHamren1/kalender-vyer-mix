// Edge Function: get-staff-time-report-period
// Returns the staff member's time-report summary for a period (week/month).
// Auth: JWT required. Self OR admin/manager-ish roles. Strict org-isolation.
// Backend owns the truth — UI must not re-aggregate raw tables.

import { buildPeriodPayload, type PeriodKind } from "../_shared/staff-time-report-period.ts";
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

  let body: { staffId?: string; kind?: PeriodKind; startDate?: string; endDate?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }
  const staffId = (body.staffId ?? "").trim();
  if (!staffId) return bad(400, "staffId is required");
  const kind: PeriodKind = body.kind === "month" ? "month" : "week";
  const startDate = (body.startDate ?? "").trim();
  const endDate = (body.endDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return bad(400, "startDate/endDate must be YYYY-MM-DD");
  }
  if (startDate > endDate) return bad(400, "startDate must be <= endDate");

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);
  const orgId = access.orgId;
  const admin = authResult.auth.admin;

  const padStart = new Date(new Date(`${startDate}T00:00:00Z`).getTime() - 24 * 3600 * 1000).toISOString();
  const padEnd = new Date(new Date(`${endDate}T23:59:59Z`).getTime() + 24 * 3600 * 1000).toISOString();

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
      .select("report_date, hours_worked, overtime_hours")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("report_date", startDate)
      .lte("report_date", endDate),
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
      .gte("flag_date", startDate)
      .lte("flag_date", endDate),
  ]);

  const errs = [workdayRes.error, trRes.error, travelRes.error, flagRes.error].filter(Boolean);
  if (errs.length) {
    console.error("[get-staff-time-report-period] db errors", errs);
    return bad(500, "Database error", { details: errs.map((e) => e?.message) });
  }

  const payload = buildPeriodPayload({
    kind,
    startDate,
    endDate,
    staffId,
    todayYmd: todayInStockholm(),
    workdays: (workdayRes.data ?? []) as never,
    timeReports: (trRes.data ?? []) as never,
    travelLogs: (travelRes.data ?? []) as never,
    flags: (flagRes.data ?? []) as never,
  });

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
