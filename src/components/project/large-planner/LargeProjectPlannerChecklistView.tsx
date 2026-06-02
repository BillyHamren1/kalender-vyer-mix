/**
 * LargeProjectPlannerChecklistView
 * --------------------------------------------------------------------------
 * Premium checklista — visar ALLA todos i projektplanen, grupperade per
 * bokning + en sektion för fria/manuella todos.
 *
 * Skriver ALDRIG till DB själv. Status-toggle/edit/delete delegeras via
 * callbacks → useLargeProjectPlannerItems → service → endast
 * `large_project_booking_plan_items`.
 */
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ListChecks,
  Inbox,
  Hash,
  Clock,
  User,
  Trash2,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';

type StatusFilter = 'all' | 'open' | 'done';

interface Props {
  bookings: LargeProjectPlannerBooking[];
  items: LargeProjectBookingPlanItem[];
  staff: LargeProjectPlannerStaffMember[];
  onItemClick?: (item: LargeProjectBookingPlanItem) => void;
  onItemDelete?: (item: LargeProjectBookingPlanItem) => void;
  onToggleItemStatus?: (item: LargeProjectBookingPlanItem, done: boolean) => void;
  onCreateManual?: () => void;
}

const formatDate = (date: string) => {
  try {
    return format(parseISO(date), 'EEE d MMM', { locale: sv });
  } catch {
    return date;
  }
};

const formatTime = (t: string | null) => (t ? t.slice(0, 5) : null);

const STATUS_ACCENT: Record<LargeProjectBookingPlanItem['status'], string> = {
  unplanned: 'bg-muted-foreground/30',
  planned: 'bg-planner/60',
  in_progress: 'bg-amber-500/70',
  done: 'bg-emerald-500/70',
  blocked: 'bg-destructive/70',
};

