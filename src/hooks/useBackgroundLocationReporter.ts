import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { mobileApi } from '@/services/mobileApiService';
import { GpsPosition } from '@/hooks/useGeofencing';

/**
 * Continuously reports GPS position to staff_locations every 30s.
 * Uses @capgo/background-geolocation on native (works even when app is backgrounded/killed).
 * Falls back to navigator.geolocation on web.
 *
 * Also exposes `latestPosition` so other hooks (e.g. useTravelDetection)
 * can consume GPS data without creating their own watcher.
 */
export const useBackgroundLocationReporter = (staffId: string | null | undefined) => {
  const lastReportRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const [latestPosition, setLatestPosition] = useState<GpsPosition | null>(null);

  useEffect(() => {
    if (!staffId) return;

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
      if (now - lastReportRef.current < 30000) return;
      lastReportRef.current = now;

      mobileApi.reportLocation({ latitude, longitude, accuracy, speed }).catch((error) => {
        console.warn('[BGLocation] report error:', error?.message || error);
      });
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
