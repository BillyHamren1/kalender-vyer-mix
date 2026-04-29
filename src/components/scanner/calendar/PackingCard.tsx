import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Calendar, Camera, ClipboardCheck } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { PackingWithBooking } from '@/types/packing';

interface Props {
  packing: PackingWithBooking;
  onSelect: (packingId: string, mode: 'verifying' | 'manual') => void;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'in_progress':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground border border-primary/20">
          In progress
        </span>
      );
    case 'packed':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary border border-primary/30">
          Packed ✓
        </span>
      );
    case 'delivered':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
          Delivered
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
          Planning
        </span>
      );
  }
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return null;
  try {
    return format(new Date(dateString), 'd MMM', { locale: sv });
  } catch {
    return null;
  }
};

export const PackingCard: React.FC<Props> = ({ packing, onSelect }) => {
  const displayDate =
    formatDate(packing.booking?.rigdaydate) || formatDate(packing.booking?.eventdate);

  return (
    <Card className="p-3 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm truncate">{packing.name}</span>
          </div>
          {packing.booking?.client && (
            <p className="text-xs text-muted-foreground truncate pl-5">
              {packing.booking.client}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {getStatusBadge(packing.status)}
          {displayDate && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {displayDate}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 gap-1.5 h-9"
          onClick={() => onSelect(packing.id, 'verifying')}
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="text-xs">Scan</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5 h-9"
          onClick={() => onSelect(packing.id, 'manual')}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          <span className="text-xs">Check off</span>
        </Button>
      </div>
    </Card>
  );
};

export default PackingCard;
