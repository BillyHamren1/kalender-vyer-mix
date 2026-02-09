import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Calendar, MapPin, Search, ChevronDown, ChevronUp,
  Hammer, PartyPopper, Truck, Clock, Filter, ArrowUpDown
} from "lucide-react";
import { format, parseISO, differenceInDays, isValid } from "date-fns";
import { sv } from "date-fns/locale";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import type { LargeProjectBooking } from "@/types/largeProject";

// Extend the booking type for the extra fields we now fetch
interface BookingWithTimes {
  id: string;
  client: string;
  booking_number: string | null;
  deliveryaddress: string | null;
  eventdate: string | null;
  rigdaydate: string | null;
  rigdowndate: string | null;
  contact_name: string | null;
  rig_start_time: string | null;
  rig_end_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  rigdown_start_time: string | null;
  rigdown_end_time: string | null;
  status: string | null;
}

type SortField = 'name' | 'rigdate' | 'eventdate' | 'rigdowndate' | 'address';

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, 'd MMM', { locale: sv }) : null;
  } catch { return null; }
};

const formatDateFull = (dateStr: string | null | undefined) => {
  if (!dateStr) return '–';
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, 'EEEE d MMMM yyyy', { locale: sv }) : '–';
  } catch { return '–'; }
};

const formatTime = (timeStr: string | null | undefined) => {
  if (!timeStr) return '';
  return timeStr.substring(0, 5);
};

const LargeEstablishmentPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const { project } = detail;
  const bookings = project?.bookings || [];

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('rigdate');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<'all' | 'rig' | 'event' | 'rigdown'>('all');

  const getBooking = (lpb: LargeProjectBooking): BookingWithTimes | undefined =>
    lpb.booking as unknown as BookingWithTimes | undefined;

  // Summary stats
  const stats = useMemo(() => {
    const allDates: Date[] = [];
    let withRig = 0, withEvent = 0, withRigdown = 0, missingDates = 0;

    bookings.forEach(lpb => {
      const b = getBooking(lpb);
      if (!b) return;
      if (b.rigdaydate) { withRig++; try { allDates.push(parseISO(b.rigdaydate)); } catch {} }
      if (b.eventdate) { withEvent++; try { allDates.push(parseISO(b.eventdate)); } catch {} }
      if (b.rigdowndate) { withRigdown++; try { allDates.push(parseISO(b.rigdowndate)); } catch {} }
      if (!b.rigdaydate && !b.eventdate && !b.rigdowndate) missingDates++;
    });

    allDates.sort((a, b) => a.getTime() - b.getTime());
    const earliest = allDates.length > 0 ? allDates[0] : null;
    const latest = allDates.length > 0 ? allDates[allDates.length - 1] : null;
    const spanDays = earliest && latest ? differenceInDays(latest, earliest) + 1 : 0;

    return { withRig, withEvent, withRigdown, missingDates, earliest, latest, spanDays, total: bookings.length };
  }, [bookings]);

  // Filter & sort
  const filtered = useMemo(() => {
    let items = bookings.filter(lpb => {
      const b = getBooking(lpb);
      if (!b) return false;
      const name = lpb.display_name || b.client || '';
      const addr = b.deliveryaddress || '';
      const num = b.booking_number || '';
      const q = search.toLowerCase();
      const matchesSearch = !q || name.toLowerCase().includes(q) || addr.toLowerCase().includes(q) || num.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (filterPhase === 'rig') return !!b.rigdaydate;
      if (filterPhase === 'event') return !!b.eventdate;
      if (filterPhase === 'rigdown') return !!b.rigdowndate;
      return true;
    });

    items.sort((a, b) => {
      const ba = getBooking(a);
      const bb = getBooking(b);
      if (!ba || !bb) return 0;

      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.display_name || ba.client || '').localeCompare(b.display_name || bb.client || '');
          break;
        case 'rigdate':
          cmp = (ba.rigdaydate || '9').localeCompare(bb.rigdaydate || '9');
          break;
        case 'eventdate':
          cmp = (ba.eventdate || '9').localeCompare(bb.eventdate || '9');
          break;
        case 'rigdowndate':
          cmp = (ba.rigdowndate || '9').localeCompare(bb.rigdowndate || '9');
          break;
        case 'address':
          cmp = (ba.deliveryaddress || '').localeCompare(bb.deliveryaddress || '');
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return items;
  }, [bookings, search, sortField, sortAsc, filterPhase]);

  if (!project) return null;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : ''}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Bokningar totalt</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.spanDays}</p>
            <p className="text-xs text-muted-foreground">Dagar totalt</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.withRig}</p>
            <p className="text-xs text-muted-foreground">Med riggdatum</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{stats.missingDates}</p>
            <p className="text-xs text-muted-foreground">Saknar datum</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline span */}
      {stats.earliest && stats.latest && (
        <Card className="border-border/40">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Projektperiod:</span>
            <span>{format(stats.earliest, 'd MMM yyyy', { locale: sv })}</span>
            <span className="text-muted-foreground">→</span>
            <span>{format(stats.latest, 'd MMM yyyy', { locale: sv })}</span>
            <Badge variant="secondary" className="ml-auto">{stats.spanDays} dagar</Badge>
          </CardContent>
        </Card>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök monter, kund, adress, bokningsnr..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {([
            { key: 'all', label: 'Alla', icon: Filter },
            { key: 'rig', label: 'Rigg', icon: Hammer },
            { key: 'event', label: 'Event', icon: PartyPopper },
            { key: 'rigdown', label: 'Nedrigg', icon: Truck },
          ] as const).map(f => (
            <Button
              key={f.key}
              variant={filterPhase === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterPhase(f.key)}
              className="gap-1.5"
            >
              <f.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{f.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Booking list */}
      <Card className="border-border/40 shadow-2xl rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Etableringsschema ({filtered.length} av {bookings.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_120px_120px_120px_1fr] gap-2 px-4 py-2 border-b border-border/40 bg-muted/30">
            <SortButton field="name" label="Bokning / Monter" />
            <SortButton field="rigdate" label="Rigg" />
            <SortButton field="eventdate" label="Event" />
            <SortButton field="rigdowndate" label="Nedrigg" />
            <SortButton field="address" label="Plats" />
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {search || filterPhase !== 'all' ? 'Inga bokningar matchar filtret.' : 'Inga bokningar kopplade ännu.'}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {filtered.map((lpb, idx) => {
                const b = getBooking(lpb);
                if (!b) return null;
                const isExpanded = expandedId === lpb.id;
                const name = lpb.display_name || b.client || `Bokning ${idx + 1}`;

                return (
                  <div key={lpb.id}>
                    {/* Main row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : lpb.id)}
                      className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="md:grid md:grid-cols-[1fr_120px_120px_120px_1fr] gap-2 items-center">
                        {/* Name */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            b.rigdaydate && b.eventdate && b.rigdowndate ? 'bg-green-500' :
                            b.rigdaydate || b.eventdate ? 'bg-yellow-500' : 'bg-red-500'
                          }`} />
                          <span className="font-medium truncate text-sm">{name}</span>
                          {b.booking_number && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                              #{b.booking_number}
                            </Badge>
                          )}
                          <span className="md:hidden ml-auto">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                        </div>

                        {/* Rig date */}
                        <div className="hidden md:flex items-center gap-1.5">
                          {b.rigdaydate ? (
                            <>
                              <Hammer className="h-3 w-3 text-orange-500" />
                              <span className="text-sm">{formatDate(b.rigdaydate)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </div>

                        {/* Event date */}
                        <div className="hidden md:flex items-center gap-1.5">
                          {b.eventdate ? (
                            <>
                              <PartyPopper className="h-3 w-3 text-blue-500" />
                              <span className="text-sm">{formatDate(b.eventdate)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </div>

                        {/* Rigdown date */}
                        <div className="hidden md:flex items-center gap-1.5">
                          {b.rigdowndate ? (
                            <>
                              <Truck className="h-3 w-3 text-purple-500" />
                              <span className="text-sm">{formatDate(b.rigdowndate)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </div>

                        {/* Address */}
                        <div className="hidden md:flex items-center gap-1.5 min-w-0">
                          {b.deliveryaddress ? (
                            <>
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm text-muted-foreground truncate">{b.deliveryaddress}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                          <span className="hidden md:block ml-auto">
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </span>
                        </div>
                      </div>

                      {/* Mobile summary */}
                      <div className="flex flex-wrap gap-3 mt-2 md:hidden text-xs text-muted-foreground">
                        {b.rigdaydate && (
                          <span className="flex items-center gap-1">
                            <Hammer className="h-3 w-3 text-orange-500" />
                            {formatDate(b.rigdaydate)}
                          </span>
                        )}
                        {b.eventdate && (
                          <span className="flex items-center gap-1">
                            <PartyPopper className="h-3 w-3 text-blue-500" />
                            {formatDate(b.eventdate)}
                          </span>
                        )}
                        {b.rigdowndate && (
                          <span className="flex items-center gap-1">
                            <Truck className="h-3 w-3 text-purple-500" />
                            {formatDate(b.rigdowndate)}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 bg-muted/20 border-t border-border/20">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                          {/* Rigg */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Hammer className="h-4 w-4 text-orange-500" />
                              Etablering
                            </div>
                            <div className="pl-6 space-y-0.5 text-sm">
                              <p><span className="text-muted-foreground">Datum:</span> {formatDateFull(b.rigdaydate)}</p>
                              {(b.rig_start_time || b.rig_end_time) && (
                                <p className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {formatTime(b.rig_start_time)} – {formatTime(b.rig_end_time)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Event */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <PartyPopper className="h-4 w-4 text-blue-500" />
                              Event
                            </div>
                            <div className="pl-6 space-y-0.5 text-sm">
                              <p><span className="text-muted-foreground">Datum:</span> {formatDateFull(b.eventdate)}</p>
                              {(b.event_start_time || b.event_end_time) && (
                                <p className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {formatTime(b.event_start_time)} – {formatTime(b.event_end_time)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Nedrigg */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Truck className="h-4 w-4 text-purple-500" />
                              Avetablering
                            </div>
                            <div className="pl-6 space-y-0.5 text-sm">
                              <p><span className="text-muted-foreground">Datum:</span> {formatDateFull(b.rigdowndate)}</p>
                              {(b.rigdown_start_time || b.rigdown_end_time) && (
                                <p className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {formatTime(b.rigdown_start_time)} – {formatTime(b.rigdown_end_time)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Extra info */}
                        <div className="mt-4 pt-3 border-t border-border/20 flex flex-wrap gap-4 text-sm">
                          {b.deliveryaddress && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{b.deliveryaddress}</span>
                            </div>
                          )}
                          {b.contact_name && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">Kontakt:</span>
                              <span>{b.contact_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LargeEstablishmentPage;
