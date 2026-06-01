import React from 'react';
import { Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatTeamVehicleLine,
  vehicleNames,
  type TeamVehicleInfo,
} from '@/lib/teamVehicles';

interface Props {
  vehicles: TeamVehicleInfo[] | null | undefined;
  className?: string;
  /** Storleksvariant — list/card är default, dense är för täta tidslinjer. */
  size?: 'default' | 'dense';
}

/**
 * Informationsrad som visar teamets bil(ar) för dagen.
 * Aldrig klickbar, alltid läsbar. Returnerar null när inga bilar finns.
 */
const TeamVehicleLine: React.FC<Props> = ({ vehicles, className, size = 'default' }) => {
  const names = vehicleNames(vehicles);
  if (names.length === 0) return null;
  const line = formatTeamVehicleLine(names);
  const dense = size === 'dense';
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-muted-foreground',
        dense ? 'text-[10px]' : 'text-[12px]',
        className,
      )}
      title={line}
    >
      <Truck className={cn('shrink-0', dense ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5')} />
      <span className="truncate">{line}</span>
    </div>
  );
};

export default TeamVehicleLine;
