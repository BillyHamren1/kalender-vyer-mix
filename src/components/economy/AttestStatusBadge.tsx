import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type AttestStatus = 'imported' | 'needs_review' | 'linked' | 'attested' | 'sent_to_booking' | 'rejected';
export type SyncStatus = 'pending' | 'sent' | 'confirmed' | 'failed';

const ATTEST_CONFIG: Record<AttestStatus, { label: string; className: string }> = {
  imported: {
    label: 'Ny',
    className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  },
  needs_review: {
    label: 'Att granska',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  },
  linked: {
    label: 'Kopplad',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  },
  attested: {
    label: 'Attesterad',
    className: 'bg-primary/5 text-primary border-primary/30 dark:bg-primary/10 dark:text-primary dark:border-primary/20',
  },
  sent_to_booking: {
    label: 'Skickad',
    className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800',
  },
  rejected: {
    label: 'Avvisad',
    className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
  },
};

const SYNC_CONFIG: Record<SyncStatus, { label: string; className: string }> = {
  pending: {
    label: 'Väntar',
    className: 'bg-muted text-muted-foreground border-border',
  },
  sent: {
    label: 'Skickad',
    className: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  },
  confirmed: {
    label: 'Bekräftad',
    className: 'bg-teal-50 text-teal-600 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-800',
  },
  failed: {
    label: 'Misslyckad',
    className: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
  },
};

interface AttestBadgeProps {
  status: AttestStatus;
  className?: string;
}

export const AttestStatusBadge: React.FC<AttestBadgeProps> = ({ status, className }) => {
  const config = ATTEST_CONFIG[status];
  if (!config) return null;
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium px-2 py-0.5', config.className, className)}>
      {config.label}
    </Badge>
  );
};

interface SyncBadgeProps {
  status: SyncStatus;
  className?: string;
}

export const SyncStatusBadge: React.FC<SyncBadgeProps> = ({ status, className }) => {
  const config = SYNC_CONFIG[status];
  if (!config) return null;
  return (
    <Badge variant="outline" className={cn('text-[9px] font-medium px-1.5 py-0', config.className, className)}>
      {config.label}
    </Badge>
  );
};
