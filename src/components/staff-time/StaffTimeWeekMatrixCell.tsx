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

// Premium statusvarianter: 3–4px statusbar + svagt tonad bakgrund + tydlig border.
interface StatusVariant {
  bar: string;
  bg: string;
  border: string;
  chip: string;
  total: string;
}

const STATUS_VARIANT: Record<StaffTimeMatrixCell["status"], StatusVariant> = {
  gps_proposal: {
    bar: "bg-violet-400",
    bg: "bg-card",
    border: "border-border/60",
    chip: "bg-violet-50 text-violet-700 border-violet-100",
    total: "text-foreground",
  },
  submitted_waiting_approval: {
    bar: "bg-amber-400",
    bg: "bg-card",
    border: "border-border/60",
    chip: "bg-amber-50 text-amber-700 border-amber-100",
    total: "text-foreground",
  },
  correction_requested: {
    bar: "bg-rose-400",
    bg: "bg-card",
    border: "border-border/60",
    chip: "bg-rose-50 text-rose-700 border-rose-100",
    total: "text-foreground",
  },
  approved: {
    bar: "bg-emerald-400",
    bg: "bg-card",
    border: "border-border/60",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-100",
    total: "text-foreground",
  },
  empty: {
    bar: "bg-transparent",
    bg: "bg-transparent",
    border: "border-dashed border-border/50",
    chip: "bg-muted text-muted-foreground border-transparent",
    total: "text-muted-foreground",
  },
};

interface Props {
  cell: StaffTimeMatrixCell;
  onClick: () => void;
}

export default function StaffTimeWeekMatrixCell({ cell, onClick }: Props) {
  const hasTimes = !!(cell.startTime && cell.endTime);
  const hasRows = (cell.rows?.length ?? 0) > 0;
  const isEmpty = cell.status === "empty" && !hasRows && !hasTimes;
  const variant = STATUS_VARIANT[cell.status];

  // Avvikelsedetektion (visuellt) — påverkar inte data.
  const hasTravel = cell.travelMinutes > 0;
  const hasOvertime = cell.overtimeMinutes > 0;
  const hasUnknown = (cell.rows ?? []).some((r) => r.kind === "unknown_place" || r.kind === "gps_gap");

  if (isEmpty) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group w-full min-h-[88px] rounded-xl border px-2 py-1 text-center flex items-center justify-center",
          "text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 hover:border-border",
          "focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors",
          variant.border,
        )}
      >
        <span className="text-xs">Ingen tid</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={cell.reviewComment ?? undefined}
      className={cn(
        "group relative w-full min-h-[120px] rounded-lg border text-left flex flex-col overflow-hidden",
        "hover:border-border hover:shadow-sm transition-all",
        "focus:outline-none focus:ring-2 focus:ring-primary/40",
        variant.bg,
        variant.border,
      )}
    >
      {/* 2px statusbar längs vänstra kanten */}
      <span className={cn("absolute left-0 top-0 bottom-0 w-[2px]", variant.bar)} aria-hidden />

      {/* Header: status-chip · start–slut · totaltid */}
      <div className="flex items-center gap-2 w-full px-3 pt-2.5 pl-4">
        <span
          className={cn(
            "text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-px rounded border",
            variant.chip,
          )}
        >
          {STATUS_LABEL[cell.status]}
        </span>
        {hasTimes ? (
          <span className="text-[10.5px] tabular-nums leading-none text-muted-foreground truncate">
            {cell.startTime}–{cell.endTime}
          </span>
        ) : (
          <span className="text-[10.5px] text-muted-foreground">–</span>
        )}
        <span className={cn("ml-auto text-sm tabular-nums font-semibold leading-none", variant.total)}>
          {fmtDur(cell.totalMinutes)}
        </span>
      </div>

      {/* Block-rader (samma reportRows som GPS-satelliten) */}
      <div className="flex-1 px-3 pt-2 pl-4 pb-2">
        {hasRows && (
          <WeekFlowReportRowsMini rows={cell.rows} maxRows={3} compact />
        )}
      </div>

      {/* Footer: sammanfattning + avvikelsebadges */}
      {(cell.normalMinutes > 0 || cell.overtimeMinutes > 0 || cell.travelMinutes > 0 || hasUnknown) && (
        <div className="mt-auto px-3 py-1.5 pl-4 border-t border-border/40 bg-muted/20 flex items-center gap-1.5 text-[10px] tabular-nums">
          <span className="text-muted-foreground truncate">
            <span className="font-medium text-foreground/80">N </span>{fmtDur(cell.normalMinutes)}
            {hasOvertime && (
              <>
                <span className="text-muted-foreground/50"> · </span>
                <span className="font-medium text-foreground/80">Ö </span>
                <span>{fmtDur(cell.overtimeMinutes)}</span>
              </>
            )}
            {hasTravel && (
              <>
                <span className="text-muted-foreground/50"> · </span>
                <span className="font-medium text-foreground/80">Resa </span>
                <span>{fmtDur(cell.travelMinutes)}</span>
              </>
            )}
          </span>
          {hasUnknown && (
            <span
              className="ml-auto inline-flex items-center justify-center px-1 h-3.5 rounded text-[9px] font-semibold uppercase bg-amber-50 text-amber-700 border border-amber-100"
              title="Innehåller GPS-glapp eller okänd plats"
            >
              !
            </span>
          )}
        </div>
      )}
    </button>
  );
}
