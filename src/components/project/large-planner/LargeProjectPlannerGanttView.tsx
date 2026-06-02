/**
 * LargeProjectPlannerGanttView — read-only horisontell tidslinje.
 * --------------------------------------------------------------------------
 * Annan VISNING av exakt samma data som LargeProjectPlannerCalendarView:
 *  - Källa: ctx.itemsWithAssignmentValidity (large_project_booking_plan_items),
 *    inte bokningarnas calendar_events. Då blir Gantten 1:1 mot kalendern.
 *  - Rader = bokningar (+ "Övrigt" för items utan booking_id).
 *  - Kolumner = ctx.days (projektets datumkort).
 *  - Klick på cell/bokningsrubrik dispatchar samma `lp-booking-sheet-open`
 *    som kalendern.
 *  - Inga DB-skrivningar. Ingen ny logik. Bara en annan lins.
 */
import { useMemo } from 'react';
import { parseISO, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarOff, Loader2 } from 'lucide-react';
import type { useLargeProjectPlannerItems, PlannerItemWithValidity } from './useLargeProjectPlannerItems';

type PlannerCtx = ReturnType<typeof useLargeProjectPlannerItems>;

interface Props {
  ctx: PlannerCtx;
}

type Phase = 'rig' | 'event' | 'rigDown' | 'other';

const PHASE_LABEL: Record<Phase, string> = {
  rig: 'Rigg',
  event: 'Event',
  rigDown: 'Rigg ner',
  other: 'Uppgift',
};

const PHASE_CLS: Record<Phase, string> = {
  rig: 'bg-amber-500/80 hover:bg-amber-500',
  event: 'bg-planner/80 hover:bg-planner',
  rigDown: 'bg-sky-500/80 hover:bg-sky-500',
  other: 'bg-muted-foreground/60 hover:bg-muted-foreground/80',
};

function resolvePhase(item: PlannerItemWithValidity): Phase {
  const raw = (item.phase ?? item.source_booking_phase ?? '').toLowerCase();
  if (raw === 'rig') return 'rig';
  if (raw === 'event') return 'event';
  if (raw === 'rigdown' || raw === 'rig_down' || raw === 'rigdown') return 'rigDown';
  // exakt match mot kalenderkonventionen
  if (item.phase === 'rigDown' || item.source_booking_phase === 'rigDown') return 'rigDown';
  return 'other';
}

