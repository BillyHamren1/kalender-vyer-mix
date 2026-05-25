import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CalendarCheck2, Search } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { StaffWeeklyStaffMember } from "@/hooks/staff/useStaffWeeklyTimeApprovals";

export interface WeekApprovalToolbarProps {
  weekStart: Date;
  weekEnd: Date;
  weekNumber: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  staff: StaffWeeklyStaffMember[];
  staffFilter: string;
  onStaffFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Alla statusar" },
  { value: "todo", label: "Att göra" },
  { value: "approved", label: "Godkända" },
  { value: "submitted", label: "Väntar attest" },
  { value: "edited", label: "Redigerad" },
  { value: "ai_flagged", label: "AI-flaggad" },
  { value: "needs_control", label: "Behöver kontroll" },
  { value: "needs_user_attention", label: "Behöver svar" },
  { value: "correction_requested", label: "Komplettering begärd" },
  { value: "payroll_approved", label: "Utbetalning godkänd" },
];

export const WeekApprovalToolbar: React.FC<WeekApprovalToolbarProps> = ({
  weekStart,
  weekEnd,
  weekNumber,
  onPrev,
  onNext,
  onToday,
  staff,
  staffFilter,
  onStaffFilterChange,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
}) => {
  const range = `${format(weekStart, "d MMM", { locale: sv })} – ${format(weekEnd, "d MMM yyyy", { locale: sv })}`;

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60">
      <div className="px-4 py-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarCheck2 className="h-4 w-4 text-primary shrink-0" />
          <div className="text-sm font-semibold tracking-tight whitespace-nowrap">
            Vecka {weekNumber}
          </div>
          <div className="text-xs text-muted-foreground whitespace-nowrap">{range}</div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2" onClick={onPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Föregående</span>
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={onToday}>
            Aktuell vecka
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2" onClick={onNext}>
            <span className="hidden sm:inline">Nästa</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Sök personal…"
              className="h-7 pl-7 w-40 text-sm"
            />
          </div>
          <Select value={staffFilter} onValueChange={onStaffFilterChange}>
            <SelectTrigger className="h-7 w-40 text-sm">
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
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="h-7 w-40 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default WeekApprovalToolbar;
