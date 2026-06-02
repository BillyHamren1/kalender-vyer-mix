/**
 * projectStaffTimeCostLinesService.ts
 * ===================================
 *
 * Läser FAKTISK registrerad projektkostnad från `project_staff_time_cost_lines`.
 *
 * Den här tabellen byggs när personal skickar in / korrigerar dagrapport
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
 *   - Vi läser ALDRIG time_reports / workdays / location_time_entries /
 *     travel_time_logs / day_attestations som timkälla i projektets ekonomi.
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
  /**
   * @deprecated Använd `totalHours` — semantiken har ändrats till
   * "alla registrerade countable timmar" (approved + oattesterade).
   * Behålls som alias så bestående konsumenter inte går sönder.
   */
  approvedStaffHours: number;
  /**
   * @deprecated Använd `totalCost` — semantiken har ändrats till
   * "alla registrerade countable kostnader" (approved + oattesterade).
   */
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

export async function fetchApprovedProjectStaffTimeCostSummary(
  target: ApprovedCostTarget,
): Promise<ApprovedProjectStaffTimeCostSummary> {
  const hasTarget = !!(target.booking_id || target.project_id || target.large_project_id);
  if (!hasTarget) return EMPTY;

  const orParts: string[] = [];
  if (target.booking_id) orParts.push(`booking_id.eq.${target.booking_id}`);
  if (target.project_id) orParts.push(`project_id.eq.${target.project_id}`);
  if (target.large_project_id) orParts.push(`large_project_id.eq.${target.large_project_id}`);

  const { data, error } = await supabase
    .from("project_staff_time_cost_lines")
    .select(
      "id, organization_id, staff_day_submission_id, staff_id, staff_name, date, booking_id, project_id, large_project_id, assignment_id, location_id, source_block_id, source_block_kind, source_label, start_at, end_at, minutes, hours, hourly_rate, cost, rate_source, submission_status",
    )
    .or(orParts.join(","))
    .limit(5000);

  if (error) {
    console.error("[projectStaffTimeCostLinesService] fetch failed:", error);
    return EMPTY;
  }

  // Dedup på row.id — samma rad kan matcha både booking_id och large_project_id.
  const seen = new Set<string>();
  const rows: ApprovedCostLineRow[] = [];
  for (const raw of (data ?? []) as Omit<ApprovedCostLineRow, "approvalState">[]) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    const approvalState = classifySubmissionStatus(raw.submission_status);
    // Defensiv guard: exkluderade statusar ska redan vara raderade,
    // men om något skulle ha läckt in räknar vi dem aldrig.
    if (approvalState === "excluded") continue;
    rows.push({
      ...raw,
      minutes: Number(raw.minutes) || 0,
      hours: Number(raw.hours) || 0,
      hourly_rate: Number(raw.hourly_rate) || 0,
      cost: Number(raw.cost) || 0,
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
