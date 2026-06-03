/**
 * StaffPayrollReportDayRow — en datumrad i lönerapporten.
 * Renderar block (work/travel/...) som separata rader.
 * Resa-rader får badge för vilket projekt restiden belastar.
 */
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import type { StaffTimeMatrixCell, StaffTimeMatrixRowItem } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import { resolveTravelAllocation } from "@/lib/staff-payroll/travelAllocation";

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtH(min: number): string {
  if (!min || min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function kindLabel(item: StaffTimeMatrixRowItem): string {
  if (item.label && item.label.trim()) return item.label;
  switch (item.kind) {
    case "work": return "Arbete";
    case "travel": return "Resa";
    case "private": return "Privat";
    case "unknown_place": return "Okänd plats";
    case "gps_gap": return "GPS-glapp";
    default: return "Övrigt";
  }
}

interface Props {
  cell: StaffTimeMatrixCell;
  onClick: () => void;
}

function TravelBadge({ cell, item }: { cell: StaffTimeMatrixCell; item: StaffTimeMatrixRowItem }) {
  const alloc = resolveTravelAllocation(cell, item);
  if (alloc.kind === "linked") {
    return (
      <span
        className="inline-flex items-center gap-1 max-w-[260px] rounded-full bg-sky-50 border border-sky-200 text-sky-800 px-2 py-0.5 text-[10.5px] font-medium"
        title={`Belastar: ${alloc.label}`}
      >
        <ArrowRight className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">Belastar: {alloc.label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 text-muted-foreground px-2 py-0.5 text-[10.5px]">
      Ej kopplad
    </span>
  );
}

export default function StaffPayrollReportDayRow({ cell, onClick }: Props) {
  const date = parseISO(cell.date);
  const dayLabel = format(date, "EEE d MMM", { locale: sv });
  const hasRows = cell.rows && cell.rows.length > 0;
  const isEmpty = cell.status === "empty" && !hasRows && !cell.startTime;

  if (isEmpty) {
    return (
      <div className="payroll-day-row grid grid-cols-[120px_1fr_70px_70px_72px] gap-3 px-4 py-1.5 text-left border-b border-border/40 text-[11.5px] text-muted-foreground/70">
        <div className="capitalize">{dayLabel}</div>
        <div className="col-span-4">—</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="payroll-day-row w-full grid grid-cols-[120px_1fr_70px_70px_72px] gap-3 px-4 py-2.5 text-left border-b border-border/40 hover:bg-muted/40 print:hover:bg-transparent text-[12.5px] leading-snug transition-colors"
    >
      <div className="font-semibold text-foreground capitalize pt-0.5">{dayLabel}</div>

      <div className="flex flex-col gap-1 min-w-0">
        {hasRows
          ? cell.rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="truncate text-foreground">{kindLabel(r)}</span>
                {r.kind === "travel" && <TravelBadge cell={cell} item={r} />}
                {r.kind === "travel" && (r.fromLabel || r.toLabel) && (
                  <span className="text-[10.5px] text-muted-foreground truncate">
                    {r.fromLabel ?? "?"} → {r.toLabel ?? "?"}
                  </span>
                )}
              </div>
            ))
          : <span className="text-foreground/80">Arbetsdag</span>}
      </div>

      <div className="text-right tabular-nums text-muted-foreground pt-0.5">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtTime(r.startIso)}</div>)
          : <div>{cell.startTime ?? ""}</div>}
      </div>

      <div className="text-right tabular-nums text-muted-foreground pt-0.5">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtTime(r.endIso)}</div>)
          : <div>{cell.endTime ?? ""}</div>}
      </div>

      <div className="text-right tabular-nums font-semibold text-foreground pt-0.5">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtH(r.minutes)}</div>)
          : <div>{fmtH(cell.totalMinutes)}</div>}
        {hasRows && cell.rows.length > 1 && (
          <div className="mt-1 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
            {fmtH(cell.totalMinutes)}
          </div>
        )}
      </div>
    </button>
  );
}
