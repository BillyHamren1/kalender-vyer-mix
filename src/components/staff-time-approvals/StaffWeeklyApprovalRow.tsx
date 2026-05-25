import React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, CheckCheck, Clock3 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  formatHm,
  isCleanWeekApproval,
  isWeekFullyApprovable,
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
  if (status === "no_report") return "bg-muted/60 text-muted-foreground/70 border-transparent";
  if (status === "approved")
    return "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300";
  if (status === "payroll_approved")
    return "bg-emerald-600/20 text-emerald-800 border-emerald-600/50 dark:text-emerald-200";
  if (status === "correction_requested")
    return "bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-300";
  if (status === "needs_user_attention")
    return "bg-rose-400/15 text-rose-700 border-rose-400/40 dark:text-rose-300";
  if (status === "needs_control" || status === "ai_flagged")
    return "bg-orange-500/15 text-orange-800 border-orange-500/40 dark:text-orange-300";
  if (status === "submitted" || status === "edited")
    return "bg-amber-400/20 text-amber-800 border-amber-500/40 dark:text-amber-300";
  if (status === "missing_report")
    return "bg-zinc-300/40 text-zinc-700 border-zinc-400/50 dark:text-zinc-300";
  return "bg-muted/60 text-muted-foreground border-transparent";
}

function statusLabel(status: string): string {
  switch (status) {
    case "no_report":
      return "Ingen rapport";
    case "approved":
      return "Godkänd";
    case "payroll_approved":
      return "Utbetald";
    case "correction_requested":
      return "Komplettering begärd";
    case "needs_user_attention":
      return "Behöver svar";
    case "needs_control":
      return "Kontroll";
    case "ai_flagged":
      return "AI-flaggad";
    case "submitted":
      return "Väntar attest";
    case "edited":
      return "Redigerad";
    case "missing_report":
      return "Saknar rapport";
    default:
      return status;
  }
}

const WEEKDAY_SHORT = ["M", "T", "O", "T", "F", "L", "S"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const StaffWeeklyApprovalRow: React.FC<Props> = ({
  bundle,
  isOpen,
  isApproving,
  onOpen,
  onApproveWeek,
}) => {
  const canApproveWeek = isWeekFullyApprovable(bundle);
  const cleanWeek = isCleanWeekApproval(bundle);
  const hasCorrection = bundle.correctionRequestedCount > 0;
  const isApprovedAll = bundle.allDone && bundle.submittedCount > 0;

  // Vänsterkant: röd om komplettering, grön om allt klart, annars neutral
  const leftAccent = hasCorrection
    ? "border-l-4 border-l-rose-500/70"
    : isApprovedAll
      ? "border-l-4 border-l-emerald-500/60"
      : "border-l-4 border-l-transparent";

  // Statusfärg (text)
  const statusTone = hasCorrection
    ? "text-rose-700 dark:text-rose-300"
    : isApprovedAll
      ? "text-emerald-700 dark:text-emerald-300"
      : bundle.priorityRank <= 3
        ? "text-orange-700 dark:text-orange-300"
        : bundle.priorityRank === 4
          ? "text-amber-700 dark:text-amber-300"
          : "text-muted-foreground";

  const approveLabel = canApproveWeek
    ? cleanWeek
      ? "Godkänn vecka"
      : "Godkänn möjliga"
    : null;

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className={`group flex items-center gap-2 pr-2 pl-0 rounded-md border bg-card hover:bg-muted/30 transition-colors cursor-pointer ${leftAccent} ${
          isOpen ? "ring-1 ring-primary/50 bg-primary/5" : "border-border/50"
        }`}
        style={{ minHeight: 48 }}
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
        {/* Person */}
        <div className="flex items-center gap-2 min-w-0 flex-1 pl-2 py-1">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
              {initials(bundle.staff.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground truncate leading-tight">
              {bundle.staff.name}
            </div>
            <div className={`text-[11px] truncate leading-tight ${statusTone}`}>
              {bundle.actionLabel}
            </div>
          </div>
        </div>

        {/* Veckototal */}
        <div className="hidden sm:flex items-center gap-1 text-[12px] text-muted-foreground tabular-nums shrink-0 w-16 justify-end">
          <Clock3 className="h-3 w-3" />
          {formatHm(bundle.totalMinutes)}
        </div>

        {/* Dagindikatorer */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          {bundle.days.map((d, i) => {
            const date = parseISO(d.date);
            return (
              <Tooltip key={d.date}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex flex-col items-center justify-center rounded border text-[9px] font-semibold leading-none ${dayChipColor(d.status)}`}
                    style={{ width: 22, height: 22 }}
                  >
                    <span>{WEEKDAY_SHORT[i]}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {format(date, "EEEE d MMM", { locale: sv })} — {statusLabel(d.status)}
                  {d.minutes > 0 ? ` · ${formatHm(d.minutes)}` : ""}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Åtgärder */}
        <div className="flex items-center gap-1 shrink-0">
          {approveLabel && (
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
              <span className="hidden lg:inline">{approveLabel}</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
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
    </TooltipProvider>
  );
};

export default StaffWeeklyApprovalRow;
