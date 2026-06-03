/**
 * ReportProjectDayPanel — högerpanel som visar tid per projekt och dag.
 * Bygger från buildReportProjectDaySummary, så siffrorna matchar raderna.
 */
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { Plane } from "lucide-react";
import type { ProjectDaySummaryDay } from "@/lib/staff-payroll/reportProjectDaySummary";

function fmtH(min: number): string {
  if (!min || min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

interface Props {
  days: ProjectDaySummaryDay[];
}

export default function ReportProjectDayPanel({ days }: Props) {
  const visible = days.filter((d) => d.projects.length > 0);

  return (
    <aside className="payroll-no-print rounded-2xl border border-border/60 bg-muted/40 p-4 lg:sticky lg:top-4 self-start">
      <div className="text-[10.5px] uppercase tracking-[0.18em] font-semibold text-muted-foreground mb-3">
        Tid per projekt och dag
      </div>

      {visible.length === 0 ? (
        <div className="text-[12px] text-muted-foreground py-2">Inga projekt registrerade.</div>
      ) : (
        <div className="space-y-4">
          {visible.map((day) => {
            const date = parseISO(day.date);
            return (
              <div key={day.date}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="text-[12.5px] font-semibold capitalize text-foreground">
                    {format(date, "EEE d MMM", { locale: sv })}
                  </div>
                  <div className="text-[11px] tabular-nums text-muted-foreground">
                    {fmtH(day.totalMinutes)}
                  </div>
                </div>
                <div className="space-y-1">
                  {day.projects.map((p) => (
                    <div
                      key={p.key}
                      className={`flex items-baseline gap-2 rounded-md px-2 py-1.5 text-[12px] ${
                        p.unlinked ? "bg-amber-50/60 border border-amber-100" : "bg-card border border-border/40"
                      }`}
                    >
                      <span className={`flex-1 min-w-0 truncate ${p.unlinked ? "text-amber-900 italic" : "text-foreground"}`}>
                        {p.label}
                      </span>
                      {p.travelMinutes > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-1.5 py-0.5">
                          <Plane className="h-2.5 w-2.5" />
                          {fmtH(p.travelMinutes)}
                        </span>
                      )}
                      <span className="tabular-nums font-medium text-foreground">
                        {fmtH(p.totalMinutes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
