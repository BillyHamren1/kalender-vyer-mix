/**
 * BookingPlannerWorkspace — FULLSCREEN planeringsvy för en bokning i ett stort projekt.
 * --------------------------------------------------------------------------
 * ERSÄTTER tidigare BookingPlannerSheet (höger-drawer) när admin dubbelklickar
 * ett bokningsblock i projektkalendern. Tar över hela arbetsytan INOM
 * projektsidan (inte modal / inte Sheet). Ingen mörk overlay.
 *
 * HÅRDA REGLER:
 *  - Skriver ALDRIG till DB själv — delegerar till parent via callbacks.
 *  - Parent skriver endast till `large_project_booking_plan_items`.
 *  - Personalkalendern, calendar_events, staff_assignments,
 *    booking_staff_assignments och large_project_team_assignments rörs aldrig.
 *
 * Layout:
 *  - Sticky topbar (← Tillbaka, bokningsnr, kund, statuschip, actions)
 *  - Summary-row (adress, antal arbetsdagar, todos, klara, öppnad från)
 *  - 12-col grid desktop:
 *      vänster col-span-9: arbetsdagar + redigera + todos + orderrader
 *      höger   col-span-3: bokningsfakta + produktionsstatus + snabbfilter + snabbåtgärder
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ArrowLeft,
  Hash,
  Calendar as CalendarIcon,
  MapPin,
  User,
  Phone,
  Mail,
  StickyNote,
  ListChecks,
  Loader2,
  Package,
  CalendarPlus,
  Trash2,
  Clock,
  MessageSquare,
  Plus,
  CheckCircle2,
  AlertCircle,
  X,
  Building2,
  Activity,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import LargeProjectScheduleEditable from '@/components/project/LargeProjectScheduleEditable';
import { useBookingProductsForPlanner } from '@/hooks/useBookingProductsForPlanner';
import type { BookingProductForPlanner } from '@/hooks/useBookingProductsForPlanner';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';
import type { PlanWholeBookingSelection } from './BookingPlannerSheet';

interface Props {
  booking: LargeProjectPlannerBooking;
  items: LargeProjectBookingPlanItem[];
  staff: LargeProjectPlannerStaffMember[];
  /** Dag som klickades i kalendern (yyyy-MM-dd). Highlightas i översikten. */
  highlightDate?: string | null;
  /** Tillbaka till projektkalendern. */
  onBack: () => void;
  onCreateTodoForBooking: (booking: LargeProjectPlannerBooking, defaultDate?: string | null) => void;
  onCreateTodoForProduct?: (
    booking: LargeProjectPlannerBooking,
    product: BookingProductForPlanner,
    defaultDate?: string | null,
  ) => void;
  onPlanWholeBooking: (
    booking: LargeProjectPlannerBooking,
    selection: PlanWholeBookingSelection,
  ) => void | Promise<void>;
  onItemClick: (item: LargeProjectBookingPlanItem) => void;
  onItemDelete?: (item: LargeProjectBookingPlanItem) => void;
  onToggleItemStatus?: (item: LargeProjectBookingPlanItem, checked: boolean) => void;
}

const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : null);
const timeRange = (a: string | null, b: string | null) => {
  const x = fmtTime(a);
  const y = fmtTime(b);
  if (x && y) return `${x}–${y}`;
  return x || y || null;
};

const normalizeHHMM = (t: string | null | undefined, fallback: string): string => {
  if (!t) return fallback;
  if (t.includes('T')) return t.substring(11, 16);
  return t.substring(0, 5) || fallback;
};

const fmtDate = (iso: string, pattern = 'EEE d MMM') => {
  try {
    return format(parseISO(iso), pattern, { locale: sv });
  } catch {
    return iso;
  }
};

const PHASE_LABELS: Record<'rig' | 'event' | 'rigDown', string> = {
  rig: 'Uppmontering',
  event: 'Event',
  rigDown: 'Nedmontering',
};

