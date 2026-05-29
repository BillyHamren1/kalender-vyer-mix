import { cn } from "@/lib/utils";
import type { StaffTimeMatrixCell } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import WeekFlowReportRowsMini from "./week-flow/WeekFlowReportRowsMini";

function fmtDur(min: number): string {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const STATUS_LABEL: Record<StaffTimeMatrixCell["status"], string> = {
  gps_proposal: "GPS",
  submitted_waiting_approval: "Väntar",
  correction_requested: "Komplettera",
  approved: "Attesterad",
  empty: "–",
};

const STATUS_STYLE: Record<StaffTimeMatrixCell["status"], string> = {
  gps_proposal: "bg-violet-50 text-violet-700 border-violet-100",
  submitted_waiting_approval: "bg-amber-50 text-amber-800 border-amber-200",
  correction_requested: "bg-rose-50 text-rose-700 border-rose-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  empty: "bg-muted/20 text-muted-foreground border-transparent",
};

interface Props {
  cell: StaffTimeMatrixCell;
  onClick: () => void;
}

export default function StaffTimeWeekMatrixCell({ cell, onClick }: Props) {
  const hasTimes = !!(cell.startTime && cell.endTime);
  const hasRows = (cell.rows?.length ?? 0) > 0;
  const isEmpty = cell.status === "empty" && !hasRows && !hasTimes;

  if (isEmpty) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full min-h-[72px] rounded-md border px-2 py-1 text-center flex items-center justify-center",
          "hover:ring-1 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/60",
          STATUS_STYLE.empty,
        )}
      >
        <span className="text-xs opacity-60">–</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={cell.reviewComment ?? undefined}
      className={cn(
        "w-full min-h-[88px] rounded-md border px-2 py-1.5 text-left flex flex-col gap-1 transition-colors",
        "hover:ring-1 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/60",
        STATUS_STYLE[cell.status],
      )}
    >
      {/* Rad 1: status + start–slut + total */}
      <div className="flex items-center gap-1.5 w-full">
        <span className="text-[9.5px] font-bold uppercase tracking-wide px-1 py-px rounded bg-white/60 border border-current/10">
          {STATUS_LABEL[cell.status]}
        </span>
        {hasTimes ? (
          <span className="text-[10.5px] tabular-nums leading-none opacity-80 truncate">
            {cell.startTime}–{cell.endTime}
          </span>
        ) : (
          <span className="text-[10.5px] opacity-50">–</span>
        )}
        <span className="ml-auto text-[10.5px] tabular-nums font-semibold">
          {fmtDur(cell.totalMinutes)}
        </span>
      </div>

      {/* Rad 2+: reportRows (samma som GPS-satelliten) */}
      {hasRows && (
        <WeekFlowReportRowsMini rows={cell.rows} maxRows={3} compact />
      )}

      {/* Sekundär summering: N / Ö / Resa */}
      {(cell.normalMinutes > 0 || cell.overtimeMinutes > 0 || cell.travelMinutes > 0) && (
        <div className="mt-auto pt-0.5 text-[10px] tabular-nums opacity-75 truncate">
          N {fmtDur(cell.normalMinutes)}
          <span className="opacity-60"> · </span>
          Ö {fmtDur(cell.overtimeMinutes)}
          {cell.travelMinutes > 0 && (
            <>
              <span className="opacity-60"> · </span>
              Resa {fmtDur(cell.travelMinutes)}
            </>
          )}
        </div>
      )}
    </button>
  );
}
