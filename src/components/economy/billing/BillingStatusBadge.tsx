import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BillingStatus } from '@/hooks/useProjectBilling';

const STATUS_CONFIG: Record<BillingStatus, { label: string; className: string }> = {
  draft: {
    label: 'Utkast',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  },
  ready: {
    label: 'Redo att fakturera',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  },
  invoiced: {
    label: 'Fakturerad',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800',
  },
};

interface Props {
  status: BillingStatus;
  className?: string;
}

const BillingStatusBadge: React.FC<Props> = ({ status, className }) => {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
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
