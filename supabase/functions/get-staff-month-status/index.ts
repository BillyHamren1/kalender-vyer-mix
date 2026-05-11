// Edge Function: get-staff-month-status
// Summarizes the SAME day-engine snapshots used by get-staff-day-status.
// Never re-aggregates raw tables on its own.

import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import { fetchRangeRows } from "../_shared/staff-range-fetch.ts";
import {
  buildDayRangeSnapshots,
  eachDayOfMonth,
  summarizeSnapshots,
  toDaySummary,
} from "../_shared/day-snapshot-range.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-view-as-staff",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: { staffId?: string; month?: string };
  try { body = await req.json(); } catch { return bad(400, "Invalid JSON body"); }

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

  const dates = eachDayOfMonth(month);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const fetched = await fetchRangeRows(admin, orgId, staffId, startDate, endDate);
  if (!fetched.ok) {
    console.error("[get-staff-month-status] db errors", fetched.error);
    return bad(500, "Database error", { details: fetched.error });
  }

  const snapshots = buildDayRangeSnapshots(staffId, dates, fetched.rows);
  const totals = summarizeSnapshots(snapshots);
  const days = snapshots.map(toDaySummary);

  return new Response(
    JSON.stringify({
      month,
      staffId,
      totals,
      days,
      lastUpdatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
