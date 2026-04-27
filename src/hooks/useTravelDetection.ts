/**
 * useTravelDetection — ASSIST LAYER (deprecated as primary engine)
 * ================================================================
 *
 * STATUS: assist only. NO auto-start of travel from GPS speed.
 *
 * OFFICIAL TIME MODEL (Tidappen):
 *   1. Dagtimer (workday) = hela arbetsdagens tak.
 *   2. Aktivitet (projekt/plats/bokning) = tidsblock inuti dagen.
 *   3. Restid = GAPET mellan två aktiviteter när gapet är rimligt.
 *      Auktoritativ väg: `create_travel_from_gap` (server) +
 *      day-review (`adjustTravel` / `createTravelForGap`).
 *
 * Vad denna hook GÖR fortfarande:
 *   • Exponerar `latestPosition`-driven `lastPositionRef` så att
 *     downstream-flöden (home-arrival detection, end-of-day prompts)
 *     kan läsa senaste GPS-koordinat utan en egen GPS-watcher.
 *   • Stänger eventuella *gamla* öppna `travel_time_logs`-rader när
 *     `STOP_TRAVEL_EVENT` fires (geofence ENTER / ny activity-timer)
 *     eller när användaren trycker manuellt stopp i banner.
 *   • Reconcilar phantom local state mot servern vid mount.
 *
 * Vad denna hook INTE LÄNGRE GÖR:
 *   • Skapar inga `travel_time_logs` automatiskt från GPS-fart.
 *     Den gamla SPEED_THRESHOLD/START_DEBOUNCE-loopen är borttagen.
 *   • Är inte längre "huvudmotor" för restid — gap-modellen är.
 *
 * Banner/dialog-UI (TravelBanner, TravelCompletedDialog) är därmed
 * passiva: de visas bara om en legacy-rad fortfarande är öppen.
 * Ny travel-data ska aldrig längre uppstå härifrån.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { GpsPosition } from '@/hooks/useGeofencing';

const MAX_ACCURACY_M = 50;

/**
 * Cross-hook signal — fired by `useGeofencing` (on ENTER of any known
 * workplace) and by `useTimerStartFlow` (right before a new activity timer
 * starts). The travel-detection hook listens and stops the open
 * `travel_time_logs` row with the supplied position as destination.
 *
 * Speed alone NEVER stops a travel row — only arrival at a known place
 * or the user starting a new activity counts as "resan är slut".
 */
export const STOP_TRAVEL_EVENT = 'eventflow-stop-travel';
export interface StopTravelEventDetail {
  lat: number;
  lng: number;
  /** True when triggered by automatic flow (geofence ENTER / new timer). */
  auto?: boolean;
}
const TRAVEL_STATE_KEY = 'eventflow-travel-state';
const MAPBOX_TOKEN_KEY = 'eventflow-mapbox-token';

export interface TravelState {
  isMoving: boolean;
  activeTravelLogId: string | null;
  startTime: string | null;
  fromAddress: string | null;
  fromLat: number | null;
  fromLng: number | null;
}

export interface TravelCompletedInfo {
  travelLogId: string;
  toAddress: string | null;
  toLat: number;
  toLng: number;
  hoursWorked: number;
  matchedBookingId: string | null;
  /**
   * 'work'         — server is confident this is billable (booking-matched
   *                  destination, or manual user action).
   * 'unclassified' — auto-detected travel without a booking match. Hours
   *                  still recorded, but the user is asked in the dialog
   *                  whether this was work or private. Until classified
   *                  it's a soft assistant signal, not paid time.
   */
  classification: 'work' | 'personal' | 'unclassified';
  /**
   * True when the row was closed by an automatic flow (geofence ENTER on
   * a known place or because a new activity timer was started). Auto-flow
   * stops are SILENT — no classification dialog is shown until the
   * day-end reconciliation step. Manual user stops keep the dialog.
   */
  autoFlow?: boolean;
}

