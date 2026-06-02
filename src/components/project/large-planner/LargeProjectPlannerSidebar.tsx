/**
 * LargeProjectPlannerSidebar
 * --------------------------------------------------------------------------
 * Visar projektets bokningar och deras planeringsstatus i den interna
 * projektplaneraren. Endast read + callbacks — inga DB-skrivningar.
 */
import { useMemo, useState } from 'react';
import {
  Hash,
  Inbox,
  ListChecks,
  Pencil,
  MapPin,
  CheckCircle2,
  CircleDashed,
  Layers,
  Building2,
} from 'lucide-react';
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

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const formatAddress = (b: LargeProjectPlannerBooking): string | null => {
  const parts = [b.deliveryaddress?.trim(), b.delivery_city?.trim()].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

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

  const isBookingPlanned = (b: LargeProjectPlannerBooking) => b.has_calendar_phase_days;

  const matchesFilter = (
    b: LargeProjectPlannerBooking,
    its: LargeProjectBookingPlanItem[],
  ): boolean => {
    if (filter === 'all') return true;
    if (filter === 'unplanned') return !isBookingPlanned(b);
    if (filter === 'planned') return isBookingPlanned(b) && its.some((i) => i.status !== 'done');
    if (filter === 'done') return its.length > 0 && its.every((i) => i.status === 'done');
    return true;
  };

  const filteredBookings = bookings.filter((b) =>
    matchesFilter(b, itemsByBooking.get(b.id) ?? []),
  );

  const unplannedBookings = filteredBookings.filter((b) => !isBookingPlanned(b));

  /** Premium-booking-kort. Funktion/callbacks oförändrade. */
  const renderBookingCard = (
    booking: LargeProjectPlannerBooking,
    opts: { compact?: boolean } = {},
  ) => {
    const its = itemsByBooking.get(booking.id) ?? [];
    const isPlanned = isBookingPlanned(booking);
    const doneCount = its.filter((i) => i.status === 'done').length;
    const address = formatAddress(booking);
    const client = booking.client?.trim() || booking.display_name;

    return (
      <div
        key={booking.id}
        className={`group/booking ${opts.compact ? 'w-[280px] shrink-0' : ''} rounded-xl border border-border/60 bg-card shadow-sm hover:shadow-md hover:border-planner/30 transition-all overflow-hidden`}
      >
        {/* Status-band överst */}
        <div
          className={`h-1 ${
            isPlanned
              ? doneCount === its.length && its.length > 0
                ? 'bg-emerald-500/70'
                : 'bg-planner/60'
              : 'bg-muted-foreground/20'
          }`}
        />
        <div className="p-3 space-y-2.5">
          {/* Header: avatar + namn + status */}
          <div className="flex items-start gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-planner/15 to-planner/5 border border-planner/15 flex items-center justify-center shrink-0 text-[10.5px] font-bold text-planner tracking-wide">
              {initialsOf(client)}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[12.5px] font-semibold text-foreground leading-tight"
                title={client}
              >
                {client}
              </div>
              <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground leading-tight" title={booking.display_name}>
                {booking.display_name}
              </div>
            </div>
            {isPlanned ? (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md bg-planner/10 text-planner border border-planner/15 shrink-0">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Planerad
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md bg-muted/70 text-muted-foreground border border-border/60 shrink-0">
                <CircleDashed className="h-2.5 w-2.5" />
                Ej planerad
              </span>
            )}
          </div>

          {/* Meta-rad */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-muted-foreground">
            {booking.booking_number && (
              <span className="inline-flex items-center gap-1 font-mono tabular-nums font-medium text-foreground/70">
                <Hash className="h-2.5 w-2.5" />
                {booking.booking_number}
              </span>
            )}
            {its.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Layers className="h-2.5 w-2.5" />
                {its.length} {its.length === 1 ? 'task' : 'tasks'}
                {doneCount > 0 && (
                  <span className="text-emerald-600/80 font-semibold">· {doneCount} klar</span>
                )}
              </span>
            )}
          </div>

          {/* Adress */}
          {address && (
            <div className="flex items-start gap-1.5 text-[10.5px] text-foreground/75 leading-snug">
              <MapPin className="h-3 w-3 text-muted-foreground/70 mt-[1.5px] shrink-0" />
              <span className="truncate" title={address}>
                {address}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 pt-0.5">
            <Button
              size="sm"
              variant={isPlanned ? 'outline' : 'default'}
              className={
                isPlanned
                  ? 'h-7 flex-1 text-[10.5px] rounded-lg font-medium border-planner/25 text-planner hover:bg-planner/10 hover:text-planner hover:border-planner/40'
                  : 'h-7 flex-1 text-[10.5px] rounded-lg font-medium bg-planner text-white hover:bg-planner/90 shadow-[0_2px_6px_-2px_hsl(var(--planner)/0.45)]'
              }
              onClick={() => onSeedBooking(booking)}
            >
              Planera
            </Button>
            {onSplitBooking && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 text-[10.5px] rounded-lg font-medium"
                onClick={() => onSplitBooking(booking)}
              >
                Dela upp
              </Button>
            )}
          </div>

          {/* Produktlista — endast i vertikalt läge */}
          {!opts.compact && onCreateTodoForProduct && (
            <BookingProductsExpandable
              bookingId={booking.id}
              onCreateTodoForProduct={(p) => onCreateTodoForProduct(booking, p)}
            />
          )}
          {!opts.compact && isPlanned && its.length > 0 && (
            <div className="space-y-1 pt-1">
              {its.map((it) => (
                <LargeProjectPlannerTaskCard
                  key={it.id}
                  item={it}
                  booking={bookingById.get(it.booking_id ?? '') ?? null}
                  staff={
                    it.assigned_staff_id ? staffById.get(it.assigned_staff_id) ?? null : null
                  }
                  compact
                  onClick={onItemClick}
                  onDelete={onItemDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (horizontal) {
    return (
      <aside className="flex shrink-0 flex-col border-b border-border/60 bg-gradient-to-b from-muted/20 to-background">
        <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <div className="h-7 w-7 rounded-lg bg-planner/10 ring-1 ring-planner/15 flex items-center justify-center">
              <Inbox className="h-3.5 w-3.5 text-planner" />
            </div>
            Bokningar
            <span className="text-[10.5px] font-normal text-muted-foreground">
              ({unplannedBookings.length} att planera)
            </span>
          </div>
          <div className="flex flex-wrap gap-1 ml-1">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? 'default' : 'outline'}
                className="h-7 px-2.5 text-[10.5px] rounded-md font-medium"
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
              className="ml-auto h-7 px-2.5 text-[10.5px] rounded-md"
              onClick={onCreateManual}
            >
              <Pencil className="mr-1 h-3 w-3" /> Manuell task
            </Button>
          )}
          <div className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground whitespace-nowrap px-2 py-1 rounded-md bg-muted/40 border border-border/50">
            <ListChecks className="h-3 w-3" />
            <span className="tabular-nums font-semibold text-foreground/80">{items.length}</span>
            items
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex gap-3 px-4 pb-3 min-w-min items-stretch">
            {unplannedBookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-center text-[11px] text-muted-foreground w-full flex items-center justify-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/80" />
                Alla bokningar är planerade — finns i kalendern nedan.
              </div>
            ) : (
              unplannedBookings.map((b) => renderBookingCard(b, { compact: true }))
            )}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border/60 bg-gradient-to-b from-muted/15 to-background">
      <div className="border-b border-border/60 px-3 py-3 space-y-2.5 bg-background/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <div className="h-7 w-7 rounded-lg bg-planner/10 ring-1 ring-planner/15 flex items-center justify-center">
            <Building2 className="h-3.5 w-3.5 text-planner" />
          </div>
          Bokningar i projektet
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              className="h-7 px-2.5 text-[10.5px] rounded-md font-medium"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2.5 p-3">
          {filteredBookings.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center text-[11px] text-muted-foreground">
              Inga bokningar matchar filtret.
            </div>
          )}
          {filteredBookings.map((booking) => renderBookingCard(booking))}

          <div className="pt-2">
            <div className="flex items-center justify-between gap-1.5 px-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Pencil className="h-3 w-3" />
                Manuella tasks
              </div>
              {onCreateManual && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10.5px] rounded-md"
                  onClick={onCreateManual}
                >
                  + Ny
                </Button>
              )}
            </div>
            {manualItems.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-center text-[10.5px] text-muted-foreground">
                Inga manuella tasks.
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {manualItems.map((it) => (
                  <LargeProjectPlannerTaskCard
                    key={it.id}
                    item={it}
                    staff={
                      it.assigned_staff_id ? staffById.get(it.assigned_staff_id) ?? null : null
                    }
                    compact
                    onClick={onItemClick}
                    onDelete={onItemDelete}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 pt-3 text-[10.5px] text-muted-foreground border-t border-border/40 mt-3">
            <ListChecks className="h-3 w-3" />
            <span className="tabular-nums font-semibold text-foreground/70">{items.length}</span>
            items totalt
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
};

export default LargeProjectPlannerSidebar;
