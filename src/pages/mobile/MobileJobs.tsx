import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileBooking } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
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
  const { data: bookings = [], isLoading, isRefetching: isRefreshing, refetch } = useMobileBookings();

  const { activeTimers, isTracking, geofenceEvent, nearbyBookings, startTimer, stopTimer, dismissGeofenceEvent } = useGeofencing(bookings);

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
    <div className="flex flex-col min-h-screen bg-card">
      {/* Header — clean, no bubbles */}
      <div className="bg-primary rounded-b-3xl shadow-md">
        {/* Safe area – täcker telefonens statusbar */}
        <div style={{ height: 'env(safe-area-inset-top, 44px)', minHeight: '44px' }} />
        <div className="px-5 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/70 text-[11px] font-semibold tracking-widest uppercase">Välkommen</p>
              <h1 className="text-[22px] font-extrabold text-primary-foreground tracking-tight leading-tight mt-0.5">
                {staff?.name?.split(' ')[0] || 'Hej'}
              </h1>
            </div>
            <button
              onClick={() => refetch()}
              className="p-2.5 rounded-xl bg-primary-foreground/10 active:scale-95 transition-all"
            >
              <RefreshCw className={cn("w-4.5 h-4.5 text-primary-foreground/80", isRefreshing && "animate-spin")} />
            </button>
          </div>
          
          {activeTimers.size > 0 && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-primary-foreground/10 border border-primary-foreground/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
                <span className="text-primary-foreground/90 text-xs font-semibold">
                  {activeTimers.size} aktiv timer
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <GeofenceStatusBar isTracking={isTracking} activeTimers={activeTimers} />

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Calendar className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground/70">Inga kommande jobb</p>
              <p className="text-xs text-muted-foreground mt-1">Dra ner för att uppdatera</p>
            </div>
          </div>
        ) : (
          sortedDates.map(dateStr => {
            const entries = groupedBookings[dateStr];
            const isDateToday = isToday(parseISO(dateStr));
            return (
              <div key={dateStr}>
                <div className="flex items-center gap-2 mb-2.5">
                  {isDateToday && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  <h2 className={cn(
                    "text-[11px] font-bold uppercase tracking-widest capitalize",
                    isDateToday ? "text-primary" : "text-muted-foreground"
                  )}>
                    {formatDateHeading(dateStr)}
                  </h2>
                </div>
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
                          "w-full text-left rounded-2xl border bg-card p-3.5 transition-all duration-150 active:scale-[0.98]",
                          hasTimer
                            ? "border-primary/30 shadow-md ring-1 ring-primary/10"
                            : "border-primary/20 shadow-md",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] tracking-wide font-bold border",
                                badge.className
                              )}>
                                {badge.label}
                              </span>
                              {booking.booking_number && (
                                <span className="text-[11px] font-mono text-muted-foreground/50">
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
                            <h3 className="font-bold text-foreground text-[15px] leading-snug mb-1">
                              {booking.client}
                            </h3>
                            {booking.deliveryaddress && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3 shrink-0 text-muted-foreground/40" />
                                <span className="truncate">{booking.deliveryaddress}</span>
                              </div>
                            )}
                            {nearby && (
                              <div className="flex items-center gap-1.5 text-xs text-primary font-semibold mt-1">
                                <Navigation className="w-3 h-3" />
                                <span>{nearby.distance}m bort</span>
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/30 mt-1 shrink-0" />
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
