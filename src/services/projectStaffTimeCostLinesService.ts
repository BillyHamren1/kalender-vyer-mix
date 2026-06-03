/**
 * projectStaffTimeCostLinesService.ts
 * ===================================
 *
 * Läser FAKTISK registrerad projektkostnad från `project_staff_time_cost_lines`.
 * Detta är projektens KANONISKA read-model/projection för rapporterad tid och
 * kostnad. Projektvyer får INTE läsa time_reports / location_time_entries /
 * travel_time_logs / staff_day_report_cache / gps_pings direkt för att bygga
 * projektets timmar.
 *
 * Tabellen byggs när personal skickar in / korrigerar dagrapport
 * (submit-staff-day-v3, submit-mobile-gps-day-v2) OCH när admin ändrar
 * status (update-staff-day-submission-status):
 *   - countable status  → rebuild (submitted, edited, ai_flagged,
 *                          needs_user_attention, needs_control,
 *                          approved, payroll_approved)
 *   - excluded status   → delete (draft, correction_requested,
 *                          rejected, deleted, cancelled)
 *
 * VIKTIGT:
 *   - Projektets total inkluderar BÅDE approved och oattesterad (countable)
 *     tid — admin-attest avgör inte om tiden syns, bara dess status.
 *   - staff_day_report_cache = Time Engine/GPS-förslag. Aldrig sanning.
 *   - Frontend får ALDRIG köra backfill när en sida öppnas — projection/
 *     backfill körs server-side vid submit/correction/status update eller
 *     manuellt via admin/dev-verktyg.
 */
import { supabase } from "@/integrations/supabase/client";

export type SubmissionApprovalState = "approved" | "unapproved" | "excluded";

const APPROVED_STATUSES = new Set<string>(["approved", "payroll_approved"]);
const UNAPPROVED_STATUSES = new Set<string>([
  "submitted",
  "edited",
  "ai_flagged",
  "needs_user_attention",
  "needs_control",
]);

export function classifySubmissionStatus(status: string | null | undefined): SubmissionApprovalState {
  const s = String(status ?? "").toLowerCase();
  if (APPROVED_STATUSES.has(s)) return "approved";
  if (UNAPPROVED_STATUSES.has(s)) return "unapproved";
  return "excluded";
}

export interface ApprovedCostTarget {
  booking_id?: string | null;
  project_id?: string | null;
  large_project_id?: string | null;
}

export interface ApprovedCostLineRow {
  id: string;
  organization_id: string;
  staff_day_submission_id: string;
  staff_id: string;
  staff_name: string | null;
  date: string;
  booking_id: string | null;
  project_id: string | null;
  large_project_id: string | null;
  assignment_id: string | null;
  location_id: string | null;
  source_block_id: string | null;
  source_block_kind: string | null;
  source_label: string | null;
  start_at: string;
  end_at: string;
  minutes: number;
  hours: number;
  hourly_rate: number;
  cost: number;
  rate_source: string | null;
  submission_status: string;
  approvalState: SubmissionApprovalState;
}

export interface ApprovedCostByStaff {
  staff_id: string;
  staff_name: string | null;
  totalMinutes: number;
  totalHours: number;
  totalCost: number;
  approvedMinutes: number;
  approvedHours: number;
  approvedCost: number;
  unapprovedMinutes: number;
  unapprovedHours: number;
  unapprovedCost: number;
}

export interface ApprovedCostByDate {
  date: string;
  totalMinutes: number;
  totalHours: number;
  totalCost: number;
  approvedMinutes: number;
  approvedHours: number;
  approvedCost: number;
  unapprovedMinutes: number;
  unapprovedHours: number;
  unapprovedCost: number;
  staffCount: number;
  hasUnapproved: boolean;
  hasApproved: boolean;
}

export interface ApprovedProjectStaffTimeCostSummary {
  /** @deprecated Använd `totalHours`. */
  approvedStaffHours: number;
  /** @deprecated Använd `totalCost`. */
  approvedStaffCost: number;

  totalHours: number;
  totalCost: number;
  approvedHours: number;
  approvedCost: number;
  unapprovedHours: number;
  unapprovedCost: number;

  rows: ApprovedCostLineRow[];
  byStaff: ApprovedCostByStaff[];
  byDate: ApprovedCostByDate[];
  source: "project_staff_time_cost_lines";
}

