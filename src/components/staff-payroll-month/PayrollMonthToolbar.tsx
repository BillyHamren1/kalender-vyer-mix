import React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Mail,
  CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { PayrollStatusFilter } from "@/hooks/staff/usePayrollMonthReport";

interface StaffOption {
  id: string;
  name: string;
}

interface Props {
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  staff: StaffOption[];
  staffFilter: string;
  onStaffFilterChange: (v: string) => void;
  statusFilter: PayrollStatusFilter;
  onStatusFilterChange: (v: PayrollStatusFilter) => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onMail: () => void;
  isBusy?: boolean;
}

const STATUS: Array<{ value: PayrollStatusFilter; label: string }> = [
  { value: "all_approved", label: "Alla godkända" },
  { value: "approved", label: "Endast godkänd" },
  { value: "payroll_approved", label: "Godkänd för utbetalning" },
];

const PayrollMonthToolbar: React.FC<Props> = ({
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  staff,
  staffFilter,
  onStaffFilterChange,
  statusFilter,
  onStatusFilterChange,
  onExportPdf,
  onExportExcel,
  onMail,
  isBusy,
}) => {
  const monthLabel = format(month, "MMMM yyyy", { locale: sv });

  // Normalisera legacy-värden in i toolbar
  const normalizedStatus: PayrollStatusFilter =
    statusFilter === "approved_only"
      ? "approved"
      : statusFilter === "payroll_approved_only"
        ? "payroll_approved"
        : statusFilter;

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60">
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={onPrevMonth}
            aria-label="Föregående månad"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 capitalize min-w-[10rem] gap-1.5"
            onClick={onToday}
            title="Hoppa till denna månad"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {monthLabel}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={onNextMonth}
            aria-label="Nästa månad"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={staffFilter} onValueChange={onStaffFilterChange}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="Personal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla personer</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={normalizedStatus}
          onValueChange={(v) => onStatusFilterChange(v as PayrollStatusFilter)}
        >
          <SelectTrigger className="h-8 w-52 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onExportPdf}
            disabled={isBusy}
          >
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onExportExcel}
            disabled={isBusy}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={onMail} disabled={isBusy}>
            <Mail className="h-3.5 w-3.5" /> Mejla rapport
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PayrollMonthToolbar;
