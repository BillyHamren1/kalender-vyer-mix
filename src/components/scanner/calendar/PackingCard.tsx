import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Package,
  PackageOpen,
  Calendar,
  Camera,
  ClipboardCheck,
  Undo2,
} from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { PackingWithBooking } from '@/types/packing';
import type { PackingEntryKind } from '@/hooks/scanner/usePackingsByDate';

interface Props {
  packing: PackingWithBooking;
  kind?: PackingEntryKind; // 'out' (default) | 'in'
  onSelect: (
    packingId: string,
    mode: 'verifying' | 'manual',
    kind: PackingEntryKind,
  ) => void;
}

const getOutBadge = (status: string) => {
  switch (status) {
    case 'in_progress':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground border border-primary/20">
          Pågår
        </span>
      );
    case 'packed':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary border border-primary/30">
          Packad ✓
        </span>
      );
    case 'delivered':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
          Levererad
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
          Planering
        </span>
      );
  }
};

const getInBadge = (status: string) => {
  if (status === 'returned') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
        Retur klar ✓
      </span>
    );
  }
  if (status === 'returning') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800 border border-orange-300 animate-pulse">
        Retur pågår
      </span>
    );
  }
  // delivered → return not started
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200">
      Att returnera
    </span>
  );
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return null;
  try {
    return format(new Date(dateString), 'd MMM', { locale: sv });
  } catch {
    return null;
  }
};

export const PackingCard: React.FC<Props> = ({ packing, kind = 'out', onSelect }) => {
  const isReturn = kind === 'in';

  const displayDate = isReturn
    ? formatDate(packing.booking?.rigdowndate) || formatDate(packing.booking?.eventdate)
    : formatDate(packing.booking?.rigdaydate) || formatDate(packing.booking?.eventdate);

  const Icon = isReturn ? PackageOpen : Package;
  const flowLabel = isReturn ? 'IN · Retur' : 'UT · Pack';

  const handleScan = () => onSelect(packing.id, 'verifying', kind);
  const handleCheck = () => onSelect(packing.id, 'manual', kind);

  return (
    <Card
      className={`p-3 transition-all border-l-4 ${
        isReturn
          ? 'border-l-red-400 bg-red-50/60'
          : 'border-l-green-400 bg-green-50/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${
                isReturn ? 'text-red-700' : 'text-green-700'
              }`}
            >
              {flowLabel}
            </span>
            {packing.booking?.booking_number && (
              <span className="text-[10px] font-mono font-semibold text-primary tracking-wide">
                #{packing.booking.booking_number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Icon
              className={`h-3.5 w-3.5 flex-shrink-0 ${
                isReturn ? 'text-red-600' : 'text-green-700'
              }`}
            />
            <span className="font-medium text-sm truncate">{packing.name}</span>
          </div>
          {packing.booking?.client && (
            <p className="text-xs text-muted-foreground truncate pl-5">
              {packing.booking.client}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isReturn ? getInBadge(packing.status) : getOutBadge(packing.status)}
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
          variant={isReturn ? 'secondary' : 'default'}
          onClick={handleScan}
        >
          {isReturn ? <Undo2 className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
          <span className="text-xs">{isReturn ? 'Scanna in' : 'Scan'}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5 h-9"
          onClick={handleCheck}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          <span className="text-xs">{isReturn ? 'Checka in' : 'Check off'}</span>
        </Button>
      </div>
    </Card>
  );
};

export default PackingCard;
