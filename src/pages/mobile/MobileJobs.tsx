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
import { HeaderShell } from '@/components/mobile-app/MobileHeader';
import CalendarViewToggle, { type CalendarViewMode } from '@/components/mobile-app/calendar/CalendarViewToggle';
import CalendarDateNav from '@/components/mobile-app/calendar/CalendarDateNav';
import MobileDayView from '@/components/mobile-app/calendar/MobileDayView';
import MobileWeekView from '@/components/mobile-app/calendar/MobileWeekView';
import MobileMonthView from '@/components/mobile-app/calendar/MobileMonthView';
import MobileListView from '@/components/mobile-app/calendar/MobileListView';
import { Loader2, RefreshCw, Clock, Square, Building2, MapPin, UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';

const VIEW_MODE_KEY = 'mobile.calendarView';
const isViewMode = (v: unknown): v is CalendarViewMode => v === 'day' || v === 'week' || v === 'month';


const MobileJobs = () => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookings = [], isLoading, isRefetching: isRefreshing, refetch } = useMobileBookings();
  const { data: shifts = [] } = useScheduledShifts();
  const { t } = useLanguage();

  // Day-review badge — antal needs_review-dagar senaste 7 dagar
  const { data: reviewData } = useQuery({
    queryKey: ['workdays-review-summary'],
    queryFn: () => mobileApi.listWorkdaysReview({ days: 7 }),
    enabled: !!staff?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const needsReviewCount = (reviewData?.workdays || []).filter(w => w.review_status === 'needs_review').length;

  // Calendar view state — persisted in localStorage
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return isViewMode(stored) ? stored : 'day';
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);

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
      <HeaderShell>
        <div className="px-5 pt-1.5 pb-2.5 flex items-center justify-between gap-3">
          {/* LEFT: refresh */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => refetch()}
              className="p-2.5 rounded-xl bg-primary-foreground/10 active:scale-95 transition-all"
              aria-label="Uppdatera"
            >
              <RefreshCw className={cn("w-4.5 h-4.5 text-primary-foreground/80", isRefreshing && "animate-spin")} />
            </button>
          </div>

          {/* RIGHT: clickable name → profile */}
          <button
            onClick={() => navigate('/m/profile')}
            className="flex items-center gap-2 min-w-0 px-2.5 py-1.5 rounded-xl active:bg-primary-foreground/10 active:scale-95 transition-all"
            aria-label="Min profil"
          >
            <div className="text-right min-w-0">
              <p className="text-primary-foreground/70 text-[10px] font-semibold tracking-widest uppercase leading-none">
                {t('jobs.eyebrow')}
              </p>
              <h1 className="text-base font-extrabold text-primary-foreground tracking-tight leading-tight mt-0.5 truncate">
                {staff?.name?.split(' ')[0] || 'Hej'}
              </h1>
            </div>
            <UserCircle2 className="w-7 h-7 text-primary-foreground/90 shrink-0" />
          </button>
        </div>
      </HeaderShell>
      {/* "X aktiv timer"-bannern borttagen — GlobalActiveTimerBanner visar
          redan varje timer som egen rad högst upp, så detta var dubbelinfo. */}

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : (
          <>
          {/* Calendar — toggleable Day/Week/Month */}
          <div className="space-y-3">
            <CalendarViewToggle value={viewMode} onChange={setViewMode} />
            {viewMode !== 'list' && (
              <CalendarDateNav
                viewMode={viewMode}
                selectedDate={selectedDate}
                onChange={setSelectedDate}
              />
            )}
            {viewMode === 'day' && (
              <MobileDayView
                date={selectedDate}
                shifts={shifts}
                activeBookingIds={new Set(Array.from(activeTimers.keys()))}
                onShowWeek={() => setViewMode('week')}
              />
            )}
            {viewMode === 'week' && (
              <MobileWeekView
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                shifts={shifts}
                activeBookingIds={new Set(Array.from(activeTimers.keys()))}
              />
            )}
            {viewMode === 'month' && (
              <MobileMonthView
                selectedDate={selectedDate}
                onSelectDate={(d) => { setSelectedDate(d); setViewMode('day'); }}
                shifts={shifts}
              />
            )}
            {viewMode === 'list' && (
              <MobileListView
                shifts={shifts}
                activeBookingIds={new Set(Array.from(activeTimers.keys()))}
              />
            )}
          </div>

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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
