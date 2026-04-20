import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { mobileApi } from '@/services/mobileApiService';
import { GpsPosition, haversineDistance, ENTER_RADIUS } from '@/hooks/useGeofencing';

const PENDING_ARRIVALS_KEY = 'eventflow-pending-arrivals';
const GEOFENCE_TARGETS_KEY = 'eventflow-geofence-targets';

export interface PendingArrival {
  key: string;
  name: string;
  type: 'fixed' | 'project' | 'booking';
  timestamp: number;
  locationId?: string;
  largeProjectId?: string;
  bookingId?: string;
  address?: string;
  radius: number;
  lat: number;
  lng: number;
}

interface GeofenceTarget {
  key: string;
  name: string;
  type: 'fixed' | 'project' | 'booking';
  lat: number;
  lng: number;
  radius: number;
  locationId?: string;
  largeProjectId?: string;
  bookingId?: string;
  address?: string;
}

function loadPendingArrivals(): PendingArrival[] {
  try {
    const raw = localStorage.getItem(PENDING_ARRIVALS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function savePendingArrivals(arrivals: PendingArrival[]) {
  localStorage.setItem(PENDING_ARRIVALS_KEY, JSON.stringify(arrivals));
}

export function clearPendingArrivals(keys?: string[]) {
  if (!keys) {
    localStorage.removeItem(PENDING_ARRIVALS_KEY);
    return;
  }
  const current = loadPendingArrivals();
  const filtered = current.filter(a => !keys.includes(a.key));
  savePendingArrivals(filtered);
}

function loadGeofenceTargets(): GeofenceTarget[] {
  try {
    const raw = localStorage.getItem(GEOFENCE_TARGETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Continuously reports GPS position to staff_locations every 30s.
 * Uses @capgo/background-geolocation on native (works even when app is backgrounded/killed).
 * Falls back to navigator.geolocation on web.
 *
 * Also performs background geofence checks against cached targets and stores
 * pending arrivals in localStorage so useGeofencing can show prompts with
 * the real arrival time when the app is opened.
 *
 * Exposes `latestPosition` so other hooks (e.g. useTravelDetection)
 * can consume GPS data without creating their own watcher.
 */
const REPORT_THROTTLE_MS = 30_000;     // normal movement-driven report
const HEARTBEAT_INTERVAL_MS = 60_000;  // forced ping even if phone is still

export const useBackgroundLocationReporter = (staffId: string | null | undefined) => {
  const lastReportRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const lastKnownPosRef = useRef<{ lat: number; lng: number; accuracy: number | null; speed: number | null } | null>(null);
  const staffIdRef = useRef<string | null | undefined>(staffId);
  const [latestPosition, setLatestPosition] = useState<GpsPosition | null>(null);
  // Track which targets we're currently inside (to avoid duplicate pending arrivals)
  const insideRef = useRef<Set<string>>(new Set());

  // Keep ref in sync so heartbeat survives auth-token refreshes without restart
  useEffect(() => { staffIdRef.current = staffId; }, [staffId]);

  useEffect(() => {
    if (!staffId) return;

    // Reset inside tracking on new session
    insideRef.current.clear();

    const handlePosition = (latitude: number, longitude: number, accuracy: number | null, speed: number | null) => {
      // Always update latest position for consumers (travel detection etc.)
      setLatestPosition({
        lat: latitude,
        lng: longitude,
        accuracy,
        speed,
        timestamp: Date.now(),
      });

      // Throttle API reports to every 30s
      const now = Date.now();
      if (now - lastReportRef.current < 30000) {
        // Still run geofence check even when throttled
        checkBackgroundGeofences(latitude, longitude);
        return;
      }
      lastReportRef.current = now;

      mobileApi.reportLocation({ latitude, longitude, accuracy, speed }).catch((error) => {
        console.warn('[BGLocation] report error:', error?.message || error);
      });

      // Run geofence check
      checkBackgroundGeofences(latitude, longitude);
    };

    const checkBackgroundGeofences = (lat: number, lng: number) => {
      const targets = loadGeofenceTargets();
      if (targets.length === 0) return;

      let arrivals = loadPendingArrivals();
      let changed = false;
      const arrivalKeys = new Set(arrivals.map(a => a.key));

      for (const target of targets) {
        const dist = haversineDistance(lat, lng, target.lat, target.lng);
        const enterRadius = target.radius || ENTER_RADIUS;
        const exitRadius = enterRadius + 50;

        if (dist <= enterRadius) {
          // Inside geofence
          if (!insideRef.current.has(target.key) && !arrivalKeys.has(target.key)) {
            // New arrival — save pending
            insideRef.current.add(target.key);
            arrivals.push({
              key: target.key,
              name: target.name,
              type: target.type,
              timestamp: Date.now(),
              locationId: target.locationId,
              largeProjectId: target.largeProjectId,
              bookingId: target.bookingId,
              address: target.address,
              radius: enterRadius,
              lat: target.lat,
              lng: target.lng,
            });
            changed = true;
            console.log(`[BGLocation] Pending arrival saved: ${target.name} (${target.key})`);
          } else {
            insideRef.current.add(target.key);
          }
        } else if (dist > exitRadius) {
          // Outside geofence — remove from inside tracking
          if (insideRef.current.has(target.key)) {
            insideRef.current.delete(target.key);
            // Remove pending arrival if user left before opening the app
            const beforeLen = arrivals.length;
            arrivals = arrivals.filter(a => a.key !== target.key);
            if (arrivals.length !== beforeLen) {
              changed = true;
              console.log(`[BGLocation] Pending arrival removed (exit): ${target.key}`);
            }
          }
        }
      }

      if (changed) {
        savePendingArrivals(arrivals);
      }
    };

    if (Capacitor.isNativePlatform()) {
      // Native: use @capgo/background-geolocation for true background tracking
      let stopped = false;

      BackgroundGeolocation.start(
        {
          backgroundMessage: 'EventFlow Time spårar din position',
          backgroundTitle: 'EventFlow Time',
          requestPermissions: true,
          stale: false,
          distanceFilter: 20,
        },
        (location, error) => {
          if (stopped) return;
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') {
              console.warn('[BGLocation] User denied location permission');
            } else {
              console.warn('[BGLocation] error:', error.code);
            }
            return;
          }
          if (location) {
            handlePosition(
              location.latitude,
              location.longitude,
              location.accuracy ?? null,
              location.speed ?? null,
            );
          }
        },
      ).then(() => {
        console.log('[BGLocation] background tracking started');
      }).catch((err) => {
        console.warn('[BGLocation] Failed to start:', err?.message || err);
      });

      return () => {
        stopped = true;
        BackgroundGeolocation.stop().catch(() => {});
      };
    } else {
      // Web: use navigator.geolocation
      if (!navigator.geolocation) return;

      const onPosition = (pos: GeolocationPosition) => {
        handlePosition(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy ?? null,
          pos.coords.speed ?? null,
        );
      };

      watchIdRef.current = navigator.geolocation.watchPosition(onPosition, (err) => {
        console.warn('[BGLocation] watch error:', err.message);
      }, {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 15000,
      });

      return () => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      };
    }
  }, [staffId]);

  return { latestPosition };
};
