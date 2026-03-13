import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BillingStatus } from '@/hooks/useProjectBilling';

const STATUS_CONFIG: Record<BillingStatus, { label: string; className: string }> = {
  not_ready: {
    label: 'Ej redo',
    className: 'bg-muted text-muted-foreground border-border',
  },
  under_review: {
    label: 'Under granskning',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  },
  ready_to_invoice: {
    label: 'Redo att fakturera',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  },
  invoice_created: {
    label: 'Faktura skapad',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800',
  },
  invoiced: {
    label: 'Fakturerad',
    className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800',
  },
  partially_paid: {
    label: 'Delbetald',
    className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800',
  },
  paid: {
    label: 'Betald',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800',
  },
  overdue: {
    label: 'Förfallen',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

interface Props {
  status: BillingStatus;
  className?: string;
}

const BillingStatusBadge: React.FC<Props> = ({ status, className }) => {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-medium px-2 py-0.5', config.className, className)}
    >
      {config.label}
    </Badge>
  );
};

export default BillingStatusBadge;
