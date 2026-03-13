import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EconomyStatus } from '@/hooks/useEconomyDashboard';

const STATUS_CONFIG: Record<EconomyStatus, { label: string; className: string }> = {
  'upcoming': { label: 'Kommande', className: 'border-amber-300 text-amber-700 bg-amber-50' },
  'ongoing': { label: 'Pågående', className: 'border-blue-300 text-blue-700 bg-blue-50' },
  'event-completed': { label: 'Event klart', className: 'border-primary/30 text-primary bg-primary/5' },
  'ready-for-invoicing': { label: 'Redo fakturera', className: 'border-green-300 text-green-700 bg-green-50' },
  'partially-invoiced': { label: 'Delvis fakturerad', className: 'border-amber-300 text-amber-700 bg-amber-50' },
  'fully-invoiced': { label: 'Fullt fakturerad', className: 'border-green-300 text-green-700 bg-green-50' },
  'economy-closed': { label: 'Stängd', className: 'bg-muted text-muted-foreground border-border' },
  'risk': { label: 'Risk', className: 'border-destructive/40 text-destructive bg-destructive/5' },
  'missing-data': { label: 'Saknar data', className: 'border-amber-300 text-amber-700 bg-amber-50' },
};

interface Props {
  status: EconomyStatus;
  className?: string;
}

const EconomyStatusBadge: React.FC<Props> = ({ status, className }) => {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium", config.className, className)}>
      {config.label}
    </Badge>
  );
};

export default EconomyStatusBadge;
