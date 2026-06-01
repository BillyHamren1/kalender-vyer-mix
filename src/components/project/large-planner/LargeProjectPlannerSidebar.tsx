/**
 * LargeProjectPlannerSidebar
 * --------------------------------------------------------------------------
 * Visar projektets bokningar och deras planeringsstatus i den interna
 * projektplaneraren. Endast read + callbacks — inga DB-skrivningar.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Hash, Inbox, ListChecks, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import LargeProjectPlannerTaskCard from './LargeProjectPlannerTaskCard';
import BookingProductsExpandable from './BookingProductsExpandable';
import type { BookingProductForPlanner } from '@/hooks/useBookingProductsForPlanner';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';

type Filter = 'all' | 'unplanned' | 'planned' | 'done';

interface Props {
  bookings: LargeProjectPlannerBooking[];
  items: LargeProjectBookingPlanItem[];
  staff: LargeProjectPlannerStaffMember[];
  onSeedBooking: (booking: LargeProjectPlannerBooking) => void;
  onSplitBooking?: (booking: LargeProjectPlannerBooking) => void;
  onItemClick?: (item: LargeProjectBookingPlanItem) => void;
  onItemDelete?: (item: LargeProjectBookingPlanItem) => void;
  onCreateManual?: () => void;
  onCreateTodoForProduct?: (
    booking: LargeProjectPlannerBooking,
    product: BookingProductForPlanner,
  ) => void;
  /** Horisontell layout — ligger ovanför kalendern och scrollar i sidled. */
  horizontal?: boolean;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Alla' },
  { key: 'unplanned', label: 'Ej planerade' },
  { key: 'planned', label: 'Planerade' },
  { key: 'done', label: 'Klara' },
];

