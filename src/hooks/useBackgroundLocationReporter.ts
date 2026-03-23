import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { mobileApi } from '@/services/mobileApiService';

/**
 * Continuously reports GPS position to staff_locations every 30s,
 * regardless of active shifts or bookings.
 * Uses Capacitor Geolocation on native, navigator.geolocation on web.
 */
export const useBackgroundLocationReporter = (staffId: string | null | undefined) => {
  const lastReportRef = useRef(0);
  const watchIdRef = useRef<string | number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      // Native: use Capacitor Geolocation plugin
      let running = true;

      const startNativeWatch = async () => {
        try {
          const perm = await Geolocation.requestPermissions();
          if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
            console.warn('[BGLocation] Location permission denied');
            return;
          }
        } catch (e) {
          console.warn('[BGLocation] Permission request failed:', e);
        }

        // Use polling with getCurrentPosition (more reliable on iOS background)
        intervalRef.current = setInterval(async () => {
          if (!running) return;
          try {
            const pos = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 10000,
            });
            reportPosition(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy ?? null,
              pos.coords.speed ?? null,
            );
          } catch (err: any) {
            console.warn('[BGLocation] native position error:', err?.message || err);
          }
        }, 30000);

        // Also get one immediately
        try {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
          reportPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null, pos.coords.speed ?? null);
        } catch {}
      };

      startNativeWatch();

      return () => {
        running = false;
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
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
          navigator.geolocation.clearWatch(watchIdRef.current as number);
          watchIdRef.current = null;
        }
      };
    }
  }, [staffId]);
};