const LargeProjectPlannerChecklistView = ({
  bookings,
  items,
  staff,
  onItemClick,
  onItemDelete,
  onToggleItemStatus,
  onCreateManual,
}: Props) => {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const staffById = useMemo(() => {
    const m = new Map<string, LargeProjectPlannerStaffMember>();
    staff.forEach((s) => m.set(s.id, s));
    return m;
  }, [staff]);

  // Todos = allt utom rena bokningsfaseblock
  const todos = useMemo(
    () => items.filter((it) => it.item_type !== 'booking'),
    [items],
  );

  const filteredTodos = useMemo(() => {
    if (filter === 'all') return todos;
    if (filter === 'done') return todos.filter((t) => t.status === 'done');
    return todos.filter((t) => t.status !== 'done');
  }, [todos, filter]);

  const todosByBooking = useMemo(() => {
    const map = new Map<string, LargeProjectBookingPlanItem[]>();
    filteredTodos.forEach((it) => {
      const key = it.booking_id ?? '__manual__';
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    });
    // Sortera per datum + tid
    map.forEach((arr) =>
      arr.sort((a, b) => {
        if (a.plan_date !== b.plan_date) return a.plan_date.localeCompare(b.plan_date);
        return (a.start_time ?? '').localeCompare(b.start_time ?? '');
      }),
    );
    return map;
  }, [filteredTodos]);

  const totalOpen = todos.filter((t) => t.status !== 'done').length;
  const totalDone = todos.filter((t) => t.status === 'done').length;

  const renderItemRow = (item: LargeProjectBookingPlanItem) => {
    const time = formatTime(item.start_time);
    const endTime = formatTime(item.end_time);
    const timeLabel = time ? (endTime ? `${time}–${endTime}` : time) : null;
    const assigned = item.assigned_staff_id
      ? staffById.get(item.assigned_staff_id)
      : null;
    const done = item.status === 'done';

    return (
      <div
        key={item.id}
        className={`group relative flex items-start gap-2.5 rounded-lg border border-border/60 bg-card pl-3 pr-2 py-2 transition-all hover:border-planner/30 hover:shadow-sm ${done ? 'opacity-70' : ''}`}
      >
        <span
          className={`pointer-events-none absolute left-0 top-0 h-full w-[3px] rounded-l-lg ${STATUS_ACCENT[item.status]}`}
        />
        <Checkbox
          checked={done}
          onCheckedChange={(c) => onToggleItemStatus?.(item, c === true)}
          className="mt-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={() => onItemClick?.(item)}
          className="min-w-0 flex-1 text-left"
        >
          <div
            className={`text-[12.5px] font-medium leading-tight text-foreground line-clamp-2 ${done ? 'line-through decoration-emerald-500/60' : ''}`}
          >
            {item.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              {formatDate(item.plan_date)}
            </span>
            {timeLabel && (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <Clock className="h-2.5 w-2.5" />
                {timeLabel}
              </span>
            )}
            {assigned && (
              <span className="inline-flex items-center gap-0.5">
                <User className="h-2.5 w-2.5" />
                {assigned.name}
              </span>
            )}
            {item.booking_product_id && (
              <span className="inline-flex items-center px-1.5 py-0 rounded-md bg-planner/10 text-planner text-[9.5px] font-semibold uppercase tracking-wide">
                Orderrad
              </span>
            )}
          </div>
        </button>
        {onItemDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onItemDelete(item);
            }}
            title="Ta bort"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  };

  const renderBookingGroup = (bookingId: string) => {
    const its = todosByBooking.get(bookingId);
    if (!its || its.length === 0) return null;
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return null;
    const openCount = its.filter((t) => t.status !== 'done').length;
    const doneCount = its.filter((t) => t.status === 'done').length;

    return (
      <section key={bookingId} className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        <header className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground truncate">
              {booking.client?.trim() || booking.display_name}
              {booking.booking_number && (
                <span className="inline-flex items-center gap-0.5 font-mono tabular-nums text-[10.5px] font-medium text-muted-foreground">
                  <Hash className="h-2.5 w-2.5" />
                  {booking.booking_number}
                </span>
              )}
            </div>
            <div className="text-[10.5px] text-muted-foreground truncate">
              {booking.display_name}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-planner/10 text-planner">
              {openCount} öppna
            </span>
            {doneCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                {doneCount} klara
              </span>
            )}
          </div>
        </header>
        <div className="p-2 space-y-1.5">{its.map(renderItemRow)}</div>
      </section>
    );
  };

  const bookingOrder = bookings
    .map((b) => b.id)
    .filter((id) => todosByBooking.has(id));
  const manualTodos = todosByBooking.get('__manual__') ?? [];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/50 px-4 py-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <ListChecks className="h-3.5 w-3.5 text-planner" />
          Checklista
        </div>
        <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-muted/60 text-foreground/70 tabular-nums">
          {totalOpen} öppna
        </span>
        <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-muted/60 text-foreground/70 tabular-nums">
          {totalDone} klara
        </span>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center rounded-lg border border-border/60 bg-background p-0.5">
            {[
              { key: 'all' as const, label: 'Alla' },
              { key: 'open' as const, label: 'Öppna' },
              { key: 'done' as const, label: 'Klara' },
            ].map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant="ghost"
                className={`h-6 px-2 text-[10.5px] rounded-md font-medium ${filter === f.key ? 'bg-planner text-white hover:bg-planner/90 hover:text-white' : 'text-muted-foreground hover:text-planner hover:bg-planner/10'}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {bookingOrder.length === 0 && manualTodos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
              <CheckCircle2 className="h-6 w-6 text-muted-foreground/60 mx-auto mb-2" />
              <div className="text-[12.5px] font-medium text-foreground">
                Inga todos {filter !== 'all' ? `(${filter === 'open' ? 'öppna' : 'klara'})` : 'än'}
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-1">
                Skapa en todo via knappen ovan eller från en bokning.
              </div>
              {onCreateManual && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-7 text-[11px] border-planner/25 text-planner hover:bg-planner/10"
                  onClick={onCreateManual}
                >
                  Skapa todo
                </Button>
              )}
            </div>
          ) : (
            <>
              {bookingOrder.map(renderBookingGroup)}
              {manualTodos.length > 0 && (
                <section className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
                  <header className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
                    <div className="flex-1 text-[12.5px] font-semibold text-foreground">
                      Fria todos
                    </div>
                    <span className="text-[10.5px] text-muted-foreground tabular-nums">
                      {manualTodos.length}
                    </span>
                  </header>
                  <div className="p-2 space-y-1.5">{manualTodos.map(renderItemRow)}</div>
                </section>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LargeProjectPlannerChecklistView;
