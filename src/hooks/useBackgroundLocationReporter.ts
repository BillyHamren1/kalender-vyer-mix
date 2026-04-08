import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { mobileApi } from '@/services/mobileApiService';

/**
 * Continuously reports GPS position to staff_locations every 30s.
 * Uses @capgo/background-geolocation on native (works even when app is backgrounded/killed).
 * Falls back to navigator.geolocation on web.
 */
export const useBackgroundLocationReporter = (staffId: string | null | undefined) => {
  const lastReportRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!staffId) return;

    const reportPosition = (latitude: number, longitude: number, accuracy: number | null, speed: number | null) => {
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

      const startBackgroundTracking = async () => {
        try {
          // Add watcher — this persists across app backgrounding and device sleep
          const watcherId = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: 'EventFlow Time spårar din position',
              backgroundTitle: 'EventFlow Time',
              requestPermissions: true,
              stale: false,
              distanceFilter: 20, // meters — triggers callback when user moves 20m
            },
            (location, error) => {
              if (stopped) return;
              if (error) {
                if (error.code === 'NOT_AUTHORIZED') {
                  console.warn('[BGLocation] User denied location permission');
                  // Optionally prompt to open settings:
                  // if (window.confirm('GPS behövs. Öppna inställningar?')) {
                  //   BackgroundGeolocation.openSettings();
                  // }
                } else {
                  console.warn('[BGLocation] error:', error.code);
                }
                return;
              }
              if (location) {
                reportPosition(
                  location.latitude,
                  location.longitude,
                  location.accuracy ?? null,
                  location.speed ?? null,
                );
              }
            },
          );

          console.log('[BGLocation] watcher started, id:', watcherId);

          // Store watcher id for cleanup
          (window as any).__bgGeoWatcherId = watcherId;
        } catch (err: any) {
          console.warn('[BGLocation] Failed to start background tracking:', err?.message || err);
        }
      };

      startBackgroundTracking();

      return () => {
        stopped = true;
        const watcherId = (window as any).__bgGeoWatcherId;
        if (watcherId != null) {
          BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
          delete (window as any).__bgGeoWatcherId;
        }
      };
    } else {
      // Web: use navigator.geolocation
      if (!navigator.geolocation) return;

      const onPosition = (pos: GeolocationPosition) => {
        reportPosition(
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
};
