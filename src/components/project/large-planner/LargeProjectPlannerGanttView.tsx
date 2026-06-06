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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { parseISO, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarOff, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { useLargeProjectPlannerItems, PlannerItemWithValidity } from './useLargeProjectPlannerItems';
import InlinePhaseDateEditor from './InlinePhaseDateEditor';
import InlineTodoDateEditor from './InlineTodoDateEditor';

type PlannerCtx = ReturnType<typeof useLargeProjectPlannerItems>;

interface Props {
  ctx: PlannerCtx;
}

type TabKey = 'rig' | 'rigDown';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'rig', label: 'Uppmontering' },
  { key: 'rigDown', label: 'Nedmontering' },
];

type Phase = 'rig' | 'event' | 'rigDown' | 'other';

const PHASE_LABEL: Record<Phase, string> = {
  rig: 'Uppmontering',
  event: 'Event',
  rigDown: 'Nedmontering',
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
  startTime: string | null;
  endTime: string | null;
}

const LargeProjectPlannerGanttView = ({ ctx }: Props) => {
  const { id: largeProjectId } = useParams<{ id: string }>();
  const { isLoading, error, bookings, days, itemsWithAssignmentValidity, deleteItem } = ctx;
  const [activeTab, setActiveTab] = useState<TabKey>('rig');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAllTodos, setShowAllTodos] = useState(false);

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
            startTime: first.start_time ?? null,
            endTime: first.end_time ?? null,
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

  const navigate = useNavigate();

  const openBooking = (bookingId: string | null) => {
    if (!bookingId) return;
    window.dispatchEvent(
      new CustomEvent('lp-booking-sheet-open', { detail: { bookingId } }),
    );
  };

  const openBookingPage = (bookingId: string | null) => {
    if (!bookingId) return;
    navigate(`/booking/${bookingId}`);
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

  const labelWidth = 260;
  const rowHeight = 44;
  const barHeight = 26;
  const MIN_COL_WIDTH = 44;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bygg visibleDays = endast datum med spans i aktiv fas (oavsett bokning).
  const visibleDays = useMemo(() => {
    const datesWithPhase = new Set<string>();
    for (const spans of spansByRow.values()) {
      for (const s of spans) {
        if (s.phase !== activeTab) continue;
        for (const d of s.dates) datesWithPhase.add(d);
      }
    }
    return days.filter((d) => datesWithPhase.has(d.date));
  }, [days, spansByRow, activeTab]);

  const visibleDateToIndex = useMemo(() => {
    const m = new Map<string, number>();
    visibleDays.forEach((d, i) => m.set(d.date, i));
    return m;
  }, [visibleDays]);

  const colWidth = useMemo(() => {
    if (!containerWidth || visibleDays.length === 0) return MIN_COL_WIDTH;
    const avail = containerWidth - labelWidth;
    return Math.max(MIN_COL_WIDTH, Math.floor(avail / visibleDays.length));
  }, [containerWidth, visibleDays.length]);

  // Filtrera + sortera rader baserat på aktiv flik.
  const visibleRows = (() => {
    const phaseFilter = activeTab;
    return rows
      .map((row) => {
        const spans = spansByRow.get(row.key) ?? [];
        const phaseSpans = spans.filter((s) => s.phase === phaseFilter);
        if (phaseSpans.length === 0) return null;
        const minIdx = Math.min(
          ...phaseSpans.map((s) => visibleDateToIndex.get(s.dates[0]) ?? 0),
        );
        return { row, minIdx };
      })
      .filter((x): x is { row: typeof rows[number]; minIdx: number } => !!x)
      .sort((a, b) => a.minIdx - b.minIdx)
      .map((x) => x.row);
  })();

  // Todos per bokning (item_type != 'booking'), inkl. orderrad-todos.
  const todosByBooking = useMemo(() => {
    const map = new Map<string, PlannerItemWithValidity[]>();
    for (const it of itemsWithAssignmentValidity) {
      if (it.item_type === 'booking') continue;
      if (!it.booking_id) continue;
      const arr = map.get(it.booking_id) ?? [];
      arr.push(it);
      map.set(it.booking_id, arr);
    }
    return map;
  }, [itemsWithAssignmentValidity]);

  const todoRowHeight = 28;

  return (
    <div ref={scrollerRef} className="flex-1 overflow-auto">
      {/* Flikar */}
      <div
        role="tablist"
        aria-label="Fasfilter"
        className="sticky top-0 z-20 flex items-center gap-1 border-b border-border/60 bg-card/95 px-3 py-2 backdrop-blur"
      >
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.key)}
              className={[
                'inline-flex items-center rounded-md px-3 h-8 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
        <label className="ml-2 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAllTodos}
            onChange={(e) => setShowAllTodos(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Visa uppgifter
        </label>
      </div>

      {visibleDays.length === 0 ? (
        <div className="px-3 py-6 text-xs text-muted-foreground">
          Inga datum för vald fas.
        </div>
      ) : (
      <div className="min-w-max">
        {/* Header */}
        <div
          className="sticky top-[49px] z-10 flex border-b border-border/60 bg-card/95 backdrop-blur"
          style={{ paddingLeft: labelWidth }}
        >
          {visibleDays.map((d) => {
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
        {visibleRows.length === 0 ? (
          <div className="px-3 py-6 text-xs text-muted-foreground">
            {rows.length === 0 ? 'Inga bokningar i projektet.' : 'Inga rader för vald fas.'}
          </div>
        ) : (
          visibleRows.map((row) => {
            const allSpans = spansByRow.get(row.key) ?? [];
            const spans = allSpans.filter((s) => s.phase === activeTab);
            const isExpanded = !!expanded[row.key] || showAllTodos;
            const todos = (row.bookingId && todosByBooking.get(row.bookingId)) || [];
            // Fallback-span (för todos utan datum i vyn) = första phase-spannet.
            const fallbackSpan = spans[0];
            return (
              <div
                key={row.key}
                className="flex flex-col border-b border-border/40 hover:bg-muted/30"
              >
                <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [row.key]: !e[row.key] }))}
                  className="sticky left-0 z-[1] flex shrink-0 items-center gap-2 border-r border-border/40 bg-background px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                  style={{ width: labelWidth }}
                  title={row.title}
                >
                  <span className="text-[10px] text-muted-foreground w-3">
                    {isExpanded ? '▾' : '▸'}
                  </span>
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
                  {visibleDays.map((d) => {
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
                    const startIdx = visibleDateToIndex.get(s.dates[0]) ?? 0;
                    const lastIdx = visibleDateToIndex.get(s.dates[s.dates.length - 1]) ?? startIdx;
                    const left = startIdx * colWidth + 2;
                    const width = (lastIdx - startIdx + 1) * colWidth - 4;
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
                        onClick={() => setExpanded((e) => ({ ...e, [row.key]: !e[row.key] }))}
                        onDoubleClick={(ev) => { ev.stopPropagation(); openBooking(row.bookingId); }}
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
                        title={`${PHASE_LABEL[s.phase]} · ${row.title}${row.subtitle ? ' · ' + row.subtitle : ''} · ${rangeLabel}`}
                      >
                        <span className="flex items-center gap-2 truncate text-left leading-[24px]">
                          <span className="truncate font-semibold">{row.title}</span>
                          {row.subtitle && (
                            <span className="truncate text-[10px] font-normal opacity-75">
                              {row.subtitle}
                            </span>
                          )}
                          <span className="ml-auto shrink-0 flex items-center gap-1.5">
                            <InlinePhaseDateEditor
                              bookingId={row.bookingId}
                              largeProjectId={largeProjectId ?? null}
                              phase={s.phase}
                              currentDates={s.dates}
                              startTime={s.startTime}
                              endTime={s.endTime}
                              label={rangeLabel}
                              title={row.title}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-white/40 hover:bg-white/70 transition-colors"
                            />
                            <span className="text-[10px] font-normal opacity-75">
                              {PHASE_LABEL[s.phase]}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                </div>

                {/* Inline todos */}
                {isExpanded && todos.length > 0 && (
                  <div className="bg-muted/20">
                    {todos.map((t) => {
                      const hasDate = visibleDateToIndex.has(t.plan_date);
                      let startIdx: number;
                      let spanLen: number;
                      let rangeLabel: string;
                      if (hasDate) {
                        startIdx = visibleDateToIndex.get(t.plan_date)!;
                        spanLen = 1;
                        rangeLabel = format(parseISO(t.plan_date), 'EEE d MMM', { locale: sv });
                      } else if (fallbackSpan) {
                        startIdx = visibleDateToIndex.get(fallbackSpan.dates[0]) ?? 0;
                        const lastIdx = visibleDateToIndex.get(fallbackSpan.dates[fallbackSpan.dates.length - 1]) ?? startIdx;
                        spanLen = lastIdx - startIdx + 1;
                        const a = fallbackSpan.dates[0];
                        const b = fallbackSpan.dates[fallbackSpan.dates.length - 1];
                        rangeLabel = a === b
                          ? format(parseISO(a), 'EEE d MMM', { locale: sv })
                          : `${format(parseISO(a), 'd MMM', { locale: sv })} – ${format(parseISO(b), 'd MMM', { locale: sv })}`;
                      } else {
                        return null;
                      }
                      const left = startIdx * colWidth + 6;
                      const width = spanLen * colWidth - 12;
                      const top = 4;
                      const done = t.status === 'done';
                      return (
                        <div
                          key={t.id}
                          className="flex items-stretch border-t border-border/30"
                        >
                          <div
                            className="sticky left-0 z-[1] flex shrink-0 items-center gap-2 border-r border-border/40 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground group"
                            style={{ width: labelWidth, paddingLeft: 28 }}
                            title={t.title}
                          >
                            <span className="truncate flex-1">
                              {done ? '✓ ' : '• '}{t.title}
                            </span>
                            <button
                              type="button"
                              onClick={async (ev) => {
                                ev.stopPropagation();
                                ev.preventDefault();
                                if (!window.confirm(`Ta bort uppgiften "${t.title}"?`)) return;
                                try {
                                  await deleteItem(t.id);
                                  toast.success('Uppgift borttagen');
                                } catch (e: any) {
                                  toast.error(e?.message || 'Kunde inte ta bort uppgiften');
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20 shrink-0"
                              title="Ta bort uppgift"
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                          <div className="relative flex" style={{ minHeight: todoRowHeight }}>
                            {visibleDays.map((d) => (
                              <div
                                key={d.date}
                                className="border-l border-border/20"
                                style={{ width: colWidth }}
                              />
                            ))}
                            <div
                              className="absolute rounded-md px-1 flex items-center"
                              style={{
                                left,
                                width: Math.max(width, 20),
                                top,
                                height: todoRowHeight - 8,
                                background: done ? '#E5E7EB' : '#EEF4FF',
                                color: done ? '#4b5563' : '#1e3a8a',
                                border: `1px solid ${done ? '#cbd0d8' : '#c7d6f5'}`,
                                textDecoration: done ? 'line-through' : 'none',
                              }}
                            >
                              <InlineTodoDateEditor
                                itemId={t.id}
                                currentDate={hasDate ? t.plan_date : (fallbackSpan?.dates[0] ?? t.plan_date)}
                                label={rangeLabel}
                                inherited={!hasDate}
                                title={t.title}
                                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium hover:bg-white/70 transition-colors w-full justify-start"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {isExpanded && todos.length === 0 && (
                  <div className="border-t border-border/30 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground"
                       style={{ paddingLeft: labelWidth + 12 }}>
                    Inga todos för denna bokning.
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      )}
    </div>
  );
};

export default LargeProjectPlannerGanttView;
