import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Search, Filter, X, CalendarDays, MapPin, Package, ChevronRight } from 'lucide-react';

import { fetchBookings } from '@/services/bookingService';
import { Booking } from '@/types/booking';
import StatusBadge from '@/components/booking/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Alla statusar' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'd MMM', { locale: sv });
  } catch {
    return dateStr;
  }
};

const DashboardAllBookings: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ['all-bookings-dashboard'],
    queryFn: () => fetchBookings(),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return bookings.filter((b) => {
      // Text search
      if (q) {
        const haystack = [
          b.client,
          b.bookingNumber,
          b.deliveryAddress,
          b.deliveryCity,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        if ((b.status || '').toUpperCase() !== statusFilter) return false;
      }

      // Date from
      if (dateFrom && b.eventDate) {
        if (new Date(b.eventDate) < dateFrom) return false;
      }

      // Date to
      if (dateTo && b.eventDate) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (new Date(b.eventDate) > endOfDay) return false;
      }

      return true;
    });
  }, [bookings, search, statusFilter, dateFrom, dateTo]);

  const hasActiveFilters = search || statusFilter !== 'ALL' || dateFrom || dateTo;

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-card to-card/80 shadow border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Alla bokningar
          </h2>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {filtered.length}
            {filtered.length !== bookings.length && ` / ${bookings.length}`}
          </span>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Text search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 w-52 text-sm rounded-xl"
              placeholder="Sök klient, nummer, adress…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-sm rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date from */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 text-sm rounded-xl gap-1.5',
                  dateFrom ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {dateFrom ? format(dateFrom, 'd MMM', { locale: sv }) : 'Från'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>

          {/* Date to */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 text-sm rounded-xl gap-1.5',
                  dateTo ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {dateTo ? format(dateTo, 'd MMM', { locale: sv }) : 'Till'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>

          {/* Reset */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-sm rounded-xl text-muted-foreground hover:text-foreground gap-1"
              onClick={resetFilters}
            >
              <X className="w-3.5 h-3.5" />
              Rensa
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[600px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Hämtar bokningar…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-muted-foreground text-sm">Inga bokningar hittades</span>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="rounded-xl text-sm" onClick={resetFilters}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Rensa filter
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Nummer</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Klient</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Rigg → Event → Retur</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Adress</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Produkter</th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((booking, idx) => (
                <tr
                  key={booking.id}
                  onClick={() => navigate(`/booking/${booking.id}`)}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-muted/40 border-b border-border/20',
                    idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {booking.bookingNumber ? `#${booking.bookingNumber}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">
                    {booking.client}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={booking.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    <span>{formatDate(booking.rigDayDate)}</span>
                    <span className="mx-1 opacity-40">→</span>
                    <span className="text-foreground font-medium">{formatDate(booking.eventDate)}</span>
                    <span className="mx-1 opacity-40">→</span>
                    <span>{formatDate(booking.rigDownDate)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px]">
                    <div className="flex items-center gap-1 truncate">
                      {(booking.deliveryAddress || booking.deliveryCity) && (
                        <MapPin className="w-3 h-3 shrink-0 opacity-50" />
                      )}
                      <span className="truncate">
                        {[booking.deliveryAddress, booking.deliveryCity].filter(Boolean).join(', ') || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {booking.products && booking.products.length > 0 ? (
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3 opacity-50" />
                        {booking.products.length}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-40" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DashboardAllBookings;
