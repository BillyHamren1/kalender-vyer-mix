import { useState, useEffect, useCallback, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';

const SPEED_THRESHOLD = 2.0; // m/s (~7.2 km/h) — threshold for "in vehicle"
const SPEED_STOP_THRESHOLD = 1.0; // m/s — below this = stopped
const START_DEBOUNCE_MS = 15000; // 15s of sustained speed before starting
const STOP_DEBOUNCE_MS = 60000; // 60s of low speed before stopping
const MAX_ACCURACY_M = 50; // Ignore GPS readings with accuracy > 50m
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

export function useTravelDetection(enabled: boolean = true) {
  const [travelState, setTravelState] = useState<TravelState>(loadTravelState);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedTravel, setCompletedTravel] = useState<TravelCompletedInfo | null>(null);

  const lastPositionRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const startDebounceRef = useRef<number | null>(null);
  const stopDebounceRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

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
    if (!travelState.activeTravelLogId) return;
    console.log('[TravelDetection] Stopping travel tracking...');
    
    const address = await reverseGeocode(lat, lng);
    
    try {
      const result = await mobileApi.stopTravelLog({
        travel_log_id: travelState.activeTravelLogId,
        to_address: address || undefined,
        to_latitude: lat,
        to_longitude: lng,
      });

      // Show completed travel dialog
      setCompletedTravel({
        travelLogId: travelState.activeTravelLogId,
        toAddress: address,
        toLat: lat,
        toLng: lng,
        hoursWorked: result.travel_log?.hours_worked || 0,
        matchedBookingId: result.travel_log?.destination_booking_id || null,
      });

      clearTravelState();
      console.log('[TravelDetection] Travel stopped');
    } catch (err) {
      console.error('[TravelDetection] Failed to stop travel:', err);
    }
  }, [travelState.activeTravelLogId, clearTravelState]);

  // Manual stop
  const manualStopTravel = useCallback(async () => {
    if (!travelState.activeTravelLogId) return;
    const lastPos = lastPositionRef.current;
    try {
      const result = await mobileApi.stopTravelLog({
        travel_log_id: travelState.activeTravelLogId,
        ...(lastPos ? { to_latitude: lastPos.lat, to_longitude: lastPos.lng } : {}),
      });

      if (lastPos) {
        const address = await reverseGeocode(lastPos.lat, lastPos.lng);
        setCompletedTravel({
          travelLogId: travelState.activeTravelLogId,
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
  }, [travelState.activeTravelLogId, clearTravelState]);

  const dismissCompletedTravel = useCallback(() => {
    setCompletedTravel(null);
  }, []);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { speed, latitude, longitude, accuracy } = position.coords;
        const now = Date.now();

        // Filter out inaccurate GPS readings
        if (accuracy > MAX_ACCURACY_M) {
          console.log(`[TravelDetection] Skipping inaccurate reading: ${accuracy.toFixed(0)}m`);
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

        if (!travelState.isMoving) {
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
      },
      (err) => {
        console.error('[TravelDetection] GPS error:', err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [enabled, travelState.isMoving, startTravel, stopTravel]);

  return {
    travelState,
    elapsedSeconds,
    manualStopTravel,
    completedTravel,
    dismissCompletedTravel,
  };
}
