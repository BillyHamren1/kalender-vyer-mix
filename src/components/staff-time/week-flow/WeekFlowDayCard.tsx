import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, FileEdit, MapPin } from "lucide-react";
import type { WeekFlowDay, WeekFlowStatus } from "@/lib/staffTimeFlow/types";
import WeekFlowApproveButtons from "./WeekFlowApproveButtons";

function fmtDur(min: number): string {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const STATUS_LABEL: Record<WeekFlowStatus, string> = {
  gps_proposal: "Förslag från GPS",
  submitted_waiting_approval: "Väntar godkännande",
  correction_requested: "Behöver kompletteras",
  approved: "Attesterad",
};

const STATUS_STYLE: Record<WeekFlowStatus, string> = {
  gps_proposal: "bg-zinc-100 text-zinc-700 border-zinc-200",
  submitted_waiting_approval: "bg-amber-100 text-amber-800 border-amber-200",
  correction_requested: "bg-rose-100 text-rose-800 border-rose-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const STATUS_ICON: Record<WeekFlowStatus, React.FC<{ className?: string }>> = {
  gps_proposal: MapPin,
  submitted_waiting_approval: Clock,
  correction_requested: AlertCircle,
  approved: CheckCircle2,
};

interface Props {
  day: WeekFlowDay;
  /** Visa knappar för submit (visas bara om viewer=staff via canSubmit). */
  onSubmit?: (date: string) => void;
  /** För klick på "Öppna GPS"-knappen (kan vara null = göm). */
  onOpenGps?: (date: string) => void;
  showHeader?: boolean;
}

export default function WeekFlowDayCard({ day, onSubmit, onOpenGps, showHeader = true }: Props) {
  const StatusIcon = STATUS_ICON[day.status];
  const hasData = day.totalMinutes > 0 || day.rows.length > 0;
  const dateObj = parseISO(day.date);

  return (
    <div className={cn(
      "rounded-lg border bg-card p-3 transition-shadow",
      day.status === "submitted_waiting_approval" && "border-amber-200",
      day.status === "approved" && "border-emerald-200",
      day.status === "correction_requested" && "border-rose-200",
    )}>
      {showHeader && (
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-semibold capitalize">
              {format(dateObj, "EEE", { locale: sv })}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {format(dateObj, "d/M", { locale: sv })}
            </span>
          </div>
          {hasData && day.startTime && day.endTime ? (
            <span className="text-xs tabular-nums text-muted-foreground/80">
              {day.startTime}<span className="mx-0.5">–</span>{day.endTime}
              <span className="ml-2 font-semibold text-foreground">{fmtDur(day.totalMinutes)}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/60">Ingen data</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Badge variant="outline" className={cn("gap-1.5 font-medium", STATUS_STYLE[day.status])}>
          <StatusIcon className="h-3 w-3" />
          {STATUS_LABEL[day.status]}
        </Badge>

        <div className="flex items-center gap-2">
          {hasData && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Arbete {fmtDur(day.workMinutes)}{day.travelMinutes > 0 && <> · Resa {fmtDur(day.travelMinutes)}</>}
            </span>
          )}
          {day.submissionId && (day.canApprove || day.canRequestCorrection) && (
            <WeekFlowApproveButtons
              submissionId={day.submissionId}
              canApprove={day.canApprove}
              canRequestCorrection={day.canRequestCorrection}
            />
          )}
          {day.canSubmit && onSubmit && (
            <button
              type="button"
              onClick={() => onSubmit(day.date)}
              className="text-xs font-semibold px-2.5 h-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {day.status === "correction_requested" ? "Skicka in igen" : "Skicka in"}
            </button>
          )}
          {onOpenGps && (
            <button
              type="button"
              onClick={() => onOpenGps(day.date)}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Öppna GPS
            </button>
          )}
        </div>
      </div>

      {day.reviewComment && day.status === "correction_requested" && (
        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11.5px] text-rose-800">
          <span className="font-semibold">Komplettering:</span> {day.reviewComment}
        </div>
      )}

      {day.rows.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {day.rows.map((r) => {
            const isTravel = r.kind === "travel" || r.kind === "gps_gap" || r.kind === "unknown_place";
            const routeLabel = isTravel && (r.fromLabel || r.toLabel)
              ? `${r.label} ${r.fromLabel ?? "—"} → ${r.toLabel ?? "—"}`
              : r.label;
            return (
              <li key={r.key} className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="flex items-baseline gap-1.5 min-w-0">
                  <span className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                    r.kind === "work" && "bg-emerald-500",
                    r.kind === "travel" && "bg-sky-500",
                    r.kind === "private" && "bg-violet-500",
                    r.kind === "unknown_place" && "bg-amber-500",
                    r.kind === "gps_gap" && "bg-zinc-400",
                    r.kind === "other" && "bg-zinc-400",
                  )} />
                  <span className="truncate">{routeLabel}</span>
                  {r.startIso && r.endIso && (
                    <span className="text-[10px] tabular-nums text-muted-foreground/60 shrink-0">
                      {r.startIso.slice(11, 16)}–{r.endIso.slice(11, 16)}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground shrink-0 text-[11px]">
                  {fmtDur(r.minutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {day.status === "approved" && day.approvedAt && (
        <div className="mt-2 text-[10.5px] text-emerald-700/80 italic">
          Attesterad {format(parseISO(day.approvedAt), "d/M HH:mm", { locale: sv })}
        </div>
      )}
      {day.status === "submitted_waiting_approval" && day.submittedAt && (
        <div className="mt-2 text-[10.5px] text-amber-700/80 italic flex items-center gap-1">
          <FileEdit className="h-3 w-3" />
          Inskickad {format(parseISO(day.submittedAt), "d/M HH:mm", { locale: sv })}
        </div>
      )}
    </div>
  );
}
