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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-b from-planner/[0.05] via-card to-card px-5 py-3.5">
      {/* Vänster: identitet + meta */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-xl bg-white ring-1 ring-planner/20 shadow-[0_2px_6px_-2px_hsl(var(--planner)/0.35)] flex items-center justify-center shrink-0">
          <CalendarDays className="h-4.5 w-4.5 text-planner" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground leading-tight tracking-tight">
            Projektplanering
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {rangeLabel && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/70 border border-border/60 font-medium tabular-nums">
                {rangeLabel}
              </span>
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-planner/10 border border-planner/20 text-planner font-semibold tabular-nums">
              {daysCount} {daysCount === 1 ? 'dag' : 'dagar'}
            </span>
          </div>
        </div>
      </div>

      {/* Höger: vy + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {onViewModeChange && (
          <div className="flex items-center rounded-xl border border-border/60 bg-background p-0.5 shadow-sm">
            <Button
              size="sm"
              variant="ghost"
              className={`h-7 px-3 text-[11px] rounded-lg font-medium transition-colors ${viewMode === 'calendar' ? 'bg-planner text-white hover:bg-planner/90 hover:text-white shadow-sm' : 'text-muted-foreground hover:text-planner hover:bg-planner/10'}`}
              onClick={() => onViewModeChange('calendar')}
              title="Kalendervy"
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1" />
              Kalender
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={`h-7 px-3 text-[11px] rounded-lg font-medium transition-colors ${viewMode === 'gantt' ? 'bg-planner text-white hover:bg-planner/90 hover:text-white shadow-sm' : 'text-muted-foreground hover:text-planner hover:bg-planner/10'}`}
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
          className="h-8 rounded-lg text-muted-foreground hover:text-planner hover:bg-planner/10"
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
          className="h-8 rounded-lg shadow-sm border-planner/25 text-planner hover:bg-planner/10 hover:text-planner hover:border-planner/40"
          onClick={onSeedFromBookings}
          disabled={isMutating}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5 text-planner" />
          Skapa plan från bokningar
        </Button>
        <Button
          size="sm"
          className="h-8 rounded-lg shadow-[0_2px_8px_-2px_hsl(var(--planner)/0.45)] bg-planner text-white hover:bg-planner/90"
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
