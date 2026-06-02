/**
 * LargeProjectPlannerToolbar
 * --------------------------------------------------------------------------
 * Toolbar för intern bokningsplanering i stora projekt.
 * Ren presentational — utlöser callbacks, gör inga DB-skrivningar själv.
 */
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Plus, RefreshCw, Sparkles, LayoutGrid, GanttChartSquare } from 'lucide-react';

export type PlannerViewMode = 'calendar' | 'gantt';

interface Props {
  daysCount: number;
  rangeLabel: string | null;
  isLoading?: boolean;
  isMutating?: boolean;
  onRefresh: () => void;
  onSeedFromBookings: () => void;
  onCreateManual: () => void;
  viewMode?: PlannerViewMode;
  onViewModeChange?: (mode: PlannerViewMode) => void;
}

const LargeProjectPlannerToolbar = ({
  daysCount,
  rangeLabel,
  isLoading,
  isMutating,
  onRefresh,
  onSeedFromBookings,
  onCreateManual,
  viewMode = 'calendar',
  onViewModeChange,
}: Props) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-primary/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold text-foreground">Projektplanering</div>
        {rangeLabel && (
          <Badge variant="outline" className="text-[10px] font-normal">
            {rangeLabel}
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px] font-normal">
          {daysCount} {daysCount === 1 ? 'dag' : 'dagar'}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={isLoading || isMutating}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          Uppdatera
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onSeedFromBookings}
          disabled={isMutating}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          Skapa plan från bokningar
        </Button>
        <Button size="sm" onClick={onCreateManual} disabled={isMutating}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Manuell task
        </Button>
      </div>
    </div>
  );
};

export default LargeProjectPlannerToolbar;
