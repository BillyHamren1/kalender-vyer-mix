import React from "react";
import { Card } from "@/components/ui/card";
import {
  Users,
  CheckCircle2,
  Coffee,
  Clock,
  Wallet,
  ClipboardCheck,
} from "lucide-react";
import {
  formatMinutes,
  formatHoursDecimal,
  type PayrollMonthReportData,
} from "@/hooks/staff/usePayrollMonthReport";

interface Props {
  data: PayrollMonthReportData | undefined;
}

interface CardDef {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "emerald" | "amber" | "sky" | "violet";
}

const TONE: Record<CardDef["tone"], string> = {
  default: "bg-card border-border/40",
  emerald: "bg-emerald-500/5 border-emerald-500/30",
  amber: "bg-amber-500/5 border-amber-500/30",
  sky: "bg-sky-500/5 border-sky-500/30",
  violet: "bg-violet-500/5 border-violet-500/30",
};

const ICON_TONE: Record<CardDef["tone"], string> = {
  default: "text-muted-foreground",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  sky: "text-sky-600",
  violet: "text-violet-600",
};

const PayrollMonthSummaryCards: React.FC<Props> = ({ data }) => {
  const totals = data?.totals;
  const totalMin = totals?.totalMinutes ?? 0;

  const cards: CardDef[] = [
    {
      label: "Godkända timmar",
      value: formatMinutes(totalMin),
      sub: `${formatHoursDecimal(totalMin)} h totalt`,
      icon: Clock,
      tone: "emerald",
    },
    {
      label: "Personal",
      value: String(totals?.staffCount ?? 0),
      sub: "personer med godkänd tid",
      icon: Users,
      tone: "sky",
    },
    {
      label: "Godkända dagar",
      value: String(totals?.approvedDaysCount ?? 0),
      sub: "dagar i månaden",
      icon: CheckCircle2,
      tone: "emerald",
    },
    {
      label: "Rast",
      value: formatMinutes(totals?.totalBreakMinutes ?? 0),
      sub: "total rast i månaden",
      icon: Coffee,
      tone: "default",
    },
    {
      label: "Godkänd för utbetalning",
      value: String(totals?.payrollApprovedDaysCount ?? 0),
      sub: "dagar klara för lön",
      icon: Wallet,
      tone: "violet",
    },
    {
      label: "Endast godkänd",
      value: String(totals?.approvedOnlyDaysCount ?? 0),
      sub: "väntar på utbetalning",
      icon: ClipboardCheck,
      tone: (totals?.approvedOnlyDaysCount ?? 0) > 0 ? "amber" : "default",
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
          {c.sub && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">{c.sub}</div>
          )}
        </Card>
      ))}
    </div>
  );
};

export default PayrollMonthSummaryCards;
