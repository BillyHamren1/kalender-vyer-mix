import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useGeofencing } from '@/hooks/useGeofencing';
import GeofenceStatusBar from '@/components/mobile-app/GeofenceStatusBar';
import GeofencePrompt from '@/components/mobile-app/GeofencePrompt';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { MapPin, Calendar, ChevronRight, Loader2, Navigation, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const eventTypeBadge = (dates: { rigdaydate: string | null; eventdate: string | null; rigdowndate: string | null }, assignmentDate: string) => {
  if (dates.rigdaydate === assignmentDate) return { label: 'RIGG', className: 'bg-planning-rig text-planning-rig-foreground border-planning-rig-border' };
  if (dates.eventdate === assignmentDate) return { label: 'EVENT', className: 'bg-planning-event text-planning-event-foreground border-planning-event-border' };
  if (dates.rigdowndate === assignmentDate) return { label: 'NEDMONT.', className: 'bg-planning-rigdown text-planning-rigdown-foreground border-planning-rigdown-border' };
  return { label: 'JOBB', className: 'bg-muted text-foreground border-border' };
};

const MobileJobs = () => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const [bookings, setBookings] = useState<MobileBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { activeTimers, isTracking, geofenceEvent, nearbyBookings, startTimer, stopTimer, dismissGeofenceEvent } = useGeofencing(bookings);

  const fetchBookings = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    try {
      const res = await mobileApi.getBookings();
      setBookings(res.bookings);
    } catch (err) {
      toast.error('Kunde inte hämta jobb');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchBookings(); }, []);

  const handleGeofenceConfirm = () => {
    if (!geofenceEvent) return;
    if (geofenceEvent.type === 'enter') {
      startTimer(geofenceEvent.booking.id, geofenceEvent.booking.client, true);
      toast.success(`Timer startad för ${geofenceEvent.booking.client}`);
    } else {
      const stopped = stopTimer(geofenceEvent.booking.id);
      if (stopped) {
        toast.success('Timer stoppad – skapa tidrapport');
        navigate('/m/report');
      }
    }
    dismissGeofenceEvent();
  };

  const groupedBookings = bookings.reduce<Record<string, { booking: MobileBooking; date: string }[]>>((acc, booking) => {
    for (const date of booking.assignment_dates) {
      if (!acc[date]) acc[date] = [];
      acc[date].push({ booking, date });
    }
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedBookings).sort();

  const formatDateHeading = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (isToday(d)) return 'Idag';
    if (isTomorrow(d)) return 'Imorgon';
    return format(d, 'EEEE d MMMM', { locale: sv });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-primary via-primary to-primary/85 px-5 pt-14 pb-6 safe-area-top overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-primary-foreground/5" />
        
        <div className="relative flex items-center justify-between mb-1">
          <div>
            <p className="text-primary-foreground/60 text-xs font-medium tracking-wide uppercase">Välkommen tillbaka</p>
            <h1 className="text-2xl font-extrabold text-primary-foreground tracking-tight mt-0.5">
              {staff?.name?.split(' ')[0] || 'Hej'}
            </h1>
          </div>
          <button
            onClick={() => fetchBookings(true)}
            className="p-2.5 rounded-2xl bg-primary-foreground/10 hover:bg-primary-foreground/20 active:scale-95 transition-all"
          >
            <RefreshCw className={cn("w-5 h-5 text-primary-foreground", isRefreshing && "animate-spin")} />
          </button>
        </div>
        
        {activeTimers.size > 0 && (
          <div className="relative mt-4 px-3.5 py-2.5 rounded-2xl bg-primary-foreground/12 border border-primary-foreground/15 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-primary-foreground animate-pulse" />
              <span className="text-primary-foreground text-sm font-semibold">
                {activeTimers.size} aktiv timer
              </span>
            </div>
          </div>
        )}
      </div>

      <GeofenceStatusBar isTracking={isTracking} activeTimers={activeTimers} />

      {/* Content */}
      <div className="flex-1 px-4 py-5 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-muted/80 flex items-center justify-center mx-auto">
              <Calendar className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground/70">Inga kommande jobb</p>
              <p className="text-sm text-muted-foreground mt-1">Dra ner för att uppdatera</p>
            </div>
          </div>
        ) : (
          sortedDates.map(dateStr => {
            const entries = groupedBookings[dateStr];
            const isDateToday = isToday(parseISO(dateStr));
            return (
              <div key={dateStr}>
                <div className="flex items-center gap-2 mb-3">
                  {isDateToday && <div className="w-2 h-2 rounded-full bg-primary" />}
                  <h2 className={cn(
                    "text-xs font-bold uppercase tracking-widest capitalize",
                    isDateToday ? "text-primary" : "text-muted-foreground"
                  )}>
                    {formatDateHeading(dateStr)}
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {entries.map(({ booking, date }) => {
                    const badge = eventTypeBadge(booking, date);
                    const hasTimer = activeTimers.has(booking.id);
                    const nearby = nearbyBookings.find(n => n.id === booking.id);

                    return (
                      <button
                        key={`${booking.id}-${date}`}
                        onClick={() => navigate(`/m/job/${booking.id}`)}
                        className={cn(
                          "w-full text-left rounded-2xl border bg-card p-4 transition-all duration-150 active:scale-[0.98]",
                          hasTimer
                            ? "border-primary/30 shadow-lg shadow-primary/8 ring-1 ring-primary/10"
                            : "border-border/60 shadow-sm hover:shadow-md",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] tracking-wide font-bold border",
                                badge.className
                              )}>
                                {badge.label}
                              </span>
                              {booking.booking_number && (
                                <span className="text-xs font-mono text-muted-foreground/60">
                                  #{booking.booking_number}
                                </span>
                              )}
                              {hasTimer && (
                                <div className="flex items-center gap-1 ml-auto">
                                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                  <span className="text-[10px] text-primary font-bold tracking-wide">AKTIV</span>
                                </div>
                              )}
                            </div>
                            <h3 className="font-bold text-foreground text-[15px] leading-tight mb-1.5">
                              {booking.client}
                            </h3>
                            {booking.deliveryaddress && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                                <span className="truncate">{booking.deliveryaddress}</span>
                              </div>
                            )}
                            {nearby && (
                              <div className="flex items-center gap-1.5 text-xs text-primary font-semibold mt-1.5">
                                <Navigation className="w-3.5 h-3.5" />
                                <span>{nearby.distance}m bort</span>
                              </div>
                            )}
                          </div>
                          <div className="p-1.5 rounded-xl bg-muted/50 mt-0.5">
                            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {geofenceEvent && (
        <GeofencePrompt
          event={geofenceEvent}
          onConfirm={handleGeofenceConfirm}
          onDismiss={dismissGeofenceEvent}
        />
      )}
    </div>
  );
};

export default MobileJobs;
