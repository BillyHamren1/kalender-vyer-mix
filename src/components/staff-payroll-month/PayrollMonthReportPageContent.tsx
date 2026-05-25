import React, { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { sv } from "date-fns/locale";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/PageHeader";
import { FileText } from "lucide-react";
import {
  usePayrollMonthReport,
  formatMinutes,
  formatHoursDecimal,
  type PayrollStatusFilter,
} from "@/hooks/staff/usePayrollMonthReport";

import PayrollMonthToolbar from "./PayrollMonthToolbar";
import PayrollMonthSummaryCards from "./PayrollMonthSummaryCards";
import PayrollMonthStaffTable from "./PayrollMonthStaffTable";
import PayrollMonthStaffDetailDrawer from "./PayrollMonthStaffDetailDrawer";

const PayrollMonthReportPageContent: React.FC = () => {
  const [month, setMonth] = useState<Date>(() => new Date());
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PayrollStatusFilter>("all_approved");
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);

  const { data, isLoading, error } = usePayrollMonthReport({
    month,
    staffId: staffFilter !== "all" ? staffFilter : null,
    statusFilter,
  });

  const staffOptions = useMemo(
    () =>
      (data?.staffSummaries ?? [])
        .map((s) => ({ id: s.staffId, name: s.staffName }))
        .sort((a, b) => a.name.localeCompare(b.name, "sv")),
    [data],
  );

  const openSummary = useMemo(
    () => data?.staffSummaries.find((s) => s.staffId === openStaffId) ?? null,
    [data, openStaffId],
  );

  const monthLabel = format(month, "LLLL yyyy", { locale: sv });

  // ── Export: Excel ────────────────────────────────────────────
  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Sammanställning
    const summaryRows = data.staffSummaries.map((s) => ({
      Personal: s.staffName,
      "Godkända dagar": s.approvedDayCount,
      "Första dag": s.firstWorkedDate ?? "",
      "Sista dag": s.lastWorkedDate ?? "",
      "Arbetstid (h:m)": formatMinutes(s.totalWorkMinutes),
      "Arbetstid (decimal)": formatHoursDecimal(s.totalWorkMinutes),
      "Rast (h:m)": formatMinutes(s.totalBreakMinutes),
      Status: s.state === "klar" ? "Klar" : s.state === "partial" ? "Delvis klar" : "Saknar",
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, ws1, "Sammanställning");

    // Per dag
    const dayRows: Record<string, unknown>[] = [];
    for (const s of data.staffSummaries) {
      for (const r of s.rows) {
        dayRows.push({
          Personal: s.staffName,
          Datum: r.date,
          Start: r.computedStartIso ? r.computedStartIso.slice(11, 16) : "",
          Slut: r.computedEndIso ? r.computedEndIso.slice(11, 16) : "",
          "Rast (min)": r.break_minutes,
          "Arbetstid (h:m)": formatMinutes(r.workMinutes),
          "Arbetstid (decimal)": formatHoursDecimal(r.workMinutes),
          Status: r.status === "payroll_approved" ? "Utbetalning godkänd" : "Godkänd",
          "Kommentar personal": r.comment ?? "",
          "Kommentar admin": r.review_comment ?? "",
        });
      }
    }
    const ws2 = XLSX.utils.json_to_sheet(dayRows);
    XLSX.utils.book_append_sheet(wb, ws2, "Per dag");

    XLSX.writeFile(wb, `lonerapport-${format(month, "yyyy-MM")}.xlsx`);
    toast.success("Excel exporterad");
  };

  // ── Export: PDF ──────────────────────────────────────────────
  const handleExportPdf = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(16);
    doc.text(`Månadsrapport lön — ${monthLabel}`, 40, 40);
    doc.setFontSize(10);
    doc.text(
      `Period: ${data.monthStart} – ${data.monthEnd}    Personal: ${data.totals.staffCount}    ` +
        `Godkända dagar: ${data.totals.approvedDayCount}    ` +
        `Totalt: ${formatMinutes(data.totals.totalWorkMinutes)}`,
      40,
      58,
    );

    autoTable(doc, {
      startY: 80,
      head: [[
        "Personal", "Dagar", "Första", "Sista",
        "Arbetstid", "Decimal", "Rast", "Status",
      ]],
      body: data.staffSummaries.map((s) => [
        s.staffName,
        s.approvedDayCount,
        s.firstWorkedDate ?? "—",
        s.lastWorkedDate ?? "—",
        formatMinutes(s.totalWorkMinutes),
        formatHoursDecimal(s.totalWorkMinutes),
        formatMinutes(s.totalBreakMinutes),
        s.state === "klar" ? "Klar" : s.state === "partial" ? "Delvis" : "Saknar",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [60, 90, 160] },
    });

    doc.save(`lonerapport-${format(month, "yyyy-MM")}.pdf`);
    toast.success("PDF exporterad");
  };

  // ── Mejla rapport ────────────────────────────────────────────
  const handleMail = () => {
    if (!data) return;
    const subject = `Månadsrapport lön ${monthLabel}`;
    const lines: string[] = [
      `Månadsrapport lön — ${monthLabel}`,
      `Period: ${data.monthStart} – ${data.monthEnd}`,
      `Personal: ${data.totals.staffCount}`,
      `Godkända dagar: ${data.totals.approvedDayCount}`,
      `Total tid: ${formatMinutes(data.totals.totalWorkMinutes)}`,
      "",
      ...data.staffSummaries.map(
        (s) =>
          `${s.staffName} — ${s.approvedDayCount} dagar — ${formatMinutes(s.totalWorkMinutes)} (${formatHoursDecimal(
            s.totalWorkMinutes,
          )} h)`,
      ),
    ];
    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="px-4 pt-4">
        <PageHeader
          icon={FileText}
          title="Månadsrapport lön"
          subtitle="Godkänd tid per personal – färdigt underlag för löneutbetalning."
          variant="purple"
        />
      </div>

      <PayrollMonthToolbar
        month={month}
        onPrevMonth={() => setMonth((m) => addMonths(m, -1))}
        onNextMonth={() => setMonth((m) => addMonths(m, 1))}
        onToday={() => setMonth(new Date())}
        staff={staffOptions}
        staffFilter={staffFilter}
        onStaffFilterChange={setStaffFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onExportPdf={handleExportPdf}
        onExportExcel={handleExportExcel}
        onMail={handleMail}
        isBusy={isLoading}
      />

      <PayrollMonthSummaryCards data={data} month={month} />

      {error ? (
        <div className="px-4 py-6 text-sm text-destructive">
          Kunde inte ladda månaden: {(error as Error).message}
        </div>
      ) : (
        <PayrollMonthStaffTable
          summaries={data?.staffSummaries ?? []}
          onOpen={setOpenStaffId}
          isLoading={isLoading}
        />
      )}

      <PayrollMonthStaffDetailDrawer
        summary={openSummary}
        open={!!openSummary}
        onClose={() => setOpenStaffId(null)}
      />
    </div>
  );
};

export default PayrollMonthReportPageContent;
