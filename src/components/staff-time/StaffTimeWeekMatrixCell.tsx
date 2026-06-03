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
    bar: "bg-violet-500",
    bg: "bg-violet-50/70",
    border: "border-violet-200",
    chip: "bg-violet-100 text-violet-800 border-violet-200",
    total: "text-violet-900",
  },
  submitted_waiting_approval: {
    bar: "bg-amber-500",
    bg: "bg-amber-50/70",
    border: "border-amber-200",
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    total: "text-amber-900",
  },
  correction_requested: {
    bar: "bg-rose-500",
    bg: "bg-rose-50/70",
    border: "border-rose-200",
    chip: "bg-rose-100 text-rose-800 border-rose-200",
    total: "text-rose-900",
  },
  approved: {
    bar: "bg-emerald-500",
    bg: "bg-emerald-50/70",
    border: "border-emerald-200",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    total: "text-emerald-900",
  },
  empty: {
    bar: "bg-transparent",
    bg: "bg-transparent",
    border: "border-dashed border-border/60",
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
        "group relative w-full min-h-[112px] rounded-xl border text-left flex flex-col overflow-hidden",
        "shadow-sm hover:shadow-md hover:-translate-y-px transition-all",
        "focus:outline-none focus:ring-2 focus:ring-primary/60",
        variant.bg,
        variant.border,
      )}
    >
      {/* 3px statusbar längs vänstra kanten */}
      <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", variant.bar)} aria-hidden />

      {/* Header: status-chip · start–slut · totaltid */}
      <div className="flex items-center gap-1.5 w-full px-2.5 pt-2 pl-3.5">
        <span
          className={cn(
            "text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded border",
            variant.chip,
          )}
        >
          {STATUS_LABEL[cell.status]}
        </span>
        {hasTimes ? (
          <span className="text-[10.5px] tabular-nums leading-none text-foreground/70 truncate">
            {cell.startTime}–{cell.endTime}
          </span>
        ) : (
          <span className="text-[10.5px] text-muted-foreground">–</span>
        )}
        <span className={cn("ml-auto text-sm tabular-nums font-bold leading-none", variant.total)}>
          {fmtDur(cell.totalMinutes)}
        </span>
      </div>

      {/* Block-rader (samma reportRows som GPS-satelliten) */}
      <div className="flex-1 px-2.5 pt-1.5 pl-3.5">
        {hasRows && (
          <WeekFlowReportRowsMini rows={cell.rows} maxRows={3} compact />
        )}
      </div>

      {/* Footer: sammanfattning + avvikelsebadges */}
      {(cell.normalMinutes > 0 || cell.overtimeMinutes > 0 || cell.travelMinutes > 0 || hasUnknown) && (
        <div className="mt-auto px-2.5 py-1.5 pl-3.5 border-t border-current/10 bg-white/30 flex items-center gap-1.5 text-[10px] tabular-nums">
          <span className="text-foreground/80 truncate">
            <span className="font-semibold">N </span>{fmtDur(cell.normalMinutes)}
            {hasOvertime && (
              <>
                <span className="text-foreground/40"> · </span>
                <span className="font-semibold text-amber-700">Ö </span>
                <span className="text-amber-800">{fmtDur(cell.overtimeMinutes)}</span>
              </>
            )}
            {hasTravel && (
              <>
                <span className="text-foreground/40"> · </span>
                <span className="font-semibold text-blue-700">Resa </span>
                <span className="text-blue-800">{fmtDur(cell.travelMinutes)}</span>
              </>
            )}
          </span>
          {hasUnknown && (
            <span
              className="ml-auto inline-flex items-center gap-0.5 px-1 h-3.5 rounded text-[9px] font-semibold uppercase bg-amber-100 text-amber-800 border border-amber-200"
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
