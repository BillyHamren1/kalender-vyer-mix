import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Search,
  FileCheck,
  Send,
  AlertTriangle,
  Banknote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectBilling, BillingStatus } from '@/hooks/useProjectBilling';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

type FilterTab = 'all' | BillingStatus;

interface KpiDef {
  title: string;
  amount: number;
  count: number;
  icon: React.ReactNode;
  iconBg: string;
  highlight?: boolean;
  filterKey: FilterTab;
}

interface Props {
  underReview: ProjectBilling[];
  readyToInvoice: ProjectBilling[];
  invoiced: ProjectBilling[];
  overdue: ProjectBilling[];
  paidThisMonth: ProjectBilling[];
  onFilterClick?: (filter: FilterTab) => void;
  activeFilter?: FilterTab;
}

const BillingKpiCards: React.FC<Props> = ({
  underReview,
  readyToInvoice,
  invoiced,
  overdue,
  paidThisMonth,
  onFilterClick,
  activeFilter,
}) => {
  const sum = (items: ProjectBilling[], field: 'invoiceable_amount' | 'invoiced_amount') =>
    items.reduce((s, p) => s + (p[field] ?? 0), 0);

  const kpis: KpiDef[] = [
    {
      title: 'Att granska',
      amount: sum(underReview, 'invoiceable_amount'),
      count: underReview.length,
      icon: <Search className="w-4 h-4 text-amber-600" />,
      iconBg: 'bg-amber-50 dark:bg-amber-950/30',
      filterKey: 'under_review',
    },
    {
      title: 'Redo att fakturera',
      amount: sum(readyToInvoice, 'invoiceable_amount'),
      count: readyToInvoice.length,
      icon: <FileCheck className="w-4 h-4 text-blue-600" />,
      iconBg: 'bg-blue-50 dark:bg-blue-950/30',
      filterKey: 'ready_to_invoice',
    },
    {
      title: 'Skickat, obetalt',
      amount: sum(invoiced, 'invoiced_amount'),
      count: invoiced.length,
      icon: <Send className="w-4 h-4 text-purple-600" />,
      iconBg: 'bg-purple-50 dark:bg-purple-950/30',
      filterKey: 'invoiced',
    },
    {
      title: 'Förfallet',
      amount: sum(overdue, 'invoiced_amount'),
      count: overdue.length,
      icon: <AlertTriangle className="w-4 h-4 text-destructive" />,
      iconBg: 'bg-destructive/10',
      highlight: overdue.length > 0,
      filterKey: 'overdue',
    },
    {
      title: 'Inbetalt denna månad',
      amount: sum(paidThisMonth, 'invoiced_amount'),
      count: paidThisMonth.length,
      icon: <Banknote className="w-4 h-4 text-green-600" />,
      iconBg: 'bg-green-50 dark:bg-green-950/30',
      filterKey: 'paid',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((kpi) => {
        const isActive = activeFilter === kpi.filterKey;
        return (
          <Card
            key={kpi.title}
            onClick={() => onFilterClick?.(isActive ? 'all' : kpi.filterKey)}
            className={cn(
              'border-border/40 transition-all cursor-pointer hover:shadow-md',
              kpi.highlight && 'ring-1 ring-destructive/20 border-destructive/30',
              isActive && 'ring-1 ring-primary/30 border-primary/40 shadow-md'
            )}
          >
            <CardContent className="pt-4 pb-3.5 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">
                    {kpi.title}
                  </p>
                  <p className="text-xl font-bold text-foreground leading-none mt-1.5">
                    {formatCurrency(kpi.amount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-1.5">
                    {kpi.count} {kpi.count === 1 ? 'projekt' : 'projekt'}
                  </p>
                </div>
                <div className={cn('p-2.5 rounded-xl shrink-0', kpi.iconBg)}>
                  {kpi.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default BillingKpiCards;
