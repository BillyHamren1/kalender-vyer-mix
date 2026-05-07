// Edge Function: get-staff-time-report-period
// Summarizes the SAME day-engine snapshots used by get-staff-day-status.
// Returns period totals + per-day summaries + blockers + status.
// Never re-aggregates raw tables on its own.

import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import { fetchRangeRows } from "../_shared/staff-range-fetch.ts";
import {
  buildDayRangeSnapshots,
  eachDayInRange,
  summarizeSnapshots,
  toDaySummary,
  type DaySummary,
} from "../_shared/day-snapshot-range.ts";

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

interface PeriodBlocker {
  date: string;
  type: "open_workday" | "needs_attest" | "needs_action";
  message: string;
}

function buildBlockers(days: DaySummary[]): PeriodBlocker[] {
  const out: PeriodBlocker[] = [];
  for (const d of days) {
    if (d.isWorkdayOpen) {
      out.push({ date: d.date, type: "open_workday", message: "Arbetsdag pågår fortfarande" });
    }
    if (d.actionsCount > 0) {
      out.push({ date: d.date, type: "needs_action", message: "Dagen behöver åtgärd" });
    }
    if (!d.approved && !d.attested && d.grossWorkdayMinutes > 0 && !d.isWorkdayOpen) {
      out.push({ date: d.date, type: "needs_attest", message: "Saknar attest" });
    }
  }
  return out;
}

type PeriodStatus = "empty" | "draft" | "submitted" | "approved";

function derivePeriodStatus(days: DaySummary[], blockers: PeriodBlocker[]): PeriodStatus {
  const hasAny = days.some((d) => d.grossWorkdayMinutes > 0 || d.isWorkdayOpen);
  if (!hasAny) return "empty";
  if (days.every((d) => d.grossWorkdayMinutes === 0 || d.approved)) return "approved";
  if (blockers.length > 0) return "draft";
  return "submitted";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: { staffId?: string; kind?: "week" | "month"; startDate?: string; endDate?: string };
  try { body = await req.json(); } catch { return bad(400, "Invalid JSON body"); }

  const staffId = (body.staffId ?? "").trim();
  if (!staffId) return bad(400, "staffId is required");
  const kind: "week" | "month" = body.kind === "month" ? "month" : "week";
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

  const fetched = await fetchRangeRows(admin, orgId, staffId, startDate, endDate);
  if (!fetched.ok) {
    console.error("[get-staff-time-report-period] db errors", fetched.error);
    return bad(500, "Database error", { details: fetched.error });
  }

  const dates = eachDayInRange(startDate, endDate);
  const snapshots = buildDayRangeSnapshots(staffId, dates, fetched.rows);
  const totals = summarizeSnapshots(snapshots);
  const days = snapshots.map(toDaySummary);
  const blockers = buildBlockers(days);
  const status = derivePeriodStatus(days, blockers);

  return new Response(
    JSON.stringify({
      period: { kind, startDate, endDate },
      staffId,
      totals,
      days,
      blockers,
      status,
      lastUpdatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
