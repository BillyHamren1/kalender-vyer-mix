/**
 * BookingPlannerSheet — strikt arbetsordning
 * --------------------------------------------------------------------------
 * Höger-sidopanel (Sheet, ~760px) som ger admin EN tydlig flow per bokning:
 *
 *  Header  — kompakt bokningsinfo (namn, #nr, klient, kontakt, adress)
 *  1.      — Arbetsdagar (faseblock rig/event/rigDown med datum + tider)
 *            → "Spara arbetsdagar i projektkalendern"
 *  2.      — Todos (skapa från orderrader ELLER manuellt)
 *  3.      — Todos för denna bokning (checklista — toggle/edit/delete)
 *
 * Arbetsdagar och todos blandas ALDRIG visuellt.
 *
 * Skriver ALDRIG till DB själv — delegerar till parent via callbacks.
 * Parent skriver endast till `large_project_booking_plan_items`.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Hash,
  Calendar,
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
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import LargeProjectScheduleEditable from '@/components/project/LargeProjectScheduleEditable';
import { useBookingProductsForPlanner } from '@/hooks/useBookingProductsForPlanner';
import type { BookingProductForPlanner } from '@/hooks/useBookingProductsForPlanner';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';

interface PhaseDraft {
  dates: string[]; // YYYY-MM-DD, sorted, unique
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface PlanWholeBookingSelection {
  rig: boolean;
  event: boolean;
  rigDown: boolean;
  /**
   * Id:n på orderrader (booking_products) som ska bli to-dos vid commit.
   * Tomt = inga produkt-todos skapas. Per den nya arbetsordningen är detta
   * normalt tomt — todos skapas i steg 2 via egna knappar.
   */
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
  /** Öppna manuell-todo-dialog för bokningen (fritt). */
  onCreateTodoForBooking: (booking: LargeProjectPlannerBooking) => void;
  /** Öppna manuell-todo-dialog förifylld från en orderrad. */
  onCreateTodoForProduct?: (
    booking: LargeProjectPlannerBooking,
    product: BookingProductForPlanner,
  ) => void;
  /** Spara arbetsdagar (fasblock) till projektkalendern. */
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
  step,
  title,
  icon: Icon,
  hint,
}: {
  step: string;
  title: string;
  icon: typeof ListChecks;
  hint?: string;
}) => (
  <div className="flex items-center gap-2.5">
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-planner/15 text-[11px] font-bold text-planner ring-1 ring-planner/20">
      {step}
    </span>
    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5 text-planner" />
      {title}
    </div>
    {hint && (
      <span className="text-[10.5px] text-muted-foreground">— {hint}</span>
    )}
  </div>
);

