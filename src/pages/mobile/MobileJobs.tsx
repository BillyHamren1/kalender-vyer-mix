import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useScheduledShifts } from '@/hooks/useScheduledShifts';
import { useGeofencingContext } from '@/contexts/GeofencingContext';
// Time Legacy Purge 6 — GeofencePrompt borttagen som UI-källa. GPS/geofence
// är passiv evidence; ingen popup får längre fråga om att starta tid.
import { HeaderShell } from '@/components/mobile-app/MobileHeader';
import { Clock } from 'lucide-react';
import CalendarViewToggle, { type CalendarViewMode } from '@/components/mobile-app/calendar/CalendarViewToggle';
import CalendarDateNav from '@/components/mobile-app/calendar/CalendarDateNav';
import MobileDayView from '@/components/mobile-app/calendar/MobileDayView';
import MobileWeekView from '@/components/mobile-app/calendar/MobileWeekView';
import MobileMonthView from '@/components/mobile-app/calendar/MobileMonthView';
import MobileJobListView from '@/components/mobile-app/calendar/MobileJobListView';
import LagerDayCard from '@/components/mobile-app/LagerDayCard';
import { Loader2, RefreshCw, Building2, MapPin, UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
// toast import removed — no popup confirmations on geofence events.
import { useLanguage } from '@/i18n/LanguageContext';


const VIEW_MODE_KEY = 'mobile.calendarView';
const isViewMode = (v: unknown): v is CalendarViewMode =>
  v === 'day' || v === 'week' || v === 'month' || v === 'list';

/**
 * MobileJobs — calendar/job overview.
 *
 * TIMER POLICY (2026-05-08):
 *   This page no longer starts or stops any timer. The single timer surface
 *   in the Time app is `WorkDayPanel` (driven by `active_time_registrations`
 *   via `useActiveTimerStatus` + `mobileApi.startTimeRegistration` /
 *   `stopTimeRegistration`). Job/project/location cards are read-only —
 *   tapping them only opens the corresponding detail page.
 *
 *   Removed from this file: `useTimerStartFlow`, `handleTimerToggle`,
 *   `handleProjectTimerToggle`, `handleLocationTimerToggle`, the
 *   `TimerConflictDialog`, the `DistanceWarningDialog`, and any
 *   clock/stop buttons rendered on the cards themselves. `activeTimers`
 *   from `GeofencingContext` is no longer treated as timer authority and
 *   is not surfaced as visual highlight on the cards.
 */
const MobileJobs = () => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookings = [], isLoading, isRefetching: isRefreshing, refetch } = useMobileBookings();
  const { data: shifts = [] } = useScheduledShifts();
  const { t } = useLanguage();

  // Calendar view state — persisted in localStorage
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return isViewMode(stored) ? stored : 'day';
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);

  const { orgLocations } = useGeofencingContext();

  // Fixed locations that should appear as job cards (read-only)
  const locationJobs = orgLocations.filter(loc => loc.show_as_project === true);

  // Time Legacy Purge 6 — geofenceEvent renderas inte längre som popup. GPS
  // pings/evidence skickas fortfarande via useBackgroundLocationReporter +
  // useGeofencing → mobile-app-api/upload_location_batch. Time Engine tolkar
  // närvaron i efterhand. Inga separata projekt-/plats-/bokningstimers får
  // startas via popup (Single Timer Policy).

  // Empty set — cards are not visually tied to legacy activeTimers anymore.
  // The single timer surface is WorkDayPanel.
  const noActiveBookingIds = new Set<string>();

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
            <div className="relative shrink-0">
              <UserCircle2 className="w-7 h-7 text-primary-foreground/90" />
            </div>
          </button>
        </div>
        {/* Kompakt arbetsdags-widget — ersätter tidigare "Öppna Time"-genväg */}
        <div className="px-5 pb-2">
          <MobileWorkDayWidget />
        </div>
      </HeaderShell>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-5">

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : (
          <>
          {/* Calendar — toggleable Day/Week/Month/List */}
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
                activeBookingIds={noActiveBookingIds}
                onShowWeek={() => setViewMode('week')}
              />
            )}
            {viewMode === 'week' && (
              <MobileWeekView
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onOpenDayView={(d) => { setSelectedDate(d); setViewMode('day'); }}
                shifts={shifts}
                activeBookingIds={noActiveBookingIds}
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
              <MobileJobListView
                shifts={shifts}
                fixedLocations={locationJobs.map(l => ({ id: l.id, name: l.name, address: l.address ?? null }))}
              />
            )}
          </div>

          {/* Lager day card — internal warehouse hub for the selected day */}
          <LagerDayCard date={selectedDate} />

          {/* Fixed location jobs (e.g. Lager) — read-only, opens detail. */}
          {locationJobs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Fixed locations
                </h2>
              </div>
              <div className="space-y-2">
                {locationJobs.map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => navigate(`/m/location/${loc.id}`)}
                    className="w-full text-left rounded-2xl border border-primary/20 bg-card p-3.5 shadow-md active:opacity-80 transition-all"
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
                  </button>
                ))}
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Time Legacy Purge 6 — GeofencePrompt borttagen. Ingen popup på
          geofence enter/exit. GPS-pings/evidence skickas fortfarande. */}
    </div>
  );
};

export default MobileJobs;
