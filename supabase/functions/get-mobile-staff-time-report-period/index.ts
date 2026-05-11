// get-mobile-staff-time-report-period
// =====================================
// Period summary (week/month) for mobile `/m/report` driven by Time Engine
// cache only. Mirrors the day source used by `get-mobile-staff-day-report`
// so admin (bild 2) and mobile show the SAME numbers.
//
// Source of truth (per day):
//   1. staff_day_report_cache       (latest engine_version per date)
//   2. staff_day_submissions        (attested / approved status)
//   3. workdays                     (only `isWorkdayOpen` flag)
//
// MUST NOT read time_reports / location_time_entries / travel_time_logs.

import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import {
  buildMobileSnapshot,
  type CacheRow,
  type SubmissionRow,
} from "../_shared/mobile/buildMobileSnapshot.ts";
import type { MobileDayReport, MobileSegment } from "../_shared/mobile/types.ts";

interface RequestBody {
  staffId?: string;
  kind?: "week" | "month";
  startDate?: string;
  endDate?: string;
}

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  for (let t = s; t <= e; t += 24 * 3600 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function isoWeekday(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

interface DaySummaryOut {
  date: string;
  weekday: number;
  grossWorkdayMinutes: number;
  breakMinutes: number;
  payableMinutes: number;
  projectMinutes: number;
  warehouseMinutes: number;
  transportMinutes: number;
  otherPlaceMinutes: number;
  isWorkdayOpen: boolean;
  approved: boolean;
  attested: boolean;
  actionsCount: number;
  status: "empty" | "open" | "needs_attest" | "needs_action" | "attested" | "approved";
}

function categorize(segments: MobileSegment[]) {
  let project = 0;
  let warehouse = 0;
  let transport = 0;
  let other = 0;
  for (const s of segments) {
    const m = s.durationMinutes ?? 0;
    switch (s.kind) {
      case "warehouse":
        warehouse += m; break;
      case "travel":
        transport += m; break;
      case "project":
      case "booking":
      case "large_project":
      case "location":
        project += m; break;
      case "needs_review":
      case "unknown":
        other += m; break;
      // break excluded — handled separately
    }
  }
  return { project, warehouse, transport, other };
}

function dayFromReport(
  date: string,
  report: MobileDayReport,
): DaySummaryOut {
  const sum = report.summary;
  const cat = categorize(report.segments);
  // Brutto = arbete + transport (samma som mobileReportToDaySnapshot).
  const gross = sum.workMinutes + sum.travelMinutes;
  const isOpen = !!report.workday?.isOpen;
  const sub = report.submission;
  const approved = sub?.status === "approved";
  const attested = !!sub && (sub.status === "submitted" || sub.status === "approved");
  const actionsCount = report.segments.filter((s) => s.kind === "needs_review").length;

  let status: DaySummaryOut["status"];
  if (gross === 0 && !isOpen && !sub) status = "empty";
  else if (isOpen) status = "open";
  else if (approved) status = "approved";
  else if (attested) status = "attested";
  else if (actionsCount > 0) status = "needs_action";
  else status = "needs_attest";

  return {
    date,
    weekday: isoWeekday(date),
    grossWorkdayMinutes: gross,
    breakMinutes: sum.breakMinutes,
    payableMinutes: sum.payableMinutes,
    projectMinutes: cat.project,
    warehouseMinutes: cat.warehouse,
    transportMinutes: cat.transport,
    otherPlaceMinutes: cat.other,
    isWorkdayOpen: isOpen,
    approved,
    attested,
    actionsCount,
    status,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: RequestBody;
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

  const dates = eachDay(startDate, endDate);

  // Fetch all relevant rows in parallel — single round-trip per table.
  const [cacheRes, subRes, wdRes] = await Promise.all([
    admin
      .from("staff_day_report_cache")
      .select(
        "date, engine_version, summary_json, report_candidate_blocks_json, display_blocks_json, diagnostics_json, built_at, stale, error",
      )
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .in("date", dates)
      .order("built_at", { ascending: false }),
    admin
      .from("staff_day_submissions")
      .select(
        "date, status, requested_start_at, requested_end_at, break_minutes, comment, submitted_at, reviewed_at, review_comment",
      )
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .in("date", dates),
    admin
      .from("workdays")
      .select("date, start_time, end_time")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .in("date", dates)
      .order("start_time", { ascending: false }),
  ]);

  if (cacheRes.error) {
    console.error("[mobile-period] cache error", cacheRes.error);
    return bad(500, "cache fetch failed", { details: cacheRes.error.message });
  }

  // Pick latest cache row per date.
  const cacheByDate = new Map<string, CacheRow>();
  for (const row of (cacheRes.data ?? []) as Array<CacheRow & { date: string }>) {
    if (!cacheByDate.has(row.date)) cacheByDate.set(row.date, row);
  }
  const subByDate = new Map<string, SubmissionRow>();
  for (const row of (subRes.data ?? []) as Array<SubmissionRow & { date: string }>) {
    subByDate.set(row.date, row);
  }
  const wdByDate = new Map<string, WorkdayLivenessRow>();
  for (const row of (wdRes.data ?? []) as Array<WorkdayLivenessRow & { date: string }>) {
    if (!wdByDate.has(row.date)) wdByDate.set(row.date, row);
  }

  // Build per-day MobileDayReport, then map to DaySummaryOut.
  const days: DaySummaryOut[] = [];
  for (const date of dates) {
    const report = buildMobileSnapshot({
      date,
      staffId,
      cache: cacheByDate.get(date) ?? null,
      submission: subByDate.get(date) ?? null,
      workday: wdByDate.get(date) ?? null,
    });
    days.push(dayFromReport(date, report));
  }

  // Period totals = sum of day fields.
  const totals = days.reduce(
    (acc, d) => {
      acc.grossWorkdayMinutes += d.grossWorkdayMinutes;
      acc.breakMinutes += d.breakMinutes;
      acc.payableMinutes += d.payableMinutes;
      acc.projectMinutes += d.projectMinutes;
      acc.warehouseMinutes += d.warehouseMinutes;
      acc.transportMinutes += d.transportMinutes;
      acc.otherPlaceMinutes += d.otherPlaceMinutes;
      if (d.grossWorkdayMinutes > 0) acc.daysWithWork += 1;
      if (d.actionsCount > 0) acc.daysWithActions += 1;
      if (d.approved) acc.approvedPayableMinutes += d.payableMinutes;
      else if (d.attested) acc.submittedPayableMinutes += d.payableMinutes;
      else if (d.grossWorkdayMinutes > 0) acc.awaitingUserAttestPayableMinutes += d.payableMinutes;
      return acc;
    },
    {
      grossWorkdayMinutes: 0,
      breakMinutes: 0,
      manualDeductionMinutes: 0,
      payableMinutes: 0,
      approvedPayableMinutes: 0,
      submittedPayableMinutes: 0,
      awaitingUserAttestPayableMinutes: 0,
      awaitingAttestPayableMinutes: 0,
      daysWithActions: 0,
      daysWithWork: 0,
      projectMinutes: 0,
      warehouseMinutes: 0,
      transportMinutes: 0,
      otherPlaceMinutes: 0,
    },
  );
  totals.awaitingAttestPayableMinutes = totals.awaitingUserAttestPayableMinutes;

  // Blockers — same buckets as legacy endpoint so UI banner stays intact.
  const blockers: Array<{ date: string; type: string; message: string }> = [];
  for (const d of days) {
    if (d.isWorkdayOpen) blockers.push({ date: d.date, type: "open_workday", message: "Arbetsdag pågår fortfarande" });
    if (d.actionsCount > 0) blockers.push({ date: d.date, type: "needs_action", message: "Dagen behöver åtgärd" });
    if (!d.approved && !d.attested && d.grossWorkdayMinutes > 0 && !d.isWorkdayOpen) {
      blockers.push({ date: d.date, type: "needs_attest", message: "Saknar attest" });
    }
  }

  let status: "empty" | "draft" | "submitted" | "approved";
  const hasAny = days.some((d) => d.grossWorkdayMinutes > 0 || d.isWorkdayOpen);
  if (!hasAny) status = "empty";
  else if (days.every((d) => d.grossWorkdayMinutes === 0 || d.approved)) status = "approved";
  else if (blockers.length > 0) status = "draft";
  else status = "submitted";

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
