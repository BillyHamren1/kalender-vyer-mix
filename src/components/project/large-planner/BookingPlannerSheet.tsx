/**
 * BookingPlannerSheet
 * --------------------------------------------------------------------------
 * Höger-sidopanel (Sheet, ~720px) som ger admin full överblick över EN
 * bokning inuti ett stort projekt — utan att ta över hela skärmen som en
 * modal dialog.
 *
 * Innehåller:
 *  - Bokningsheader (namn, #nr, klient, datum, plats)
 *  - Lista över ALLA orderrader (booking_products) med "+ To-do" per rad
 *  - Lista över redan planerade tasks för bokningen (klickbara)
 *  - "+ Skapa to-do för bokningen" (öppnar ManualProjectTaskDialog ovanpå)
 *
 * Skriver INTE själv till DB — delegerar create/edit till parent via callbacks.
 */
import { Hash, Calendar, MapPin, User, ListChecks, ListPlus, Loader2, Package } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  items: LargeProjectBookingPlanItem[]; // alla plan-items för stora projektet
  staff: LargeProjectPlannerStaffMember[];
  onCreateTodoForBooking: (booking: LargeProjectPlannerBooking) => void;
  onCreateTodoForProduct: (
    booking: LargeProjectPlannerBooking,
    product: BookingProductForPlanner,
  ) => void;
  onItemClick: (item: LargeProjectBookingPlanItem) => void;
  onItemDelete?: (item: LargeProjectBookingPlanItem) => void;
}

const formatDate = (d: string | null) => (d ? d : '—');
const formatTime = (t: string | null) => (t ? t.slice(0, 5) : null);
const timeRange = (a: string | null, b: string | null) => {
  const x = formatTime(a);
  const y = formatTime(b);
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
  onItemClick,
  onItemDelete,
}: Props) => {
  const bookingId = booking?.id ?? null;
  const { data: products, isLoading: productsLoading, error: productsError } =
    useBookingProductsForPlanner(open ? bookingId : null);

  const bookingItems = booking
    ? items.filter((it) => it.booking_id === booking.id)
    : [];

  const staffById = new Map(staff.map((s) => [s.id, s]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[720px]"
      >
        {booking ? (
          <>
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
                <Button
                  size="sm"
                  onClick={() => onCreateTodoForBooking(booking)}
                  className="shrink-0"
                >
                  <ListPlus className="mr-1 h-3.5 w-3.5" />
                  Skapa to-do
                </Button>
              </div>

              {/* Fas-rader */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <PhaseChip
                  label="Rigg"
                  date={booking.rigdaydate}
                  time={timeRange(booking.rig_start_time, booking.rig_end_time)}
                />
                <PhaseChip
                  label="Event"
                  date={booking.eventdate}
                  time={timeRange(booking.event_start_time, booking.event_end_time)}
                />
                <PhaseChip
                  label="Rigg ner"
                  date={booking.rigdowndate}
                  time={timeRange(booking.rigdown_start_time, booking.rigdown_end_time)}
                />
              </div>

              {(booking.deliveryaddress || booking.delivery_city) && (
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {[booking.deliveryaddress, booking.delivery_city]
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-6 px-5 py-4">
                {/* Planerade tasks */}
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <ListChecks className="h-3.5 w-3.5" />
                      Planerade to-dos ({bookingItems.length})
                    </h3>
                  </div>
                  {bookingItems.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                      Inga to-dos planerade ännu. Klicka "+ To-do" på en orderrad
                      eller "Skapa to-do" ovan.
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
                        const linkedCount = bookingItems.filter(
                          (it) => it.booking_product_id === p.id,
                        ).length;
                        return (
                          <li
                            key={p.id}
                            className="flex items-start justify-between gap-3 px-3 py-2 hover:bg-muted/40"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {p.name || 'Namnlös rad'}
                                </span>
                                {linkedCount > 0 && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {linkedCount} to-do
                                  </Badge>
                                )}
                              </div>
                              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                                {p.quantity != null && <span>{p.quantity} st</span>}
                                {p.sku && <span>SKU: {p.sku}</span>}
                                {p.is_package_component && <span>(paketdel)</span>}
                                {p.notes && (
                                  <span className="italic">{p.notes}</span>
                                )}
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
      <span className="text-[11px]">{formatDate(date)}</span>
    </div>
    {time && <div className="text-[10px] text-muted-foreground">{time}</div>}
  </div>
);

export default BookingPlannerSheet;
