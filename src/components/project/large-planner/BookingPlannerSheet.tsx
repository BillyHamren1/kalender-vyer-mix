/**
 * BookingPlannerSheet
 * --------------------------------------------------------------------------
 * Höger-sidopanel (Sheet, ~760px) som ger admin FULL överblick över EN
 * bokning inuti ett stort projekt — utan att ta över hela skärmen.
 *
 * Innehåller:
 *  - Bokningsheader (namn, #nr, klient, kontaktperson, telefon, e-post, plats)
 *  - Faser (rig / event / rigDown) med datum + tider
 *  - Interna anteckningar (om finns)
 *  - Knapp "Planera hela bokningen i kalendern" → skapar planner-items för
 *    alla bokningens faser i ett svep
 *  - Knapp "Skapa to-do" (fritt)
 *  - Lista över ALLA orderrader (booking_products) med per-rad:
 *      • antal kopplade to-dos
 *      • inline-rad med datum/tid för varje to-do
 *      • "+ To-do"-knapp
 *  - Lista över alla planerade to-dos för bokningen (klickbara → edit)
 *
 * Skriver INTE själv till DB — delegerar till parent via callbacks.
 */
import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import LargeProjectScheduleEditable from '@/components/project/LargeProjectScheduleEditable';
import LargeProjectPlannerTaskCard from './LargeProjectPlannerTaskCard';
import { useBookingProductsForPlanner, type BookingProductForPlanner } from '@/hooks/useBookingProductsForPlanner';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';

interface PhaseDraft {
  dates: string[];   // YYYY-MM-DD, sorted, unique
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface PlanWholeBookingSelection {
  rig: boolean;
  event: boolean;
  rigDown: boolean;
  /**
   * Id:n på orderrader (booking_products) som ska bli to-dos vid commit.
   * Tomt array = inga produkt-todos skapas. Default = alla rader utan
   * befintlig to-do.
   */
  productIdsForTodos: string[];
  /**
   * Aktuellt lokalt utkast (datum + tider) per fas. DETTA är sanningen
   * när Planera klickas — DB-skrivningen sker först här.
   */
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
  onCreateTodoForBooking: (booking: LargeProjectPlannerBooking) => void;
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
    dates: booking.rig_dates.length
      ? [...booking.rig_dates].sort()
      : booking.rigdaydate
        ? [booking.rigdaydate]
        : [],
    startTime: normalizeHHMM(booking.rig_start_time, '08:00'),
    endTime: normalizeHHMM(booking.rig_end_time, '17:00'),
  },
  event: {
    dates: booking.event_dates.length
      ? [...booking.event_dates].sort()
      : booking.eventdate
        ? [booking.eventdate]
        : [],
    startTime: normalizeHHMM(booking.event_start_time, '08:00'),
    endTime: normalizeHHMM(booking.event_end_time, '17:00'),
  },
  rigDown: {
    dates: booking.rigdown_dates.length
      ? [...booking.rigdown_dates].sort()
      : booking.rigdowndate
        ? [booking.rigdowndate]
        : [],
    startTime: normalizeHHMM(booking.rigdown_start_time, '08:00'),
    endTime: normalizeHHMM(booking.rigdown_end_time, '17:00'),
  },
});

const EMPTY_DRAFTS: PlanWholeBookingSelection['drafts'] = {
  rig: { dates: [], startTime: '08:00', endTime: '17:00' },
  event: { dates: [], startTime: '08:00', endTime: '17:00' },
  rigDown: { dates: [], startTime: '08:00', endTime: '17:00' },
};

