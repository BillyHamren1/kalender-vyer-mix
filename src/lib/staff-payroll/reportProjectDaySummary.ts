/**
 * buildReportProjectDaySummary — bygger högerpanelens "Tid per projekt och dag"
 * från befintlig StaffTimeMatrixRow. Pure helper, ingen DB, inga queries.
 */
import type { StaffTimeMatrixRow } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { resolveTravelAllocation } from "./travelAllocation";

export interface ProjectDaySummaryItem {
  key: string;
  label: string;
  /** Arbetstid (kind=work) i minuter. */
  workMinutes: number;
  /** Restid allokerad till projektet i minuter. */
  travelMinutes: number;
  /** workMinutes + travelMinutes. */
  totalMinutes: number;
  unlinked: boolean;
}

export interface ProjectDaySummaryDay {
  date: string;
  projects: ProjectDaySummaryItem[];
  /** Summor från cellen (matchar dagens "Total" i header). */
  totalMinutes: number;
  workMinutes: number;
  travelMinutes: number;
}

const UNLINKED_KEY = "__unlinked_travel__";
const UNLINKED_LABEL = "Ej kopplad restid";

export function buildReportProjectDaySummary(row: StaffTimeMatrixRow): ProjectDaySummaryDay[] {
  const out: ProjectDaySummaryDay[] = [];
  for (const cell of row.days) {
    const map = new Map<string, ProjectDaySummaryItem>();

    const upsert = (key: string, label: string, opts: { work?: number; travel?: number; unlinked?: boolean }) => {
      const existing = map.get(key);
      if (existing) {
        existing.workMinutes += opts.work ?? 0;
        existing.travelMinutes += opts.travel ?? 0;
        existing.totalMinutes = existing.workMinutes + existing.travelMinutes;
      } else {
        const work = opts.work ?? 0;
        const travel = opts.travel ?? 0;
        map.set(key, {
          key,
          label,
          workMinutes: work,
          travelMinutes: travel,
          totalMinutes: work + travel,
          unlinked: opts.unlinked ?? false,
        });
      }
    };

    for (const r of cell.rows ?? []) {
      if (r.kind === "work") {
        const key = r.label || "work";
        upsert(key, r.label || "Arbete", { work: r.minutes });
      } else if (r.kind === "travel") {
        const alloc = resolveTravelAllocation(cell, r);
        if (alloc.kind === "linked") {
          upsert(alloc.projectKey, alloc.label, { travel: r.minutes });
        } else {
          upsert(UNLINKED_KEY, UNLINKED_LABEL, { travel: r.minutes, unlinked: true });
        }
      }
      // private / unknown_place / gps_gap räknas inte in
    }

    const projects = [...map.values()].sort((a, b) => {
      if (a.unlinked !== b.unlinked) return a.unlinked ? 1 : -1;
      return b.totalMinutes - a.totalMinutes;
    });

    out.push({
      date: cell.date,
      projects,
      totalMinutes: cell.totalMinutes || 0,
      workMinutes: cell.workMinutes || 0,
      travelMinutes: cell.travelMinutes || 0,
    });
  }
  return out;
}
