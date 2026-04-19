import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, addDays, addWeeks, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { useStaffWarehouseSchedule, ScheduleViewMode, eventTypeLabel, eventTypeColor, StaffScheduleItem } from '@/hooks/useStaffWarehouseSchedule';

interface Props {
  staffId: string;
  staffName: string;
}

const ViewToggle = ({ value, onChange }: { value: ScheduleViewMode; onChange: (v: ScheduleViewMode) => void }) => (
  <div className="inline-flex rounded-md border border-border bg-background p-0.5">
    {(['day', 'week', 'month'] as ScheduleViewMode[]).map(v => (
      <button
        key={v}
        onClick={() => onChange(v)}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
          value === v
            ? 'bg-warehouse text-white'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {v === 'day' ? 'Dag' : v === 'week' ? 'Vecka' : 'Månad'}
      </button>
    ))}
  </div>
);

const periodLabel = (date: Date, view: ScheduleViewMode): string => {
  if (view === 'day') return format(date, 'EEEE d MMM', { locale: sv });
  if (view === 'week') {
    const s = startOfWeek(date, { weekStartsOn: 1 });
    const e = endOfWeek(date, { weekStartsOn: 1 });
    return `v.${format(s, 'w', { locale: sv })} · ${format(s, 'd MMM', { locale: sv })} – ${format(e, 'd MMM', { locale: sv })}`;
  }
  return format(date, 'MMMM yyyy', { locale: sv });
};

const formatTime = (iso: string | null) => iso ? format(new Date(iso), 'HH:mm') : null;

const ScheduleItemRow = ({ item }: { item: StaffScheduleItem }) => {
  const start = formatTime(item.startTime);
  const end = formatTime(item.endTime);
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40">
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${eventTypeColor(item.eventType)}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          {start && (
            <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">
              {start}{end && start !== end ? `–${end}` : ''}
            </span>
          )}
          <span className="text-sm truncate">{item.title}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            {item.kind === 'warehouse' ? eventTypeLabel(item.eventType) : 'Planering'}
          </span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{item.resourceLabel}</span>
          {item.bookingNumber && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground">#{item.bookingNumber}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const StaffScheduleView = ({ staffId, staffName }: Props) => {
  const [view, setView] = useState<ScheduleViewMode>('day');
  const [date, setDate] = useState(new Date());

  const { data: items = [], isLoading } = useStaffWarehouseSchedule(staffId, date, view);

  const navigate = (dir: -1 | 1) => {
    if (view === 'day') setDate(d => addDays(d, dir));
    else if (view === 'week') setDate(d => addWeeks(d, dir));
    else setDate(d => addMonths(d, dir));
  };

  // Group by day for week/month
  const groupedByDate = items.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {} as Record<string, StaffScheduleItem[]>);

  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <ViewToggle value={view} onChange={setView} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setDate(new Date())}
          >
            Idag
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="text-xs font-medium text-muted-foreground capitalize">
        {periodLabel(date, view)}
      </div>

      {/* List */}
      <div className="border rounded-lg max-h-[320px] overflow-y-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Laddar schema...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-8 px-4">
            <CalendarIcon className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Inga uppgifter</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {staffName} har inget inplanerat denna {view === 'day' ? 'dag' : view === 'week' ? 'vecka' : 'månad'}.
            </p>
          </div>
        ) : view === 'day' ? (
          <div className="p-1">
            {items.map(item => <ScheduleItemRow key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="divide-y">
            {sortedDates.map(dateKey => (
              <div key={dateKey} className="p-2">
                <div className="text-[11px] font-semibold text-foreground capitalize px-2 mb-1">
                  {format(new Date(dateKey), 'EEEE d MMM', { locale: sv })}
                </div>
                <div>
                  {groupedByDate[dateKey].map(item => <ScheduleItemRow key={item.id} item={item} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffScheduleView;
