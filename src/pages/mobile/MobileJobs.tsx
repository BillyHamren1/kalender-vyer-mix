import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useGeofencing } from '@/hooks/useGeofencing';
import GeofenceStatusBar from '@/components/mobile-app/GeofenceStatusBar';
import GeofencePrompt from '@/components/mobile-app/GeofencePrompt';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';
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

  // Group bookings by day
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
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-5 pt-12 pb-5 safe-area-top">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-primary-foreground/70 text-xs font-medium">Välkommen tillbaka</p>
            <h1 className="text-xl font-bold text-primary-foreground">{staff?.name?.split(' ')[0] || 'Hej'}</h1>
          </div>
          <button
            onClick={() => fetchBookings(true)}
            className="p-2 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
          >
            <RefreshCw className={cn("w-5 h-5 text-primary-foreground", isRefreshing && "animate-spin")} />
          </button>
        </div>
        
        {/* Active timer summary */}
        {activeTimers.size > 0 && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-primary-foreground/15 border border-primary-foreground/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
              <span className="text-primary-foreground text-xs font-medium">
                {activeTimers.size} aktiv timer
              </span>
            </div>
          </div>
        )}
      </div>

      <GeofenceStatusBar isTracking={isTracking} activeTimers={activeTimers} />

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground">Inga kommande jobb</p>
          </div>
        ) : (
          sortedDates.map(dateStr => {
            const entries = groupedBookings[dateStr];
            return (
              <div key={dateStr}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 capitalize">
                  {formatDateHeading(dateStr)}
                </h2>
                <div className="space-y-2">
                  {entries.map(({ booking, date }) => {
                    const badge = eventTypeBadge(booking, date);
                    const hasTimer = activeTimers.has(booking.id);
                    const nearby = nearbyBookings.find(n => n.id === booking.id);

                    return (
                      <button
                        key={`${booking.id}-${date}`}
                        onClick={() => navigate(`/m/job/${booking.id}`)}
                        className={cn(
                          "w-full text-left rounded-xl border bg-card p-4 transition-all active:scale-[0.98]",
                          hasTimer ? "border-primary/40 shadow-md shadow-primary/10" : "border-border hover:border-primary/20",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] tracking-wide font-bold border",
                                badge.className
                              )}>
                                {badge.label}
                              </span>
                              {booking.booking_number && (
                                <span className="text-xs font-mono text-muted-foreground">
                                  #{booking.booking_number}
                                </span>
                              )}
                              {hasTimer && (
                                <div className="flex items-center gap-1 ml-auto">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                  <span className="text-[10px] text-primary font-bold">AKTIV</span>
                                </div>
                              )}
                            </div>
                            <h3 className="font-semibold text-foreground text-sm leading-tight mb-1">
                              {booking.client}
                            </h3>
                            {booking.deliveryaddress && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{booking.deliveryaddress}</span>
                              </div>
                            )}
                            {nearby && (
                              <div className="flex items-center gap-1.5 text-xs text-primary font-medium mt-1">
                                <Navigation className="w-3 h-3" />
                                <span>{nearby.distance}m bort</span>
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
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

      {/* Geofence prompt */}
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
