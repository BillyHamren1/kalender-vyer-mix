/**
 * StaffPayrollReportSheet — en anställds tidrapport för veckan.
 * Rent papper-utseende, en sektion per anställd, summa-footer.
 */
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { StaffTimeMatrixRow } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import StaffPayrollReportDayRow from "./StaffPayrollReportDayRow";
import { countWeekStats, rowWeekStatus } from "@/lib/staff-payroll/payrollCsvExport";

function fmtH(min: number): string {
  if (!min || min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const TONE: Record<string, string> = {
  neutral: "text-neutral-500",
  pending: "text-amber-700",
  approved: "text-emerald-700",
  warn: "text-rose-700",
};

interface Props {
  row: StaffTimeMatrixRow;
  weekStart: Date;
  weekEnd: Date;
  onOpenDay: (staffId: string, date: string) => void;
}

export default function StaffPayrollReportSheet({ row, weekStart, weekEnd, onOpenDay }: Props) {
  const stats = countWeekStats(row);
  const status = rowWeekStatus(row);

  return (
    <article className="payroll-sheet bg-white border border-neutral-200 rounded-sm shadow-sm print:shadow-none mx-auto w-full max-w-[820px] mb-6 print:mb-0">
      {/* Header — papper-stil */}
      <header className="px-6 pt-6 pb-4 border-b-2 border-neutral-900">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
              Tidrapport
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 mt-0.5">{row.staffName}</h2>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
              Vecka {format(weekStart, "I", { locale: sv })} · {format(weekStart, "yyyy")}
            </div>
            <div className="text-[13px] text-neutral-700 tabular-nums mt-0.5">
              {format(weekStart, "d MMM", { locale: sv })} – {format(weekEnd, "d MMM yyyy", { locale: sv })}
            </div>
          </div>
        </div>
      </header>

      {/* Kolumnhuvuden */}
      <div className="grid grid-cols-[120px_1fr_70px_70px_72px] gap-3 px-4 py-2 border-b border-neutral-300 text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold">
        <div>Datum</div>
        <div>Aktivitet</div>
        <div className="text-right">Start</div>
        <div className="text-right">Slut</div>
        <div className="text-right">Tim</div>
      </div>

      {/* Datumrader */}
      <div>
        {row.days.map((cell) => (
          <StaffPayrollReportDayRow
            key={cell.date}
            cell={cell}
            onClick={() => onOpenDay(row.staffId, cell.date)}
          />
        ))}
      </div>

      {/* Footer / summa */}
      <footer className="px-6 pt-4 pb-5 border-t-2 border-neutral-900">
        <div className="grid grid-cols-4 gap-4 text-[12px]">
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500">Normal</div>
            <div className="text-base font-semibold tabular-nums text-neutral-900">{fmtH(stats.normal)}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500">Övertid</div>
            <div className="text-base font-semibold tabular-nums text-neutral-900">{fmtH(stats.overtime)}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500">Resa</div>
            <div className="text-base font-semibold tabular-nums text-neutral-900">{fmtH(stats.travel)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500">Totalt</div>
            <div className="text-base font-bold tabular-nums text-neutral-900">{fmtH(stats.total)}</div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-200 flex items-baseline justify-between text-[11.5px]">
          <span className="text-neutral-500">
            {stats.reportedDays} {stats.reportedDays === 1 ? "rapporterad dag" : "rapporterade dagar"}
          </span>
          <span className={`font-medium ${TONE[status.tone]}`}>
            Status: {status.label}
          </span>
        </div>
      </footer>
    </article>
  );
}
