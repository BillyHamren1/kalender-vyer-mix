import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileBooking } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useGeofencing } from '@/hooks/useGeofencing';
import { useTravelDetection } from '@/hooks/useTravelDetection';
import GeofenceStatusBar from '@/components/mobile-app/GeofenceStatusBar';
import GeofencePrompt from '@/components/mobile-app/GeofencePrompt';
import TravelBanner from '@/components/mobile-app/TravelBanner';
import TravelCompletedDialog from '@/components/mobile-app/TravelCompletedDialog';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { MapPin, Calendar, ChevronRight, Loader2, Navigation, RefreshCw, FolderOpen, Play, Square } from 'lucide-react';
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

  const { activeTimers, userPosition, isTracking, geofenceEvent, nearbyBookings, startTimer, stopTimer, dismissGeofenceEvent } = useGeofencing(bookings, staff?.id);
  const { travelState, elapsedSeconds, manualStopTravel, completedTravel, dismissCompletedTravel } = useTravelDetection(true, userPosition);

  const handleGeofenceConfirm = () => {
    if (!geofenceEvent) return;

    if (geofenceEvent.locationType === 'project' && geofenceEvent.largeProjectId) {
      const projectKey = `project-${geofenceEvent.largeProjectId}`;
      if (geofenceEvent.type === 'enter') {
        startTimer(projectKey, geofenceEvent.largeProjectName || 'Projekt', true, undefined, undefined, undefined, undefined, geofenceEvent.largeProjectId);
        toast.success(`Timer startad: ${geofenceEvent.largeProjectName}`);
      } else {
        const stopped = stopTimer(projectKey);
        if (stopped) {
          toast.success('Timer stoppad – skapa tidrapport');
          navigate('/m/report');
        }
      }
    } else if (geofenceEvent.locationType === 'fixed' && geofenceEvent.locationId) {
      const locKey = `location-${geofenceEvent.locationId}`;
      if (geofenceEvent.type === 'enter') {
        startTimer(locKey, geofenceEvent.locationName || 'Plats', true, undefined, undefined, geofenceEvent.locationId, geofenceEvent.locationName);
        toast.success(`Timer startad: ${geofenceEvent.locationName}`);
      } else {
        stopTimer(locKey);
        toast.success(`Timer stoppad: ${geofenceEvent.locationName}`);
      }
    } else if (geofenceEvent.booking) {
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
    }
    dismissGeofenceEvent();
  };

  // Group bookings by date, then within each date group by large project
  const groupedBookings = bookings.reduce<Record<string, { booking: MobileBooking; date: string }[]>>((acc, booking) => {
    for (const date of booking.assignment_dates) {
      if (!acc[date]) acc[date] = [];
      acc[date].push({ booking, date });
    }
    return acc;
  }, {});

  // Helper to group entries within a date by large_project_id
  const groupByProject = (entries: { booking: MobileBooking; date: string }[]) => {
    const projectGroups: Record<string, { name: string; entries: { booking: MobileBooking; date: string }[] }> = {};
    const standalone: { booking: MobileBooking; date: string }[] = [];

    for (const entry of entries) {
      const lpId = entry.booking.large_project_id;
      const lpName = entry.booking.large_project_name;
      if (lpId && lpName) {
        if (!projectGroups[lpId]) projectGroups[lpId] = { name: lpName, entries: [] };
        projectGroups[lpId].entries.push(entry);
      } else {
        standalone.push(entry);
      }
    }
    return { projectGroups, standalone };
  };

  const sortedDates = Object.keys(groupedBookings).sort();

  const formatDateHeading = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (isToday(d)) return 'Idag';
    if (isTomorrow(d)) return 'Imorgon';
    return format(d, 'EEEE d MMMM', { locale: sv });
  };

  // Check if any timer is already running
  const hasAnyTimer = activeTimers.size > 0;

  // Timer toggle for standalone bookings
  const handleTimerToggle = (e: React.MouseEvent, bookingId: string, client: string) => {
    e.stopPropagation();
    if (activeTimers.has(bookingId)) {
      const stopped = stopTimer(bookingId);
      if (stopped) {
        toast.success('Timer stoppad – skapa tidrapport');
        navigate('/m/report');
      }
    } else {
      if (hasAnyTimer) {
        toast.error('Du har redan en aktiv timer. Stoppa den först.');
        return;
      }
      startTimer(bookingId, client, false);
      toast.success(`Timer startad: ${client}`);
    }
  };

  // Timer toggle for projects
  const handleProjectTimerToggle = (e: React.MouseEvent, lpId: string, name: string) => {
    e.stopPropagation();
    const projectKey = `project-${lpId}`;
    if (activeTimers.has(projectKey)) {
      const stopped = stopTimer(projectKey);
      if (stopped) {
        toast.success('Timer stoppad – skapa tidrapport');
        navigate('/m/report');
      }
    } else {
      if (hasAnyTimer) {
        toast.error('Du har redan en aktiv timer. Stoppa den först.');
        return;
      }
      startTimer(projectKey, name, false, undefined, undefined, undefined, undefined, lpId);
      toast.success(`Timer startad: ${name}`);
    }
  };

  // Elapsed time display
  const [, setTick] = useState(0);
  useEffect(() => {
    if (activeTimers.size === 0) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeTimers.size]);

  const formatElapsed = (startIso: string) => {
    const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader
        eyebrow="MINA JOBB"
        title={staff?.name?.split(' ')[0] || 'Hej'}
        subtitle="Dagens uppdrag"
        rightAction={
          <button
            onClick={() => refetch()}
            className="p-2.5 rounded-xl bg-primary-foreground/10 active:scale-95 transition-all"
          >
            <RefreshCw className={cn("w-4.5 h-4.5 text-primary-foreground/80", isRefreshing && "animate-spin")} />
          </button>
        }
      />

      {activeTimers.size > 0 && (
        <div className="mx-5 -mt-2 mb-1 px-3 py-2 rounded-xl bg-primary/10 border border-primary/15">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-primary text-xs font-semibold">
              {activeTimers.size} aktiv timer
            </span>
          </div>
        </div>
      )}

      <GeofenceStatusBar isTracking={isTracking} activeTimers={activeTimers} />
      <TravelBanner travelState={travelState} elapsedSeconds={elapsedSeconds} onStop={manualStopTravel} />

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
            const { projectGroups, standalone } = groupByProject(entries);

            const renderBookingCard = ({ booking, date }: { booking: MobileBooking; date: string }) => {
              const badge = eventTypeBadge(booking, date);
              const hasTimer = activeTimers.has(booking.id);
              const timer = activeTimers.get(booking.id);
              const nearby = nearbyBookings.find(n => n.id === booking.id);

              return (
                <div
                  key={`${booking.id}-${date}`}
                  className={cn(
                    "w-full rounded-2xl border bg-card p-3.5 transition-all duration-150",
                    hasTimer
                      ? "border-primary/30 shadow-md ring-1 ring-primary/10"
                      : "border-primary/20 shadow-md",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => navigate(`/m/job/${booking.id}`)}
                      className="flex-1 min-w-0 text-left active:opacity-70"
                    >
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
                      {hasTimer && timer && (
                        <p className="text-xs font-mono text-primary font-bold mt-1">
                          ⏱ {formatElapsed(timer.startTime)}
                        </p>
                      )}
                    </button>
                    {/* Timer toggle button — only show if this card has timer OR no timer is running */}
                    {(hasTimer || !hasAnyTimer) && (
                      <button
                        onClick={(e) => handleTimerToggle(e, booking.id, booking.client)}
                        className={cn(
                          "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90",
                          hasTimer
                            ? "bg-destructive text-destructive-foreground shadow-md"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}
                      >
                        {hasTimer ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            };

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
                  {/* Project-grouped bookings */}
                  {Object.entries(projectGroups).map(([lpId, group]) => {
                    const projectKey = `project-${lpId}`;
                    const hasProjectTimer = activeTimers.has(projectKey);
                    const projectTimer = activeTimers.get(projectKey);

                    return (
                      <div
                        key={lpId}
                        className={cn(
                          "w-full rounded-2xl border bg-card shadow-md p-3.5 transition-all duration-150",
                          hasProjectTimer
                            ? "border-primary/30 ring-1 ring-primary/10"
                            : "border-primary/20",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => navigate(`/m/project/${lpId}`)}
                            className="flex-1 min-w-0 text-left active:opacity-70"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <FolderOpen className="w-3.5 h-3.5 text-primary/70" />
                              <span className="px-1.5 py-0.5 rounded text-[10px] tracking-wide font-bold border bg-primary/10 text-primary border-primary/20">
                                PROJEKT
                              </span>
                            </div>
                            <h3 className="font-bold text-foreground text-[15px] leading-snug mb-0.5">
                              {group.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {group.entries.length} bokningar
                            </p>
                            {hasProjectTimer && projectTimer && (
                              <p className="text-xs font-mono text-primary font-bold mt-1">
                                ⏱ {formatElapsed(projectTimer.startTime)}
                              </p>
                            )}
                          </button>
                          {/* Timer toggle button */}
                          <button
                            onClick={(e) => handleProjectTimerToggle(e, lpId, group.name)}
                            className={cn(
                              "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90",
                              hasProjectTimer
                                ? "bg-amber-500 text-white shadow-md"
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                            )}
                          >
                            {hasProjectTimer ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Standalone bookings */}
                  {standalone.map(renderBookingCard)}
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

      {completedTravel && (
        <TravelCompletedDialog
          info={completedTravel}
          onDismiss={dismissCompletedTravel}
        />
      )}
    </div>
  );
};

export default MobileJobs;
