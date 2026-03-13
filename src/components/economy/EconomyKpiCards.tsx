import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Banknote,
  Receipt,
  TrendingUp,
  TrendingDown,
  CalendarCheck,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EconomyDashboardSummary } from '@/types/economyOverview';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(value);

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  trend?: 'positive' | 'negative' | 'neutral';
  highlight?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon, iconBg, trend, highlight }) => (
  <Card className={cn(
    "border-border/40 transition-all hover:shadow-md group",
    highlight && "ring-1 ring-destructive/20 border-destructive/30"
  )}>
    <CardContent className="pt-4 pb-3.5 px-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">{title}</p>
          <p className="text-xl font-bold text-foreground leading-none mt-1.5">{value}</p>
          <p className={cn(
            "text-[11px] leading-tight mt-1.5 flex items-center gap-1",
            trend === 'positive' ? "text-green-600" :
            trend === 'negative' ? "text-destructive" :
            "text-muted-foreground"
          )}>
            {trend === 'positive' && <TrendingUp className="h-3 w-3 shrink-0" />}
            {trend === 'negative' && <TrendingDown className="h-3 w-3 shrink-0" />}
            {subtitle}
          </p>
        </div>
        <div className={cn("p-2.5 rounded-xl shrink-0", iconBg)}>
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

interface Props {
  summary: EconomyDashboardSummary;
}

const EconomyKpiCards: React.FC<Props> = ({ summary }) => {
  const cards: KpiCardProps[] = [
    {
      title: 'Fakturerat denna månad',
      value: formatCurrency(summary.invoicedThisMonth),
      subtitle: 'baserat på registrerade fakturor',
      icon: <Banknote className="w-4 h-4 text-primary" />,
      iconBg: 'bg-primary/10',
    },
    {
      title: 'Redo att fakturera',
      value: formatCurrency(summary.readyToInvoiceAmount),
      subtitle: summary.readyToInvoiceAmount > 0
        ? `${summary.readyForInvoicingCount} projekt bör faktureras nu`
        : 'allt fakturerat',
      icon: <Receipt className="w-4 h-4 text-primary" />,
      iconBg: 'bg-primary/10',
      trend: summary.readyToInvoiceAmount > 0 ? 'negative' : 'positive',
    },
    {
      title: 'Prognos 30 dagar',
      value: formatCurrency(summary.projectedRevenue30),
      subtitle: 'säker + trolig prognos',
      icon: <TrendingUp className="w-4 h-4 text-primary" />,
      iconBg: 'bg-primary/10',
    },
    {
      title: 'Prognos 90 dagar',
      value: formatCurrency(summary.projectedRevenue90),
      subtitle: 'säker + trolig prognos',
      icon: <TrendingUp className="w-4 h-4 text-muted-foreground" />,
      iconBg: 'bg-muted/60',
    },
    {
      title: 'Riskprojekt',
      value: `${summary.riskProjectCount}`,
      subtitle: summary.riskProjectCount > 0 ? 'kräver uppföljning' : 'inga risker',
      icon: <ShieldAlert className="w-4 h-4 text-destructive" />,
      iconBg: summary.riskProjectCount > 0 ? 'bg-destructive/10' : 'bg-muted/60',
      trend: summary.riskProjectCount > 0 ? 'negative' : 'positive',
      highlight: summary.riskProjectCount > 0,
    },
    {
      title: 'Avslutade ej stängda',
      value: `${summary.completedNotFullyInvoicedCount}`,
      subtitle: summary.completedNotFullyInvoicedCount > 0
        ? 'avslutade men ej ekonomiskt stängda'
        : 'alla är stängda',
      icon: <CalendarCheck className="w-4 h-4 text-amber-600" />,
      iconBg: 'bg-amber-50',
      trend: summary.completedNotFullyInvoicedCount > 0 ? 'negative' : 'positive',
      highlight: summary.completedNotFullyInvoicedCount > 3,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(card => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  );
};

export default EconomyKpiCards;
