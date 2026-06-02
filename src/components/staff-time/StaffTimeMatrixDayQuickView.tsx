/**
 * StaffTimeMatrixDayQuickView — kompakt detaljvy som renderar EXAKT samma
 * matriscell-data som veckomatrisen redan har i minne. Ingen ny nätverks-
 * trafik, ingen parallell GPS-bygg.
 *
 * Single-pipeline: `cell.rows` kommer från
 *   get-staff-time-week-matrix → resolveStaffDayReportSummariesBatch
 *   → cache.display_blocks_json (fallback report_candidate_blocks_json)
 *
 * Visar:
 *   - Status-badge + start/slut + total/normal/övertid/resa
 *   - Tidslinje (WeekFlowReportRowsMini, samma renderare som mini-cellen)
 *   - Knapp för att öppna GPS-satellitkartan (om användaren vill se råpings)
 */
import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  gps_proposal: "GPS-förslag",
  submitted_waiting_approval: "Väntar godkännande",
  correction_requested: "Komplettering begärd",
  approved: "Attesterad",
  empty: "Ingen data",
};

interface Props {
  cell: StaffTimeMatrixCell;
  staffName: string;
  onOpenSatellite: () => void;
}

export default function StaffTimeMatrixDayQuickView({ cell, staffName, onOpenSatellite }: Props) {
  const hasRows = (cell.rows?.length ?? 0) > 0;
  const hasTotals =
    cell.totalMinutes > 0 || cell.workMinutes > 0 || cell.travelMinutes > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 border-b pb-3">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {staffName} · {cell.date}
          </span>
          <span className="text-sm font-semibold">{STATUS_LABEL[cell.status]}</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Tid
            </span>
            <span className="tabular-nums font-semibold">
              {cell.startTime ?? "–"} – {cell.endTime ?? "–"}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="tabular-nums font-semibold">{fmtDur(cell.totalMinutes)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Normal
            </span>
            <span className="tabular-nums">{fmtDur(cell.normalMinutes)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Övertid
            </span>
            <span className="tabular-nums">{fmtDur(cell.overtimeMinutes)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Resa
            </span>
            <span className="tabular-nums">{fmtDur(cell.travelMinutes)}</span>
          </div>
        </div>
      </div>

      {cell.reviewComment && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="font-semibold">Granskningskommentar: </span>
          {cell.reviewComment}
        </div>
      )}

      {hasRows ? (
        <div className="rounded-md border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Tidslinje ({cell.rows.length} rader)
          </div>
          <WeekFlowReportRowsMini rows={cell.rows} maxRows={cell.rows.length} compact={false} />
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground text-center">
          {hasTotals
            ? "Cachen har totaltid men inga tidslinje-block ännu (förmodligen äldre cache-rad utan display_blocks_json). Öppna GPS-kartan för rådata."
            : "Inga GPS-data eller rapporterad tid för dagen."}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onOpenSatellite}>
          <MapIcon className="h-4 w-4 mr-1" /> Öppna GPS-satellitkartan
        </Button>
      </div>
    </div>
  );
}
