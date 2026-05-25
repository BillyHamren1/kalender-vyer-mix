/**
 * payrollMonthExportService — PDF + Excel-export för månadsrapport lön.
 *
 * Använder ENDAST data som redan laddats via usePayrollMonthReport.
 * Gör inga egna queries.
 *
 * Beroenden:
 *  - jspdf + jspdf-autotable (PDF)
 *  - xlsx (Excel)
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

import {
  formatMinutes,
  type PayrollMonthReportData,
  type PayrollMonthGroup,
  type PayrollMonthRow,
} from "@/hooks/staff/usePayrollMonthReport";

export interface PayrollExportOptions {
  /** Visningsnamn för organisationen i headern (valfritt). */
  organizationName?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function monthLabel(month: string): string {
  // month = "YYYY-MM"
  try {
    const d = new Date(`${month}-01T00:00:00`);
    return format(d, "LLLL yyyy", { locale: sv });
  } catch {
    return month;
  }
}

function fileBase(month: string): string {
  return `eventflow-loneunderlag-${month}`;
}

function rowStart(r: PayrollMonthRow): string {
  if (r.requested_start_at) return r.requested_start_at.slice(11, 16);
  if (r.start_time) return r.start_time.slice(0, 5);
  return "—";
}
function rowEnd(r: PayrollMonthRow): string {
  if (r.requested_end_at) return r.requested_end_at.slice(11, 16);
  if (r.end_time) return r.end_time.slice(0, 5);
  return "—";
}
function rowStatusLabel(r: PayrollMonthRow): string {
  return r.status === "payroll_approved" ? "Klar för lön" : "Godkänd";
}
function groupStatusLabel(g: PayrollMonthGroup): string {
  if (g.days_count === 0) return "Ingen godkänd tid";
  if (g.approved_days_count === 0 && g.payroll_approved_days_count > 0)
    return "Klar för lön";
  if (g.payroll_approved_days_count > 0) return "Delvis klar för lön";
  return "Godkänd";
}
function periodLabel(g: PayrollMonthGroup): string {
  if (!g.first_date) return "—";
  if (g.first_date === g.last_date) return g.first_date;
  return `${g.first_date} – ${g.last_date}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────
export function exportPayrollMonthPdf(
  report: PayrollMonthReportData,
  opts: PayrollExportOptions = {},
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 32;
  const label = monthLabel(report.month);
  const today = format(new Date(), "yyyy-MM-dd HH:mm");

  // 1) Titel
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Löneunderlag – ${label}`, marginX, 48);

  // 2) Metadata
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const metaLines = [
    `Organisation: ${opts.organizationName ?? "—"}`,
    `Period: ${report.monthStart} – ${report.monthEnd}`,
    `Exportdatum: ${today}`,
    `Endast godkänd tid`,
    `Källa: staff_day_submissions`,
  ];
  metaLines.forEach((l, i) => doc.text(l, marginX, 66 + i * 11));

  // 3) Summary
  const summaryY = 66 + metaLines.length * 11 + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Sammanfattning", marginX, summaryY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const sum = [
    `Total arbetstid: ${formatMinutes(report.totals.totalMinutes)}`,
    `Total rast: ${formatMinutes(report.totals.totalBreakMinutes)}`,
    `Antal personal: ${report.totals.staffCount}`,
    `Antal godkända dagar: ${report.totals.approvedDaysCount}`,
  ];
  sum.forEach((l, i) => doc.text(l, marginX, summaryY + 14 + i * 11));

  // 4) Tabell per personal
  const tableY = summaryY + 14 + sum.length * 11 + 6;
  autoTable(doc, {
    startY: tableY,
    head: [["Personal", "Godkända dagar", "Period", "Arbetstid", "Rast", "Status"]],
    body: report.groups.map((g) => [
      g.staff_name,
      g.days_count,
      periodLabel(g),
      formatMinutes(g.total_minutes),
      formatMinutes(g.total_break_minutes),
      groupStatusLabel(g),
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [124, 90, 200], textColor: 255 },
    columnStyles: {
      3: { font: "courier", halign: "right" },
      4: { font: "courier", halign: "right" },
    },
    margin: { left: marginX, right: marginX },
  });

  // 5) Detaljsidor per personal
  for (const g of report.groups) {
    if (g.rows.length === 0) continue;
    doc.addPage();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(g.staff_name, marginX, 48);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Period: ${periodLabel(g)}    Dagar: ${g.days_count}    ` +
        `Arbetstid: ${formatMinutes(g.total_minutes)}    ` +
        `Rast: ${formatMinutes(g.total_break_minutes)}`,
      marginX,
      64,
    );

    autoTable(doc, {
      startY: 80,
      head: [["Datum", "Start", "Slut", "Rast", "Total", "Status", "Kommentar"]],
      body: g.rows.map((r) => [
        r.date,
        rowStart(r),
        rowEnd(r),
        formatMinutes(r.break_minutes),
        formatMinutes(r.total_minutes),
        rowStatusLabel(r),
        [r.comment, r.review_comment].filter(Boolean).join(" | ") || "—",
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [124, 90, 200], textColor: 255 },
      columnStyles: {
        1: { font: "courier", halign: "right" },
        2: { font: "courier", halign: "right" },
        3: { font: "courier", halign: "right" },
        4: { font: "courier", halign: "right" },
      },
      margin: { left: marginX, right: marginX },
    });
  }

  // 6) Footer med sidnummer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Sida ${i} / ${pageCount}`,
      pageWidth - marginX,
      doc.internal.pageSize.getHeight() - 16,
      { align: "right" },
    );
    doc.text(
      `Löneunderlag ${label}`,
      marginX,
      doc.internal.pageSize.getHeight() - 16,
    );
    doc.setTextColor(0);
  }

  doc.save(`${fileBase(report.month)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel
// ─────────────────────────────────────────────────────────────────────────────
export function exportPayrollMonthExcel(
  report: PayrollMonthReportData,
  _opts: PayrollExportOptions = {},
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Sammanfattning
  const summary = report.groups.map((g) => ({
    Personal: g.staff_name,
    "Godkända dagar": g.days_count,
    "Första dag": g.first_date ?? "",
    "Sista dag": g.last_date ?? "",
    "Arbetstid minuter": g.total_minutes,
    Arbetstid: formatMinutes(g.total_minutes),
    "Rast minuter": g.total_break_minutes,
    Status: groupStatusLabel(g),
  }));
  const ws1 = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, ws1, "Sammanfattning");

  // Sheet 2: Detaljer
  const details: Record<string, unknown>[] = [];
  for (const g of report.groups) {
    for (const r of g.rows) {
      details.push({
        Personal: g.staff_name,
        Datum: r.date,
        Start: rowStart(r),
        Slut: rowEnd(r),
        "Rast minuter": r.break_minutes,
        "Total minuter": r.total_minutes,
        "Total tid": formatMinutes(r.total_minutes),
        Status: rowStatusLabel(r),
        Kommentar: r.comment ?? "",
        "Admin-kommentar": r.review_comment ?? "",
      });
    }
  }
  const ws2 = XLSX.utils.json_to_sheet(details);
  XLSX.utils.book_append_sheet(wb, ws2, "Detaljer");

  XLSX.writeFile(wb, `${fileBase(report.month)}.xlsx`);
}
