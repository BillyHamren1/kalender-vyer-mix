import React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronRight, CheckCheck, Clock3 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  formatHm,
  isWeekFullyApprovable,
  TODO_STATUSES,
  APPROVED_STATUSES,
  type WeeklyStaffBundle,
} from "./weeklyApprovalModel";

interface Props {
  bundle: WeeklyStaffBundle;
  isOpen: boolean;
  isApproving: boolean;
  onOpen: () => void;
  onApproveWeek: () => void;
}

function dayChipColor(status: string): string {
  if (status === "no_report") return "bg-muted text-muted-foreground border-border";
  if (status === "approved") return "bg-emerald-500/20 text-emerald-700 border-emerald-500/40 dark:text-emerald-300";
  if (status === "payroll_approved") return "bg-emerald-600/25 text-emerald-800 border-emerald-600/50 dark:text-emerald-200";
  if (status === "correction_requested") return "bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-300";
  if (status === "needs_control" || status === "needs_user_attention" || status === "ai_flagged")
    return "bg-orange-500/15 text-orange-800 border-orange-500/40 dark:text-orange-300";
  if (status === "submitted" || status === "edited")
    return "bg-amber-400/20 text-amber-800 border-amber-500/40 dark:text-amber-300";
  return "bg-muted text-muted-foreground border-border";
}

const WEEKDAY_SHORT = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function summaryText(bundle: WeeklyStaffBundle): { text: string; tone: string } {
  if (bundle.allDone && bundle.submittedCount > 0) {
    return { text: "Godkänd vecka", tone: "text-emerald-700 dark:text-emerald-300" };
  }
  const parts: string[] = [];
  if (bundle.awaitingCount > 0) parts.push(`${bundle.awaitingCount} väntar attest`);
  if (bundle.needsFixCount > 0) parts.push(`${bundle.needsFixCount} behöver åtgärd`);
  if (bundle.missingCount > 0) parts.push(`${bundle.missingCount} saknas`);
  if (parts.length === 0 && bundle.approvedCount > 0) {
    return { text: `${bundle.approvedCount} godkända`, tone: "text-emerald-700 dark:text-emerald-300" };
  }
  if (parts.length === 0) return { text: "Inget att göra", tone: "text-muted-foreground" };
  return { text: parts.join(" · "), tone: "text-amber-700 dark:text-amber-300" };
}

export const StaffWeeklyApprovalRow: React.FC<Props> = ({
  bundle,
  isOpen,
  isApproving,
  onOpen,
  onApproveWeek,
}) => {
  const summary = summaryText(bundle);
  const canApproveWeek = isWeekFullyApprovable(bundle);

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
        isOpen
          ? "border-primary/60 bg-primary/5"
          : "border-border/60 bg-card hover:bg-muted/40"
      }`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-[11px] bg-primary/10 text-primary">
          {initials(bundle.staff.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm text-foreground truncate">
            {bundle.staff.name}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0 inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {formatHm(bundle.totalMinutes)}
          </span>
        </div>
        <div className={`text-xs truncate ${summary.tone}`}>{summary.text}</div>
      </div>

      <div className="hidden md:flex items-center gap-1 shrink-0">
        {bundle.days.map((d, i) => {
          const date = parseISO(d.date);
          return (
            <div
              key={d.date}
              className={`flex flex-col items-center justify-center w-7 h-9 rounded border text-[9px] uppercase font-semibold ${dayChipColor(d.status)}`}
              title={`${format(date, "EEEE d MMM", { locale: sv })} – ${d.status}`}
            >
              <span className="leading-none">{WEEKDAY_SHORT[i]}</span>
              <span className="leading-none text-[10px] font-bold">
                {format(date, "d")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {canApproveWeek && (
          <Button
            size="sm"
            variant="default"
            className="h-7 px-2 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={isApproving}
            onClick={(e) => {
              e.stopPropagation();
              onApproveWeek();
            }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Godkänn vecka</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 gap-1"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          Öppna
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default StaffWeeklyApprovalRow;
