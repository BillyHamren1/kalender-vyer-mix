import React, { useEffect } from 'react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';
import { useGpsPulseHandler } from '@/hooks/useGpsPulseHandler';
import { initLocationPingHandler } from '@/services/locationPingHandler';
import GpsHealthDebugPanel from '@/components/mobile-app/GpsHealthDebugPanel';


/**
 * MobileGlobalOverlays — PASSIVE in the new Time Engine v2 world.
 *
 * Previously this file orchestrated the full mobile timer experience:
 * GlobalActiveTimerBanner, AutoArrivalNotice, WorkDayAssistant,
 * TravelCompletedDialog, StaleTimerDialog, TimerConflictDialog,
 * DistanceWarningDialog, EndDayOnArrivalHomeDialog, UnplannedVisitBanner,
 * useWorkSession-driven start/stop, etc.
 *
 * In the Time Engine v2 architecture the visible timer UI is owned exclusively
 * by `WorkDayPanel`, and timer state is read from `active_time_registrations`
 * via `useActiveTimerStatus` / `get-active-time-registration-status`.
 *
 * This component therefore must NOT:
 *  - start or stop timers via legacy hooks (useWorkSession, useTimerStartFlow,
 *    useWorkDay, useGeofencing auto-actions)
 *  - render workday/arrival/travel/stale/conflict/distance dialogs
 *  - read or write `location_time_entries`, `workdays`, `time_reports`
 *  - dispatch `request-end-day` or `timer-state-changed` events
 *
 * It MAY:
 *  - keep the background location reporter alive (passive GPS pings)
 *  - respond to server-triggered location pings (FCM data-pushes)
 */
const MobileGlobalOverlays: React.FC = () => {
  const { staff } = useMobileAuth();

  // Passive GPS reporter — pings are saved as location data only.
  // Frontend overlays never start/stop timers directly. GPS auto-start is
  // handled only by backend Time Engine via active_time_registrations.
  const { debug: gpsDebug } = useBackgroundLocationReporter(staff?.id);

  // Server-triggered "ping the phone" — listen for FCM data-pushes with
  // notification_type=location_ping and respond with a fresh GPS sample.
  useEffect(() => {
    if (!staff) return;
    const dispose = initLocationPingHandler({
      getCurrentPosition: () =>
        new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('no geolocation'));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy ?? null,
                speed: pos.coords.speed ?? null,
              }),
            reject,
            { timeout: 8000, maximumAge: 30_000, enableHighAccuracy: true },
          );
        }),
    });
    return dispose;
  }, [staff]);

  return <GpsHealthDebugPanel debug={gpsDebug} />;
};

export default MobileGlobalOverlays;
