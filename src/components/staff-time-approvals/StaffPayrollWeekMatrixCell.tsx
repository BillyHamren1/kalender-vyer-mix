/**
 * StaffPayrollWeekMatrixCell — klinisk dagcell för Lön-tabben.
 *
 * Samma data som Tid-cellen (StaffTimeWeekMatrixCell) men presentationen är
 * stramare: vit bakgrund, tunn ram, status som monokrom etikett + tunn
 * vänsterkant i statusfärgen, tabular siffror, inga färgfyllda chips.
 */
import { cn } from "@/lib/utils";
import type { StaffTimeMatrixCell } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import WeekFlowReportRowsMini from "@/components/staff-time/week-flow/WeekFlowReportRowsMini";

function fmtDur(min: number): string {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const STATUS_LABEL: Record<StaffTimeMatrixCell["status"], string> = {
  gps_proposal: "Förslag",
  submitted_waiting_approval: "Väntar attest",
  correction_requested: "Komplettera",
  approved: "Attesterad",
  empty: "Ingen data",
};

const STATUS_ACCENT: Record<StaffTimeMatrixCell["status"], string> = {
  gps_proposal: "border-l-violet-400",
  submitted_waiting_approval: "border-l-amber-500",
  correction_requested: "border-l-rose-500",
  approved: "border-l-emerald-500",
  empty: "border-l-transparent",
};

const STATUS_TEXT: Record<StaffTimeMatrixCell["status"], string> = {
  gps_proposal: "text-violet-700 dark:text-violet-300",
  submitted_waiting_approval: "text-amber-700 dark:text-amber-300",
  correction_requested: "text-rose-700 dark:text-rose-300",
  approved: "text-emerald-700 dark:text-emerald-300",
  empty: "text-muted-foreground",
};

interface Props {
  cell: StaffTimeMatrixCell;
  onClick: () => void;
}

export default function StaffPayrollWeekMatrixCell({ cell, onClick }: Props) {
  const hasTimes = !!(cell.startTime && cell.endTime);
  const hasRows = (cell.rows?.length ?? 0) > 0;
  const isEmpty = cell.status === "empty" && !hasRows && !hasTimes;

  if (isEmpty) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full min-h-[88px] rounded-sm border border-border/50 bg-background/60",
          "flex items-center justify-center text-[11px] text-muted-foreground/60",
          "hover:bg-muted/30 hover:border-border focus:outline-none focus:ring-1 focus:ring-primary/50",
        )}
      >
        —
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={cell.reviewComment ?? undefined}
      className={cn(
        "w-full min-h-[96px] rounded-sm border border-border/60 bg-card text-left",
        "border-l-2 flex flex-col gap-1 px-2 py-1.5 transition-colors",
        "hover:bg-muted/20 hover:border-border focus:outline-none focus:ring-1 focus:ring-primary/50",
        STATUS_ACCENT[cell.status],
      )}
    >
      {/* Rad 1: status + total */}
      <div className="flex items-center justify-between w-full">
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", STATUS_TEXT[cell.status])}>
          {STATUS_LABEL[cell.status]}
        </span>
        <span className="text-[11px] tabular-nums font-semibold text-foreground">
          {fmtDur(cell.totalMinutes)}
        </span>
      </div>

      {/* Rad 2: start–slut */}
      <div className="text-[10.5px] tabular-nums text-muted-foreground leading-none">
        {hasTimes ? `${cell.startTime}–${cell.endTime}` : "—"}
      </div>

      {/* Block (samma som Tid-cellen) */}
      {hasRows && (
        <div className="border-t border-border/40 pt-1 mt-0.5">
          <WeekFlowReportRowsMini rows={cell.rows} maxRows={3} compact />
        </div>
      )}

      {/* Strukturerad sekundärsumma */}
      {(cell.normalMinutes > 0 || cell.overtimeMinutes > 0 || cell.travelMinutes > 0) && (
        <div className="mt-auto pt-1 border-t border-border/40 grid grid-cols-3 gap-1 text-[9.5px] tabular-nums text-muted-foreground">
          <div className="flex flex-col leading-tight">
            <span className="uppercase tracking-wide opacity-70">Normal</span>
            <span className="text-foreground font-medium">{fmtDur(cell.normalMinutes)}</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="uppercase tracking-wide opacity-70">Övertid</span>
            <span className="text-foreground font-medium">{fmtDur(cell.overtimeMinutes)}</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="uppercase tracking-wide opacity-70">Resa</span>
            <span className="text-foreground font-medium">{fmtDur(cell.travelMinutes)}</span>
          </div>
        </div>
      )}
    </button>
  );
}