const LargeProjectPlannerGanttView = ({ ctx }: Props) => {
  const { isLoading, error, bookings, days, itemsWithAssignmentValidity } = ctx;

  const dateToIndex = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d.date, i));
    return m;
  }, [days]);

  // Gruppera plan_items per booking_id (null → "__other__")
  const itemsByBooking = useMemo(() => {
    const map = new Map<string, PlannerItemWithValidity[]>();
    for (const it of itemsWithAssignmentValidity) {
      const key = it.booking_id ?? '__other__';
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return map;
  }, [itemsWithAssignmentValidity]);

  // Rader: alla bokningar i projektet (även de utan items, för parity med kalendern),
  // plus ev. en "Övrigt"-rad om det finns booking_id=null-items.
  const rows = useMemo(() => {
    const list: Array<{
      key: string;
      bookingId: string | null;
      title: string;
      subtitle: string | null;
    }> = bookings.map((b) => ({
      key: b.id,
      bookingId: b.id,
      title: b.display_name,
      subtitle:
        (b.booking_number ? `#${b.booking_number}` : '—') +
        (b.client ? ` · ${b.client}` : ''),
    }));
    if (itemsByBooking.has('__other__')) {
      list.push({
        key: '__other__',
        bookingId: null,
        title: 'Övrigt',
        subtitle: 'Manuella poster utan bokning',
      });
    }
    return list;
  }, [bookings, itemsByBooking]);

  const openBooking = (bookingId: string | null) => {
    if (!bookingId) return;
    window.dispatchEvent(
      new CustomEvent('lp-booking-sheet-open', { detail: { bookingId } }),
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Laddar projektplan…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center py-10 text-sm text-destructive">
        {error.message}
      </div>
    );
  }
  if (days.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <CalendarOff className="h-6 w-6 text-muted-foreground" />
        Inga projektdagar att visa. Lägg till projektdagar i personalkalendern först.
      </div>
    );
  }

  const colWidth = 44;
  const labelWidth = 240;
  const rowHeight = 40;

  return (
    <div className="flex-1 overflow-auto">
      <div className="min-w-max">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex border-b border-border/60 bg-card/95 backdrop-blur"
          style={{ paddingLeft: labelWidth }}
        >
          {days.map((d) => {
            const date = parseISO(d.date);
            const isToday = d.date === format(new Date(), 'yyyy-MM-dd');
            return (
              <div
                key={d.date}
                className={`flex flex-col items-center justify-center border-l border-border/40 py-1 text-[10px] ${
                  isToday ? 'bg-planner/10 font-semibold text-planner' : 'text-muted-foreground'
                }`}
                style={{ width: colWidth }}
                title={format(date, 'EEEE d MMMM yyyy', { locale: sv })}
              >
                <div className="uppercase">{format(date, 'EEE', { locale: sv })}</div>
                <div className="text-foreground">{format(date, 'd/M')}</div>
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-xs text-muted-foreground">
            Inga bokningar i projektet.
          </div>
        ) : (
          rows.map((row) => {
            const items = itemsByBooking.get(row.key) ?? [];
            // Gruppera items per dag för att stacka flera på samma datum.
            const byDate = new Map<string, PlannerItemWithValidity[]>();
            for (const it of items) {
              if (!dateToIndex.has(it.plan_date)) continue;
              const arr = byDate.get(it.plan_date) ?? [];
              arr.push(it);
              byDate.set(it.plan_date, arr);
            }

            return (
              <div
                key={row.key}
                className="flex items-stretch border-b border-border/40 hover:bg-muted/30"
              >
                <button
                  type="button"
                  onClick={() => openBooking(row.bookingId)}
                  disabled={!row.bookingId}
                  className="sticky left-0 z-[1] flex shrink-0 items-center gap-2 border-r border-border/40 bg-background px-2 py-1.5 text-left text-xs hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-background"
                  style={{ width: labelWidth }}
                  title={row.title}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      {row.title}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {row.subtitle ?? '—'}
                    </div>
                  </div>
                </button>

                <div className="relative flex" style={{ minHeight: rowHeight }}>
                  {/* Bakgrundsraster */}
                  {days.map((d) => {
                    const isToday = d.date === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <div
                        key={d.date}
                        className={`border-l border-border/30 ${isToday ? 'bg-planner/5' : ''}`}
                        style={{ width: colWidth }}
                      />
                    );
                  })}
                  {/* Item-block (stackas vertikalt i samma dagcell) */}
                  {Array.from(byDate.entries()).flatMap(([date, list]) => {
                    const idx = dateToIndex.get(date)!;
                    const slotH = Math.max(8, (rowHeight - 4) / list.length);
                    return list.map((it, i) => {
                      const phase = resolvePhase(it);
                      const top = 2 + i * slotH;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => openBooking(row.bookingId)}
                          className={`absolute rounded-sm px-1 text-[10px] font-medium text-white shadow-sm transition-colors ${PHASE_CLS[phase]}`}
                          style={{
                            left: idx * colWidth + 2,
                            width: colWidth - 4,
                            top,
                            height: slotH - 2,
                          }}
                          title={`${PHASE_LABEL[phase]} · ${it.title} · ${format(parseISO(date), 'EEE d MMM', { locale: sv })}`}
                        >
                          <span className="block truncate leading-tight">
                            {PHASE_LABEL[phase]}
                          </span>
                        </button>
                      );
                    });
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LargeProjectPlannerGanttView;
