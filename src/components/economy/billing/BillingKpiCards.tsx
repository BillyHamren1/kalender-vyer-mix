import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Search,
  CheckCircle2,
  Lock,
  FileWarning,
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
  filterKey: FilterTab;
}

interface Props {
  draft: ProjectBilling[];
  readyToClose: ProjectBilling[];
  closedThisMonth: ProjectBilling[];
  uninvoicedValue: number;
  onFilterClick?: (filter: FilterTab) => void;
  activeFilter?: FilterTab;
}

const BillingKpiCards: React.FC<Props> = ({
  draft,
  readyToClose,
  closedThisMonth,
  uninvoicedValue,
  onFilterClick,
  activeFilter,
}) => {
  const sum = (items: ProjectBilling[], field: 'invoiceable_amount' | 'invoiced_amount') =>
    items.reduce((s, p) => s + (p[field] ?? 0), 0);

  const kpis: KpiDef[] = [
    {
      title: 'Att granska',
      amount: sum(draft, 'invoiceable_amount'),
      count: draft.length,
      icon: <Search className="w-4 h-4 text-amber-600" />,
      iconBg: 'bg-amber-50 dark:bg-amber-950/30',
      filterKey: 'draft',
    },
    {
      title: 'Klara att stänga',
      amount: sum(readyToClose, 'invoiceable_amount'),
      count: readyToClose.length,
      icon: <CheckCircle2 className="w-4 h-4 text-blue-600" />,
      iconBg: 'bg-blue-50 dark:bg-blue-950/30',
      filterKey: 'ready_for_handover',
    },
    {
      title: 'Stängda denna månad',
      amount: sum(closedThisMonth, 'invoiceable_amount'),
      count: closedThisMonth.length,
      icon: <Lock className="w-4 h-4 text-green-600" />,
      iconBg: 'bg-green-50 dark:bg-green-950/30',
      filterKey: 'handed_over_to_booking',
    },
    {
      title: 'Ej stängt värde',
      amount: uninvoicedValue,
      count: draft.length + readyToClose.length,
      icon: <FileWarning className="w-4 h-4 text-muted-foreground" />,
      iconBg: 'bg-muted',
      filterKey: 'all',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((kpi) => {
        const isActive = activeFilter === kpi.filterKey;
        return (
          <Card
            key={kpi.title}
            onClick={() => onFilterClick?.(isActive ? 'all' : kpi.filterKey)}
            className={cn(
              'border-border/40 transition-all cursor-pointer hover:shadow-md',
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