const EMPTY: ApprovedProjectStaffTimeCostSummary = {
  approvedStaffHours: 0,
  approvedStaffCost: 0,
  totalHours: 0,
  totalCost: 0,
  approvedHours: 0,
  approvedCost: 0,
  unapprovedHours: 0,
  unapprovedCost: 0,
  rows: [],
  byStaff: [],
  byDate: [],
  source: "project_staff_time_cost_lines",
};

const COST_LINE_COLS =
  "id, organization_id, staff_day_submission_id, staff_id, staff_name, date, booking_id, project_id, large_project_id, assignment_id, location_id, source_block_id, source_block_kind, source_label, start_at, end_at, minutes, hours, hourly_rate, cost, rate_source, submission_status";

function devLog(label: string, payload: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info(`[projectStaffTimeCostLines] ${label}`, payload);
  }
}

function devWarn(label: string, payload: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[projectStaffTimeCostLines] ${label}`, payload);
  }
}

function summarizeCostLineRows(
  raw: ReadonlyArray<Omit<ApprovedCostLineRow, "approvalState">>,
): ApprovedProjectStaffTimeCostSummary {
  const seen = new Set<string>();
  const rows: ApprovedCostLineRow[] = [];
  for (const r of raw) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const approvalState = classifySubmissionStatus(r.submission_status);
    if (approvalState === "excluded") continue;
    rows.push({
      ...r,
      minutes: Number(r.minutes) || 0,
      hours: Number(r.hours) || 0,
      hourly_rate: Number(r.hourly_rate) || 0,
      cost: Number(r.cost) || 0,
      approvalState,
    });
  }

  let totalMinutes = 0;
  let totalCost = 0;
  let approvedMinutes = 0;
  let approvedCost = 0;
  let unapprovedMinutes = 0;
  let unapprovedCost = 0;

  const byStaffMap = new Map<string, ApprovedCostByStaff>();
  type DateAgg = {
    totalMinutes: number;
    totalCost: number;
    approvedMinutes: number;
    approvedCost: number;
    unapprovedMinutes: number;
    unapprovedCost: number;
    staff: Set<string>;
  };
  const byDateMap = new Map<string, DateAgg>();

  for (const r of rows) {
    totalMinutes += r.minutes;
    totalCost += r.cost;
    if (r.approvalState === "approved") {
      approvedMinutes += r.minutes;
      approvedCost += r.cost;
    } else {
      unapprovedMinutes += r.minutes;
      unapprovedCost += r.cost;
    }

    const s =
      byStaffMap.get(r.staff_id) ?? {
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        totalMinutes: 0,
        totalHours: 0,
        totalCost: 0,
        approvedMinutes: 0,
        approvedHours: 0,
        approvedCost: 0,
        unapprovedMinutes: 0,
        unapprovedHours: 0,
        unapprovedCost: 0,
      };
    s.totalMinutes += r.minutes;
    s.totalCost += r.cost;
    if (r.approvalState === "approved") {
      s.approvedMinutes += r.minutes;
      s.approvedCost += r.cost;
    } else {
      s.unapprovedMinutes += r.minutes;
      s.unapprovedCost += r.cost;
    }
    if (!s.staff_name && r.staff_name) s.staff_name = r.staff_name;
    byStaffMap.set(r.staff_id, s);

    const d =
      byDateMap.get(r.date) ?? ({
        totalMinutes: 0,
        totalCost: 0,
        approvedMinutes: 0,
        approvedCost: 0,
        unapprovedMinutes: 0,
        unapprovedCost: 0,
        staff: new Set<string>(),
      } as DateAgg);
    d.totalMinutes += r.minutes;
    d.totalCost += r.cost;
    if (r.approvalState === "approved") {
      d.approvedMinutes += r.minutes;
      d.approvedCost += r.cost;
    } else {
      d.unapprovedMinutes += r.minutes;
      d.unapprovedCost += r.cost;
    }
    d.staff.add(r.staff_id);
    byDateMap.set(r.date, d);
  }

  const minToHours = (m: number) => +(m / 60).toFixed(2);

  const byStaff: ApprovedCostByStaff[] = Array.from(byStaffMap.values())
    .map((s) => ({
      ...s,
      totalHours: minToHours(s.totalMinutes),
      approvedHours: minToHours(s.approvedMinutes),
      unapprovedHours: minToHours(s.unapprovedMinutes),
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const byDate: ApprovedCostByDate[] = Array.from(byDateMap.entries())
    .map(([date, v]) => ({
      date,
      totalMinutes: v.totalMinutes,
      totalHours: minToHours(v.totalMinutes),
      totalCost: v.totalCost,
      approvedMinutes: v.approvedMinutes,
      approvedHours: minToHours(v.approvedMinutes),
      approvedCost: v.approvedCost,
      unapprovedMinutes: v.unapprovedMinutes,
      unapprovedHours: minToHours(v.unapprovedMinutes),
      unapprovedCost: v.unapprovedCost,
      staffCount: v.staff.size,
      hasUnapproved: v.unapprovedMinutes > 0,
      hasApproved: v.approvedMinutes > 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalHours = minToHours(totalMinutes);
  const approvedHours = minToHours(approvedMinutes);
  const unapprovedHours = minToHours(unapprovedMinutes);

  return {
    approvedStaffHours: totalHours,
    approvedStaffCost: totalCost,
    totalHours,
    totalCost,
    approvedHours,
    approvedCost,
    unapprovedHours,
    unapprovedCost,
    rows,
    byStaff,
    byDate,
    source: "project_staff_time_cost_lines",
  };
}

/**
 * Hämtar en summary för EN target (booking/project/large_project).
 * Föredra `fetchProjectStaffTimeCostSummaryForTargets` när du har flera ids —
 * den gör en enda batchad query och dedupar.
 */
export async function fetchApprovedProjectStaffTimeCostSummary(
  target: ApprovedCostTarget,
): Promise<ApprovedProjectStaffTimeCostSummary> {
  const hasTarget = !!(target.booking_id || target.project_id || target.large_project_id);
  if (!hasTarget) return EMPTY;

  const orParts: string[] = [];
  if (target.booking_id) orParts.push(`booking_id.eq.${target.booking_id}`);
  if (target.project_id) orParts.push(`project_id.eq.${target.project_id}`);
  if (target.large_project_id) orParts.push(`large_project_id.eq.${target.large_project_id}`);

  const t0 = performance.now();
  const { data, error } = await supabase
    .from("project_staff_time_cost_lines")
    .select(COST_LINE_COLS)
    .or(orParts.join(","))
    .limit(5000);

  if (error) {
    console.error("[projectStaffTimeCostLinesService] fetch failed:", error);
    return EMPTY;
  }

  const summary = summarizeCostLineRows(
    (data ?? []) as Omit<ApprovedCostLineRow, "approvalState">[],
  );
  devLog("single-target fetch", {
    target,
    rowCount: summary.rows.length,
    elapsedMs: Math.round(performance.now() - t0),
  });
  return summary;
}

export interface ProjectStaffTimeCostTargets {
  large_project_id?: string | null;
  project_id?: string | null;
  booking_ids?: string[];
}

/**
 * BATCHAD läsning av `project_staff_time_cost_lines` för alla projekttargets
 * i en enda Supabase-query. Dedupar rader på `row.id` så att samma rad inte
 * räknas två gånger om den matchar både large_project_id och booking_id.
 *
 * Använd denna i ALLA projektvyer (booking, project, large project) i stället
 * för att loopa `fetchApprovedProjectStaffTimeCostSummary` per booking.
 */
export async function fetchProjectStaffTimeCostSummaryForTargets(
  targets: ProjectStaffTimeCostTargets,
): Promise<ApprovedProjectStaffTimeCostSummary> {
  const lpId = targets.large_project_id ?? null;
  const projectId = targets.project_id ?? null;
  const bookingIds = (targets.booking_ids ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  if (!lpId && !projectId && bookingIds.length === 0) return EMPTY;

  const orParts: string[] = [];
  if (lpId) orParts.push(`large_project_id.eq.${lpId}`);
  if (projectId) orParts.push(`project_id.eq.${projectId}`);
  if (bookingIds.length > 0) orParts.push(`booking_id.in.(${bookingIds.join(",")})`);

  const t0 = performance.now();
  const { data, error } = await supabase
    .from("project_staff_time_cost_lines")
    .select(COST_LINE_COLS)
    .or(orParts.join(","))
    .limit(10000);
  const elapsedMs = Math.round(performance.now() - t0);

  if (error) {
    console.error("[projectStaffTimeCostLinesService] batched fetch failed:", error);
    return EMPTY;
  }

  const summary = summarizeCostLineRows(
    (data ?? []) as Omit<ApprovedCostLineRow, "approvalState">[],
  );

  devLog("batched fetch", {
    largeProjectId: lpId,
    projectId,
    bookingCount: bookingIds.length,
    rowCount: summary.rows.length,
    elapsedMs,
  });
  if (bookingIds.length > 10) {
    devWarn("batched fetch with > 10 bookingIds", { bookingCount: bookingIds.length });
  }

  return summary;
}
