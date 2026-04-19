import { useState, useEffect, useCallback, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { GpsPosition } from '@/hooks/useGeofencing';

const SPEED_THRESHOLD = 2.0; // m/s (~7.2 km/h)
const SPEED_STOP_THRESHOLD = 1.0; // m/s
const START_DEBOUNCE_MS = 15000; // 15s sustained speed
const STOP_DEBOUNCE_MS = 60000; // 60s low speed
const MAX_ACCURACY_M = 50;
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
  const stopDebounceRef = useRef<number | null>(null);
  
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

  const startTravel = useCallback(async (lat: number, lng: number) => {
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
      console.log('[TravelDetection] Travel started:', result.travel_log.id);
    } catch (err) {
      console.error('[TravelDetection] Failed to start travel:', err);
    }
  }, []);

  const stopTravel = useCallback(async (lat: number, lng: number) => {
    const currentLogId = travelStateRef.current.activeTravelLogId;
    if (!currentLogId) return;
    console.log('[TravelDetection] Stopping travel tracking...');
    
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
      });

      clearTravelState();
      console.log('[TravelDetection] Travel stopped, classification:', result.travel_log?.classification);
    } catch (err) {
      console.error('[TravelDetection] Failed to stop travel:', err);
    }
  }, [clearTravelState]);

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
        });
      }

      clearTravelState();
    } catch (err) {
      console.error('[TravelDetection] Manual stop failed:', err);
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

    if (!currentState.isMoving) {
      if (currentSpeed >= SPEED_THRESHOLD) {
        if (!startDebounceRef.current) {
          startDebounceRef.current = now;
        } else if (now - startDebounceRef.current >= START_DEBOUNCE_MS) {
          startDebounceRef.current = null;
          stopDebounceRef.current = null;
          startTravel(latitude, longitude);
        }
      } else {
        startDebounceRef.current = null;
      }
    } else {
      if (currentSpeed < SPEED_STOP_THRESHOLD) {
        if (!stopDebounceRef.current) {
          stopDebounceRef.current = now;
        } else if (now - stopDebounceRef.current >= STOP_DEBOUNCE_MS) {
          stopDebounceRef.current = null;
          startDebounceRef.current = null;
          stopTravel(latitude, longitude);
        }
      } else {
        stopDebounceRef.current = null;
      }
    }
  }, [enabled, gpsPosition, startTravel, stopTravel]);

  return {
    travelState,
    elapsedSeconds,
    manualStopTravel,
    completedTravel,
    dismissCompletedTravel,
  };
}