const PHASE_ORDER: Array<'rig' | 'event' | 'rigDown'> = ['rig', 'event', 'rigDown'];

const buildInitialDrafts = (
  booking: LargeProjectPlannerBooking,
): PlanWholeBookingSelection['drafts'] => ({
  rig: {
    dates: [...booking.rig_dates].sort(),
    startTime: normalizeHHMM(booking.rig_start_time, '08:00'),
    endTime: normalizeHHMM(booking.rig_end_time, '17:00'),
  },
  event: {
    dates: [...booking.event_dates].sort(),
    startTime: normalizeHHMM(booking.event_start_time, '08:00'),
    endTime: normalizeHHMM(booking.event_end_time, '17:00'),
  },
  rigDown: {
    dates: [...booking.rigdown_dates].sort(),
    startTime: normalizeHHMM(booking.rigdown_start_time, '08:00'),
    endTime: normalizeHHMM(booking.rigdown_end_time, '17:00'),
  },
});

const EMPTY_DRAFTS: PlanWholeBookingSelection['drafts'] = {
  rig: { dates: [], startTime: '08:00', endTime: '17:00' },
  event: { dates: [], startTime: '08:00', endTime: '17:00' },
  rigDown: { dates: [], startTime: '08:00', endTime: '17:00' },
};

const SectionHeader = ({
  title,
  icon: Icon,
  hint,
  right,
}: {
  title: string;
  icon: typeof ListChecks;
  hint?: string;
  right?: React.ReactNode;
}) => (
  <div className="flex items-center gap-2.5">
    <Icon className="h-3.5 w-3.5 text-planner" />
    <div className="text-[13px] font-semibold text-foreground">{title}</div>
    {hint && <span className="text-[10.5px] text-muted-foreground">— {hint}</span>}
    {right && <div className="ml-auto">{right}</div>}
  </div>
);

