/**
 * LargeProjectPlannerChecklistView
 * --------------------------------------------------------------------------
 * Premium produktionschecklista för stora projekt.
 *
 * Gruppering:
 *   1. Datum (sticky rubrik)
 *   2. Bokning inom datumet (#nummer — klient)
 *   3. Todos under bokningen
 *
 * Visar ENBART todos (item_type = 'task' | 'manual' | 'split').
 * Bokningsfasblock (item_type = 'booking') filtreras bort — de tillhör
 * kalendervyn.
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
  Hash,
  Clock,
  User,
  Trash2,
  Pencil,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  CalendarOff,
  UserX,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerItemStatus,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';

type FilterKey =
  | 'all'
  | 'open'
  | 'done'
  | 'blocked'
  | 'missing_staff'
  | 'missing_date';

interface Props {
  bookings: LargeProjectPlannerBooking[];
  items: LargeProjectBookingPlanItem[];
  staff: LargeProjectPlannerStaffMember[];
  onItemClick?: (item: LargeProjectBookingPlanItem) => void;
  onItemDelete?: (item: LargeProjectBookingPlanItem) => void;
  onToggleItemStatus?: (item: LargeProjectBookingPlanItem, done: boolean) => void;
  onCreateManual?: () => void;
}

const STATUS_LABEL: Record<LargeProjectPlannerItemStatus, string> = {
  unplanned: 'Oplanerad',
  planned: 'Planerad',
  in_progress: 'Pågår',
  done: 'Klar',
  blocked: 'Blockerad',
};

const STATUS_BADGE: Record<LargeProjectPlannerItemStatus, string> = {
  unplanned: 'bg-muted text-muted-foreground',
  planned: 'bg-planner/10 text-planner',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  blocked: 'bg-destructive/15 text-destructive',
};

const STATUS_ACCENT: Record<LargeProjectPlannerItemStatus, string> = {
  unplanned: 'bg-muted-foreground/30',
  planned: 'bg-planner/60',
  in_progress: 'bg-amber-500/70',
  done: 'bg-emerald-500/70',
  blocked: 'bg-destructive/70',
};

const formatDateLong = (date: string) => {
  try {
    return format(parseISO(date), 'EEE d MMM', { locale: sv });
  } catch {
    return date;
  }
};

const formatTime = (t: string | null) => (t ? t.slice(0, 5) : null);

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Alla' },
  { key: 'open', label: 'Ej klara' },
  { key: 'done', label: 'Klara' },
  { key: 'blocked', label: 'Blockerade' },
  { key: 'missing_staff', label: 'Saknar personal' },
  { key: 'missing_date', label: 'Saknar datum' },
];

const LargeProjectPlannerChecklistView = ({
  bookings,
  items,
  staff,
  onItemClick,
  onItemDelete,
  onToggleItemStatus,
  onCreateManual,
}: Props) => {
  const [filter, setFilter] = useState<FilterKey>('all');

  const staffById = useMemo(() => {
    const m = new Map<string, LargeProjectPlannerStaffMember>();
    staff.forEach((s) => m.set(s.id, s));
    return m;
  }, [staff]);

  const bookingById = useMemo(() => {
    const m = new Map<string, LargeProjectPlannerBooking>();
    bookings.forEach((b) => m.set(b.id, b));
    return m;
  }, [bookings]);

  // Todos = task / manual / split (aldrig 'booking' = fasblock)
  const todos = useMemo(
    () => items.filter((it) => it.item_type !== 'booking'),
    [items],
  );

  const filteredTodos = useMemo(() => {
    switch (filter) {
      case 'all':
        return todos;
      case 'open':
        return todos.filter((t) => t.status !== 'done');
      case 'done':
        return todos.filter((t) => t.status === 'done');
      case 'blocked':
        return todos.filter((t) => t.status === 'blocked');
      case 'missing_staff':
        return todos.filter((t) => !t.assigned_staff_id && !t.assigned_team_id);
      case 'missing_date':
        return todos.filter((t) => !t.plan_date);
      default:
        return todos;
    }
  }, [todos, filter]);

  // Gruppera per datum → bokning
  const grouped = useMemo(() => {
    const byDate = new Map<string, Map<string, LargeProjectBookingPlanItem[]>>();
    filteredTodos.forEach((it) => {
      const dateKey = it.plan_date || '__no_date__';
      const bookingKey = it.booking_id ?? '__manual__';
      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
      const dateMap = byDate.get(dateKey)!;
      if (!dateMap.has(bookingKey)) dateMap.set(bookingKey, []);
      dateMap.get(bookingKey)!.push(it);
    });
    // Sortera todos inom bokning på starttid → titel
    byDate.forEach((dateMap) => {
      dateMap.forEach((arr) =>
        arr.sort((a, b) => {
          const sa = a.start_time ?? '';
          const sb = b.start_time ?? '';
          if (sa !== sb) return sa.localeCompare(sb);
          return a.title.localeCompare(b.title, 'sv');
        }),
      );
    });
    // Sorterade datum-nycklar (no_date sist)
    const dateKeys = Array.from(byDate.keys()).sort((a, b) => {
      if (a === '__no_date__') return 1;
      if (b === '__no_date__') return -1;
      return a.localeCompare(b);
    });
    return { byDate, dateKeys };
  }, [filteredTodos]);

  const totalOpen = todos.filter((t) => t.status !== 'done').length;
  const totalDone = todos.filter((t) => t.status === 'done').length;
  const totalBlocked = todos.filter((t) => t.status === 'blocked').length;

  const renderItemRow = (item: LargeProjectBookingPlanItem) => {
    const time = formatTime(item.start_time);
    const endTime = formatTime(item.end_time);
    const timeLabel = time ? (endTime ? `${time}–${endTime}` : time) : null;
    const assigned = item.assigned_staff_id
      ? staffById.get(item.assigned_staff_id)
      : null;
    const done = item.status === 'done';
    const hasNotes = Boolean(item.notes && item.notes.trim().length > 0);

    return (
      <div
        key={item.id}
        className={`group relative flex items-start gap-2.5 rounded-md border border-border/50 bg-background pl-3 pr-1.5 py-1.5 transition-all hover:border-planner/30 hover:shadow-sm ${
          done ? 'opacity-65' : ''
        }`}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 h-full w-[2px] rounded-l-md ${STATUS_ACCENT[item.status]}`}
        />
        <Checkbox
          checked={done}
          onCheckedChange={(c) => onToggleItemStatus?.(item, c === true)}
          className="mt-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
          aria-label={done ? 'Markera som ej klar' : 'Markera som klar'}
        />
        <button
          type="button"
          onClick={() => onItemClick?.(item)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-start gap-1.5">
            <div
              className={`text-[12.5px] font-medium leading-snug text-foreground line-clamp-2 ${
                done ? 'line-through decoration-emerald-500/60' : ''
              }`}
            >
              {item.title}
            </div>
            <span
              className={`shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0 rounded text-[9.5px] font-semibold uppercase tracking-wide ${STATUS_BADGE[item.status]}`}
            >
              {STATUS_LABEL[item.status]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
            {timeLabel ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <Clock className="h-2.5 w-2.5" />
                {timeLabel}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground/70">
                Ej tid
              </span>
            )}
            {assigned ? (
              <span className="inline-flex items-center gap-0.5">
                <User className="h-2.5 w-2.5" />
                {assigned.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground/70">
                <UserX className="h-2.5 w-2.5" />
                Ej tilldelad
              </span>
            )}
            {item.booking_product_id && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded bg-planner/10 text-planner text-[9.5px] font-semibold uppercase tracking-wide">
                <Package className="h-2.5 w-2.5" />
                Orderrad
              </span>
            )}
            {hasNotes && (
              <span
                className="inline-flex items-center gap-0.5 text-planner/80"
                title="Kommentar finns"
              >
                <MessageSquare className="h-2.5 w-2.5" />
                kommentar
              </span>
            )}
          </div>
        </button>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 transition group-hover:opacity-100">
          {onItemClick && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover:bg-planner/10 hover:text-planner"
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(item);
              }}
              title="Redigera"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onItemDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
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
      </div>
    );
  };

  const renderBookingBlock = (
    bookingKey: string,
    its: LargeProjectBookingPlanItem[],
  ) => {
    const booking = bookingKey === '__manual__' ? null : bookingById.get(bookingKey);
    const openCount = its.filter((t) => t.status !== 'done').length;
    const doneCount = its.filter((t) => t.status === 'done').length;

    return (
      <div key={bookingKey} className="space-y-1.5">
        <div className="flex items-baseline gap-2 px-1">
          {booking ? (
            <>
              {booking.booking_number && (
                <span className="inline-flex items-center gap-0.5 font-mono tabular-nums text-[11px] font-semibold text-planner">
                  <Hash className="h-2.5 w-2.5" />
                  {booking.booking_number}
                </span>
              )}
              <span className="text-[12px] font-semibold text-foreground truncate">
                {booking.client?.trim() || booking.display_name}
              </span>
              {booking.client?.trim() && booking.display_name !== booking.client && (
                <span className="text-[10.5px] text-muted-foreground truncate">
                  · {booking.display_name}
                </span>
              )}
            </>
          ) : (
            <span className="text-[12px] font-semibold text-foreground">
              Fria todos
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
            {openCount > 0 && <span>{openCount} öppna</span>}
            {doneCount > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                {doneCount} klara
              </span>
            )}
          </span>
        </div>
        <div className="space-y-1 pl-2 border-l border-border/40">
          {its.map(renderItemRow)}
        </div>
      </div>
    );
  };

  const renderDateBlock = (dateKey: string) => {
    const dateMap = grouped.byDate.get(dateKey);
    if (!dateMap) return null;

    // Sortera bokningar inom datumet enligt projektets booking-ordning
    const bookingKeys = Array.from(dateMap.keys()).sort((a, b) => {
      if (a === '__manual__') return 1;
      if (b === '__manual__') return -1;
      const ia = bookings.findIndex((bk) => bk.id === a);
      const ib = bookings.findIndex((bk) => bk.id === b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    return (
      <section key={dateKey} className="space-y-2">
        <div className="sticky top-0 z-10 -mx-4 px-4 py-1.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-planner flex items-center gap-2">
            {dateKey === '__no_date__' ? (
              <>
                <CalendarOff className="h-3 w-3" />
                Utan datum
              </>
            ) : (
              formatDateLong(dateKey)
            )}
          </h3>
        </div>
        <div className="space-y-3">
          {bookingKeys.map((bk) => renderBookingBlock(bk, dateMap.get(bk)!))}
        </div>
      </section>
    );
  };

  const isEmpty = todos.length === 0;
  const isFilteredEmpty = !isEmpty && grouped.dateKeys.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Toolbar */}
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
        {totalBlocked > 0 && (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive tabular-nums">
            <AlertTriangle className="h-2.5 w-2.5" />
            {totalBlocked} blockerade
          </span>
        )}
        <div className="ml-auto flex items-center rounded-lg border border-border/60 bg-background p-0.5 flex-wrap">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant="ghost"
              className={`h-6 px-2 text-[10.5px] rounded-md font-medium ${
                filter === f.key
                  ? 'bg-planner text-white hover:bg-planner/90 hover:text-white'
                  : 'text-muted-foreground hover:text-planner hover:bg-planner/10'
              }`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Innehåll */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {isEmpty ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-6 py-12 text-center">
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-planner/10 ring-1 ring-planner/20 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-planner" />
              </div>
              <div className="text-[13px] font-semibold text-foreground">
                Inga todos ännu
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-1 max-w-sm mx-auto">
                Öppna en bokning och skapa todos från orderrader eller manuellt.
              </div>
              {onCreateManual && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 h-7 text-[11px] border-planner/25 text-planner hover:bg-planner/10"
                  onClick={onCreateManual}
                >
                  Skapa todo
                </Button>
              )}
            </div>
          ) : isFilteredEmpty ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
              <div className="text-[12.5px] font-medium text-foreground">
                Inga todos matchar filtret
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-1">
                Prova ett annat filter eller välj Alla.
              </div>
            </div>
          ) : (
            grouped.dateKeys.map(renderDateBlock)
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LargeProjectPlannerChecklistView;
