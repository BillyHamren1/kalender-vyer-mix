import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, AlertCircle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

interface Props {
  events: CalendarEvent[];
  crewByDayTeam: Map<string, string[]> | undefined;
  currentDate: Date;
  viewMode: 'day' | 'weekly' | 'monthly' | 'list';
}

interface UnstaffedRow {
  date: Date;
  label: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  packing: 'Packning',
  return: 'Retur',
  delivery: 'Utleverans',
  unpacking: 'Uppackning',
  inventory: 'Inventering',
  internal_task: 'Lageruppgift',
};

const MAX_UNSTAFFED_ROWS = 3;

function getViewInterval(currentDate: Date, viewMode: Props['viewMode']) {
  if (viewMode === 'day') {
    return { start: currentDate, end: currentDate };
  }
  if (viewMode === 'monthly') {
    return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }
  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  return { start, end: endOfWeek(start, { weekStartsOn: 1 }) };
}

function isEventInInterval(event: CalendarEvent, interval: { start: Date; end: Date }) {
  const d = new Date(event.start);
  if (isNaN(d.getTime())) return false;
  return isWithinInterval(d, interval);
}

function isWarehouseEvent(event: CalendarEvent): boolean {
  return (
    event.resourceId?.startsWith('lager-') === true ||
    event.resourceId === 'warehouse-event' ||
    event.resourceId === 'warehouse'
  );
}

const WarehouseStaffingOverview: React.FC<Props> = ({ events, crewByDayTeam, currentDate, viewMode }) => {
  const navigate = useNavigate();

  const interval = useMemo(() => getViewInterval(currentDate, viewMode), [currentDate, viewMode]);

  const { totalJobs, unstaffedRows, unstaffedCount, plannedPeople } = useMemo(() => {
    const warehouseEvents = events.filter(isWarehouseEvent);
    const inView = warehouseEvents.filter((e) => isEventInInterval(e, interval));
    const rows: UnstaffedRow[] = [];
    const plannedStaff = new Set<string>();

    inView.forEach((event) => {
      const dayKey = format(new Date(event.start), 'yyyy-MM-dd');
      const crew = crewByDayTeam?.get(`${dayKey}|${event.resourceId}`) ?? [];
      crew.forEach((name) => plannedStaff.add(`${dayKey}|${name}`));

      if (crew.length === 0) {
        const activity = ACTIVITY_LABELS[event.eventType as string] ?? 'Lagerjobb';
        rows.push({
          date: new Date(event.start),
          label: `${format(new Date(event.start), 'd MMM', { locale: sv })} · ${activity} · ${event.title}`,
        });
      }
    });

    return {
      totalJobs: inView.length,
      unstaffedRows: rows.slice(0, MAX_UNSTAFFED_ROWS),
      unstaffedCount: rows.length,
      plannedPeople: plannedStaff.size,
    };
  }, [events, crewByDayTeam, interval]);

  const goToDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    navigate(`/warehouse/calendar?date=${dateStr}&view=day`);
  };

  return (
    <div className="shrink-0 mx-2 mb-2 rounded-xl border border-border/60 bg-card px-3 py-2">
      <div className="flex items-center gap-3 mb-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Behöver bemanning</h2>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{totalJobs}</span> lagerjobb
          </span>
          <span className="text-muted-foreground">
            <span className={cn('font-semibold', unstaffedCount > 0 ? 'text-amber-600' : 'text-foreground')}>
              {unstaffedCount}
            </span>{' '}
            utan bemanning
          </span>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{plannedPeople}</span> planerade
          </span>
        </div>
      </div>

      {unstaffedCount > 0 ? (
        <div className="space-y-1">
          {unstaffedRows.map((row, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 px-2 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-xs truncate" title={row.label}>
                  {row.label}
                </span>
                <span className="text-[10px] font-medium text-amber-600 shrink-0">Obemannad</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] shrink-0"
                onClick={() => goToDay(row.date)}
              >
                Gå till dag →
              </Button>
            </div>
          ))}
          {unstaffedCount > MAX_UNSTAFFED_ROWS && (
            <div className="text-[11px] text-muted-foreground pl-1">
              + {unstaffedCount - MAX_UNSTAFFED_ROWS} fler
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">
          Alla lagerjobb i aktuell vy har bemanning.
        </div>
      )}
    </div>
  );
};

export default WarehouseStaffingOverview;
