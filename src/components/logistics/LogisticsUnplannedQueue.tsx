import React, { useMemo } from 'react';
import { ArrowRight, CalendarDays, MapPin, PackageOpen } from 'lucide-react';
import { endOfWeek, format, isWithinInterval, parseISO, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BookingForTransport } from '@/hooks/useBookingsForTransport';

interface LogisticsUnplannedQueueProps {
  currentDate: Date;
  bookings: BookingForTransport[];
  isLoading: boolean;
  onOpenTransport: () => void;
}

const bookingMatchesWeek = (booking: BookingForTransport, start: Date, end: Date) => (
  [booking.rigdaydate, booking.eventdate, booking.rigdowndate]
    .filter(Boolean)
    .some((value) => {
      try {
        return isWithinInterval(parseISO(value as string), { start, end });
      } catch {
        return false;
      }
    })
);

const primaryDate = (booking: BookingForTransport) => {
  const value = booking.rigdaydate || booking.eventdate || booking.rigdowndate;
  if (!value) return null;
  try {
    return format(parseISO(value), 'EEEE d MMMM', { locale: sv });
  } catch {
    return value;
  }
};

const LogisticsUnplannedQueue: React.FC<LogisticsUnplannedQueueProps> = ({
  currentDate,
  bookings,
  isLoading,
  onOpenTransport,
}) => {
  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const end = endOfWeek(currentDate, { weekStartsOn: 1 });
  const visible = useMemo(
    () => bookings.filter((booking) => bookingMatchesWeek(booking, start, end)),
    [bookings, start.getTime(), end.getTime()]
  );

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <PackageOpen className="h-4 w-4 text-foreground" />
            <h2 className="text-sm font-bold text-foreground">Ej transportplanerade</h2>
            <Badge variant={visible.length > 0 ? 'destructive' : 'secondary'} className="rounded-full">
              {visible.length}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Bekräftade bokningar i vald vecka som ännu saknar transport.</p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/40">
              <PackageOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">Ingen öppen transportkö</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Alla bekräftade bokningar som träffar veckan har en transporttilldelning.</p>
          </div>
        ) : (
          <div className="divide-y">
            {visible.slice(0, 7).map((booking) => (
              <button
                key={booking.id}
                type="button"
                onClick={onOpenTransport}
                className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{booking.client || 'Namnlös bokning'}</p>
                    {booking.booking_number && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">#{booking.booking_number}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {primaryDate(booking) && (
                      <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{primaryDate(booking)}</span>
                    )}
                    {(booking.delivery_city || booking.deliveryaddress) && (
                      <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{booking.delivery_city || booking.deliveryaddress}</span></span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t bg-muted/10 p-3">
        <Button variant="outline" className="w-full" onClick={onOpenTransport}>
          Planera transporter
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
};

export default LogisticsUnplannedQueue;
