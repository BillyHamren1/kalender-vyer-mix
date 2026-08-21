import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, ClipboardList, MapPin, Package, Search } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PackingWithBooking } from '@/types/packing';
import { PACKING_STATUS_LABELS } from '@/types/packing';

interface Props {
  packings: PackingWithBooking[];
}

interface BookingRow {
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

const formatDate = (date: string | null) => {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return format(parsed, 'd MMM yyyy', { locale: sv });
};

/**
 * Gemensam sök i Lager OPS.
 * Söker på bokningsnummer, kund och adress i BÅDE packlistor och bokningar.
 * - Finns packlista → öppna packlistan direkt.
 * - Saknas packlista → öppna lagerbokningen.
 * Bokningar som redan har packlista dubbelvisas aldrig som "saknar packlista".
 */
const OpsUnifiedSearch: React.FC<Props> = ({ packings }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const normalized = normalizeSearch(search);
  const hasSearch = normalized.length >= 2;
  const needle = normalized.toLowerCase();

  const packingHits = useMemo(() => {
    if (!hasSearch) return [];
    return packings
      .filter(p =>
        [
          p.name,
          p.booking?.client,
          p.booking?.booking_number,
          p.booking?.deliveryaddress,
          p.booking?.delivery_city,
        ].some(value => value?.toLowerCase().includes(needle)),
      )
      .slice(0, 12);
  }, [packings, hasSearch, needle]);

  const { data: bookings = [], isFetching } = useQuery({
    queryKey: ['warehouse-ops-search-bookings', normalized],
    enabled: hasSearch,
    staleTime: 30_000,
    queryFn: async () => {
      const pattern = `%${normalized}%`;
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, client, title, status, eventdate, rigdaydate, deliveryaddress, delivery_city')
        .or(`booking_number.ilike.${pattern},client.ilike.${pattern},title.ilike.${pattern},deliveryaddress.ilike.${pattern}`)
        .order('eventdate', { ascending: false, nullsFirst: false })
        .limit(12);
      if (error) throw error;
      return (data || []) as BookingRow[];
    },
  });

  const packedBookingIds = useMemo(
    () => new Set(packings.map(p => p.booking_id).filter((id): id is string => !!id)),
    [packings],
  );

  const bookingHits = useMemo(
    () => bookings.filter(b => !packedBookingIds.has(b.id)),
    [bookings, packedBookingIds],
  );

  const totalHits = packingHits.length + bookingHits.length;

  return (
    <section className="mb-5 rounded-2xl border border-border/60 bg-card shadow-sm p-4 sm:p-5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök bokningsnummer, kund eller adress…"
          className="pl-10 h-10 rounded-xl"
          autoComplete="off"
        />
        {isFetching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">Söker…</span>
        )}
      </div>

      {hasSearch && (
        <div className="mt-3">
          {!isFetching && totalHits === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground text-center">
              Ingen packlista eller bokning hittades.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/50 divide-y divide-border/40">
              {packingHits.map(p => (
                <button
                  key={`packing-${p.id}`}
                  type="button"
                  onClick={() => navigate(`/warehouse/packing/${p.id}`)}
                  className="w-full px-3.5 py-3 text-left hover:bg-accent/45 transition-colors flex items-center gap-3"
                >
                  <Package className="h-4 w-4 text-warehouse shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-[hsl(var(--heading))]">
                        {p.booking?.booking_number || p.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">Packlista</Badge>
                      <span className="text-[11px] text-muted-foreground">{PACKING_STATUS_LABELS[p.status]}</span>
                    </div>
                    <div className="text-sm text-foreground/90 truncate mt-0.5">
                      {p.booking?.client || p.name}
                    </div>
                    {(p.booking?.deliveryaddress || p.booking?.rigdaydate) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                        {p.booking?.rigdaydate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />{formatDate(p.booking.rigdaydate)}
                          </span>
                        )}
                        {p.booking?.deliveryaddress && (
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {p.booking.deliveryaddress}{p.booking.delivery_city ? `, ${p.booking.delivery_city}` : ''}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}

              {bookingHits.map(b => (
                <button
                  key={`booking-${b.id}`}
                  type="button"
                  onClick={() => navigate(`/warehouse/bookings/${b.id}`)}
                  className="w-full px-3.5 py-3 text-left hover:bg-accent/45 transition-colors flex items-center gap-3"
                >
                  <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-[hsl(var(--heading))]">
                        {b.booking_number || 'Utan bokningsnummer'}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">Saknar packlista</Badge>
                    </div>
                    <div className="text-sm text-foreground/90 truncate mt-0.5">
                      {b.client}{b.title ? ` · ${b.title}` : ''}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                      {(b.rigdaydate || b.eventdate) && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />{formatDate(b.rigdaydate || b.eventdate)}
                        </span>
                      )}
                      {b.deliveryaddress && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{b.deliveryaddress}{b.delivery_city ? `, ${b.delivery_city}` : ''}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default OpsUnifiedSearch;