// Haversine distance in meters
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function loadTravelState(): TravelState {
  try {
    const raw = localStorage.getItem(TRAVEL_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { isMoving: false, activeTravelLogId: null, startTime: null, fromAddress: null, fromLat: null, fromLng: null };
}

function saveTravelState(state: TravelState) {
  localStorage.setItem(TRAVEL_STATE_KEY, JSON.stringify(state));
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    let token = localStorage.getItem(MAPBOX_TOKEN_KEY);
    if (!token) {
      const res = await fetch('https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/mapbox-token');
      const data = await res.json();
      if (data?.token) {
        token = data.token;
        localStorage.setItem(MAPBOX_TOKEN_KEY, token!);
      }
    }
    if (!token) return null;

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=sv&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    return data.features?.[0]?.place_name || null;
  } catch (err) {
    console.error('[TravelDetection] Reverse geocode failed:', err);
    return null;
  }
}

/**
 * Travel detection hook that consumes GPS position from useGeofencing
 * instead of creating its own GPS watcher (eliminates dual-watcher issue).
 */
export function useTravelDetection(enabled: boolean = true, gpsPosition: GpsPosition | null = null) {
  const [travelState, setTravelState] = useState<TravelState>(loadTravelState);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedTravel, setCompletedTravel] = useState<TravelCompletedInfo | null>(null);

  const lastPositionRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const startDebounceRef = useRef<number | null>(null);
  const startInFlightRef = useRef(false);
  const stopInFlightRef = useRef<string | null>(null);
  
  // Use refs for values accessed in GPS callback to avoid effect restart loops
  const travelStateRef = useRef(travelState);
  useEffect(() => { travelStateRef.current = travelState; }, [travelState]);

  // Update elapsed seconds for active travel
  useEffect(() => {
    if (!travelState.isMoving || !travelState.startTime) return;
    const interval = setInterval(() => {
      const start = new Date(travelState.startTime!).getTime();
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [travelState.isMoving, travelState.startTime]);

  const clearTravelState = useCallback(() => {
    const newState: TravelState = {
      isMoving: false,
      activeTravelLogId: null,
      startTime: null,
      fromAddress: null,
      fromLat: null,
      fromLng: null,
    };
    setTravelState(newState);
    saveTravelState(newState);
  }, []);

  // ── Phantom-state reconciliation ─────────────────────────────────────
  // If localStorage claims a trip is active but the server has no open
  // travel row, clear the phantom local state so the banner doesn't get
  // stuck after a refresh / app re-install / token rotation.
  useEffect(() => {
    if (!enabled) return;
    if (!travelStateRef.current.activeTravelLogId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await mobileApi.getTravelLogs(10);
        if (cancelled) return;
        const localId = travelStateRef.current.activeTravelLogId;
        if (!localId) return;
        const logs = (res?.travel_logs || []) as Array<{ id: string; end_time: string | null }>;
        const matching = logs.find(l => l.id === localId);
        const stillOpen = !!matching && !matching.end_time;
        if (!stillOpen) {
          console.log('[TravelDetection] Phantom local travel state — clearing (no open server row).');
          clearTravelState();
        }
      } catch (err) {
        // Soft-fail: don't kill banner on a transient network blip.
        console.warn('[TravelDetection] Phantom reconcile failed:', err);
      }
    })();
    return () => { cancelled = true; };
    // Run once when the hook gains a logged-in/enabled session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);


  const startTravel = useCallback(async (lat: number, lng: number) => {
    if (startInFlightRef.current || travelStateRef.current.activeTravelLogId) {
      return;
    }
    startInFlightRef.current = true;
    console.log('[TravelDetection] Starting travel tracking...');
    const address = await reverseGeocode(lat, lng);
    
    try {
      const result = await mobileApi.createTravelLog({
        from_address: address || undefined,
        from_latitude: lat,
        from_longitude: lng,
        auto_detected: true,
      });

      const newState: TravelState = {
        isMoving: true,
        activeTravelLogId: result.travel_log.id,
        startTime: result.travel_log.start_time,
        fromAddress: address,
        fromLat: lat,
        fromLng: lng,
      };
      setTravelState(newState);
      saveTravelState(newState);
      // NOTE: travel_start is NEVER allowed to open the workday.
      // The workday must be opened by a real work-presence signal
      // (geofence ENTER on a known workplace, arrival report, or
      // explicit user action). Auto-detected travel before the day
      // has begun is morning commute and is rejected by the server
      // with reason='pre_workday_commute'. Do NOT call autoStartWorkDay() here.
      console.log('[TravelDetection] Travel started:', result.travel_log.id);
      // Note: open location_time_entries are now closed atomically by the
      // server inside `handleStartTravelLog` (mobile-app-api). The previous
      // client-side close attempt was unauthenticated for mobile sessions
      // and silently failed → two timers ticking. Do NOT re-add it here.
    } catch (err: any) {
      // SILENT REJECTION: the server returns 409 in two situations:
      //   • inside_geofence — user is currently standing inside a known
      //     workplace; GPS jitter must not spawn a phantom travel row.
      //   • pre_workday_commute — no real work presence today yet, so
      //     this auto-detected movement is morning commute and must
      //     never be auto-logged as travel time.
      const msg = String(err?.message || '');
      if (
        msg.includes('inside_geofence') ||
        msg.includes('pre_workday_commute') ||
        msg.includes('blocked')
      ) {
        console.log('[TravelDetection] Travel start rejected by server:', msg);
        return;
      }
      console.error('[TravelDetection] Failed to start travel:', err);
    } finally {
      startInFlightRef.current = false;
    }
  }, []);


  const stopTravel = useCallback(async (lat: number, lng: number, opts: { auto?: boolean } = {}) => {
    const currentLogId = travelStateRef.current.activeTravelLogId;
    if (!currentLogId) return;
    if (stopInFlightRef.current === currentLogId) return;
    stopInFlightRef.current = currentLogId;
    console.log('[TravelDetection] Stopping travel tracking...', { auto: !!opts.auto });

    const address = await reverseGeocode(lat, lng);

    try {
      const result = await mobileApi.stopTravelLog({
        travel_log_id: currentLogId,
        to_address: address || undefined,
        to_latitude: lat,
        to_longitude: lng,
      });

      setCompletedTravel({
        travelLogId: currentLogId,
        toAddress: address,
        toLat: lat,
        toLng: lng,
        hoursWorked: result.travel_log?.hours_worked || 0,
        matchedBookingId: result.travel_log?.destination_booking_id || null,
        classification: result.travel_log?.classification || 'unclassified',
        autoFlow: !!opts.auto,
      });

      clearTravelState();
      console.log('[TravelDetection] Travel stopped, classification:', result.travel_log?.classification);
    } catch (err: any) {
      console.error('[TravelDetection] Failed to stop travel:', err);
      // If the server explicitly says the row is gone / not found, clear
      // the local banner so the user is not stuck. Network errors leave
      // local state intact so a retry can happen.
      const msg = String(err?.message || '');
      if (msg.includes('not found') || msg.includes('404')) {
        console.log('[TravelDetection] Server reports travel gone — clearing local banner.');
        clearTravelState();
      }
    } finally {
      if (stopInFlightRef.current === currentLogId) {
        stopInFlightRef.current = null;
      }
    }
  }, [clearTravelState]);

  // Listen for cross-hook stop signals (geofence ENTER on a known place,
  // or a new activity timer being started via useTimerStartFlow). These
  // are the ONLY two automatic triggers allowed to end a travel row —
  // low GPS speed at an unknown address must NOT end the trip.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<StopTravelEventDetail>).detail;
      if (!detail) return;
      if (!travelStateRef.current.activeTravelLogId) return;
      stopTravel(detail.lat, detail.lng, { auto: detail.auto !== false });
    };
    window.addEventListener(STOP_TRAVEL_EVENT, handler as EventListener);
    return () => window.removeEventListener(STOP_TRAVEL_EVENT, handler as EventListener);
  }, [stopTravel]);

  // Manual stop — explicit user action ⇒ classify as 'work' (billable).
  // Auto-stop (speed-based) goes through stopTravel without mark_payable,
  // so the server defaults that path to 'unclassified' unless the
  // destination matches a booking. This is the core split between
  // "tidsgrundande resa" and "ren assistent-signal".
  const manualStopTravel = useCallback(async () => {
    const currentLogId = travelStateRef.current.activeTravelLogId;
    if (!currentLogId) return;
    const lastPos = lastPositionRef.current;
    try {
      const result = await mobileApi.stopTravelLog({
        travel_log_id: currentLogId,
        ...(lastPos ? { to_latitude: lastPos.lat, to_longitude: lastPos.lng } : {}),
        mark_payable: true,
      });

      if (lastPos) {
        const address = await reverseGeocode(lastPos.lat, lastPos.lng);
        setCompletedTravel({
          travelLogId: currentLogId,
          toAddress: address,
          toLat: lastPos.lat,
          toLng: lastPos.lng,
          hoursWorked: result.travel_log?.hours_worked || 0,
          matchedBookingId: result.travel_log?.destination_booking_id || null,
          // Manual stop is always treated as work — server enforces the
          // same classification because we passed mark_payable: true.
          classification: result.travel_log?.classification || 'work',
        });
      }

      clearTravelState();
    } catch (err: any) {
      console.error('[TravelDetection] Manual stop failed:', err);
      // The user explicitly tapped Stop. Whatever the server said, do
      // NOT leave the banner ticking. Worst case the server still has an
      // open row — the next geofence ENTER or app reload will reconcile.
      clearTravelState();
    }
  }, [clearTravelState]);

  const dismissCompletedTravel = useCallback(() => {
    setCompletedTravel(null);
  }, []);

  // Process GPS position from useGeofencing (no own watcher needed)
  useEffect(() => {
    if (!enabled || !gpsPosition) return;

    const { lat: latitude, lng: longitude, accuracy, speed, timestamp: now } = gpsPosition;

    // Filter out inaccurate GPS readings
    if (accuracy !== null && accuracy > MAX_ACCURACY_M) {
      return;
    }

    // Calculate speed from position delta (iOS fallback)
    let calculatedSpeed = 0;
    const lastPos = lastPositionRef.current;
    if (lastPos) {
      const distance = haversineDistance(lastPos.lat, lastPos.lng, latitude, longitude);
      const timeDiff = (now - lastPos.time) / 1000;
      if (timeDiff > 0 && timeDiff < 60) {
        calculatedSpeed = distance / timeDiff;
      }
    }
    lastPositionRef.current = { lat: latitude, lng: longitude, time: now };

    // Use native speed if available, otherwise calculated
    const currentSpeed = (speed !== null && speed >= 0) ? speed : calculatedSpeed;

    const currentState = travelStateRef.current;

    // Auto-START on sustained speed. Auto-STOP based on low speed has been
    // intentionally removed — a parked car at an unknown address (Bauhaus,
    // lunch, fuel) must NOT end the trip. Travel only ends when the user
    // arrives at a known geofence (warehouse / project / booking) or
    // starts a new activity timer via useTimerStartFlow. Both fire the
    // STOP_TRAVEL_EVENT handled above.
    if (!currentState.isMoving) {
      if (currentSpeed >= SPEED_THRESHOLD) {
        if (!startDebounceRef.current) {
          startDebounceRef.current = now;
        } else if (now - startDebounceRef.current >= START_DEBOUNCE_MS) {
          startDebounceRef.current = null;
          startTravel(latitude, longitude);
        }
      } else {
        startDebounceRef.current = null;
      }
    }
  }, [enabled, gpsPosition, startTravel]);

  return {
    travelState,
    elapsedSeconds,
    manualStopTravel,
    completedTravel,
    dismissCompletedTravel,
  };
}
