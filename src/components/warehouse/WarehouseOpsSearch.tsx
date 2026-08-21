import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, MapPin, Package, Search } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PackingWithBooking, PACKING_STATUS_LABELS } from '@/types/packing';

interface Props {
  packings: PackingWithBooking[];
}

interface BookingSearchRow {
  id: string;
  booking_number: string | null;
  client: string;
  title: string | null;
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

const formatDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'd MMM yyyy', { locale: sv });
};

/**
 * En enda sökyta för Lager OPS.
 * Packlista är primärt resultat om bokningen redan har en packning,
 * annars visas bokningen så att lagret fortfarande kan öppna den.
 */
const WarehouseOpsSearch = ({ packings }: Props) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const normalized = normalizeSearch(search);
  const normalizedLower = normalized.toLowerCase();

  const matchingPackings = useMemo(() => {
    if (normalizedLower.length < 2) return [];
    return packings
      .filter(packing => [
        packing.name,
        packing.booking?.booking_number,
        packing.booking?.client,
        packing.booking?.deliveryaddress,
        packing.booking?.delivery_city,
      ].some(value => value?.toLowerCase().includes(normalizedLower)))
      .slice(0, 8);
  }, [packings, normalizedLower]);

  const matchedBookingIds = useMemo(
    () => new Set(matchingPackings.map(p => p.booking_id).filter((id): id is string => !!id)),
    [matchingPackings],
  );

  const { data: bookingMatches = [], isFetching } = useQuery({
    queryKey: ['warehouse-ops-search-bookings', normalized],
    enabled: normalized.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const pattern = `%${normalized}%`;
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, client, title, eventdate, rigdaydate, deliveryaddress, delivery_city')
        .or(`booking_number.ilike.${pattern},client.ilike.${pattern},title.ilike.${pattern},deliveryaddress.ilike.${pattern}`)
        .order('eventdate', { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as BookingSearchRow[];
    },
  });

  const unmatchedBookings = bookingMatches
    .filter(booking => !matchedBookingIds.has(booking.id))
    .slice(0, Math.max(0, 8 - matchingPackings.length));

  const hasSearch = normalized.length >= 2;
  const noResults = hasSearch && !isFetching && matchingPackings.length === 0 && unmatchedBookings.length === 0;

  return (
    <section className="border-b border-border/50 pb-5">
      <div className="relative max-w-3xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Sök bokning, packlista, kund eller adress…"
          className="h-10 rounded-xl pl-10"
          autoComplete="off"
        />
        {isFetching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">Söker…</span>
        )}
      </div>

      {hasSearch && (
        <div className="mt-2 max-w-3xl overflow-hidden rounded-xl border border-border/50 bg-card divide-y divide-border/40">
          {matchingPackings.map(packing => {
            const date = formatDate(packing.booking?.rigdaydate || packing.start_date);
            return (
              <div key={`packing-${packing.id}`} className="flex items-center gap-3 px-3.5 py-3">
                <Package className="h-4 w-4 shrink-0 text-warehouse" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{packing.booking?.booking_number || packing.name}</span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Packlista</span>
                  </div>
                  <div className="truncate text-sm text-foreground/90">{packing.booking?.client || packing.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{PACKING_STATUS_LABELS[packing.status]}</span>
                    {date && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date}</span>}
                  </div>
                </div>
                <Button size="sm" className="h-7 px-3 text-xs" onClick={() => navigate(`/warehouse/packing/${packing.id}`)}>
                  Öppna packlista
                </Button>
              </div>
            );
          })}

          {unmatchedBookings.map(booking => {
            const date = formatDate(booking.rigdaydate || booking.eventdate);
            return (
              <button
                key={`booking-${booking.id}`}
                type="button"
                onClick={() => navigate(`/warehouse/bookings/${booking.id}`)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{booking.booking_number || 'Utan bokningsnummer'}</span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bokning</span>
                  </div>
                  <div className="truncate text-sm text-foreground/90">{booking.client}{booking.title ? ` · ${booking.title}` : ''}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {date && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date}</span>}
                    {booking.deliveryaddress && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{booking.deliveryaddress}{booking.delivery_city ? `, ${booking.delivery_city}` : ''}</span>
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}

          {noResults && (
            <div className="px-4 py-5 text-center text-sm text-muted-foreground">Ingen bokning eller packlista hittades.</div>
          )}
        </div>
      )}
    </section>
  );
};

export default WarehouseOpsSearch;
