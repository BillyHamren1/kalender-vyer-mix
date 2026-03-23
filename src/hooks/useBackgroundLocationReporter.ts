import { useEffect, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';

/**
 * Continuously reports GPS position to staff_locations every 30s,
 * regardless of active shifts or bookings.
 * Runs as long as the app is open and staffId is provided.
 */
export const useBackgroundLocationReporter = (staffId: string | null | undefined) => {
  const lastReportRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!staffId || !navigator.geolocation) return;

    const onPosition = (pos: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastReportRef.current < 30000) return;
      lastReportRef.current = now;

      mobileApi.reportLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
      }).catch((error) => {
        console.warn('[BGLocation] report error:', error?.message || error);
      });
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
  }, [staffId]);
};
