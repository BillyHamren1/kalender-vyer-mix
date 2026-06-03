/**
 * StaffPayrollReportDayRow — en datumrad i lönerapporten.
 * Visar varje block (work/travel/...) som en egen rad. Klick = öppna dag-snabbvy.
 */
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import type { StaffTimeMatrixCell, StaffTimeMatrixRowItem } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";

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

export default function StaffPayrollReportDayRow({ cell, onClick }: Props) {
  const date = parseISO(cell.date);
  const dayLabel = format(date, "EEE d MMM", { locale: sv });
  const hasRows = cell.rows && cell.rows.length > 0;
  const isEmpty = cell.status === "empty" && !hasRows && !cell.startTime;

  return (
    <button
      type="button"
      onClick={onClick}
      className="payroll-day-row w-full grid grid-cols-[120px_1fr_70px_70px_72px] gap-3 px-4 py-2 text-left border-b border-neutral-200 hover:bg-neutral-50 print:hover:bg-transparent text-[12px] leading-snug"
    >
      <div className="font-medium text-neutral-900 capitalize">{dayLabel}</div>

      <div className="flex flex-col gap-0.5 min-w-0">
        {isEmpty && <span className="text-neutral-400">—</span>}
        {hasRows
          ? cell.rows.map((r, i) => (
              <div key={i} className="flex items-baseline gap-2 min-w-0">
                <span className="truncate text-neutral-900">{kindLabel(r)}</span>
                {(r.fromLabel || r.toLabel) && r.kind === "travel" && (
                  <span className="text-[11px] text-neutral-500 truncate">
                    {r.fromLabel ?? "?"} → {r.toLabel ?? "?"}
                  </span>
                )}
              </div>
            ))
          : !isEmpty && (
              <span className="text-neutral-700">Arbetsdag</span>
            )}
      </div>

      <div className="text-right tabular-nums text-neutral-700">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtTime(r.startIso)}</div>)
          : <div>{cell.startTime ?? ""}</div>}
      </div>

      <div className="text-right tabular-nums text-neutral-700">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtTime(r.endIso)}</div>)
          : <div>{cell.endTime ?? ""}</div>}
      </div>

      <div className="text-right tabular-nums font-medium text-neutral-900">
        {hasRows
          ? cell.rows.map((r, i) => <div key={i}>{fmtH(r.minutes)}</div>)
          : <div>{isEmpty ? "" : fmtH(cell.totalMinutes)}</div>}
        {hasRows && cell.rows.length > 1 && (
          <div className="mt-0.5 pt-0.5 border-t border-neutral-200 text-[11px] text-neutral-600">
            {fmtH(cell.totalMinutes)}
          </div>
        )}
      </div>
    </button>
  );
}