const BookingPlannerWorkspace = ({
  booking,
  items,
  staff,
  highlightDate,
  onBack,
  onCreateTodoForBooking,
  onCreateTodoForProduct,
  onPlanWholeBooking,
  onItemClick,
  onItemDelete,
  onToggleItemStatus,
}: Props) => {
  const { data: products, isLoading: productsLoading, error: productsError } =
    useBookingProductsForPlanner(booking.id);

  const bookingItems = useMemo(
    () => items.filter((it) => it.booking_id === booking.id),
    [booking.id, items],
  );

  const workdayItems = useMemo(
    () =>
      bookingItems.filter(
        (it) =>
          it.item_type === 'booking' &&
          it.source === 'booking' &&
          !it.booking_product_id,
      ),
    [bookingItems],
  );

  const todoItems = useMemo(
    () => bookingItems.filter((it) => it.item_type === 'task' || it.item_type === 'manual'),
    [bookingItems],
  );

  const todosByDate = useMemo(() => {
    const map = new Map<string, LargeProjectBookingPlanItem[]>();
    for (const it of todoItems) {
      const key = it.plan_date || '__nodate__';
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    }
    return map;
  }, [todoItems]);

  const workdaysByPhase = useMemo(() => {
    const grouped: Record<'rig' | 'event' | 'rigDown', LargeProjectBookingPlanItem[]> = {
      rig: [],
      event: [],
      rigDown: [],
    };
    for (const it of workdayItems) {
      const phase = (it.source_booking_phase ?? it.phase) as 'rig' | 'event' | 'rigDown' | null;
      if (phase === 'rig' || phase === 'event' || phase === 'rigDown') {
        grouped[phase].push(it);
      }
    }
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => a.plan_date.localeCompare(b.plan_date));
    }
    return grouped;
  }, [workdayItems]);

  const plannedDateSet = useMemo(
    () => new Set(workdayItems.map((it) => it.plan_date)),
    [workdayItems],
  );

  const totalWorkdays = workdayItems.length;
  const totalTodos = todoItems.length;
  const doneTodos = todoItems.filter((it) => it.status === 'done').length;
  const missingDateTodos = todoItems.filter((it) => !it.plan_date).length;
  const missingStaffTodos = todoItems.filter((it) => !it.assigned_staff_id).length;
  const outsideTodos = todoItems.filter(
    (it) => it.plan_date && !plannedDateSet.has(it.plan_date),
  ).length;

  const planningStatus: 'empty' | 'partial' | 'planned' | 'done' = (() => {
    if (totalWorkdays === 0) return 'empty';
    if (totalTodos === 0) return 'planned';
    if (doneTodos === totalTodos) return 'done';
    return 'partial';
  })();

  const planningStatusLabel = {
    empty: 'Ej planerad',
    partial: 'Delvis planerad',
    planned: 'Planerad',
    done: 'Klar',
  }[planningStatus];

  const planningStatusClass = {
    empty: 'bg-muted text-muted-foreground border-border',
    partial: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
    planned: 'bg-planner/15 text-planner border-planner/30',
    done: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
  }[planningStatus];

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const [planRig, setPlanRig] = useState(true);
  const [planEvent, setPlanEvent] = useState(true);
  const [planRigDown, setPlanRigDown] = useState(true);
  const [drafts, setDrafts] = useState<PlanWholeBookingSelection['drafts']>(EMPTY_DRAFTS);
  const [savingPhases, setSavingPhases] = useState(false);

  useEffect(() => {
    const init = buildInitialDrafts(booking);
    setDrafts(init);
    setPlanRig(init.rig.dates.length > 0);
    setPlanEvent(init.event.dates.length > 0);
    setPlanRigDown(init.rigDown.dates.length > 0);
  }, [booking]);

  // Scrolla till klickad dag när workspace öppnas
  const highlightRowRef = useRef<HTMLElement | null>(null);
  const workdaysSectionRef = useRef<HTMLDivElement | null>(null);
  const todosSectionRef = useRef<HTMLDivElement | null>(null);
  const noDateSectionRef = useRef<HTMLDivElement | null>(null);
  const productsSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlightDate) return;
    const t = window.setTimeout(() => {
      highlightRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    return () => window.clearTimeout(t);
  }, [highlightDate, workdayItems.length]);

  const highlightedPhase = useMemo(() => {
    if (!highlightDate) return null;
    for (const ph of PHASE_ORDER) {
      if (workdaysByPhase[ph].some((it) => it.plan_date === highlightDate)) return ph;
    }
    return null;
  }, [highlightDate, workdaysByPhase]);

  const updateDraftPhase = (
    dateType: 'rig' | 'event' | 'rigDown',
    dates: string[],
    startTime: string,
    endTime: string,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [dateType]: {
        dates: Array.from(new Set(dates.filter(Boolean))).sort(),
        startTime: startTime || prev[dateType].startTime,
        endTime: endTime || prev[dateType].endTime,
      },
    }));
    if (dateType === 'rig' && dates.length > 0) setPlanRig(true);
    if (dateType === 'event' && dates.length > 0) setPlanEvent(true);
    if (dateType === 'rigDown' && dates.length > 0) setPlanRigDown(true);
  };

  const handleSavePhases = async () => {
    setSavingPhases(true);
    try {
      await onPlanWholeBooking(booking, {
        rig: planRig,
        event: planEvent,
        rigDown: planRigDown,
        productIdsForTodos: [],
        drafts,
      });
    } finally {
      setSavingPhases(false);
    }
  };

  const totalPlannedDays =
    (planRig ? drafts.rig.dates.length : 0) +
    (planEvent ? drafts.event.dates.length : 0) +
    (planRigDown ? drafts.rigDown.dates.length : 0);

  const datesUnion = useMemo(() => {
    const s = new Set<string>();
    workdayItems.forEach((it) => s.add(it.plan_date));
    todoItems.forEach((it) => it.plan_date && s.add(it.plan_date));
    return Array.from(s).sort();
  }, [workdayItems, todoItems]);

  const firstWorkday = workdayItems[0]?.plan_date ?? null;
  const suggestDefaultDate = (): string | null => {
    if (highlightDate && plannedDateSet.has(highlightDate)) return highlightDate;
    return firstWorkday;
  };

  const dateSpan = (() => {
    const dates = [
      ...booking.rig_dates,
      ...booking.event_dates,
      ...booking.rigdown_dates,
    ].sort();
    if (dates.length === 0) return null;
    const first = dates[0];
    const last = dates[dates.length - 1];
    return first === last
      ? fmtDate(first, 'd MMM yyyy')
      : `${fmtDate(first, 'd MMM')} – ${fmtDate(last, 'd MMM yyyy')}`;
  })();

  const scrollTo = (ref: React.RefObject<HTMLElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* ───── Sticky topbar ───── */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-gradient-to-b from-planner/10 to-planner/5 backdrop-blur">
        <div className="flex items-center gap-3 px-5 py-2.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={onBack}
            className="h-8 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Tillbaka till projektkalendern
          </Button>

          <div className="mx-1 h-5 w-px bg-border/60" />

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {booking.booking_number && (
              <span className="inline-flex items-center gap-1 shrink-0 rounded-md border border-border/60 bg-card px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-foreground/80">
                <Hash className="h-3 w-3 text-muted-foreground" />
                {booking.booking_number}
              </span>
            )}
            <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground">
              {booking.client?.trim() || booking.display_name}
            </h1>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${planningStatusClass}`}
            >
              {planningStatus === 'done' && <CheckCircle2 className="h-3 w-3" />}
              {planningStatusLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCreateTodoForBooking(booking, suggestDefaultDate())}
              className="h-8 border-planner/30 text-planner hover:bg-planner/10 hover:text-planner"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Skapa todo
            </Button>
            <Button
              size="sm"
              onClick={handleSavePhases}
              disabled={savingPhases || totalPlannedDays === 0}
              className="h-8 bg-planner text-white shadow-[0_2px_8px_-2px_hsl(var(--planner)/0.45)] hover:bg-planner/90"
            >
              {savingPhases ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Spara arbetsdagar
              {totalPlannedDays > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded bg-white/20 px-1 text-[10px] font-bold tabular-nums">
                  {totalPlannedDays}
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onBack}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              title="Stäng"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-2.5 text-[11.5px] text-muted-foreground">
          {(booking.deliveryaddress || booking.delivery_city) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {[booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ')}
            </span>
          )}
          <span className="inline-flex items-center gap-1 tabular-nums">
            <CalendarIcon className="h-3 w-3 text-planner" />
            {totalWorkdays} arbetsdag{totalWorkdays === 1 ? '' : 'ar'}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <ListChecks className="h-3 w-3 text-planner" />
            {totalTodos} todo{totalTodos === 1 ? '' : 's'}
            {totalTodos > 0 && ` · ${doneTodos}/${totalTodos} klara`}
          </span>
          {highlightDate && (
            <span className="inline-flex items-center gap-1 rounded-md border border-planner/30 bg-planner/15 px-1.5 py-0.5 font-medium text-planner">
              Öppnad från {fmtDate(highlightDate)}
              {highlightedPhase && ` · ${PHASE_LABELS[highlightedPhase]}`}
            </span>
          )}
        </div>
      </div>

      {/* ───── Main grid ───── */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-12">
          {/* === Vänster: huvudyta === */}
          <div className="space-y-5 lg:col-span-9">
            {/* Interna anteckningar */}
            {booking.internalnotes && (
              <section className="rounded-lg border border-amber-300/50 bg-amber-50/40 p-3 text-xs dark:bg-amber-950/20">
                <div className="mb-1 inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  <StickyNote className="h-3.5 w-3.5" />
                  Interna anteckningar
                </div>
                <div className="whitespace-pre-wrap text-foreground/90">
                  {booking.internalnotes}
                </div>
              </section>
            )}

            {/* 1. Planerade arbetsdagar */}
            <section
              ref={workdaysSectionRef}
              className="space-y-3 rounded-xl border border-border/60 bg-card p-4"
            >
              <SectionHeader
                title="Planerade arbetsdagar"
                icon={CalendarIcon}
                hint="från projektkalendern"
              />

              {workdayItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-5 text-center text-[12px] text-muted-foreground">
                  Inga arbetsdagar planerade ännu.<br />
                  Lägg först in när bokningen ska byggas, genomföras eller demonteras nedan.
                </div>
              ) : (
                <div className="space-y-3">
                  {PHASE_ORDER.map((phase) => {
                    const list = workdaysByPhase[phase];
                    if (list.length === 0) return null;
                    return (
                      <div key={phase} className="space-y-1.5">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {PHASE_LABELS[phase]}
                        </div>
                        <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60 bg-background">
                          {list.map((wd) => {
                            const todosThisDay = todosByDate.get(wd.plan_date) ?? [];
                            const doneThisDay = todosThisDay.filter((t) => t.status === 'done').length;
                            const isHighlighted = highlightDate === wd.plan_date;
                            return (
                              <li
                                key={wd.id}
                                ref={isHighlighted ? (el) => { highlightRowRef.current = el; } : undefined}
                                className={`flex items-center gap-3 px-3 py-2 text-[12px] transition-colors ${
                                  isHighlighted
                                    ? 'bg-planner/10 ring-1 ring-inset ring-planner/30'
                                    : 'hover:bg-muted/30'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium capitalize tabular-nums text-foreground">
                                    {fmtDate(wd.plan_date, 'EEEE d MMM')}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                                      <Clock className="h-2.5 w-2.5" />
                                      {timeRange(wd.start_time, wd.end_time) ?? '—'}
                                    </span>
                                    <span>
                                      {todosThisDay.length} todo{todosThisDay.length === 1 ? '' : 's'}
                                      {todosThisDay.length > 0 && ` · ${doneThisDay}/${todosThisDay.length} klara`}
                                    </span>
                                  </div>
                                </div>
                                {wd.status === 'done' && (
                                  <Badge variant="outline" className="border-emerald-300 text-[9.5px] text-emerald-700">
                                    Klar
                                  </Badge>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 2. Redigera arbetsdagar */}
            <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
              <SectionHeader
                title="Redigera arbetsdagar"
                icon={CalendarPlus}
                hint="lägg till, ändra eller ta bort dagar per fas"
              />
              <p className="text-[11px] text-muted-foreground">
                Välj datum och tider per fas. Endast bockade faser sparas.
                Befintliga arbetsdagar uppdateras automatiskt.
              </p>

              <div className="rounded-lg border border-border/60 bg-background p-3">
                <LargeProjectScheduleEditable
                  startDates={drafts.rig.dates}
                  eventDates={drafts.event.dates}
                  endDates={drafts.rigDown.dates}
                  startStartTime={drafts.rig.startTime}
                  startEndTime={drafts.rig.endTime}
                  eventStartTime={drafts.event.startTime}
                  eventEndTime={drafts.event.endTime}
                  endStartTime={drafts.rigDown.startTime}
                  endEndTime={drafts.rigDown.endTime}
                  onUpdateScheduleMulti={(dateType, dates, startTime, endTime) =>
                    updateDraftPhase(dateType, dates, startTime, endTime)
                  }
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                {(['rig', 'event', 'rigDown'] as const).map((p) => (
                  <label
                    key={p}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 hover:border-planner/40"
                  >
                    <Checkbox
                      checked={p === 'rig' ? planRig : p === 'event' ? planEvent : planRigDown}
                      onCheckedChange={(v) => {
                        const b = !!v;
                        if (p === 'rig') setPlanRig(b);
                        if (p === 'event') setPlanEvent(b);
                        if (p === 'rigDown') setPlanRigDown(b);
                      }}
                    />
                    <span className="flex-1">
                      <span className="font-medium">{PHASE_LABELS[p]}</span>
                      <span className="ml-1 tabular-nums text-muted-foreground">
                        ({drafts[p].dates.length})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {/* 3. Todos per arbetsdag */}
            <section
              ref={todosSectionRef}
              className="space-y-3 rounded-xl border border-border/60 bg-card p-4"
            >
              <SectionHeader
                title="Todos per arbetsdag"
                icon={ListChecks}
                hint={`${totalTodos} totalt · ${doneTodos} klara`}
              />

              {todoItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-5 text-center text-[12px] text-muted-foreground">
                  Inga todos skapade ännu. Skapa från orderrader eller fritt via "Skapa todo".
                </div>
              ) : (
                <div className="space-y-3">
                  {datesUnion.map((date) => {
                    const list = todosByDate.get(date) ?? [];
                    if (list.length === 0) return null;
                    const isPlannedWorkday = plannedDateSet.has(date);
                    const matchingPhase = PHASE_ORDER.find((p) =>
                      workdaysByPhase[p].some((w) => w.plan_date === date),
                    );
                    return (
                      <div key={date} className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span className="capitalize">{fmtDate(date, 'EEE d MMM')}</span>
                          {matchingPhase && (
                            <Badge variant="outline" className="border-planner/30 py-0 text-[9px] text-planner">
                              {PHASE_LABELS[matchingPhase]}
                            </Badge>
                          )}
                          {!isPlannedWorkday && (
                            <span className="inline-flex items-center gap-1 font-normal normal-case text-amber-700 dark:text-amber-400">
                              <AlertCircle className="h-3 w-3" />
                              Utanför planerade arbetsdagar
                            </span>
                          )}
                        </div>
                        <TodoList
                          list={list}
                          staffById={staffById}
                          onItemClick={onItemClick}
                          onItemDelete={onItemDelete}
                          onToggleItemStatus={onToggleItemStatus}
                        />
                      </div>
                    );
                  })}

                  {/* Saknar datum */}
                  {missingDateTodos > 0 && (
                    <div ref={noDateSectionRef} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3" />
                        Saknar datum
                      </div>
                      <TodoList
                        list={todosByDate.get('__nodate__') ?? []}
                        staffById={staffById}
                        onItemClick={onItemClick}
                        onItemDelete={onItemDelete}
                        onToggleItemStatus={onToggleItemStatus}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 4. Skapa todos från orderrader */}
            <section
              ref={productsSectionRef}
              className="rounded-xl border border-border/60 bg-card"
            >
              <Accordion type="single" collapsible defaultValue="products">
                <AccordionItem value="products" className="border-0">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
                      <Package className="h-3.5 w-3.5 text-planner" />
                      Skapa todos från orderrader
                      {products && (
                        <span className="text-[10.5px] font-normal text-muted-foreground">
                          ({products.length})
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {productsLoading && (
                      <div className="flex items-center gap-1 px-2 py-2 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Laddar orderrader…
                      </div>
                    )}
                    {productsError && (
                      <div className="px-2 py-2 text-[11px] text-destructive">
                        {(productsError as Error).message || 'Kunde inte ladda orderrader.'}
                      </div>
                    )}
                    {products && products.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border/60 p-3 text-center text-[11px] italic text-muted-foreground">
                        Inga orderrader på bokningen.
                      </div>
                    )}
                    {products && products.length > 0 && (
                      <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60 bg-background">
                        {products.map((p) => {
                          const linked = todoItems.filter((it) => it.booking_product_id === p.id);
                          const alreadyHasTodo = linked.length > 0;
                          return (
                            <li key={p.id} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[12.5px] font-medium text-foreground">
                                    {p.name || 'Namnlös rad'}
                                  </span>
                                  {alreadyHasTodo && (
                                    <Badge variant="outline" className="text-[9.5px]">
                                      {linked.length} todo
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10.5px] text-muted-foreground">
                                  {p.quantity != null && <span>{p.quantity} st</span>}
                                  {p.sku && <span>SKU: {p.sku}</span>}
                                </div>
                              </div>
                              {onCreateTodoForProduct && (
                                <Button
                                  size="sm"
                                  variant={alreadyHasTodo ? 'ghost' : 'outline'}
                                  className={`h-7 shrink-0 px-2 text-[10.5px] ${
                                    alreadyHasTodo
                                      ? 'text-muted-foreground'
                                      : 'border-planner/25 text-planner hover:border-planner/40 hover:bg-planner/10 hover:text-planner'
                                  }`}
                                  onClick={() => onCreateTodoForProduct(booking, p, suggestDefaultDate())}
                                >
                                  <Plus className="mr-1 h-3 w-3" />
                                  {alreadyHasTodo ? 'Lägg till till' : 'Skapa todo'}
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>
          </div>

          {/* === Höger: context-panel === */}
          <aside className="space-y-4 lg:col-span-3">
            {/* Bokningsfakta */}
            <section className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
              <div className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Building2 className="h-3 w-3 text-planner" />
                Bokningsfakta
              </div>
              <dl className="space-y-1.5 text-[11.5px]">
                {booking.booking_number && (
                  <FactRow label="Boknings-nr">
                    <span className="font-mono tabular-nums">#{booking.booking_number}</span>
                  </FactRow>
                )}
                {booking.client && <FactRow label="Kund">{booking.client}</FactRow>}
                {(booking.deliveryaddress || booking.delivery_city) && (
                  <FactRow label="Adress">
                    {[booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ')}
                  </FactRow>
                )}
                {booking.contact_name && (
                  <FactRow label="Kontakt">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" /> {booking.contact_name}
                      </span>
                      {booking.contact_phone && (
                        <a
                          href={`tel:${booking.contact_phone}`}
                          className="inline-flex items-center gap-1 text-foreground hover:underline"
                        >
                          <Phone className="h-3 w-3" /> {booking.contact_phone}
                        </a>
                      )}
                      {booking.contact_email && (
                        <a
                          href={`mailto:${booking.contact_email}`}
                          className="inline-flex items-center gap-1 text-foreground hover:underline"
                        >
                          <Mail className="h-3 w-3" /> {booking.contact_email}
                        </a>
                      )}
                    </div>
                  </FactRow>
                )}
                {dateSpan && <FactRow label="Datumspann">{dateSpan}</FactRow>}
              </dl>
            </section>

            {/* Produktionsstatus */}
            <section className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
              <div className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Activity className="h-3 w-3 text-planner" />
                Produktionsstatus
              </div>
              <ul className="space-y-1 text-[11.5px]">
                <StatRow label="Arbetsdagar" value={totalWorkdays} />
                <StatRow label="Todos totalt" value={totalTodos} />
                <StatRow label="Klara todos" value={`${doneTodos}/${totalTodos}`} tone={doneTodos === totalTodos && totalTodos > 0 ? 'good' : 'neutral'} />
                <StatRow label="Saknar datum" value={missingDateTodos} tone={missingDateTodos > 0 ? 'warn' : 'neutral'} />
                <StatRow label="Saknar personal" value={missingStaffTodos} tone={missingStaffTodos > 0 ? 'warn' : 'neutral'} />
                <StatRow label="Utanför arbetsdagar" value={outsideTodos} tone={outsideTodos > 0 ? 'warn' : 'neutral'} />
              </ul>
            </section>

            {/* Snabbfilter / hopp */}
            <section className="space-y-1.5 rounded-xl border border-border/60 bg-card p-4">
              <div className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ListChecks className="h-3 w-3 text-planner" />
                Hopp
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-full justify-start px-2 text-[11.5px]" onClick={() => scrollTo(workdaysSectionRef)}>
                Planerade arbetsdagar
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-full justify-start px-2 text-[11.5px]" onClick={() => scrollTo(todosSectionRef)}>
                Todos
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-full justify-start px-2 text-[11.5px]" onClick={() => scrollTo(noDateSectionRef)} disabled={missingDateTodos === 0}>
                Saknar datum {missingDateTodos > 0 && <span className="ml-1 tabular-nums">({missingDateTodos})</span>}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-full justify-start px-2 text-[11.5px]" onClick={() => scrollTo(productsSectionRef)}>
                Orderrader
              </Button>
            </section>

            {/* Snabbåtgärder */}
            <section className="space-y-1.5 rounded-xl border border-border/60 bg-card p-4">
              <div className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Zap className="h-3 w-3 text-planner" />
                Snabbåtgärder
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full justify-start border-planner/30 text-planner hover:bg-planner/10 hover:text-planner"
                onClick={() => onCreateTodoForBooking(booking, suggestDefaultDate())}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Skapa manuell todo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-full justify-start"
                onClick={() => scrollTo(productsSectionRef)}
              >
                <Package className="mr-1.5 h-3.5 w-3.5" />
                Skapa från orderrader
              </Button>
              <Button
                size="sm"
                className="h-8 w-full justify-start bg-planner text-white hover:bg-planner/90"
                onClick={handleSavePhases}
                disabled={savingPhases || totalPlannedDays === 0}
              >
                {savingPhases ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Spara arbetsdagar
              </Button>
            </section>
          </aside>
        </div>
      </ScrollArea>
    </div>
  );
};

const FactRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="text-foreground/90">{children}</dd>
  </div>
);

const StatRow = ({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  tone?: 'neutral' | 'good' | 'warn';
}) => {
  const cls =
    tone === 'good'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'warn'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-foreground';
  return (
    <li className="flex items-center justify-between gap-2 border-b border-border/40 py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
    </li>
  );
};

const TodoList = ({
  list,
  staffById,
  onItemClick,
  onItemDelete,
  onToggleItemStatus,
}: {
  list: LargeProjectBookingPlanItem[];
  staffById: Map<string, LargeProjectPlannerStaffMember>;
  onItemClick: (item: LargeProjectBookingPlanItem) => void;
  onItemDelete?: (item: LargeProjectBookingPlanItem) => void;
  onToggleItemStatus?: (item: LargeProjectBookingPlanItem, checked: boolean) => void;
}) => (
  <ul className="space-y-1.5">
    {list.map((it) => {
      const done = it.status === 'done';
      const assigned = it.assigned_staff_id ? staffById.get(it.assigned_staff_id) : null;
      const time = timeRange(it.start_time, it.end_time);
      return (
        <li
          key={it.id}
          className={`group flex items-start gap-2.5 rounded-lg border border-border/60 bg-background py-2 pl-2.5 pr-2 transition-all hover:border-planner/30 hover:shadow-sm ${
            done ? 'opacity-70' : ''
          }`}
        >
          {onToggleItemStatus && (
            <Checkbox
              checked={done}
              onCheckedChange={(c) => onToggleItemStatus(it, c === true)}
              className="mt-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <button type="button" onClick={() => onItemClick(it)} className="min-w-0 flex-1 text-left">
            <div
              className={`line-clamp-2 text-[12.5px] font-medium leading-tight text-foreground ${
                done ? 'line-through decoration-emerald-500/60' : ''
              }`}
            >
              {it.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
              {time ? (
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <Clock className="h-2.5 w-2.5" />
                  {time}
                </span>
              ) : (
                <span className="italic">Ej tid</span>
              )}
              {assigned ? (
                <span className="inline-flex items-center gap-0.5">
                  <User className="h-2.5 w-2.5" />
                  {assigned.name}
                </span>
              ) : (
                <span className="italic">Ej tilldelad</span>
              )}
              {it.notes && (
                <span className="inline-flex items-center gap-0.5" title={it.notes}>
                  <MessageSquare className="h-2.5 w-2.5" />
                  kommentar
                </span>
              )}
              {it.booking_product_id && (
                <span className="inline-flex items-center rounded bg-planner/10 px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-wide text-planner">
                  Orderrad
                </span>
              )}
            </div>
          </button>
          {onItemDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onItemDelete(it);
              }}
              title="Ta bort"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </li>
      );
    })}
  </ul>
);

export default BookingPlannerWorkspace;
