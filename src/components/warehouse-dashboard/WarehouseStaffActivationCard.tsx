import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { addDays, addMonths, addWeeks, endOfWeek, format, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWarehouseStaffActivations } from '@/hooks/useWarehouseStaffActivations';
import {
  useWarehouseStaffScheduleOverview,
  type WarehouseScheduleView,
  type WarehouseStaffScheduleItem,
} from '@/hooks/useWarehouseStaffScheduleOverview';
import { extractUTCTime } from '@/utils/dateUtils';

const eventTypeLabel = (type?: string) => {
  switch (type) {
    case 'packing': return 'Packning';
    case 'delivery': return 'Utleverans';
    case 'return': return 'Retur';
    case 'inventory': return 'Inventering';
    case 'unpacking': return 'Uppackning';
    case 'internal_task': return 'Lageruppgift';
    case 'warehouse_shift': return 'Lagerpass';
    case 'field': return 'Ute i fält';
    case 'transport': return 'Transport';
    default: return 'Ute i fält';
  }
};

const eventDotClass = (type?: string) => {
  switch (type) {
    case 'packing': return 'bg-primary';
    case 'delivery': return 'bg-green-500';
    case 'return': return 'bg-amber-500';
    case 'inventory': return 'bg-sky-500';
    case 'unpacking': return 'bg-cyan-500';
    case 'internal_task':
    case 'warehouse_shift':
      return 'bg-warehouse';
    case 'field':
      return 'bg-emerald-500';
    default:
      return 'bg-emerald-500';
  }
};

const periodLabel = (date: Date, view: WarehouseScheduleView) => {
  if (view === 'day') return format(date, 'EEEE d MMMM', { locale: sv });
  if (view === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return `${format(start, 'd MMM', { locale: sv })} – ${format(end, 'd MMM', { locale: sv })}`;
  }
  return format(date, 'MMMM yyyy', { locale: sv });
};

const timeLabel = (item: WarehouseStaffScheduleItem) => {
  if (!item.startTime) return null;
  const start = extractUTCTime(item.startTime);
  const end = item.endTime ? extractUTCTime(item.endTime) : null;
  return end && end !== start ? `${start}–${end}` : start;
};

const ScheduleItemRow = ({ item }: { item: WarehouseStaffScheduleItem }) => {
  const time = timeLabel(item);

  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventDotClass(item.eventType)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {time && (
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {time}
            </span>
          )}
          <span className="truncate text-sm text-foreground">{item.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>{eventTypeLabel(item.eventType)}</span>
          <span>•</span>
          <span>{item.resourceLabel}</span>
          {item.bookingNumber && (
            <>
              <span>•</span>
              <span>#{item.bookingNumber}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ViewToggle = ({ value, onChange }: { value: WarehouseScheduleView; onChange: (view: WarehouseScheduleView) => void }) => (
  <div className="inline-flex rounded-md border border-border bg-background p-0.5">
    {(['day', 'week', 'month'] as WarehouseScheduleView[]).map((view) => (
      <button
        key={view}
        onClick={() => onChange(view)}
        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          value === view
            ? 'bg-warehouse text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {view === 'day' ? 'Dag' : view === 'week' ? 'Vecka' : 'Månad'}
      </button>
    ))}
  </div>
);

const WarehouseStaffActivationCard = () => {
  const { staffWithActivations, isLoading } = useWarehouseStaffActivations();
  const [view, setView] = useState<WarehouseScheduleView>('day');
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: scheduleGroups = [], isLoading: isScheduleLoading } = useWarehouseStaffScheduleOverview(
    staffWithActivations,
    currentDate,
    view,
  );

  const navigate = (direction: -1 | 1) => {
    if (view === 'day') setCurrentDate((date) => addDays(date, direction));
    else if (view === 'week') setCurrentDate((date) => addWeeks(date, direction));
    else setCurrentDate((date) => addMonths(date, direction));
  };

  const totalItems = useMemo(
    () => scheduleGroups.reduce((sum, group) => sum + group.items.length, 0),
    [scheduleGroups],
  );

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shadow-sm"
            style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
          >
            <Users className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Personal & schema</h3>
            <p className="text-xs text-muted-foreground">
              {scheduleGroups.length} personer · {totalItems} poster
            </p>
          </div>
        </div>

        <ViewToggle value={view} onChange={setView} />
      </div>

      <div className="flex items-center justify-between gap-2 border-y border-border/50 px-4 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentDate(new Date())}>
            Idag
          </Button>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground capitalize">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{periodLabel(currentDate, view)}</span>
        </div>
      </div>

      <div className="max-h-[560px] space-y-3 overflow-y-auto p-4">
        {isLoading || isScheduleLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Laddar personalschema...</p>
        ) : scheduleGroups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ingen lagerpersonal hittades</p>
        ) : (
          scheduleGroups.map(({ staff, items }) => {
            const groupedByDate = items.reduce<Record<string, WarehouseStaffScheduleItem[]>>((acc, item) => {
              if (!acc[item.date]) acc[item.date] = [];
              acc[item.date].push(item);
              return acc;
            }, {});

            const dates = Object.keys(groupedByDate).sort();

            return (
              <div key={staff.id} className="rounded-lg border border-border/60 bg-background/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{staff.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {items.length > 0 ? `${items.length} ${items.length === 1 ? 'post' : 'poster'}` : 'Ledig'}
                    </p>
                  </div>
                  <Badge variant="outline" className={staff.isCurrentlyActive ? 'border-warehouse/40 text-warehouse' : ''}>
                    {staff.isCurrentlyActive ? 'Aktiv' : 'Ej aktiv'}
                  </Badge>
                </div>

                {items.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                    Inget inplanerat.
                  </div>
                ) : view === 'day' ? (
                  <div className="space-y-1">
                    {items.map((item) => (
                      <ScheduleItemRow key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dates.map((dateKey) => (
                      <div key={dateKey} className="rounded-md bg-muted/30 p-2">
                        <p className="mb-1 px-1 text-[11px] font-semibold capitalize text-foreground">
                          {format(new Date(dateKey), 'EEEE d MMM', { locale: sv })}
                        </p>
                        <div className="space-y-1">
                          {groupedByDate[dateKey].map((item) => (
                            <ScheduleItemRow key={item.id} item={item} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default WarehouseStaffActivationCard;
