import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useScheduledShifts } from '@/hooks/useScheduledShifts';

// Time Legacy Purge 6 — GeofencePrompt borttagen som UI-källa. GPS/geofence
// är passiv evidence; ingen popup får längre fråga om att starta tid.
import { HeaderShell } from '@/components/mobile-app/MobileHeader';

import CalendarViewToggle, { type CalendarViewMode } from '@/components/mobile-app/calendar/CalendarViewToggle';
import CalendarDateNav from '@/components/mobile-app/calendar/CalendarDateNav';
import MobileDayView from '@/components/mobile-app/calendar/MobileDayView';
import MobileWeekView from '@/components/mobile-app/calendar/MobileWeekView';
import MobileMonthView from '@/components/mobile-app/calendar/MobileMonthView';
import MobileJobListView from '@/components/mobile-app/calendar/MobileJobListView';
import LagerDayCard from '@/components/mobile-app/LagerDayCard';
import { Loader2, RefreshCw, UserCircle2 } from 'lucide-react';
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

  // Fixed locations är inte längre en egen huvudsektion i Jobs-vyn.
  // De dyker upp kontextuellt i vald dags segmentlista (Time v2) och
  // i tidrapporten — inte som statisk lista här.

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
        <div className="px-5 pt-2 pb-3 flex items-center justify-between gap-3">
          {/* LEFT: refresh */}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-primary-foreground/10 active:scale-95 transition-all"
            aria-label="Uppdatera"
          >
            <RefreshCw className={cn("w-4 h-4 text-primary-foreground/85", isRefreshing && "animate-spin")} />
          </button>

          {/* RIGHT: clickable name → profile */}
          <button
            onClick={() => navigate('/m/profile')}
            className="flex items-center gap-2.5 min-w-0 pl-2.5 pr-1 py-1 rounded-xl active:bg-primary-foreground/10 active:scale-95 transition-all"
            aria-label="Min profil"
          >
            <div className="text-right min-w-0">
              <p className="text-primary-foreground/70 text-[10px] font-semibold tracking-[0.18em] uppercase leading-none">
                {t('jobs.eyebrow')}
              </p>
              <h1 className="text-[15px] font-extrabold text-primary-foreground tracking-tight leading-tight mt-0.5 truncate">
                {staff?.name?.split(' ')[0] || 'Hej'}
              </h1>
            </div>
            <div className="relative shrink-0">
              <UserCircle2 className="w-7 h-7 text-primary-foreground/90" />
            </div>
          </button>
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
              />
            )}
          </div>

          {/* Lager day card — internal warehouse hub for the selected day */}
          <LagerDayCard date={selectedDate} />

          {/* Fixed locations renderas INTE som egen huvudsektion längre.
              Kända platser dyker upp kontextuellt i vald dags segmentlista
              (Time-vyn / get-mobile-gps-day-view) och i tidrapporten. */}
          </>
        )}
      </div>

      {/* Time Legacy Purge 6 — GeofencePrompt borttagen. Ingen popup på
          geofence enter/exit. GPS-pings/evidence skickas fortfarande. */}
    </div>
  );
};

export default MobileJobs;
