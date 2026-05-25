import React, { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { sv } from "date-fns/locale";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/card";
import { FileText, AlertCircle } from "lucide-react";
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

  const monthStr = format(month, "yyyy-MM");

  const { data, isLoading, error } = usePayrollMonthReport({
    month: monthStr,
    staffId: staffFilter !== "all" ? staffFilter : null,
    status: statusFilter,
  });

  const staffOptions = useMemo(
    () =>
      (data?.groups ?? [])
        .map((g) => ({ id: g.staff_id, name: g.staff_name }))
        .sort((a, b) => a.name.localeCompare(b.name, "sv")),
    [data],
  );

  const openGroup = useMemo(
    () => data?.groups.find((g) => g.staff_id === openStaffId) ?? null,
    [data, openStaffId],
  );

  const monthLabel = format(month, "LLLL yyyy", { locale: sv });

  // ── Export: Excel ────────────────────────────────────────────
  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const summaryRows = data.groups.map((g) => ({
      Personal: g.staff_name,
      "Godkända dagar": g.days_count,
      "Första dag": g.first_date ?? "",
      "Sista dag": g.last_date ?? "",
      "Arbetstid (h:m)": formatMinutes(g.total_minutes),
      "Arbetstid (decimal)": formatHoursDecimal(g.total_minutes),
      "Rast (h:m)": formatMinutes(g.total_break_minutes),
      "Godkänd för utbetalning": g.payroll_approved_days_count,
      "Endast godkänd": g.approved_days_count,
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, ws1, "Sammanställning");

    const dayRows: Record<string, unknown>[] = [];
    for (const g of data.groups) {
      for (const r of g.rows) {
        dayRows.push({
          Personal: g.staff_name,
          Datum: r.date,
          Dag: r.weekday,
          Start: r.requested_start_at
            ? r.requested_start_at.slice(11, 16)
            : (r.start_time?.slice(0, 5) ?? ""),
          Slut: r.requested_end_at
            ? r.requested_end_at.slice(11, 16)
            : (r.end_time?.slice(0, 5) ?? ""),
          "Rast (min)": r.break_minutes,
          "Arbetstid (h:m)": formatMinutes(r.total_minutes),
          "Arbetstid (decimal)": formatHoursDecimal(r.total_minutes),
          Status:
            r.status === "payroll_approved" ? "Utbetalning godkänd" : "Godkänd",
          "Kommentar personal": r.comment ?? "",
          "Kommentar admin": r.review_comment ?? "",
        });
      }
    }
    const ws2 = XLSX.utils.json_to_sheet(dayRows);
    XLSX.utils.book_append_sheet(wb, ws2, "Per dag");

    XLSX.writeFile(wb, `lonerapport-${monthStr}.xlsx`);
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
        `Godkända dagar: ${data.totals.approvedDaysCount}    ` +
        `Klar för lön: ${data.totals.payrollApprovedDaysCount}    ` +
        `Totalt: ${formatMinutes(data.totals.totalMinutes)}`,
      40,
      58,
    );

    autoTable(doc, {
      startY: 80,
      head: [[
        "Personal",
        "Dagar",
        "Första",
        "Sista",
        "Arbetstid",
        "Decimal",
        "Rast",
        "Klar/Godkänd",
      ]],
      body: data.groups.map((g) => [
        g.staff_name,
        g.days_count,
        g.first_date ?? "—",
        g.last_date ?? "—",
        formatMinutes(g.total_minutes),
        formatHoursDecimal(g.total_minutes),
        formatMinutes(g.total_break_minutes),
        `${g.payroll_approved_days_count} / ${g.approved_days_count}`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [124, 90, 200] },
    });

    doc.save(`lonerapport-${monthStr}.pdf`);
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
      `Godkända dagar: ${data.totals.approvedDaysCount}`,
      `Klar för utbetalning: ${data.totals.payrollApprovedDaysCount}`,
      `Total tid: ${formatMinutes(data.totals.totalMinutes)}`,
      "",
      ...data.groups.map(
        (g) =>
          `${g.staff_name} — ${g.days_count} dagar — ${formatMinutes(
            g.total_minutes,
          )} (${formatHoursDecimal(g.total_minutes)} h)`,
      ),
    ];
    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
  };

  return (
    <div className="flex flex-col min-h-full">
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

      <PayrollMonthSummaryCards data={data} />

      {error ? (
        <div className="px-4 pb-6">
          <Card className="border-destructive/40 bg-destructive/5 p-5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-destructive">
                Kunde inte ladda månaden
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {(error as Error).message}
              </p>
            </div>
          </Card>
        </div>
      ) : (
        <PayrollMonthStaffTable
          groups={data?.groups ?? []}
          onOpen={(id) => setOpenStaffId(id)}
          isLoading={isLoading}
        />
      )}

      <PayrollMonthStaffDetailDrawer
        group={openGroup}
        month={monthStr}
        open={!!openGroup}
        onClose={() => setOpenStaffId(null)}
      />
    </div>
  );
};

export default PayrollMonthReportPageContent;
