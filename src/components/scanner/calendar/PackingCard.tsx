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
  CircleDashed,
  Loader2,
  CheckCircle2,
  Truck,
  RotateCcw,
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

type StatusBadgeProps = {
  icon: React.ReactNode;
  label: string;
  className: string;
  pulse?: boolean;
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ icon, label, className, pulse }) => (
  <span
    className={[
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide shadow-sm border',
      pulse ? 'animate-pulse' : '',
      className,
    ].join(' ')}
  >
    {icon}
    {label}
  </span>
);

const getOutBadge = (status: string) => {
  switch (status) {
    case 'in_progress':
      return (
        <StatusBadge
          icon={<Loader2 className="h-3 w-3 animate-spin" />}
          label="Pågår"
          className="bg-green-700 text-white border-green-800"
        />
      );
    case 'packed':
      return (
        <StatusBadge
          icon={<CheckCircle2 className="h-3 w-3" />}
          label="Klar"
          className="bg-green-100 text-green-900 border-green-400"
        />
      );
    case 'delivered':
      return (
        <StatusBadge
          icon={<Truck className="h-3 w-3" />}
          label="Levererad"
          className="bg-green-50 text-green-800 border-green-300"
        />
      );
    default:
      return (
        <StatusBadge
          icon={<CircleDashed className="h-3 w-3" />}
          label="Ej startad"
          className="bg-green-50 text-green-800 border-green-300"
        />
      );
  }
};

const getInBadge = (status: string) => {
  if (status === 'returned') {
    return (
      <StatusBadge
        icon={<CheckCircle2 className="h-3 w-3" />}
        label="Retur klar"
        className="bg-red-700 text-white border-red-800"
      />
    );
  }
  if (status === 'returning') {
    return (
      <StatusBadge
        icon={<Loader2 className="h-3 w-3 animate-spin" />}
        label="Retur pågår"
        className="bg-red-100 text-red-900 border-red-400"
        pulse
      />
    );
  }
  // delivered → return not started
  return (
    <StatusBadge
      icon={<RotateCcw className="h-3 w-3" />}
      label="Att returnera"
      className="bg-red-50 text-red-800 border-red-300"
    />
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
      className={`p-3 transition-all border-2 ${
        isReturn
          ? 'border-red-500 bg-red-100'
          : 'border-green-500 bg-green-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${
                isReturn ? 'text-red-900' : 'text-green-900'
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
                isReturn ? 'text-red-800' : 'text-green-800'
              }`}
            />
            <span className={`font-medium text-sm truncate ${isReturn ? 'text-red-950' : 'text-green-950'}`}>
              {packing.name}
            </span>
          </div>
          {packing.booking?.client && (
            <p className={`text-xs truncate pl-5 ${isReturn ? 'text-red-900/70' : 'text-green-900/70'}`}>
              {packing.booking.client}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isReturn ? getInBadge(packing.status) : getOutBadge(packing.status)}
          {displayDate && (
            <span className={`text-[10px] flex items-center gap-1 ${isReturn ? 'text-red-900/70' : 'text-green-900/70'}`}>
              <Calendar className="h-3 w-3" />
              {displayDate}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className={`flex-1 gap-1.5 h-9 ${
            isReturn
              ? 'bg-red-700 hover:bg-red-800 text-white'
              : 'bg-green-700 hover:bg-green-800 text-white'
          }`}
          onClick={handleScan}
        >
          {isReturn ? <Undo2 className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
          <span className="text-xs">{isReturn ? 'Scanna in' : 'Scan'}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={`flex-1 gap-1.5 h-9 ${
            isReturn
              ? 'border-red-400 bg-white/80 text-red-900 hover:bg-red-50'
              : 'border-green-400 bg-white/80 text-green-900 hover:bg-green-50'
          }`}
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
