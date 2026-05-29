import { cn } from "@/lib/utils";
import type { StaffTimeMatrixCell } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";

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
  empty: "bg-muted/30 text-muted-foreground border-transparent",
};

interface Props {
  cell: StaffTimeMatrixCell;
  onClick: () => void;
}

export default function StaffTimeWeekMatrixCell({ cell, onClick }: Props) {
  const hasTimes = cell.startTime && cell.endTime;
  const hasBuckets = cell.normalMinutes > 0 || cell.overtimeMinutes > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={cell.reviewComment ?? undefined}
      className={cn(
        "w-full h-full min-h-[68px] rounded-md border px-1.5 py-1 text-left flex flex-col justify-between gap-0.5 transition-colors",
        "hover:ring-1 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/60",
        STATUS_STYLE[cell.status],
      )}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-wide leading-none">
        {STATUS_LABEL[cell.status]}
      </div>
      {hasTimes ? (
        <>
          <div className="text-[10.5px] tabular-nums leading-none opacity-80">
            {cell.startTime}–{cell.endTime}
          </div>
          {hasBuckets && (
            <div className="text-[10px] tabular-nums leading-none font-semibold">
              N {fmtDur(cell.normalMinutes)}
              <span className="opacity-60"> · </span>
              Ö {fmtDur(cell.overtimeMinutes)}
            </div>
          )}
          {cell.travelMinutes > 0 && (
            <div className="text-[10px] tabular-nums leading-none opacity-75">
              Resa {fmtDur(cell.travelMinutes)}
            </div>
          )}
        </>
      ) : (
        <div className="text-[10.5px] opacity-50">–</div>
      )}
    </button>
  );
}
