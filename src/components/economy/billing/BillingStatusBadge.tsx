import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BillingStatus } from '@/hooks/useProjectBilling';

const STATUS_CONFIG: Record<BillingStatus, { label: string; className: string }> = {
  draft: {
    label: 'Under arbete',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  },
  needs_completion: {
    label: 'Kräver komplettering',
    className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800',
  },
  ready_for_handover: {
    label: 'Klar att stänga',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  },
  handed_over_to_booking: {
    label: 'Stängd',
    className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800',
  },
  invoiced_in_booking: {
    label: 'Fakturerad i Booking',
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