const LargeProjectPlannerSidebar = ({
  bookings,
  items,
  staff,
  onSeedBooking,
  onSplitBooking,
  onItemClick,
  onItemDelete,
  onCreateManual,
  onCreateTodoForProduct,
  horizontal = false,
}: Props) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [showPlanned, setShowPlanned] = useState(false);

  const staffById = useMemo(() => {
    const map = new Map<string, LargeProjectPlannerStaffMember>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);

  const bookingById = useMemo(() => {
    const map = new Map<string, LargeProjectPlannerBooking>();
    bookings.forEach((b) => map.set(b.id, b));
    return map;
  }, [bookings]);

  const itemsByBooking = useMemo(() => {
    const map = new Map<string, LargeProjectBookingPlanItem[]>();
    items.forEach((it) => {
      if (!it.booking_id) return;
      const list = map.get(it.booking_id) ?? [];
      list.push(it);
      map.set(it.booking_id, list);
    });
    return map;
  }, [items]);

  const manualItems = useMemo(
    () => items.filter((it) => !it.booking_id && it.source !== 'booking'),
    [items],
  );

  const matchesFilter = (its: LargeProjectBookingPlanItem[]): boolean => {
    if (filter === 'all') return true;
    if (filter === 'unplanned') return its.length === 0;
    if (filter === 'planned') return its.some((i) => i.status !== 'done');
    if (filter === 'done') return its.length > 0 && its.every((i) => i.status === 'done');
    return true;
  };

  const filteredBookings = bookings.filter((b) =>
    matchesFilter(itemsByBooking.get(b.id) ?? []),
  );

  if (horizontal) {
    return (
      <aside className="flex shrink-0 flex-col border-b border-border/60 bg-background">
        <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Inbox className="h-3.5 w-3.5 text-primary" />
            Bokningar i projektet
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? 'default' : 'outline'}
                className="h-6 px-2 text-[10px]"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          {onCreateManual && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-[10px]"
              onClick={onCreateManual}
            >
              <Pencil className="mr-1 h-3 w-3" /> Manuell task
            </Button>
          )}
          <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
            <ListChecks className="h-3 w-3" />
            {items.length} items
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex gap-2 p-2 min-w-min">
            {filteredBookings.length === 0 && (
              <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground w-full">
                Inga bokningar matchar filtret.
              </div>
            )}
            {filteredBookings.map((booking) => {
              const its = itemsByBooking.get(booking.id) ?? [];
              const isPlanned = its.length > 0;
              return (
                <div
                  key={booking.id}
                  className="w-[260px] shrink-0 rounded-md border border-border/60 bg-card p-2"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-foreground">
                        {booking.display_name}
                      </div>
                      {booking.booking_number && (
                        <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Hash className="h-2.5 w-2.5" />
                          {booking.booking_number}
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={isPlanned ? 'secondary' : 'outline'}
                      className="text-[9px]"
                    >
                      {isPlanned ? `${its.length} st` : 'Ej planerad'}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button
                      size="sm"
                      variant={isPlanned ? 'outline' : 'default'}
                      className="h-6 flex-1 text-[10px]"
                      onClick={() => onSeedBooking(booking)}
                    >
                      Planera
                    </Button>
                    {onSplitBooking && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 flex-1 text-[10px]"
                        onClick={() => onSplitBooking(booking)}
                      >
                        Dela upp
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border/60 bg-background">
      <div className="border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Inbox className="h-3.5 w-3.5 text-primary" />
          Bokningar i projektet
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-2">
          {filteredBookings.length === 0 && (
            <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
              Inga bokningar matchar filtret.
            </div>
          )}
          {filteredBookings.map((booking) => {
            const its = itemsByBooking.get(booking.id) ?? [];
            const isPlanned = its.length > 0;
            return (
              <div
                key={booking.id}
                className="rounded-md border border-border/60 bg-card p-2"
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">
                      {booking.display_name}
                    </div>
                    {booking.booking_number && (
                      <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Hash className="h-2.5 w-2.5" />
                        {booking.booking_number}
                      </div>
                    )}
                  </div>
                  <Badge
                    variant={isPlanned ? 'secondary' : 'outline'}
                    className="text-[9px]"
                  >
                    {isPlanned ? `${its.length} st` : 'Ej planerad'}
                  </Badge>
                </div>
                <div className="mt-2 flex gap-1">
                  <Button
                    size="sm"
                    variant={isPlanned ? 'outline' : 'default'}
                    className="h-6 flex-1 text-[10px]"
                    onClick={() => onSeedBooking(booking)}
                  >
                    Planera
                  </Button>
                  {onSplitBooking && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 flex-1 text-[10px]"
                      onClick={() => onSplitBooking(booking)}
                    >
                      Dela upp
                    </Button>
                  )}
                </div>
                {onCreateTodoForProduct && (
                  <BookingProductsExpandable
                    bookingId={booking.id}
                    onCreateTodoForProduct={(p) => onCreateTodoForProduct(booking, p)}
                  />
                )}
                {isPlanned && (
                  <div className="mt-2 space-y-1">

                    {its.map((it) => (
                      <LargeProjectPlannerTaskCard
                        key={it.id}
                        item={it}
                        booking={bookingById.get(it.booking_id ?? '') ?? null}
                        staff={
                          it.assigned_staff_id
                            ? staffById.get(it.assigned_staff_id) ?? null
                            : null
                        }
                        compact
                        onClick={onItemClick}
                        onDelete={onItemDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-2">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Pencil className="h-3 w-3" />
                Manuella tasks
              </div>
              {onCreateManual && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1 text-[10px]"
                  onClick={onCreateManual}
                >
                  + Ny
                </Button>
              )}
            </div>
            {manualItems.length === 0 ? (
              <div className="mt-1 rounded-md border border-dashed border-border/60 p-2 text-center text-[10px] text-muted-foreground">
                Inga manuella tasks.
              </div>
            ) : (
              <div className="mt-1 space-y-1">
                {manualItems.map((it) => (
                  <LargeProjectPlannerTaskCard
                    key={it.id}
                    item={it}
                    staff={
                      it.assigned_staff_id
                        ? staffById.get(it.assigned_staff_id) ?? null
                        : null
                    }
                    compact
                    onClick={onItemClick}
                    onDelete={onItemDelete}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-1 pt-2 text-[10px] text-muted-foreground">
            <ListChecks className="h-3 w-3" />
            {items.length} items totalt
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
};

export default LargeProjectPlannerSidebar;
