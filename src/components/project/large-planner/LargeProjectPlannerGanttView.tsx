/**
 * LargeProjectPlannerGanttView — read-only horisontell tidslinje.
 * --------------------------------------------------------------------------
 * Visar samma data som LargeProjectPlannerCalendarView (large_project_
 * booking_plan_items) men som klassiska Gantt-staplar.
 *
 * Regler:
 *  - Rader = projektets bokningar (+ "Övrigt" för items utan booking).
 *  - Konsekutiva dagar med SAMMA fas på samma bokning slås ihop till EN
 *    sammanhängande stapel (ingen daghackning).
 *  - Färger speglar personalkalenderns fas-pasteller:
 *      rig     → ljusgrön (#F2FCE2)
 *      event   → ljusgul  (#FEF7CD)
 *      rigDown → ljusröd  (#FEE2E2)
 *  - Orderrad-todos (booking_product_id != null) renderas ALDRIG som
 *    egna staplar — samma policy som kalendervyn.
 *  - "other"-items visar sin egna titel, inte ett generiskt "Uppgift".
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

// Pastellfärger som matchar personalkalenderns rig/event/rigDown-event
// (samma hex som .project-phase-* i ProjectCalendarView.css).
const PHASE_STYLE: Record<Phase, { bg: string; fg: string; border: string }> = {
  rig:     { bg: '#F2FCE2', fg: '#1f3a24', border: '#bfe5a8' },
  event:   { bg: '#FEF7CD', fg: '#3a2e0a', border: '#ecd97a' },
  rigDown: { bg: '#FEE2E2', fg: '#4a1d1d', border: '#f3b4b4' },
  other:   { bg: '#E5E7EB', fg: '#1f2937', border: '#cbd0d8' },
};

function resolvePhase(item: PlannerItemWithValidity): Phase {
  const raw = (item.phase ?? item.source_booking_phase ?? '').toLowerCase();
  if (raw === 'rig') return 'rig';
  if (raw === 'event') return 'event';
  if (raw === 'rigdown' || raw === 'rig_down') return 'rigDown';
  if (item.phase === 'rigDown' || item.source_booking_phase === 'rigDown') return 'rigDown';
  return 'other';
}

interface GanttSpan {
  id: string;
  phase: Phase;
  startIdx: number;
  span: number;
  title: string;
  dates: string[];
}

const LargeProjectPlannerGanttView = ({ ctx }: Props) => {
  const { isLoading, error, bookings, days, itemsWithAssignmentValidity } = ctx;

  const dateToIndex = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d.date, i));
    return m;
  }, [days]);

  // Filtrera bort orderrad-todos (samma policy som kalendervyn).
  const visibleItems = useMemo(
    () => itemsWithAssignmentValidity.filter((it) => !it.booking_product_id),
    [itemsWithAssignmentValidity],
  );

  const itemsByBooking = useMemo(() => {
    const map = new Map<string, PlannerItemWithValidity[]>();
    for (const it of visibleItems) {
      const key = it.booking_id ?? '__other__';
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return map;
  }, [visibleItems]);

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

  /**
   * Slå ihop konsekutiva dagar med samma fas till EN sammanhängande
   * Gantt-stapel per bokning.
   */
  const spansByRow = useMemo(() => {
    const out = new Map<string, GanttSpan[]>();
    for (const [rowKey, items] of itemsByBooking.entries()) {
      // Sortera per datum
      const sorted = [...items].sort((a, b) => a.plan_date.localeCompare(b.plan_date));
      // Gruppera per fas och slå ihop intilliggande dag-index.
      const byPhase = new Map<Phase, PlannerItemWithValidity[]>();
      for (const it of sorted) {
        if (!dateToIndex.has(it.plan_date)) continue;
        const ph = resolvePhase(it);
        const arr = byPhase.get(ph) ?? [];
        arr.push(it);
        byPhase.set(ph, arr);
      }

      const spans: GanttSpan[] = [];
      for (const [phase, list] of byPhase.entries()) {
        // Dedupe per datum (kan finnas flera items samma dag, en stapel räcker)
        const uniqByDate = new Map<string, PlannerItemWithValidity>();
        for (const it of list) {
          if (!uniqByDate.has(it.plan_date)) uniqByDate.set(it.plan_date, it);
        }
        const ordered = Array.from(uniqByDate.values()).sort((a, b) =>
          a.plan_date.localeCompare(b.plan_date),
        );

        let group: PlannerItemWithValidity[] = [];
        const flush = () => {
          if (group.length === 0) return;
          const first = group[0];
          const startIdx = dateToIndex.get(first.plan_date)!;
          const span = group.length;
          const dates = group.map((g) => g.plan_date);
          const titles = Array.from(new Set(group.map((g) => g.title).filter(Boolean)));
          const title =
            phase === 'other'
              ? titles.join(' · ') || PHASE_LABEL.other
              : PHASE_LABEL[phase];
          spans.push({
            id: `${rowKey}:${phase}:${first.plan_date}`,
            phase,
            startIdx,
            span,
            title,
            dates,
          });
          group = [];
        };

        for (const it of ordered) {
          if (group.length === 0) {
            group.push(it);
            continue;
          }
          const prev = group[group.length - 1];
          const prevIdx = dateToIndex.get(prev.plan_date)!;
          const curIdx = dateToIndex.get(it.plan_date)!;
          if (curIdx === prevIdx + 1) {
            group.push(it);
          } else {
            flush();
            group.push(it);
          }
        }
        flush();
      }
      out.set(rowKey, spans);
    }
    return out;
  }, [itemsByBooking, dateToIndex]);

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
  const labelWidth = 260;
  const rowHeight = 44;
  const barHeight = 26;

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
            const spans = spansByRow.get(row.key) ?? [];
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
                  {/* Spans (sammanhängande staplar per fas) */}
                  {spans.map((s) => {
                    const style = PHASE_STYLE[s.phase];
                    const left = s.startIdx * colWidth + 2;
                    const width = s.span * colWidth - 4;
                    const top = (rowHeight - barHeight) / 2;
                    const firstDate = s.dates[0];
                    const lastDate = s.dates[s.dates.length - 1];
                    const rangeLabel =
                      firstDate === lastDate
                        ? format(parseISO(firstDate), 'EEE d MMM', { locale: sv })
                        : `${format(parseISO(firstDate), 'd MMM', { locale: sv })} – ${format(parseISO(lastDate), 'd MMM', { locale: sv })}`;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openBooking(row.bookingId)}
                        className="absolute rounded-md px-2 text-[11px] font-semibold shadow-sm transition-all hover:brightness-95"
                        style={{
                          left,
                          width,
                          top,
                          height: barHeight,
                          background: style.bg,
                          color: style.fg,
                          border: `1px solid ${style.border}`,
                        }}
                        title={`${PHASE_LABEL[s.phase]} · ${s.title} · ${rangeLabel}`}
                      >
                        <span className="block truncate text-left leading-[24px]">
                          {s.phase === 'other' ? s.title : PHASE_LABEL[s.phase]}
                        </span>
                      </button>
                    );
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
