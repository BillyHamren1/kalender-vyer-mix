/**
 * LargeProjectPlannerToolbar
 * --------------------------------------------------------------------------
 * Toolbar för intern bokningsplanering i stora projekt.
 * Ren presentational — utlöser callbacks, gör inga DB-skrivningar själv.
 */
import { Button } from '@/components/ui/button';
import {
  CalendarDays,
  Plus,
  RefreshCw,
  Sparkles,
  LayoutGrid,
  GanttChartSquare,
} from 'lucide-react';

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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-b from-planner/[0.06] to-background px-4 py-3">
      {/* Vänster: identitet + meta */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-planner/10 ring-1 ring-planner/15 flex items-center justify-center shrink-0">
          <CalendarDays className="h-4 w-4 text-planner" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground leading-tight">
            Projektplanering
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {rangeLabel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted/70 border border-border/60 font-medium tabular-nums">
                {rangeLabel}
              </span>
            )}
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-planner/8 border border-planner/15 text-planner/85 font-semibold tabular-nums">
              {daysCount} {daysCount === 1 ? 'dag' : 'dagar'}
            </span>
          </div>
        </div>
      </div>

      {/* Höger: vy + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {onViewModeChange && (
          <div className="flex items-center rounded-lg border border-border/60 bg-background p-0.5 shadow-sm">
            <Button
              size="sm"
              variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
              className="h-7 px-2.5 text-[11px] rounded-md"
              onClick={() => onViewModeChange('calendar')}
              title="Kalendervy"
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1" />
              Kalender
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'gantt' ? 'secondary' : 'ghost'}
              className="h-7 px-2.5 text-[11px] rounded-md"
              onClick={() => onViewModeChange('gantt')}
              title="Gantt-vy (read-only)"
            >
              <GanttChartSquare className="h-3.5 w-3.5 mr-1" />
              Gantt
            </Button>
          </div>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-lg"
          onClick={onRefresh}
          disabled={isLoading || isMutating}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          Uppdatera
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg shadow-sm"
          onClick={onSeedFromBookings}
          disabled={isMutating}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5 text-planner" />
          Skapa plan från bokningar
        </Button>
        <Button
          size="sm"
          className="h-8 rounded-lg shadow-sm"
          onClick={onCreateManual}
          disabled={isMutating}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Manuell task
        </Button>
      </div>
    </div>
  );
};

export default LargeProjectPlannerToolbar;
