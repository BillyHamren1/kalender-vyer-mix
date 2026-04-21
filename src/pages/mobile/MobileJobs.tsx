import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileBooking } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useScheduledShifts } from '@/hooks/useScheduledShifts';
import { useGeofencing } from '@/hooks/useGeofencing';
import { type WorkTarget } from '@/hooks/useWorkSession';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { TimerConflictDialog } from '@/components/mobile-app/TimerConflictDialog';
import GeofencePrompt from '@/components/mobile-app/GeofencePrompt';
import DistanceWarningDialog from '@/components/mobile-app/DistanceWarningDialog';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import CalendarViewToggle, { type CalendarViewMode } from '@/components/mobile-app/calendar/CalendarViewToggle';
import CalendarDateNav from '@/components/mobile-app/calendar/CalendarDateNav';
import MobileDayView from '@/components/mobile-app/calendar/MobileDayView';
import MobileWeekView from '@/components/mobile-app/calendar/MobileWeekView';
import MobileMonthView from '@/components/mobile-app/calendar/MobileMonthView';
import { Loader2, RefreshCw, Clock, Square, Building2, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

const VIEW_MODE_KEY = 'mobile.calendarView';
const isViewMode = (v: unknown): v is CalendarViewMode => v === 'day' || v === 'week' || v === 'month';

const eventTypeBadge = (dates: { rigdaydate: string | null; eventdate: string | null; rigdowndate: string | null }, assignmentDate: string, t: (k: any) => string) => {
  if (dates.rigdaydate === assignmentDate) return { label: t('jobs.rig'), className: 'bg-planning-rig text-planning-rig-foreground border-planning-rig-border' };
  if (dates.eventdate === assignmentDate) return { label: t('jobs.event'), className: 'bg-planning-event text-planning-event-foreground border-planning-event-border' };
  if (dates.rigdowndate === assignmentDate) return { label: t('jobs.rigdown'), className: 'bg-planning-rigdown text-planning-rigdown-foreground border-planning-rigdown-border' };
  return { label: t('jobs.job'), className: 'bg-muted text-foreground border-border' };
};

const MobileJobs = () => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookings = [], isLoading, isRefetching: isRefreshing, refetch } = useMobileBookings();
  const { data: shifts = [] } = useScheduledShifts();
  const { t, locale } = useLanguage();
  const dateFnsLocale = locale === 'en' ? enUS : sv;

  const { activeTimers, userPosition, isTracking, geofenceEvent, nearbyBookings, orgLocations, dismissGeofenceEvent } = useGeofencing(bookings, staff?.id);

  // ALL starts go through useTimerStartFlow → evaluateStartConflict →
  // startSession. No raw startTimer / startSession calls here. Direct
  // calls are forbidden and fail the unification contract test.
  const {
    requestStart,
    cancelConflict,
    confirmSwitch,
    conflictEval,
    pendingLabel,
    distanceWarning,
    dismissDistanceWarning,
  } = useTimerStartFlow(bookings, staff?.id);

  // Fixed locations that should appear as job cards
  const locationJobs = orgLocations.filter(loc => loc.show_as_project === true);

  /**
   * Geofence ENTER no longer auto-starts a timer. The arrival popup
   * (UnifiedArrivalPrompt, rendered globally by MobileGlobalOverlays) is
   * now the single user-visible entry point for geo-driven starts. This
   * eliminates "phantom timers" that started silently in the background.
   *
   * EXIT still routes the user to /m/report so save-then-stop runs.
   */
  const handleGeofenceConfirm = (correctedStartTime?: string) => {
    if (!geofenceEvent) {
      return;
    }
    if (geofenceEvent.type === 'enter') {
      // Intentional no-op. Arrival popup handles the start.
      console.log('[MobileJobs] geofence enter — deferring to arrival popup');
    } else {
      toast.success(t('timer.stoppedCreateReport'));
      navigate('/m/report');
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
    if (isToday(d)) return t('jobs.today');
    if (isTomorrow(d)) return t('jobs.tomorrow');
    return format(d, 'EEEE d MMMM', { locale: dateFnsLocale });
  };

  // Timer toggle for standalone bookings.
  // STOP path: never clears local timer here — navigates user to /m/report
  // where save-then-stop is enforced.
  const handleTimerToggle = (e: React.MouseEvent, booking: MobileBooking) => {
    e.stopPropagation();
    if (activeTimers.has(booking.id)) {
      toast.success(t('timer.stoppedCreateReport'));
      navigate('/m/report');
      return;
    }
    const target: WorkTarget = { kind: 'booking', bookingId: booking.id, client: booking.client };
    requestStart(target);
  };

  // Timer toggle for projects
  const handleProjectTimerToggle = (e: React.MouseEvent, lpId: string, name: string, _entries: { booking: MobileBooking }[]) => {
    e.stopPropagation();
    const projectKey = `project-${lpId}`;
    if (activeTimers.has(projectKey)) {
      toast.success(t('timer.stoppedCreateReport'));
      navigate('/m/report');
      return;
    }
    const target: WorkTarget = { kind: 'project', largeProjectId: lpId, name };
    requestStart(target);
  };

  // Timer toggle for fixed locations (e.g. Lager)
  const handleLocationTimerToggle = (e: React.MouseEvent, loc: typeof locationJobs[0]) => {
    e.stopPropagation();
    const locKey = `location-${loc.id}`;
    if (activeTimers.has(locKey)) {
      toast.success(t('timer.stoppedCreateReport'));
      navigate('/m/report');
      return;
    }
    const target: WorkTarget = {
      kind: 'location',
      locationId: loc.id,
      name: loc.name,
      createsTimeReport: false,
    };
    requestStart(target);
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
        eyebrow={t('jobs.eyebrow')}
        title={staff?.name?.split(' ')[0] || 'Hej'}
        subtitle={t('jobs.subtitle')}
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
              {activeTimers.size} {t('jobs.activeTimer')}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : sortedDates.length === 0 && locationJobs.length === 0 && shifts.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Calendar className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground/70">{t('jobs.noJobs')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('jobs.pullToRefresh')}</p>
            </div>
          </div>
        ) : (
          <>
          {/* Fixed location jobs (e.g. Lager) */}
          {locationJobs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Fixed locations
                </h2>
              </div>
              <div className="space-y-2">
                {locationJobs.map(loc => {
                  const locKey = `location-${loc.id}`;
                  const hasTimer = activeTimers.has(locKey);
                  const timer = activeTimers.get(locKey);

                  return (
                    <div
                      key={loc.id}
                      className={cn(
                        "w-full rounded-2xl border bg-card p-3.5 transition-all duration-150",
                        hasTimer
                          ? "border-primary/30 shadow-md ring-1 ring-primary/10"
                          : "border-primary/20 shadow-md",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => navigate(`/m/location/${loc.id}`)}
                          className="flex-1 min-w-0 text-left active:opacity-70"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-3.5 h-3.5 text-primary/70" />
                            <span className="px-1.5 py-0.5 rounded text-[10px] tracking-wide font-bold border bg-accent/50 text-accent-foreground border-accent/30">
                              LOCATION
                            </span>
                          </div>
                          <h3 className="font-bold text-foreground text-[15px] leading-snug mb-0.5">
                            {loc.name}
                          </h3>
                          {loc.address && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3 shrink-0 text-muted-foreground/40" />
                              <span className="truncate">{loc.address}</span>
                            </div>
                          )}
                          {hasTimer && timer && (
                            <p className="text-xs font-mono text-primary font-bold mt-1">
                              ⏱ {formatElapsed(timer.startTime)}
                            </p>
                          )}
                        </button>
                        {(
                          /* Always render — concurrency is handled by TimerConflictDialog */
                          true
                        ) && (
                          <button
                            onClick={(e) => handleLocationTimerToggle(e, loc)}
                            className={cn(
                              "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90",
                              hasTimer
                                ? "bg-destructive text-destructive-foreground shadow-md"
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                            )}
                          >
                            {hasTimer ? <Square className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today's planned shifts (vertical timeline) */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-primary">
                {t('jobs.today')}
              </h2>
            </div>
            <DayTimeline
              shifts={shifts}
              activeBookingIds={new Set(Array.from(activeTimers.keys()))}
            />
          </div>
          </>

        )}
      </div>

      {geofenceEvent && (
        <GeofencePrompt
          event={geofenceEvent}
          onConfirm={handleGeofenceConfirm}
          onDismiss={dismissGeofenceEvent}
        />
      )}

      <DistanceWarningDialog
        open={!!distanceWarning}
        onOpenChange={(open) => { if (!open) dismissDistanceWarning(); }}
        placeName={distanceWarning?.placeName || ''}
        distanceMeters={distanceWarning?.distance || 0}
        onConfirm={() => {
          distanceWarning?.onConfirm();
          dismissDistanceWarning();
        }}
      />

      <TimerConflictDialog
        open={!!conflictEval}
        evaluation={conflictEval}
        newTargetLabel={pendingLabel}
        onCancel={cancelConflict}
        onSwitch={confirmSwitch}
      />
    </div>
  );
};

export default MobileJobs;