const BookingPlannerSheet = ({
  open,
  onOpenChange,
  booking,
  items,
  staff,
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

  // Todos = allt utom item_type='booking' (fasblock)
  const todoItems = useMemo(
    () => bookingItems.filter((it) => it.item_type !== 'booking'),
    [bookingItems],
  );

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
      // Skapar ENDAST fasblock — produkter hanteras separat i steg 2
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[760px]"
      >
        {booking ? (
          <>
            {/* ───── Header: kompakt bokningsinfo ───── */}
            <SheetHeader className="border-b border-border/60 bg-planner/5 px-5 py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base font-semibold leading-tight">
                    {booking.client?.trim() || booking.display_name}
                  </SheetTitle>
                  <SheetDescription className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {booking.display_name}
                  </SheetDescription>
                </div>
                {booking.booking_number && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-card border border-border/60 font-mono tabular-nums text-[11px] font-medium text-foreground/80 shrink-0">
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    {booking.booking_number}
                  </span>
                )}
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
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-6 px-5 py-5">
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

                {/* ───── 1. Arbetsdagar ───── */}
                <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
                  <SectionHeader
                    step="1"
                    title="Arbetsdagar"
                    icon={CalendarPlus}
                    hint="planeras i projektkalendern"
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
                    <label className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 cursor-pointer hover:border-planner/40">
                      <Checkbox checked={planRig} onCheckedChange={(v) => setPlanRig(!!v)} />
                      <span className="flex-1">
                        <span className="font-medium">Rigg</span>
                        <span className="ml-1 text-muted-foreground tabular-nums">
                          ({drafts.rig.dates.length})
                        </span>
                      </span>
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 cursor-pointer hover:border-planner/40">
                      <Checkbox checked={planEvent} onCheckedChange={(v) => setPlanEvent(!!v)} />
                      <span className="flex-1">
                        <span className="font-medium">Event</span>
                        <span className="ml-1 text-muted-foreground tabular-nums">
                          ({drafts.event.dates.length})
                        </span>
                      </span>
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 cursor-pointer hover:border-planner/40">
                      <Checkbox checked={planRigDown} onCheckedChange={(v) => setPlanRigDown(!!v)} />
                      <span className="flex-1">
                        <span className="font-medium">Nedmontering</span>
                        <span className="ml-1 text-muted-foreground tabular-nums">
                          ({drafts.rigDown.dates.length})
                        </span>
                      </span>
                    </label>
                  </div>

                  <Button
                    size="sm"
                    onClick={handleSavePhases}
                    disabled={savingPhases || totalPlannedDays === 0}
                    className="w-full bg-planner text-white hover:bg-planner/90 shadow-[0_2px_8px_-2px_hsl(var(--planner)/0.45)]"
                  >
                    {savingPhases ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Spara arbetsdagar i projektkalendern
                    {totalPlannedDays > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-4 rounded bg-white/20 text-[10px] font-bold tabular-nums px-1">
                        {totalPlannedDays}
                      </span>
                    )}
                  </Button>
                </section>

                {/* ───── 2. Todos ───── */}
                <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
                  <SectionHeader
                    step="2"
                    title="Todos"
                    icon={ListPlus}
                    hint="skapa från orderrader eller fritt"
                  />

                  {/* A) Orderrader */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Package className="h-3 w-3" />
                      Orderrader {products ? `(${products.length})` : ''}
                    </div>

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
                      <ul className="divide-y divide-border/40 rounded-lg border border-border/60 bg-background">
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
                                  {p.is_package_component && <span>(paketdel)</span>}
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
                                  onClick={() => onCreateTodoForProduct(booking, p)}
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
                  </div>

                  {/* B) Manuell */}
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2">
                    <ListPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-[11px] text-muted-foreground">
                      Skapa fritt todo (titel, datum, person, kommentar)
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[10.5px] border-planner/25 text-planner hover:bg-planner/10 hover:text-planner hover:border-planner/40"
                      onClick={() => onCreateTodoForBooking(booking)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Skapa manuell todo
                    </Button>
                  </div>
                </section>

                {/* ───── 3. Todos för denna bokning ───── */}
                <section className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
                  <SectionHeader
                    step="3"
                    title="Todos för denna bokning"
                    icon={ListChecks}
                    hint={`${todoItems.length} totalt`}
                  />

                  {todoItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-[11px] text-muted-foreground">
                      Inga todos skapade ännu. Lägg till från en orderrad eller skapa fritt ovan.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {todoItems
                        .slice()
                        .sort((a, b) => {
                          if (a.plan_date !== b.plan_date)
                            return a.plan_date.localeCompare(b.plan_date);
                          return (a.start_time ?? '').localeCompare(b.start_time ?? '');
                        })
                        .map((it) => {
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
                                  <span className="inline-flex items-center gap-0.5 tabular-nums">
                                    <Calendar className="h-2.5 w-2.5" />
                                    {it.plan_date}
                                  </span>
                                  {time && (
                                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                                      <Clock className="h-2.5 w-2.5" />
                                      {time}
                                    </span>
                                  )}
                                  {assigned && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <User className="h-2.5 w-2.5" />
                                      {assigned.name}
                                    </span>
                                  )}
                                  {it.notes && (
                                    <span
                                      className="inline-flex items-center"
                                      title={it.notes}
                                    >
                                      <MessageSquare className="h-2.5 w-2.5" />
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
                  )}
                </section>
              </div>
            </ScrollArea>
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
