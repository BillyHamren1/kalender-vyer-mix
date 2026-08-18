import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isSameDay, parseISO, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { BriefcaseBusiness, CalendarDays, ChevronRight, MapPin, Search } from 'lucide-react';
import type { MobileBooking } from '@/services/mobileApiService';
import { cn } from '@/lib/utils';

type Scope = 'upcoming' | 'all';

interface Props {
  bookings: MobileBooking[];
  selectedDate?: Date | null;
  compactHeader?: boolean;
}

function bookingDates(booking: MobileBooking): Array<{ key: 'rig' | 'event' | 'rigdown'; label: string; date: string }> {
  const out: Array<{ key: 'rig' | 'event' | 'rigdown'; label: string; date: string }> = [];
  if (booking.rigdaydate) out.push({ key: 'rig', label: 'Rigg', date: booking.rigdaydate });
  if (booking.eventdate) out.push({ key: 'event', label: 'Event', date: booking.eventdate });
  if (booking.rigdowndate) out.push({ key: 'rigdown', label: 'Riv', date: booking.rigdowndate });
  return out;
}

function firstDate(booking: MobileBooking): string | null {
  const dates = bookingDates(booking).map((x) => x.date).sort();
  return dates[0] ?? null;
}

function displayDate(iso: string): string {
  try {
    return format(parseISO(iso), 'EEE d MMM', { locale: sv });
  } catch {
    return iso;
  }
}

export default function MobileJobDirectoryList({ bookings, selectedDate = null, compactHeader = false }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('upcoming');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = startOfDay(new Date());

    return bookings
      .filter((booking) => {
        const dates = bookingDates(booking);
        if (selectedDate) {
          return dates.some((x) => {
            try { return isSameDay(parseISO(x.date), selectedDate); } catch { return false; }
          });
        }
        if (scope === 'all') return true;
        return dates.some((x) => {
          try { return startOfDay(parseISO(x.date)).getTime() >= today.getTime(); } catch { return false; }
        });
      })
      .filter((booking) => {
        if (!q) return true;
        return [
          booking.title,
          booking.client,
          booking.booking_number,
          booking.deliveryaddress,
          booking.delivery_city,
          booking.large_project_name,
          booking.assigned_project_name,
        ].some((value) => String(value || '').toLowerCase().includes(q));
      })
      .sort((a, b) => (firstDate(a) || '9999-12-31').localeCompare(firstDate(b) || '9999-12-31'));
  }, [bookings, search, scope, selectedDate]);

  return (
    <div className="space-y-3">
      {!compactHeader && !selectedDate && (
        <div className="inline-flex w-full rounded-2xl bg-muted/70 p-1">
          <button
            type="button"
            onClick={() => setScope('upcoming')}
            className={cn(
              'flex-1 h-9 rounded-xl text-xs font-semibold transition-all',
              scope === 'upcoming' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Kommande
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={cn(
              'flex-1 h-9 rounded-xl text-xs font-semibold transition-all',
              scope === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Alla jobb
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök jobb, kund, nummer eller adress"
          className="w-full h-11 rounded-2xl border border-border bg-card pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {selectedDate && (
        <div className="flex items-center gap-2 pt-1">
          <CalendarDays className="w-4 h-4 text-primary" />
          <p className="text-sm font-bold text-foreground">
            {format(selectedDate, 'EEEE d MMMM', { locale: sv })}
          </p>
          <span className="ml-auto text-xs font-semibold text-muted-foreground">{filtered.length} jobb</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-card">
          <p className="text-sm font-semibold text-foreground">Inga jobb hittades</p>
          <p className="text-xs text-muted-foreground mt-1">Prova ett annat datum eller sökord.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((booking) => {
            const dates = bookingDates(booking);
            const visibleDates = selectedDate
              ? dates.filter((x) => {
                  try { return isSameDay(parseISO(x.date), selectedDate); } catch { return false; }
                })
              : dates;
            const title = booking.title || booking.client || booking.booking_number || 'Jobb';
            const secondary = booking.title && booking.client && booking.title !== booking.client ? booking.client : null;

            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => navigate(`/m/job/${booking.id}`)}
                className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm active:scale-[0.99] transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <BriefcaseBusiness className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-extrabold text-foreground truncate">{title}</p>
                        {secondary && <p className="text-xs text-muted-foreground truncate mt-0.5">{secondary}</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {booking.booking_number && (
                        <span className="px-2 py-1 rounded-lg bg-muted text-[10px] font-bold text-muted-foreground">
                          #{booking.booking_number}
                        </span>
                      )}
                      {visibleDates.map((item) => (
                        <span key={`${item.key}-${item.date}`} className="px-2 py-1 rounded-lg bg-primary/8 text-[10px] font-bold text-primary">
                          {item.label} · {displayDate(item.date)}
                        </span>
                      ))}
                      {booking.large_project_name && (
                        <span className="px-2 py-1 rounded-lg bg-muted text-[10px] font-bold text-foreground/70">
                          {booking.large_project_name}
                        </span>
                      )}
                    </div>

                    {booking.deliveryaddress && (
                      <div className="flex items-start gap-1.5 mt-2.5 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="line-clamp-1">{booking.deliveryaddress}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
