/**
 * LargeProjectPlannerToolbar
 * --------------------------------------------------------------------------
 * Kompakt, lugn toolbar för projektplaneringen.
 * Ren presentational — utlöser callbacks, gör inga DB-skrivningar själv.
 */
import { Button } from '@/components/ui/button';
import {
  CalendarDays,
  Plus,
  RefreshCw,
  LayoutGrid,
  GanttChartSquare,
  ListChecks,
  Inbox,
} from 'lucide-react';

export type PlannerViewMode = 'calendar' | 'checklist' | 'gantt';

interface Props {
  daysCount: number;
  bookingsCount: number;
  todosCount: number;
  rangeLabel: string | null;
  isLoading?: boolean;
  isMutating?: boolean;
  onRefresh: () => void;
  onCreateManual: () => void;
  onOpenBookingsDrawer: () => void;
  viewMode?: PlannerViewMode;
  onViewModeChange?: (mode: PlannerViewMode) => void;
}

const LargeProjectPlannerToolbar = ({
  daysCount,
  bookingsCount,
  todosCount,
  rangeLabel,
  isLoading,
  isMutating,
  onRefresh,
  onCreateManual,
  onOpenBookingsDrawer,
  viewMode = 'calendar',
  onViewModeChange,
}: Props) => {
  const modes: { key: PlannerViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'calendar', label: 'Kalender', icon: LayoutGrid },
    { key: 'checklist', label: 'Checklista', icon: ListChecks },
    { key: 'gantt', label: 'Gantt', icon: GanttChartSquare },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-2.5">
      {/* Vänster: identitet + badges */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-planner/10 ring-1 ring-planner/20 flex items-center justify-center shrink-0">
          <CalendarDays className="h-4 w-4 text-planner" />
        </div>
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-foreground tracking-tight">
            Projektplanering
          </span>
          {rangeLabel && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] text-muted-foreground tabular-nums">
              {rangeLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-planner/10 text-planner text-[10.5px] font-semibold tabular-nums">
            {daysCount} {daysCount === 1 ? 'dag' : 'dagar'}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/60 text-foreground/70 text-[10.5px] font-medium tabular-nums">
            {bookingsCount} {bookingsCount === 1 ? 'bokning' : 'bokningar'}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/60 text-foreground/70 text-[10.5px] font-medium tabular-nums">
            <ListChecks className="h-2.5 w-2.5" />
            {todosCount} todos
          </span>
        </div>
      </div>

      {/* Höger: vy + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {onViewModeChange && (
          <div className="flex items-center rounded-lg border border-border/60 bg-background p-0.5">
            {modes.map((m) => {
              const Icon = m.icon;
              const active = viewMode === m.key;
              return (
                <Button
                  key={m.key}
                  size="sm"
                  variant="ghost"
                  className={`h-7 px-2.5 text-[11px] rounded-md font-medium transition-colors ${
                    active
                      ? 'bg-planner text-white hover:bg-planner/90 hover:text-white'
                      : 'text-muted-foreground hover:text-planner hover:bg-planner/10'
                  }`}
                  onClick={() => onViewModeChange(m.key)}
                  title={m.label}
                >
                  <Icon className="h-3.5 w-3.5 mr-1" />
                  {m.label}
                </Button>
              );
            })}
          </div>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-lg text-muted-foreground hover:text-planner hover:bg-planner/10"
          onClick={onRefresh}
          disabled={isLoading || isMutating}
          title="Uppdatera"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg border-planner/25 text-planner hover:bg-planner/10 hover:text-planner hover:border-planner/40"
          onClick={onCreateManual}
          disabled={isMutating}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Skapa todo
        </Button>
        <Button
          size="sm"
          className="h-8 rounded-lg bg-planner text-white hover:bg-planner/90 shadow-[0_2px_8px_-2px_hsl(var(--planner)/0.45)]"
          onClick={onOpenBookingsDrawer}
        >
          <Inbox className="h-3.5 w-3.5 mr-1.5" />
          Planera bokning
        </Button>
      </div>
    </div>
  );
};

export default LargeProjectPlannerToolbar;
