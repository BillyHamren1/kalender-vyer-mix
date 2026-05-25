import React, { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { sv } from "date-fns/locale";
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
import {
  exportPayrollMonthPdf,
  exportPayrollMonthExcel,
} from "@/services/payrollMonthExportService";

import PayrollMonthToolbar from "./PayrollMonthToolbar";
import PayrollMonthSummaryCards from "./PayrollMonthSummaryCards";
import PayrollMonthStaffTable from "./PayrollMonthStaffTable";
import PayrollMonthStaffDetailDrawer from "./PayrollMonthStaffDetailDrawer";
import PayrollMonthEmailDialog from "./PayrollMonthEmailDialog";

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
    if (!data || data.groups.length === 0) {
      toast.error("Det finns ingen godkänd tid att exportera.");
      return;
    }
    exportPayrollMonthExcel(data);
    toast.success("Excel exporterad");
  };

  // ── Export: PDF ──────────────────────────────────────────────
  const handleExportPdf = () => {
    if (!data || data.groups.length === 0) {
      toast.error("Det finns ingen godkänd tid att exportera.");
      return;
    }
    exportPayrollMonthPdf(data);
    toast.success("PDF exporterad");
  };

  // ── Mejla rapport ────────────────────────────────────────────
  const [mailOpen, setMailOpen] = useState(false);
  const handleMail = () => {
    if (!data || data.groups.length === 0) {
      toast.error("Det finns ingen godkänd tid att mejla.");
      return;
    }
    setMailOpen(true);
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
