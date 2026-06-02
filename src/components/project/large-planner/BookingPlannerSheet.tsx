/**
 * BookingPlannerSheet — Planeringspanel för en bokning i ett stort projekt
 * --------------------------------------------------------------------------
 * Höger-sidopanel (~860px) som ger admin EN tydlig översikt + redigering per
 * bokning i ett stort projekt.
 *
 *  1. Kompakt premium-header (bokningsnr/kund/adress + progresschips)
 *  2. Översikt: Planerade arbetsdagar (från large_project_booking_plan_items
 *     där item_type='booking' + source='booking', grupperat per fas)
 *  3. Redigera arbetsdagar (fas-editor)
 *  4. Todos per arbetsdag (grupperat per plan_date)
 *  5. Skapa todos från orderrader (accordion)
 *  6. Skapa manuell todo
 *
 * Skriver ALDRIG till DB själv — delegerar till parent via callbacks.
 * Parent skriver endast till `large_project_booking_plan_items`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Hash,
  Calendar as CalendarIcon,
  MapPin,
  User,
  Phone,
  Mail,
  StickyNote,
  ListChecks,
  ListPlus,
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
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
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

interface PhaseDraft {
  dates: string[];
  startTime: string;
  endTime: string;
}

export interface PlanWholeBookingSelection {
  rig: boolean;
  event: boolean;
  rigDown: boolean;
  productIdsForTodos: string[];
  drafts: {
    rig: PhaseDraft;
    event: PhaseDraft;
    rigDown: PhaseDraft;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: LargeProjectPlannerBooking | null;
  items: LargeProjectBookingPlanItem[];
  staff: LargeProjectPlannerStaffMember[];
  /** Dag som klickades i kalendern (yyyy-MM-dd). Highlightas i översikten. */
  highlightDate?: string | null;
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

/**
 * Bygger drafts från faktiskt sparade arbetsdagar i large_project_booking_plan_items.
 * Faller tillbaka till booking-fältens default-tider (men ALDRIG datum) om inga
 * workday-items finns. Datum ska komma uteslutande från planner-items.
 */
