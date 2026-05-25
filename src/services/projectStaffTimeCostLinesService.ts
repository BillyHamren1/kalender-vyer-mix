/**
 * projectStaffTimeCostLinesService.ts
 * ===================================
 *
 * Läser FAKTISK godkänd projektkostnad från `project_staff_time_cost_lines`.
 *
 * Den här tabellen byggs av admin-attest-flödet:
 *   staff_day_submissions.status -> approved | payroll_approved
 *     => rebuildProjectStaffTimeCostLinesForSubmission()
 *
 * REGLER:
 *   - staff_day_report_cache = Time Engine/GPS-förslag (prognos). Aldrig sanning.
 *   - project_staff_time_cost_lines = godkänd faktisk projektkostnad.
 *   - Vi läser ALDRIG time_reports / workdays / location_time_entries /
 *     travel_time_logs / day_attestations som timkälla i projektets ekonomi.
 */
import { supabase } from "@/integrations/supabase/client";

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
}

export interface ApprovedCostByStaff {
  staff_id: string;
  staff_name: string | null;
  totalMinutes: number;
  totalHours: number;
  totalCost: number;
}

export interface ApprovedCostByDate {
  date: string;
  totalMinutes: number;
  totalHours: number;
  totalCost: number;
  staffCount: number;
}

export interface ApprovedProjectStaffTimeCostSummary {
  approvedStaffHours: number;
  approvedStaffCost: number;
  rows: ApprovedCostLineRow[];
  byStaff: ApprovedCostByStaff[];
  byDate: ApprovedCostByDate[];
  source: "project_staff_time_cost_lines";
}

const EMPTY: ApprovedProjectStaffTimeCostSummary = {
  approvedStaffHours: 0,
  approvedStaffCost: 0,
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

  // Bygg ett OR-filter mot project_staff_time_cost_lines.
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

  // Dedup på row.id (samma rad kan matcha både booking_id och large_project_id).
  const seen = new Set<string>();
  const rows: ApprovedCostLineRow[] = [];
  for (const r of (data ?? []) as ApprovedCostLineRow[]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    rows.push({
      ...r,
      minutes: Number(r.minutes) || 0,
      hours: Number(r.hours) || 0,
      hourly_rate: Number(r.hourly_rate) || 0,
      cost: Number(r.cost) || 0,
    });
  }

  let approvedMinutes = 0;
  let approvedCost = 0;
  const byStaffMap = new Map<string, ApprovedCostByStaff>();
  const byDateMap = new Map<string, { totalMinutes: number; totalCost: number; staff: Set<string> }>();

  for (const r of rows) {
    approvedMinutes += r.minutes;
    approvedCost += r.cost;

    const s = byStaffMap.get(r.staff_id) ?? {
      staff_id: r.staff_id,
      staff_name: r.staff_name,
      totalMinutes: 0,
      totalHours: 0,
      totalCost: 0,
    };
    s.totalMinutes += r.minutes;
    s.totalCost += r.cost;
    if (!s.staff_name && r.staff_name) s.staff_name = r.staff_name;
    byStaffMap.set(r.staff_id, s);

    const d = byDateMap.get(r.date) ?? { totalMinutes: 0, totalCost: 0, staff: new Set<string>() };
    d.totalMinutes += r.minutes;
    d.totalCost += r.cost;
    d.staff.add(r.staff_id);
    byDateMap.set(r.date, d);
  }

  const byStaff: ApprovedCostByStaff[] = Array.from(byStaffMap.values())
    .map((s) => ({ ...s, totalHours: +(s.totalMinutes / 60).toFixed(2) }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const byDate: ApprovedCostByDate[] = Array.from(byDateMap.entries())
    .map(([date, v]) => ({
      date,
      totalMinutes: v.totalMinutes,
      totalHours: +(v.totalMinutes / 60).toFixed(2),
      totalCost: v.totalCost,
      staffCount: v.staff.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    approvedStaffHours: +(approvedMinutes / 60).toFixed(2),
    approvedStaffCost: approvedCost,
    rows,
    byStaff,
    byDate,
    source: "project_staff_time_cost_lines",
  };
}
