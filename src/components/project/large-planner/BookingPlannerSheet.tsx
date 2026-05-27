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
import LargeProjectPlannerTaskCard from './LargeProjectPlannerTaskCard';
import { useBookingProductsForPlanner, type BookingProductForPlanner } from '@/hooks/useBookingProductsForPlanner';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: LargeProjectPlannerBooking | null;
  items: LargeProjectBookingPlanItem[];
  staff: LargeProjectPlannerStaffMember[];
  onCreateTodoForBooking: (booking: LargeProjectPlannerBooking) => void;
  onCreateTodoForProduct: (
    booking: LargeProjectPlannerBooking,
    product: BookingProductForPlanner,
  ) => void;
  onPlanWholeBooking: (
    booking: LargeProjectPlannerBooking,
    selection: { rig: boolean; event: boolean; rigDown: boolean; createProductTodos: boolean },
  ) => void;
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

  const bookingItems = booking
    ? items.filter((it) => it.booking_id === booking.id)
    : [];
  const hasAnyPlan = bookingItems.length > 0;
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const [planRig, setPlanRig] = useState(true);
  const [planEvent, setPlanEvent] = useState(true);
  const [planRigDown, setPlanRigDown] = useState(true);
  const [createProductTodos, setCreateProductTodos] = useState(true);

  useEffect(() => {
    if (!open || !booking) return;
    setPlanRig(booking.rig_dates.length > 0 || !!booking.rigdaydate);
    setPlanEvent(booking.event_dates.length > 0 || !!booking.eventdate);
    setPlanRigDown(booking.rigdown_dates.length > 0 || !!booking.rigdowndate);
    setCreateProductTodos(true);
  }, [open, booking]);

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

              {/* Faser */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <PhaseChip
                  label="Rigg"
                  date={booking.rig_dates[0] ?? booking.rigdaydate}
                  time={timeRange(booking.rig_start_time, booking.rig_end_time)}
                  count={booking.rig_dates.length}
                />
                <PhaseChip
                  label="Event"
                  date={booking.event_dates[0] ?? booking.eventdate}
                  time={timeRange(booking.event_start_time, booking.event_end_time)}
                  count={booking.event_dates.length}
                />
                <PhaseChip
                  label="Rigg ner"
                  date={booking.rigdown_dates[0] ?? booking.rigdowndate}
                  time={timeRange(booking.rigdown_start_time, booking.rigdown_end_time)}
                  count={booking.rigdown_dates.length}
                />
              </div>

              <div className="mt-3 rounded-md border border-border/60 bg-background px-3 py-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Vad ska planeras nu?
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <Checkbox checked={planRig} onCheckedChange={(v) => setPlanRig(!!v)} />
                    <span>Rigg ({booking.rig_dates.length || (booking.rigdaydate ? 1 : 0)} dagar)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <Checkbox checked={planEvent} onCheckedChange={(v) => setPlanEvent(!!v)} />
                    <span>Event ({booking.event_dates.length || (booking.eventdate ? 1 : 0)} dagar)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <Checkbox checked={planRigDown} onCheckedChange={(v) => setPlanRigDown(!!v)} />
                    <span>Rigg ner ({booking.rigdown_dates.length || (booking.rigdowndate ? 1 : 0)} dagar)</span>
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
                    })
                  }
                  className="flex-1"
                  variant={hasAnyPlan ? 'outline' : 'default'}
                  title="Skapa kalenderaktiviteter för alla bokningens faser"
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

const PhaseChip = ({
  label,
  date,
  time,
}: {
  label: string;
  date: string | null;
  time: string | null;
}) => (
  <div className="rounded border border-border/60 bg-background px-2 py-1.5">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
    <div className="mt-0.5 inline-flex items-center gap-1 text-foreground">
      <Calendar className="h-3 w-3 text-muted-foreground" />
      <span className="text-[11px]">{date ?? '—'}</span>
    </div>
    {time && <div className="text-[10px] text-muted-foreground">{time}</div>}
  </div>
);

export default BookingPlannerSheet;
