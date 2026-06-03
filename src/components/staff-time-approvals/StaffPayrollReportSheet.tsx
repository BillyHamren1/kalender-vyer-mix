/**
 * StaffPayrollReportSheet — premiumkort per anställd för veckan.
 *
 * Layout: bred container, vänsterkolumn = tidslinje, högerkolumn = projekt/dag.
 * Print: payroll-print.css kollapsar till smalt A4-papper utan högerpanel.
 */
import { useMemo } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { StaffTimeMatrixRow } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";
import StaffPayrollReportDayRow from "./StaffPayrollReportDayRow";
import ReportKpiBadges from "./ReportKpiBadges";
import ReportProjectDayPanel from "./ReportProjectDayPanel";
import { countWeekStats, rowWeekStatus } from "@/lib/staff-payroll/payrollCsvExport";
import { buildReportProjectDaySummary } from "@/lib/staff-payroll/reportProjectDaySummary";

const STATUS_STYLE: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-rose-50 text-rose-800 border-rose-200",
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
  const summary = useMemo(() => buildReportProjectDaySummary(row), [row]);

  return (
    <article className="payroll-sheet bg-card border border-border/60 rounded-2xl shadow-sm print:shadow-none print:border-neutral-300 print:rounded-none w-full mb-6 print:mb-0 overflow-hidden">
      {/* Header */}
      <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-border/60 bg-gradient-to-b from-violet-500/[0.04] to-transparent">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Tidrapport
            </div>
            <h2 className="text-xl sm:text-[22px] font-bold text-foreground mt-0.5 leading-tight">
              {row.staffName}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">
                Vecka {format(weekStart, "I", { locale: sv })} · {format(weekStart, "yyyy")}
              </span>
              <span className="opacity-50">·</span>
              <span className="tabular-nums">
                {format(weekStart, "d MMM", { locale: sv })} – {format(weekEnd, "d MMM yyyy", { locale: sv })}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[status.tone] ?? STATUS_STYLE.neutral}`}
              >
                {status.label}
              </span>
            </div>
          </div>

          <ReportKpiBadges
            normal={stats.normal}
            overtime={stats.overtime}
            travel={stats.travel}
            total={stats.total}
          />
        </div>
      </header>

      {/* Body grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-0 lg:gap-6 lg:p-6">
        {/* Tidslinje */}
        <section className="min-w-0">
          <div className="grid grid-cols-[120px_1fr_70px_70px_72px] gap-3 px-4 py-2 border-b border-border/60 text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted/30 lg:rounded-t-xl">
            <div>Datum</div>
            <div>Aktivitet</div>
            <div className="text-right">Start</div>
            <div className="text-right">Slut</div>
            <div className="text-right">Tim</div>
          </div>
          <div className="lg:rounded-b-xl lg:border lg:border-t-0 lg:border-border/60 overflow-hidden">
            {row.days.map((cell) => (
              <StaffPayrollReportDayRow
                key={cell.date}
                cell={cell}
                staffId={row.staffId}
                onClick={() => onOpenDay(row.staffId, cell.date)}
              />
            ))}
          </div>
        </section>

        {/* Projekt-summering */}
        <div className="px-4 py-4 lg:p-0">
          <ReportProjectDayPanel days={summary} />
        </div>
      </div>

      {/* Footer */}
      <footer className="px-5 sm:px-6 py-3 border-t border-border/60 bg-muted/20 flex flex-wrap items-baseline justify-between gap-2 text-[11.5px]">
        <span className="text-muted-foreground">
          {stats.reportedDays} {stats.reportedDays === 1 ? "rapporterad dag" : "rapporterade dagar"}
        </span>
        <span className="text-muted-foreground">
          Totalt arbete <span className="tabular-nums font-semibold text-foreground">{Math.floor((stats.normal + stats.overtime) / 60)}:{String((stats.normal + stats.overtime) % 60).padStart(2, "0")}</span>
          {" · "}
          Resa <span className="tabular-nums font-semibold text-foreground">{Math.floor(stats.travel / 60)}:{String(stats.travel % 60).padStart(2, "0")}</span>
        </span>
      </footer>
    </article>
  );
}
