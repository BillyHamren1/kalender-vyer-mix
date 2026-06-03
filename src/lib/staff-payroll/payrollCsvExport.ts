/**
 * payrollCsvExport — bygger en CSV-export från StaffTimeMatrix.
 * En rad per block per dag per anställd. Ekonomi-vänligt format.
 */
import type { StaffTimeMatrix, StaffTimeMatrixRow, StaffTimeMatrixCell } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";

const STATUS_SV: Record<string, string> = {
  gps_proposal: "Förslag",
  submitted_waiting_approval: "Väntar attest",
  correction_requested: "Komplettera",
  approved: "Attesterad",
  empty: "—",
};

function esc(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes(";")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtIsoTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function buildPayrollCsv(matrix: StaffTimeMatrix): string {
  const header = [
    "datum",
    "anställd",
    "typ",
    "beskrivning",
    "start",
    "slut",
    "minuter",
    "timmar",
    "normal_min",
    "övertid_min",
    "resa_min",
    "status",
  ];
  const lines: string[] = [header.join(",")];

  for (const row of matrix.rows) {
    for (const cell of row.days) {
      if (!cell.rows || cell.rows.length === 0) {
        if (cell.totalMinutes > 0 || cell.startTime || cell.endTime) {
          lines.push(
            [
              cell.date,
              row.staffName,
              "dag",
              "",
              cell.startTime ?? "",
              cell.endTime ?? "",
              cell.totalMinutes,
              (cell.totalMinutes / 60).toFixed(2),
              cell.normalMinutes,
              cell.overtimeMinutes,
              cell.travelMinutes,
              STATUS_SV[cell.status] ?? cell.status,
            ].map(esc).join(","),
          );
        }
        continue;
      }
      for (const r of cell.rows) {
        lines.push(
          [
            cell.date,
            row.staffName,
            r.kind,
            r.label,
            fmtIsoTime(r.startIso),
            fmtIsoTime(r.endIso),
            r.minutes,
            (r.minutes / 60).toFixed(2),
            "",
            "",
            "",
            STATUS_SV[cell.status] ?? cell.status,
          ].map(esc).join(","),
        );
      }
    }
  }
  return lines.join("\n");
}

export function downloadPayrollCsv(matrix: StaffTimeMatrix, filename: string): void {
  const csv = buildPayrollCsv(matrix);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function countWeekStats(row: StaffTimeMatrixRow): {
  normal: number;
  overtime: number;
  travel: number;
  total: number;
  reportedDays: number;
} {
  let normal = 0, overtime = 0, travel = 0, total = 0, reportedDays = 0;
  for (const d of row.days) {
    normal += d.normalMinutes || 0;
    overtime += d.overtimeMinutes || 0;
    travel += d.travelMinutes || 0;
    total += d.totalMinutes || 0;
    if (d.status !== "empty") reportedDays++;
  }
  return { normal, overtime, travel, total, reportedDays };
}

export function rowWeekStatus(row: StaffTimeMatrixRow): {
  label: string;
  tone: "neutral" | "pending" | "approved" | "warn";
} {
  const reported = row.days.filter((d) => d.status !== "empty");
  if (reported.length === 0) return { label: "Inga rapporter", tone: "neutral" };
  const correction = reported.some((d) => d.status === "correction_requested");
  if (correction) return { label: "Komplettering begärd", tone: "warn" };
  const pending = row.pendingSubmissionIds.length;
  if (pending > 0) return { label: `Väntar attest (${pending})`, tone: "pending" };
  const allApproved = reported.every((d) => d.status === "approved");
  if (allApproved) return { label: "Attesterad", tone: "approved" };
  return { label: "Delvis attesterad", tone: "pending" };
}

export type { StaffTimeMatrixCell };
