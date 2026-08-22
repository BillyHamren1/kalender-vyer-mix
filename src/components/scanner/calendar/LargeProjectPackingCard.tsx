import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, Package, PackageOpen, ChevronRight, Loader2, CheckCircle2, CircleDashed } from 'lucide-react';
import type { PackingWithBooking } from '@/types/packing';
import type { PackingEntryKind } from '@/hooks/scanner/usePackingsByDate';

interface Props {
  largeProjectId: string;
  largeProjectName: string;
  kind: PackingEntryKind;
  packings: PackingWithBooking[];
  onOpen: (
    largeProjectId: string,
    largeProjectName: string,
    kind: PackingEntryKind,
    packings: PackingWithBooking[],
  ) => void;
}

export const LargeProjectPackingCard: React.FC<Props> = ({
  largeProjectId,
  largeProjectName,
  kind,
  packings,
  onOpen,
}) => {
  const isReturn = kind === 'in';
  const Icon = isReturn ? PackageOpen : Package;
  const count = packings.length;
  const flowLabel = isReturn ? 'IN · Retur' : 'UT · Pack';

  const inProgress = packings.filter(p =>
    isReturn ? p.status === 'returning' : p.status === 'in_progress',
  ).length;
  const done = packings.filter(p =>
    isReturn ? p.status === 'returned' : p.status === 'packed',
  ).length;
  const notStarted = count - inProgress - done;

  const badgeBase = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border';

  return (
    <Card
      className={`p-3 transition-all border-2 cursor-pointer active:scale-[0.99] ${
        isReturn
          ? 'border-red-500 bg-red-100'
          : 'border-green-500 bg-green-100'
      }`}
      onClick={() => onOpen(largeProjectId, largeProjectName, kind, packings)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${
                isReturn ? 'text-red-900' : 'text-green-900'
              }`}
            >
              {flowLabel}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-900 inline-flex items-center gap-1">
              <Layers className="h-3 w-3" />
              Stort projekt
            </span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isReturn ? 'text-red-800' : 'text-green-800'}`} />
            <span className={`font-semibold text-sm truncate ${isReturn ? 'text-red-950' : 'text-green-950'}`}>
              {largeProjectName}
            </span>
          </div>
          <div className={`flex flex-wrap items-center gap-1.5 pl-5 ${isReturn ? 'text-red-900/70' : 'text-green-900/70'}`}>
            <span className="text-xs">{count} {count === 1 ? 'bokning' : 'bokningar'}</span>
            {notStarted > 0 && (
              <span className={`${badgeBase} ${isReturn ? 'bg-red-50 text-red-800 border-red-300' : 'bg-green-50 text-green-800 border-green-300'}`}>
                <CircleDashed className="h-3 w-3" />
                {notStarted} ej startad{notStarted > 1 ? 'a' : ''}
              </span>
            )}
            {inProgress > 0 && (
              <span className={`${badgeBase} ${isReturn ? 'bg-red-100 text-red-900 border-red-400' : 'bg-green-100 text-green-900 border-green-400'}`}>
                <Loader2 className="h-3 w-3 animate-spin" />
                {inProgress} pågår
              </span>
            )}
            {done > 0 && (
              <span className={`${badgeBase} ${isReturn ? 'bg-red-700 text-white border-red-800' : 'bg-green-700 text-white border-green-800'}`}>
                <CheckCircle2 className="h-3 w-3" />
                {done} klar{done > 1 ? 'a' : ''}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className={`h-5 w-5 flex-shrink-0 ${isReturn ? 'text-red-800' : 'text-green-800'}`} />
      </div>
      <Button
        size="sm"
        className={`w-full h-9 gap-1.5 ${
          isReturn
            ? 'bg-red-700 hover:bg-red-800 text-white'
            : 'bg-green-700 hover:bg-green-800 text-white'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(largeProjectId, largeProjectName, kind, packings);
        }}
      >
        <span className="text-xs">Välj bokning att {isReturn ? 'returnera' : 'packa'}</span>
      </Button>
    </Card>
  );
};

export default LargeProjectPackingCard;
