import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Banknote,
  Receipt,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CalendarCheck,
  PiggyBank,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
type DashboardKPIs = {
  invoicedThisMonth: number;
  readyToInvoice: number;
  forecast30: number;
  forecast90: number;
  totalCostsThisMonth: number;
  projectedMarginPercent: number;
  completedNotFullyInvoiced: number;
  riskProjectCount: number;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(value);

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg?: string;
  trend?: 'positive' | 'negative' | 'neutral';
  highlight?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon, iconBg = 'bg-muted/60', trend, highlight }) => (
  <Card className={cn(
    "border-border/40 transition-shadow hover:shadow-md",
    highlight && "ring-1 ring-destructive/20 border-destructive/30"
  )}>
    <CardContent className="pt-4 pb-3 px-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{title}</p>
          <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
          {subtitle && (
            <p className={cn(
              "text-[11px] flex items-center gap-1 mt-0.5",
              trend === 'positive' ? "text-green-600" :
              trend === 'negative' ? "text-destructive" :
              "text-muted-foreground"
            )}>
              {trend === 'positive' && <TrendingUp className="h-3 w-3" />}
              {trend === 'negative' && <TrendingDown className="h-3 w-3" />}
              {subtitle}
            </p>
          )}
        </div>
        <div className={cn("p-2 rounded-xl shrink-0", iconBg)}>
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

interface Props {
  kpis: DashboardKPIs;
}

const EconomyKpiCards: React.FC<Props> = ({ kpis }) => {
  const cards: KpiCardProps[] = [
    {
      title: 'Fakturerat denna månad',
      value: formatCurrency(kpis.invoicedThisMonth),
      icon: <Banknote className="w-4 h-4 text-primary" />,
      iconBg: 'bg-primary/10',
    },
    {
      title: 'Redo att fakturera',
      value: formatCurrency(kpis.readyToInvoice),
      subtitle: kpis.readyToInvoice > 0 ? 'Kräver åtgärd' : 'Allt fakturerat',
      icon: <Receipt className="w-4 h-4 text-primary" />,
      iconBg: 'bg-primary/10',
      trend: kpis.readyToInvoice > 0 ? 'negative' : 'positive',
    },
    {
      title: 'Prognos 30 dagar',
      value: formatCurrency(kpis.forecast30),
      icon: <TrendingUp className="w-4 h-4 text-primary" />,
      iconBg: 'bg-primary/10',
    },
    {
      title: 'Prognos 90 dagar',
      value: formatCurrency(kpis.forecast90),
      icon: <TrendingUp className="w-4 h-4 text-muted-foreground" />,
      iconBg: 'bg-muted/60',
    },
    {
      title: 'Kostnader denna månad',
      value: formatCurrency(kpis.totalCostsThisMonth),
      icon: <PiggyBank className="w-4 h-4 text-muted-foreground" />,
      iconBg: 'bg-muted/60',
    },
    {
      title: 'Progn. marginal',
      value: `${kpis.projectedMarginPercent.toFixed(1)}%`,
      subtitle: kpis.projectedMarginPercent >= 0 ? 'Positiv' : 'Negativ',
      icon: kpis.projectedMarginPercent >= 0 
        ? <TrendingUp className="w-4 h-4 text-green-600" /> 
        : <TrendingDown className="w-4 h-4 text-destructive" />,
      iconBg: kpis.projectedMarginPercent >= 0 ? 'bg-green-50' : 'bg-destructive/10',
      trend: kpis.projectedMarginPercent >= 0 ? 'positive' : 'negative',
    },
    {
      title: 'Ej fullt fakturerade',
      value: `${kpis.completedNotFullyInvoiced}`,
      subtitle: kpis.completedNotFullyInvoiced > 0 ? 'projekt kräver fakturering' : 'alla fakturerade',
      icon: <CalendarCheck className="w-4 h-4 text-amber-600" />,
      iconBg: 'bg-amber-50',
      trend: kpis.completedNotFullyInvoiced > 0 ? 'negative' : 'positive',
      highlight: kpis.completedNotFullyInvoiced > 3,
    },
    {
      title: 'Riskprojekt',
      value: `${kpis.riskProjectCount}`,
      subtitle: kpis.riskProjectCount > 0 ? 'kräver uppmärksamhet' : 'inga risker',
      icon: <ShieldAlert className="w-4 h-4 text-destructive" />,
      iconBg: kpis.riskProjectCount > 0 ? 'bg-destructive/10' : 'bg-muted/60',
      trend: kpis.riskProjectCount > 0 ? 'negative' : 'positive',
      highlight: kpis.riskProjectCount > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map(card => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  );
};

export default EconomyKpiCards;
