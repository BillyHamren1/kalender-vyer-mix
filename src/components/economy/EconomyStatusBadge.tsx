import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EconomyProjectStatus } from '@/types/economyOverview';
import {
  getProjectLifecycleStatus,
  LIFECYCLE_STATUS_LABEL,
  type ProjectLifecycleStatus,
} from '@/lib/economy/projectLifecycleStatus';

const LIFECYCLE_CLASS: Record<ProjectLifecycleStatus, string> = {
  active: 'border-primary/30 text-primary bg-primary/5',
  closed: 'bg-muted text-muted-foreground border-border',
  cancelled: 'border-destructive/40 text-destructive bg-destructive/5',
};

/**
 * Map gamla härledda EconomyProjectStatus → ny enkel livscykel.
 * Behållen så att komponenten kan användas av äldre call-sites
 * utan att tappa typsäkerhet.
 */
function statusToLifecycle(status: ProjectLifecycleStatus | EconomyProjectStatus): ProjectLifecycleStatus {
  if (status === 'active' || status === 'closed' || status === 'cancelled') return status;
  if (status === 'economy-closed') return 'closed';
  return 'active';
}

interface Props {
  /** Nya användare: skicka 'active' | 'closed' | 'cancelled'. Gamla EconomyProjectStatus mappas automatiskt. */
  status: ProjectLifecycleStatus | EconomyProjectStatus;
  className?: string;
}

const EconomyStatusBadge: React.FC<Props> = ({ status, className }) => {
  const lifecycle = statusToLifecycle(status);
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', LIFECYCLE_CLASS[lifecycle], className)}>
      {LIFECYCLE_STATUS_LABEL[lifecycle]}
    </Badge>
  );
};

export default EconomyStatusBadge;
export { getProjectLifecycleStatus };
