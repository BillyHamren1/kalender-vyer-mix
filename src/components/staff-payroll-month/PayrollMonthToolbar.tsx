import React from "react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Mail } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { PayrollStatusFilter } from "@/hooks/staff/usePayrollMonthReport";

interface StaffOption { id: string; name: string }

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
  { value: "approved_only", label: "Endast godkänd" },
  { value: "payroll_approved_only", label: "Godkänd för utbetalning" },
];

const PayrollMonthToolbar: React.FC<Props> = ({
  month, onPrevMonth, onNextMonth, onToday,
  staff, staffFilter, onStaffFilterChange,
  statusFilter, onStatusFilterChange,
  onExportPdf, onExportExcel, onMail, isBusy,
}) => {
  const monthLabel = format(month, "MMMM yyyy", { locale: sv });
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60">
      <div className="px-4 py-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={onPrevMonth}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 capitalize min-w-[10rem]" onClick={onToday}>
            {monthLabel}
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={onNextMonth}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Select value={staffFilter} onValueChange={onStaffFilterChange}>
          <SelectTrigger className="h-7 w-44 text-sm">
            <SelectValue placeholder="Personal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla personer</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as PayrollStatusFilter)}>
          <SelectTrigger className="h-7 w-52 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onExportPdf} disabled={isBusy}>
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onExportExcel} disabled={isBusy}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" className="h-7 gap-1.5" onClick={onMail} disabled={isBusy}>
            <Mail className="h-3.5 w-3.5" /> Mejla rapport
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PayrollMonthToolbar;
