import React from "react";
import { Card } from "@/components/ui/card";
import { CalendarRange, Users, CheckCircle2, AlertTriangle, Coffee, Clock } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { formatMinutes, type PayrollMonthReportData } from "@/hooks/staff/usePayrollMonthReport";

interface Props {
  data: PayrollMonthReportData | undefined;
  month: Date;
}

interface CardDef {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "emerald" | "amber" | "sky" | "rose";
}

const TONE: Record<CardDef["tone"], string> = {
  default: "bg-card border-border/40",
  emerald: "bg-emerald-500/5 border-emerald-500/30",
  amber: "bg-amber-500/5 border-amber-500/30",
  sky: "bg-sky-500/5 border-sky-500/30",
  rose: "bg-rose-500/5 border-rose-500/30",
};

const ICON_TONE: Record<CardDef["tone"], string> = {
  default: "text-muted-foreground",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  sky: "text-sky-600",
  rose: "text-rose-600",
};

const PayrollMonthSummaryCards: React.FC<Props> = ({ data, month }) => {
  const totals = data?.totals;
  const periodLabel = `${format(new Date(data?.monthStart ?? month), "d MMM", { locale: sv })} – ${format(
    new Date(data?.monthEnd ?? month),
    "d MMM yyyy",
    { locale: sv },
  )}`;

  const cards: CardDef[] = [
    {
      label: "Godkända timmar",
      value: formatMinutes(totals?.totalWorkMinutes ?? 0),
      icon: Clock,
      tone: "emerald",
    },
    {
      label: "Personal",
      value: String(totals?.staffCount ?? 0),
      icon: Users,
      tone: "sky",
    },
    {
      label: "Godkända dagar",
      value: String(totals?.approvedDayCount ?? 0),
      icon: CheckCircle2,
      tone: "emerald",
    },
    {
      label: "Ej redo / saknas",
      value: String(totals?.notReadyDayCount ?? 0),
      icon: AlertTriangle,
      tone: (totals?.notReadyDayCount ?? 0) > 0 ? "amber" : "default",
    },
    {
      label: "Total rast",
      value: formatMinutes(totals?.totalBreakMinutes ?? 0),
      icon: Coffee,
      tone: "default",
    },
    {
      label: "Period",
      value: periodLabel,
      icon: CalendarRange,
      tone: "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 px-4 py-3">
      {cards.map((c) => (
        <Card key={c.label} className={`p-3 ${TONE[c.tone]}`}>
          <div className="flex items-center gap-2">
            <c.icon className={`h-4 w-4 ${ICON_TONE[c.tone]}`} />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </span>
          </div>
          <div className="mt-1.5 text-lg font-semibold tabular-nums">{c.value}</div>
        </Card>
      ))}
    </div>
  );
};

export default PayrollMonthSummaryCards;