const buildDraftsFromWorkdayItems = (
  booking: LargeProjectPlannerBooking,
  workdays: LargeProjectBookingPlanItem[],
): PlanWholeBookingSelection['drafts'] => {
  const fallback = buildInitialDrafts(booking);
  const grouped: PlanWholeBookingSelection['drafts'] = {
    rig: { dates: [], startTime: fallback.rig.startTime, endTime: fallback.rig.endTime },
    event: { dates: [], startTime: fallback.event.startTime, endTime: fallback.event.endTime },
    rigDown: { dates: [], startTime: fallback.rigDown.startTime, endTime: fallback.rigDown.endTime },
  };
  for (const item of workdays) {
    const phase = (item.source_booking_phase ?? item.phase) as 'rig' | 'event' | 'rigDown' | null;
    if (phase !== 'rig' && phase !== 'event' && phase !== 'rigDown') continue;
    if (!item.plan_date) continue;
    grouped[phase].dates.push(item.plan_date);
    if (item.start_time) grouped[phase].startTime = item.start_time.slice(0, 5);
    if (item.end_time) grouped[phase].endTime = item.end_time.slice(0, 5);
  }
  for (const phase of ['rig', 'event', 'rigDown'] as const) {
    grouped[phase].dates = Array.from(new Set(grouped[phase].dates)).sort();
  }
  return grouped;
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

const BookingPlannerSheet = ({
  open,
  onOpenChange,
  booking,
  items,
  staff,
  highlightDate,
  onCreateTodoForBooking,
  onCreateTodoForProduct,
  onPlanWholeBooking,
  onItemClick,
  onItemDelete,
  onToggleItemStatus,
}: Props) => {
  const bookingId = booking?.id ?? null;
  const { data: products, isLoading: productsLoading, error: productsError } =
    useBookingProductsForPlanner(open ? bookingId : null);

  const bookingItems = useMemo(
    () => (booking ? items.filter((it) => it.booking_id === booking.id) : []),
    [booking, items],
  );

  // Arbetsdagar = item_type='booking' + source='booking' + ej orderrad
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

  // Todos = task/manual
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
    if (!open || !booking) return;
    const init = buildInitialDrafts(booking);
    setDrafts(init);
    setPlanRig(init.rig.dates.length > 0);
    setPlanEvent(init.event.dates.length > 0);
    setPlanRigDown(init.rigDown.dates.length > 0);
  }, [open, booking]);

  // Scrolla till klickad dag när panelen öppnas
  const highlightRowRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || !highlightDate) return;
    const t = window.setTimeout(() => {
      highlightRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    return () => window.clearTimeout(t);
  }, [open, highlightDate, workdayItems.length]);

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
    if (!booking) return;
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
    todoItems.forEach((it) => s.add(it.plan_date));
    return Array.from(s).sort();
  }, [workdayItems, todoItems]);

  // Bygg suggested defaultDate för "Skapa todo"
  const firstWorkday = workdayItems[0]?.plan_date ?? null;
  const suggestDefaultDate = (): string | null => {
    if (highlightDate && plannedDateSet.has(highlightDate)) return highlightDate;
    return firstWorkday;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[860px]"
      >
        {booking ? (
          <>
            {/* ───── Sticky header ───── */}
            <SheetHeader className="sticky top-0 z-10 border-b border-border/60 bg-gradient-to-b from-planner/10 to-planner/5 px-5 py-3 space-y-2 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {booking.booking_number && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-card border border-border/60 font-mono tabular-nums text-[11px] font-medium text-foreground/80 shrink-0">
                        <Hash className="h-3 w-3 text-muted-foreground" />
                        {booking.booking_number}
                      </span>
                    )}
                    <SheetTitle className="truncate text-base font-semibold leading-tight">
                      {booking.client?.trim() || booking.display_name}
                    </SheetTitle>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-semibold uppercase tracking-wide ${planningStatusClass}`}
                    >
                      {planningStatus === 'done' && <CheckCircle2 className="h-3 w-3" />}
                      {planningStatusLabel}
                    </span>
                  </div>
                  <SheetDescription className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {booking.client?.trim() && booking.display_name !== booking.client
                      ? booking.display_name
                      : ''}
                  </SheetDescription>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {(booking.deliveryaddress || booking.delivery_city) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[booking.deliveryaddress, booking.delivery_city]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                )}
                {booking.contact_name && (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" /> {booking.contact_name}
                  </span>
                )}
                {booking.contact_phone && (
                  <a
                    href={`tel:${booking.contact_phone}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Phone className="h-3 w-3" /> {booking.contact_phone}
                  </a>
                )}
                {booking.contact_email && (
                  <a
                    href={`mailto:${booking.contact_email}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Mail className="h-3 w-3" /> {booking.contact_email}
                  </a>
                )}
              </div>

              {/* Progresschips */}
              <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-card border border-border/60 tabular-nums">
                  <CalendarIcon className="h-2.5 w-2.5 text-planner" />
                  {totalWorkdays} arbetsdag{totalWorkdays === 1 ? '' : 'ar'}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-card border border-border/60 tabular-nums">
                  <ListChecks className="h-2.5 w-2.5 text-planner" />
                  {totalTodos} todo{totalTodos === 1 ? '' : 's'}
                </span>
                {totalTodos > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 tabular-nums dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {doneTodos}/{totalTodos} klara
                  </span>
                )}
                {highlightDate && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-planner/15 border border-planner/30 text-planner font-medium">
                    Öppnad från {fmtDate(highlightDate)}
                    {highlightedPhase && ` · ${PHASE_LABELS[highlightedPhase]}`}
                  </span>
                )}
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-5 px-5 py-5 pb-24">
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

                {/* ───── 1. Översikt: Planerade arbetsdagar ───── */}
                <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
                  <SectionHeader
                    title="Planerade arbetsdagar"
                    icon={CalendarIcon}
                    hint="från projektkalendern"
                  />

                  {workdayItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 p-5 text-center text-[12px] text-muted-foreground">
                      Inga arbetsdagar planerade ännu.<br />
                      Lägg först in när bokningen ska byggas, genomföras eller demonteras.
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
                            <ul className="divide-y divide-border/40 rounded-lg border border-border/60 bg-background overflow-hidden">
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
                                      <div className="font-medium text-foreground capitalize tabular-nums">
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
                                      <Badge variant="outline" className="text-[9.5px] border-emerald-300 text-emerald-700">
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

                {/* ───── 2. Redigera arbetsdagar ───── */}
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
                        className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 cursor-pointer hover:border-planner/40"
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
                          <span className="ml-1 text-muted-foreground tabular-nums">
                            ({drafts[p].dates.length})
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>

                {/* ───── 3. Todos per arbetsdag ───── */}
                <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
                  <SectionHeader
                    title="Todos per arbetsdag"
                    icon={ListChecks}
                    hint={`${totalTodos} totalt · ${doneTodos} klara`}
                  />

                  {todoItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 p-5 text-center text-[12px] text-muted-foreground">
                      Inga todos skapade ännu. Skapa från orderrader eller fritt nedan.
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
                                <Badge
                                  variant="outline"
                                  className="text-[9px] py-0 border-planner/30 text-planner"
                                >
                                  {PHASE_LABELS[matchingPhase]}
                                </Badge>
                              )}
                              {!isPlannedWorkday && (
                                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 normal-case font-normal">
                                  <AlertCircle className="h-3 w-3" />
                                  Utanför planerade arbetsdagar
                                </span>
                              )}
                            </div>
                            <ul className="space-y-1.5">
                              {list.map((it) => {
                                const done = it.status === 'done';
                                const assigned = it.assigned_staff_id
                                  ? staffById.get(it.assigned_staff_id)
                                  : null;
                                const time = timeRange(it.start_time, it.end_time);
                                return (
                                  <li
                                    key={it.id}
                                    className={`group flex items-start gap-2.5 rounded-lg border border-border/60 bg-background pl-2.5 pr-2 py-2 transition-all hover:border-planner/30 hover:shadow-sm ${
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
                                    <button
                                      type="button"
                                      onClick={() => onItemClick(it)}
                                      className="min-w-0 flex-1 text-left"
                                    >
                                      <div
                                        className={`text-[12.5px] font-medium leading-tight text-foreground line-clamp-2 ${
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
                                          <span
                                            className="inline-flex items-center gap-0.5"
                                            title={it.notes}
                                          >
                                            <MessageSquare className="h-2.5 w-2.5" />
                                            kommentar
                                          </span>
                                        )}
                                        {it.booking_product_id && (
                                          <span className="inline-flex items-center px-1.5 py-0 rounded bg-planner/10 text-planner text-[9.5px] font-semibold uppercase tracking-wide">
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* ───── 4. Skapa todos från orderrader (accordion) ───── */}
                <section className="rounded-xl border border-border/60 bg-card">
                  <Accordion type="single" collapsible>
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
                          <ul className="divide-y divide-border/40 rounded-lg border border-border/60 bg-background overflow-hidden">
                            {products.map((p) => {
                              const linked = todoItems.filter(
                                (it) => it.booking_product_id === p.id,
                              );
                              const alreadyHasTodo = linked.length > 0;
                              return (
                                <li
                                  key={p.id}
                                  className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30"
                                >
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
                                      className={`h-7 px-2 text-[10.5px] shrink-0 ${
                                        alreadyHasTodo
                                          ? 'text-muted-foreground'
                                          : 'border-planner/25 text-planner hover:bg-planner/10 hover:text-planner hover:border-planner/40'
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
            </ScrollArea>

            {/* ───── Sticky footer ───── */}
            <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border/60 bg-card/95 px-5 py-3 backdrop-blur">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-8"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Stäng
              </Button>
              <div className="flex-1" />
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
                className="h-8 bg-planner text-white hover:bg-planner/90 shadow-[0_2px_8px_-2px_hsl(var(--planner)/0.45)]"
              >
                {savingPhases ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Spara arbetsdagar
                {totalPlannedDays > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-4 rounded bg-white/20 text-[10px] font-bold tabular-nums px-1">
                    {totalPlannedDays}
                  </span>
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Ingen bokning vald.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default BookingPlannerSheet;
