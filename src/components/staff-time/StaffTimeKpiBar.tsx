/**
 * StaffTimeKpiBar — premium KPI-rad ovanför veckogrid.
 * Räknar enbart från matrix.rows (samma data som redan finns). Ingen ny datalogik.
 */
import { useMemo } from "react";
import { Users, Clock, AlertTriangle, Inbox, CheckCircle2, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffTimeMatrix } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";

function fmtHours(minutes: number): string {
  if (!minutes || minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface KpiSpec {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "neutral" | "violet" | "amber" | "teal" | "emerald" | "rose";
}

const TONE: Record<KpiSpec["tone"], { card: string; icon: string; value: string }> = {
  neutral: { card: "border-border/60", icon: "bg-slate-100 text-slate-600", value: "text-foreground" },
  violet:  { card: "border-violet-200/70", icon: "bg-violet-100 text-violet-700", value: "text-violet-900" },
  amber:   { card: "border-amber-200/70", icon: "bg-amber-100 text-amber-700", value: "text-amber-900" },
  teal:    { card: "border-teal-200/70", icon: "bg-teal-100 text-teal-700", value: "text-teal-900" },
  emerald: { card: "border-emerald-200/70", icon: "bg-emerald-100 text-emerald-700", value: "text-emerald-900" },
  rose:    { card: "border-rose-200/70", icon: "bg-rose-100 text-rose-700", value: "text-rose-900" },
};

interface Props {
  matrix: StaffTimeMatrix | null;
}

export default function StaffTimeKpiBar({ matrix }: Props) {
  const kpis = useMemo<KpiSpec[]>(() => {
    const rows = matrix?.rows ?? [];
    let totalStaff = rows.length;
    let totalMin = 0;
    let gpsProposalDays = 0;
    let submittedDays = 0;
    let approvedDays = 0;
    let staffWithoutData = 0;

    for (const r of rows) {
      let anyData = false;
      for (const d of r.days) {
        totalMin += d.totalMinutes || 0;
        if (d.status === "gps_proposal") gpsProposalDays++;
        else if (d.status === "submitted_waiting_approval") submittedDays++;
        else if (d.status === "approved") approvedDays++;
        if (d.status !== "empty") anyData = true;
      }
      if (!anyData) staffWithoutData++;
    }

    return [
      { key: "staff", label: "Personal", value: String(totalStaff), hint: "aktiva i org", icon: Users, tone: "neutral" },
      { key: "hours", label: "Timmar denna vecka", value: fmtHours(totalMin), hint: "Summa över alla", icon: Clock, tone: "violet" },
      { key: "review", label: "Behöver granskning", value: String(gpsProposalDays), hint: "GPS-förslag", icon: AlertTriangle, tone: "amber" },
      { key: "submitted", label: "Inskickat", value: String(submittedDays), hint: "Väntar attest", icon: Inbox, tone: "teal" },
      { key: "approved", label: "Attesterat", value: String(approvedDays), hint: "Klart", icon: CheckCircle2, tone: "emerald" },
      { key: "missing", label: "Saknar rapport", value: String(staffWithoutData), hint: "Hela veckan tom", icon: Ban, tone: "rose" },
    ];
  }, [matrix]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-4 pt-4">
      {kpis.map((k) => {
        const Icon = k.icon;
        const tone = TONE[k.tone];
        return (
          <div
            key={k.key}
            className={cn(
              "rounded-xl border bg-card px-3.5 py-3 shadow-sm flex items-start gap-3 transition-colors hover:shadow-md",
              tone.card,
            )}
          >
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", tone.icon)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn("text-xl font-bold tabular-nums leading-none", tone.value)}>{k.value}</div>
              <div className="text-[11.5px] font-medium text-foreground/80 mt-1 truncate">{k.label}</div>
              {k.hint && <div className="text-[10.5px] text-muted-foreground truncate">{k.hint}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
