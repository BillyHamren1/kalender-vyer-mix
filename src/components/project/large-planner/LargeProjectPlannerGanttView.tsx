/**
 * LargeProjectPlannerGanttView — read-only horisontell tidslinje.
 * --------------------------------------------------------------------------
 * Annan VISNING av samma data som LargeProjectPlannerCalendarView:
 *  - Inga nya datakällor: använder ctx.bookings + ctx.days.
 *  - Skriver ALDRIG till någon tabell (read-only).
 *  - En rad per bokning, kolumner = projektets dagar (ctx.days).
 *  - Celler färgade per fas (rig / event / rigDown) från
 *    bokningens rig_dates / event_dates / rigdown_dates.
 *
 * Detta är inget Gantt-redigeringsverktyg — bara ett annat sätt att läsa
 * kalendern. Klick på en cell dispatchar samma `lp-booking-sheet-open`
 * event som vanliga bokningsklick i kalendern.
 */
import { useMemo } from 'react';
import { parseISO, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarOff, Loader2 } from 'lucide-react';
import type { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';

type PlannerCtx = ReturnType<typeof useLargeProjectPlannerItems>;

interface Props {
  ctx: PlannerCtx;
}

const PHASE_LABEL: Record<'rig' | 'event' | 'rigDown', string> = {
  rig: 'Rigg',
  event: 'Event',
  rigDown: 'Rigg ner',
};

const PHASE_CLS: Record<'rig' | 'event' | 'rigDown', string> = {
  rig: 'bg-amber-500/70 hover:bg-amber-500',
  event: 'bg-primary/80 hover:bg-primary',
  rigDown: 'bg-sky-500/70 hover:bg-sky-500',
};

const LargeProjectPlannerGanttView = ({ ctx }: Props) => {
  const { isLoading, error, bookings, days } = ctx;

  const dateToIndex = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d.date, i));
    return m;
  }, [days]);

  const openBooking = (bookingId: string) => {
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

  const colWidth = 44; // px per dag
  const labelWidth = 240; // px för bokningskolumnen

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
                  isToday ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground'
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
        {bookings.length === 0 ? (
          <div className="px-3 py-6 text-xs text-muted-foreground">
            Inga bokningar i projektet.
          </div>
        ) : (
          bookings.map((b) => {
            const phaseDates: Array<{
              phase: 'rig' | 'event' | 'rigDown';
              dates: string[];
            }> = [
              { phase: 'rig', dates: b.rig_dates ?? [] },
              { phase: 'event', dates: b.event_dates ?? [] },
              { phase: 'rigDown', dates: b.rigdown_dates ?? [] },
            ];

            return (
              <div
                key={b.id}
                className="flex items-stretch border-b border-border/40 hover:bg-muted/30"
              >
                <button
                  type="button"
                  onClick={() => openBooking(b.id)}
                  className="sticky left-0 z-[1] flex shrink-0 items-center gap-2 border-r border-border/40 bg-background px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                  style={{ width: labelWidth }}
                  title={b.display_name}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      {b.display_name}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {b.booking_number ? `#${b.booking_number}` : '—'}
                      {b.client ? ` · ${b.client}` : ''}
                    </div>
                  </div>
                </button>

                <div className="relative flex" style={{ minHeight: 36 }}>
                  {/* Bakgrundsraster */}
                  {days.map((d) => {
                    const isToday = d.date === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <div
                        key={d.date}
                        className={`border-l border-border/30 ${isToday ? 'bg-primary/5' : ''}`}
                        style={{ width: colWidth }}
                      />
                    );
                  })}
                  {/* Fas-block */}
                  {phaseDates.map(({ phase, dates }) =>
                    dates
                      .filter((dt) => dateToIndex.has(dt))
                      .map((dt) => {
                        const idx = dateToIndex.get(dt)!;
                        return (
                          <button
                            key={`${phase}-${dt}`}
                            type="button"
                            onClick={() => openBooking(b.id)}
                            className={`absolute top-1 bottom-1 rounded-sm px-1 text-[10px] font-medium text-white shadow-sm transition-colors ${PHASE_CLS[phase]}`}
                            style={{
                              left: idx * colWidth + 2,
                              width: colWidth - 4,
                            }}
                            title={`${PHASE_LABEL[phase]} · ${format(parseISO(dt), 'EEE d MMM', { locale: sv })}`}
                          >
                            <span className="truncate block">{PHASE_LABEL[phase]}</span>
                          </button>
                        );
                      }),
                  )}
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
