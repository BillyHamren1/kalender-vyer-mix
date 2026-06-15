import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, Package, PackageOpen, ChevronRight } from 'lucide-react';
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

  // En knapp för antalet i progress för snabb glance
  const inProgress = packings.filter(p =>
    isReturn ? p.status === 'returning' : p.status === 'in_progress',
  ).length;
  const done = packings.filter(p =>
    isReturn ? p.status === 'returned' : p.status === 'packed',
  ).length;

  return (
    <Card
      className={`p-3 transition-all border-l-4 cursor-pointer active:scale-[0.99] ${
        isReturn
          ? 'border-l-red-400 bg-red-50/60'
          : 'border-l-purple-500 bg-purple-50/60'
      }`}
      onClick={() => onOpen(largeProjectId, largeProjectName, kind, packings)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${
                isReturn ? 'text-red-700' : 'text-purple-700'
              }`}
            >
              {flowLabel}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 inline-flex items-center gap-1">
              <Layers className="h-3 w-3" />
              Stort projekt
            </span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isReturn ? 'text-red-600' : 'text-purple-700'}`} />
            <span className="font-semibold text-sm truncate">{largeProjectName}</span>
          </div>
          <p className="text-xs text-muted-foreground pl-5">
            {count} {count === 1 ? 'bokning' : 'bokningar'}
            {inProgress > 0 && ` · ${inProgress} pågår`}
            {done > 0 && ` · ${done} klara`}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      </div>
      <Button
        size="sm"
        variant={isReturn ? 'secondary' : 'default'}
        className="w-full h-9 gap-1.5"
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
