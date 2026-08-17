import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, MapPin, Search } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface WarehouseBookingQuickOpenProps {
  className?: string;
  compact?: boolean;
}

interface WarehouseBookingSearchRow {
  id: string;
  booking_number: string | null;
  client: string;
  title: string | null;
  status: string | null;
  eventdate: string | null;
  rigdaydate: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
}

const normalizeSearch = (value: string) =>
  value
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);

const bookingStatusLabel = (status: string | null) => {
  switch ((status || '').toLowerCase()) {
    case 'confirmed': return 'Bekräftad';
    case 'offer': return 'Offert';
    case 'cancelled': return 'Avbokad';
    default: return status || 'Okänd status';
  }
};

const formatDate = (date: string | null) => {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return format(parsed, 'd MMM yyyy', { locale: sv });
};

const WarehouseBookingQuickOpen = ({ className, compact = false }: WarehouseBookingQuickOpenProps) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const normalized = normalizeSearch(search);

  const { data: bookings = [], isFetching } = useQuery({
    queryKey: ['warehouse-booking-quick-open', normalized],
    enabled: normalized.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const pattern = `%${normalized}%`;
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, client, title, status, eventdate, rigdaydate, deliveryaddress, delivery_city')
        .or(`booking_number.ilike.${pattern},client.ilike.${pattern},title.ilike.${pattern},deliveryaddress.ilike.${pattern}`)
        .order('eventdate', { ascending: false, nullsFirst: false })
        .limit(8);

      if (error) throw error;
      return (data || []) as WarehouseBookingSearchRow[];
    },
  });

  const hasSearch = normalized.length >= 2;

  return (
    <section className={cn('rounded-2xl border border-border/60 bg-card shadow-sm', compact ? 'p-3' : 'p-4 sm:p-5', className)}>
      <div className="flex flex-col gap-1 mb-3">
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Öppna bokning i lager</h2>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Sök på bokningsnummer, kund, projektnamn eller leveransadress och öppna lagervyn direkt.
          </p>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="T.ex. 2608-14, kund eller adress…"
          className="pl-10 h-10 rounded-xl"
          autoComplete="off"
        />
        {isFetching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">Söker…</span>
        )}
      </div>

      {hasSearch && (
        <div className="mt-3 overflow-hidden rounded-xl border border-border/50 divide-y divide-border/40">
          {!isFetching && bookings.length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted-foreground text-center">Ingen bokning hittades.</div>
          ) : (
            bookings.map((booking) => {
              const date = formatDate(booking.rigdaydate || booking.eventdate);
              return (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => navigate(`/warehouse/bookings/${booking.id}`)}
                  className="w-full px-3.5 py-3 text-left bg-background/30 hover:bg-accent/45 transition-colors flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-[hsl(var(--heading))]">
                        {booking.booking_number || 'Utan bokningsnummer'}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-medium">
                        {bookingStatusLabel(booking.status)}
                      </Badge>
                    </div>
                    <div className="text-sm text-foreground/90 truncate mt-0.5">
                      {booking.client}{booking.title ? ` · ${booking.title}` : ''}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                      {date && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date}</span>}
                      {booking.deliveryaddress && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{booking.deliveryaddress}{booking.delivery_city ? `, ${booking.delivery_city}` : ''}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};

export default WarehouseBookingQuickOpen;
