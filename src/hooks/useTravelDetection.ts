import { useState, useEffect, useCallback, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';

const SPEED_THRESHOLD = 2.0; // m/s (~7.2 km/h) — threshold for "in vehicle"
const SPEED_STOP_THRESHOLD = 1.0; // m/s — below this = stopped
const START_DEBOUNCE_MS = 30000; // 30s of sustained speed before starting
const STOP_DEBOUNCE_MS = 60000; // 60s of low speed before stopping
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
    // Try cached mapbox token first
    let token = localStorage.getItem(MAPBOX_TOKEN_KEY);
    if (!token) {
      // Fetch from edge function
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

  const speedHistoryRef = useRef<{ speed: number; time: number }[]>([]);
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
      await mobileApi.stopTravelLog({
        travel_log_id: travelState.activeTravelLogId,
        to_address: address || undefined,
        to_latitude: lat,
        to_longitude: lng,
      });

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
      console.log('[TravelDetection] Travel stopped');
    } catch (err) {
      console.error('[TravelDetection] Failed to stop travel:', err);
    }
  }, [travelState.activeTravelLogId]);

  // Manual stop
  const manualStopTravel = useCallback(async () => {
    if (!travelState.activeTravelLogId) return;
    // Use last known position or null
    const lastSpeed = speedHistoryRef.current[speedHistoryRef.current.length - 1];
    // We don't have lat/lng from speed history, so just stop without position
    try {
      await mobileApi.stopTravelLog({
        travel_log_id: travelState.activeTravelLogId,
      });
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
    } catch (err) {
      console.error('[TravelDetection] Manual stop failed:', err);
    }
  }, [travelState.activeTravelLogId]);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { speed, latitude, longitude } = position.coords;
        const now = Date.now();
        const currentSpeed = speed !== null && speed >= 0 ? speed : 0;

        speedHistoryRef.current.push({ speed: currentSpeed, time: now });
        // Keep only last 2 minutes
        speedHistoryRef.current = speedHistoryRef.current.filter(s => now - s.time < 120000);

        if (!travelState.isMoving) {
          // Check if we should start
          if (currentSpeed >= SPEED_THRESHOLD) {
            if (!startDebounceRef.current) {
              startDebounceRef.current = now;
            } else if (now - startDebounceRef.current >= START_DEBOUNCE_MS) {
              // Sustained movement for 30s
              startDebounceRef.current = null;
              stopDebounceRef.current = null;
              startTravel(latitude, longitude);
            }
          } else {
            startDebounceRef.current = null;
          }
        } else {
          // Check if we should stop
          if (currentSpeed < SPEED_STOP_THRESHOLD) {
            if (!stopDebounceRef.current) {
              stopDebounceRef.current = now;
            } else if (now - stopDebounceRef.current >= STOP_DEBOUNCE_MS) {
              // Stopped for 60s
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
  };
}
