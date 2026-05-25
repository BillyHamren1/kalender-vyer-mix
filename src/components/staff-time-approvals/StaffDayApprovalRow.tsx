import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Pencil,
  ShieldAlert,
  MapPin,
  CheckCircle2,
  MessageSquareWarning,
  Cpu,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import TimeApprovalStatusBadge from "./TimeApprovalStatusBadge";
import { formatHm, type WeeklyDayCell } from "./weeklyApprovalModel";

interface Props {
  day: WeeklyDayCell;
  staffId: string;
  isExpanded: boolean;
  isBusy: boolean;
  onToggle: () => void;
  onApproveDay: () => void;
  onRequestCorrection: () => void;
  onOpenGps: () => void;
}

const WEEKDAY_LONG = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

function dayIndex(dateStr: string): number {
  const d = parseISO(dateStr);
  const js = d.getDay();
  return (js + 6) % 7;
}

export const StaffDayApprovalRow: React.FC<Props> = ({
  day,
  isExpanded,
  isBusy,
  onToggle,
  onApproveDay,
  onRequestCorrection,
  onOpenGps,
}) => {
  const dateObj = parseISO(day.date);
  const weekday = WEEKDAY_LONG[dayIndex(day.date)];
  const isApproved = day.uiStatus === "approved" || day.uiStatus === "payroll_approved";
  const canApprove = day.isAdminApprovable; // submission + APPROVABLE_STATUSES
  const canRequestCorrection = !!day.submission && !isApproved;

  const timeRange = day.startLabel && day.endLabel
    ? `${day.startLabel} – ${day.endLabel}`
    : day.startLabel
      ? `${day.startLabel} – ?`
      : day.endLabel
        ? `? – ${day.endLabel}`
        : "–";

  const isEnginePending = day.uiStatus === "pending_staff_attest";
  const isEngineError = day.uiStatus === "engine_error";

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isExpanded
          ? "border-primary/60 bg-primary/5"
          : day.submission
            ? "border-border/60 bg-card hover:bg-muted/30"
            : isEnginePending
              ? "border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10"
              : isEngineError
                ? "border-rose-500/40 bg-rose-500/5"
                : "border-dashed border-border/40 bg-muted/20"
      }`}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="w-16 shrink-0">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground leading-tight">
            {weekday.slice(0, 3)}
          </div>
          <div className="text-sm font-bold leading-tight">
            {format(dateObj, "d MMM", { locale: sv })}
          </div>
        </div>

        <div className="w-28 shrink-0 text-sm font-mono">{timeRange}</div>

        <div className="w-14 shrink-0 text-xs text-muted-foreground">
          {day.submission ? `rast ${day.submission.break_minutes ?? 0}m` : ""}
        </div>

        <div className="w-16 shrink-0 text-sm font-semibold tabular-nums">
          {formatHm(day.minutes)}
        </div>

        <div className="flex-1 flex items-center gap-1 min-w-0 flex-wrap">
          {day.source === "none" ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
              Ingen rapport
            </Badge>
          ) : (
            <TimeApprovalStatusBadge status={day.uiStatus} />
          )}
          {isEnginePending && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] border-indigo-500/40 text-indigo-700 dark:text-indigo-300 bg-indigo-500/10"
            >
              <Cpu className="h-3 w-3" />
              Förslag från Time Engine
            </Badge>
          )}
          {day.hasComment && (
            <MessageSquare className="h-3.5 w-3.5 text-sky-600" aria-label="Användarkommentar" />
          )}
          {day.hasUserEdits && (
            <Pencil className="h-3.5 w-3.5 text-amber-600" aria-label="Användarredigerad" />
          )}
          {day.hasAiWarning && (
            <ShieldAlert className="h-3.5 w-3.5 text-orange-600" aria-label="AI-varning" />
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onOpenGps();
            }}
            title="Öppna GPS-karta"
          >
            <MapPin className="h-3.5 w-3.5" />
          </Button>
          {canApprove && (
            <Button
              size="sm"
              className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isBusy}
              onClick={(e) => {
                e.stopPropagation();
                onApproveDay();
              }}
              title="Godkänn dag"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {canRequestCorrection && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={isBusy}
              onClick={(e) => {
                e.stopPropagation();
                onRequestCorrection();
              }}
              title="Begär komplettering"
            >
              <MessageSquareWarning className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffDayApprovalRow;
