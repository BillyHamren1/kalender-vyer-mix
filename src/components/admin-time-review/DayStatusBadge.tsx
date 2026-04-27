import { Badge } from '@/components/ui/badge';
import type { DayStatus } from '@/lib/timeReview/dayAggregation';
import { cn } from '@/lib/utils';

const config: Record<DayStatus, { label: string; className: string }> = {
  in_progress: {
    label: 'Pågår',
    className: 'bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300',
  },
  needs_review: {
    label: 'Behöver review',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
  ready: {
    label: 'Redo att godkänna',
    className: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300',
  },
  approved: {
    label: 'Godkänd',
    className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  },
};

export const DayStatusBadge = ({ status }: { status: DayStatus }) => {
  const c = config[status];
  return (
    <Badge variant="outline" className={cn('font-semibold', c.className)}>
      {c.label}
    </Badge>
  );
};