const BookingPlannerSheet = ({
  open,
  onOpenChange,
  booking,
  items,
  staff,
  onCreateTodoForBooking,
  onPlanWholeBooking,
  onItemClick,
  onItemDelete,
  onToggleItemStatus,
}: Props) => {
  const bookingId = booking?.id ?? null;
  const { data: products, isLoading: productsLoading, error: productsError } =
    useBookingProductsForPlanner(open ? bookingId : null);

  const bookingItems = booking
    ? items.filter((it) => it.booking_id === booking.id)
    : [];
  const hasAnyPlan = bookingItems.length > 0;
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const [planRig, setPlanRig] = useState(true);
  const [planEvent, setPlanEvent] = useState(true);
  const [planRigDown, setPlanRigDown] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<PlanWholeBookingSelection['drafts']>(EMPTY_DRAFTS);

  // Default: alla orderrader utan befintlig to-do är förvalda
  useEffect(() => {
    if (!open || !booking) return;
    const init = buildInitialDrafts(booking);
    setDrafts(init);
    setPlanRig(init.rig.dates.length > 0);
    setPlanEvent(init.event.dates.length > 0);
    setPlanRigDown(init.rigDown.dates.length > 0);
  }, [open, booking]);

  // När produkter laddats: förvälj alla rader som inte redan har to-do
  useEffect(() => {
    if (!open || !booking || !products) return;
    const linkedProductIds = new Set(
      bookingItems
        .map((it) => it.booking_product_id)
        .filter((id): id is string => !!id),
    );
    setSelectedProductIds(
      new Set(products.filter((p) => !linkedProductIds.has(p.id)).map((p) => p.id)),
    );
    // bookingItems beror på items + booking — vi vill bara köra när products byts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, booking?.id, products]);

  const toggleProduct = (id: string, checked: boolean) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectableProducts = (products ?? []).filter(
    (p) => !bookingItems.some((it) => it.booking_product_id === p.id),
  );
  const allSelected =
    selectableProducts.length > 0 &&
    selectableProducts.every((p) => selectedProductIds.has(p.id));
  const toggleAllProducts = () => {
    if (allSelected) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(selectableProducts.map((p) => p.id)));
    }
  };

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
    // Aktivera fasen automatiskt när användaren just lagt in datum
    if (dateType === 'rig' && dates.length > 0) setPlanRig(true);
    if (dateType === 'event' && dates.length > 0) setPlanEvent(true);
    if (dateType === 'rigDown' && dates.length > 0) setPlanRigDown(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[760px]"
      >
        {booking ? (
          <>
            {/* ───── Header: namn + kontakt + plats ───── */}
            <SheetHeader className="border-b border-border/60 bg-primary/5 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base font-semibold">
                    {booking.display_name}
                  </SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {booking.booking_number && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Hash className="h-3 w-3" />
                        {booking.booking_number}
                      </span>
                    )}
                    {booking.client && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <User className="h-3 w-3" />
                        {booking.client}
                      </span>
                    )}
                  </SheetDescription>
                </div>
              </div>

              {/* Kontakt + adress */}
              <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
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
                {(booking.deliveryaddress || booking.delivery_city) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[booking.deliveryaddress, booking.delivery_city]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                )}
              </div>

              <div className="mt-3 rounded-md border border-border/60 bg-background px-3 py-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Datum per fas
                </div>
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
                <p className="mt-2 text-[10px] italic text-muted-foreground">
                  Ändringar sparas först när du klickar <strong>Planera hela bokningen</strong>.
                </p>
              </div>

              <div className="mt-3 rounded-md border border-border/60 bg-background px-3 py-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Vad ska planeras nu?
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <Checkbox checked={planRig} onCheckedChange={(v) => setPlanRig(!!v)} />
                    <span>Rigg ({drafts.rig.dates.length} dagar)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <Checkbox checked={planEvent} onCheckedChange={(v) => setPlanEvent(!!v)} />
                    <span>Event ({drafts.event.dates.length} dagar)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <Checkbox checked={planRigDown} onCheckedChange={(v) => setPlanRigDown(!!v)} />
                    <span>Rigg ner ({drafts.rigDown.dates.length} dagar)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <Checkbox checked={createProductTodos} onCheckedChange={(v) => setCreateProductTodos(!!v)} />
                    <span>Alla orderrader som to-dos</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    onPlanWholeBooking(booking, {
                      rig: planRig,
                      event: planEvent,
                      rigDown: planRigDown,
                      createProductTodos,
                      drafts,
                    })
                  }
                  className="flex-1"
                  variant={hasAnyPlan ? 'outline' : 'default'}
                  title="Spara datum och skapa kalenderaktiviteter för alla bokningens faser"
                >

                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                  Planera hela bokningen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCreateTodoForBooking(booking)}
                  className="flex-1"
                >
                  <ListPlus className="mr-1.5 h-3.5 w-3.5" />
                  Skapa to-do
                </Button>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-6 px-5 py-4">
                {/* Interna anteckningar */}
                {booking.internalnotes && (
                  <section className="rounded-md border border-amber-300/50 bg-amber-50/40 p-3 text-xs dark:bg-amber-950/20">
                    <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      <StickyNote className="h-3.5 w-3.5" />
                      Interna anteckningar
                    </div>
                    <div className="whitespace-pre-wrap text-foreground/90">
                      {booking.internalnotes}
                    </div>
                  </section>
                )}

                {/* Planerade to-dos */}
                <section>
                  <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5" />
                    Planerade to-dos ({bookingItems.length})
                  </h3>
                  {bookingItems.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                      Inga to-dos planerade ännu. Klicka "Planera hela bokningen"
                      eller "+ To-do" på en orderrad.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {bookingItems.map((it) => (
                        <LargeProjectPlannerTaskCard
                          key={it.id}
                          item={it}
                          booking={booking}
                          staff={
                            it.assigned_staff_id
                              ? staffById.get(it.assigned_staff_id) ?? null
                              : null
                          }
                          onClick={onItemClick}
                          onDelete={onItemDelete}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                {/* Orderrader */}
                <section>
                  <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Package className="h-3.5 w-3.5" />
                    Orderrader {products ? `(${products.length})` : ''}
                  </h3>

                  {productsLoading && (
                    <div className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Laddar orderrader…
                    </div>
                  )}
                  {productsError && (
                    <div className="px-2 py-2 text-xs text-destructive">
                      {(productsError as Error).message || 'Kunde inte ladda orderrader.'}
                    </div>
                  )}
                  {products && products.length === 0 && (
                    <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs italic text-muted-foreground">
                      Inga orderrader på bokningen.
                    </div>
                  )}
                  {products && products.length > 0 && (
                    <ul className="divide-y divide-border/40 rounded-md border border-border/60">
                      {products.map((p) => {
                        const linkedItems = bookingItems.filter(
                          (it) => it.booking_product_id === p.id,
                        );
                        return (
                          <li
                            key={p.id}
                            className="flex flex-col gap-1.5 px-3 py-2 hover:bg-muted/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {p.name || 'Namnlös rad'}
                                  </span>
                                  {linkedItems.length > 0 && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {linkedItems.length} to-do
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                                  {p.quantity != null && <span>{p.quantity} st</span>}
                                  {p.sku && <span>SKU: {p.sku}</span>}
                                  {p.is_package_component && <span>(paketdel)</span>}
                                  {p.notes && <span className="italic">{p.notes}</span>}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 shrink-0 text-[11px]"
                                onClick={() => onCreateTodoForProduct(booking, p)}
                                title="Skapa to-do för denna orderrad"
                              >
                                <ListPlus className="mr-1 h-3 w-3" />
                                To-do
                              </Button>
                            </div>

                            {/* Inline: när är denna orderrad planerad? */}
                            {linkedItems.length > 0 && (
                              <ul className="ml-1 mt-0.5 space-y-0.5 border-l-2 border-primary/30 pl-2">
                                {linkedItems.map((it) => (
                                  <li
                                    key={it.id}
                                    className="flex items-center gap-2 text-[11px] text-muted-foreground"
                                  >
                                    {onToggleItemStatus && (
                                      <Checkbox
                                        checked={it.status === 'done'}
                                        onCheckedChange={(checked) =>
                                          onToggleItemStatus(it, !!checked)
                                        }
                                        aria-label={`Markera ${it.title} som klar`}
                                      />
                                    )}
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1 truncate text-left hover:text-foreground hover:underline"
                                      onClick={() => onItemClick(it)}
                                    >
                                      <Calendar className="h-3 w-3 shrink-0" />
                                      <span>{it.plan_date}</span>
                                      {timeRange(it.start_time, it.end_time) && (
                                        <span>· {timeRange(it.start_time, it.end_time)}</span>
                                      )}
                                      <span className="truncate">· {it.title}</span>
                                    </button>
                                    {it.assigned_staff_id &&
                                      staffById.get(it.assigned_staff_id) && (
                                        <Badge variant="outline" className="text-[9px]">
                                          {staffById.get(it.assigned_staff_id)!.name}
                                        </Badge>
                                      )}
                                  </li>
                                ))}
                              </ul>
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
