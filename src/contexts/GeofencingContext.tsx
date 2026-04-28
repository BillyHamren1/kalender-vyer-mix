/**
 * GeofencingContext — SINGLE GPS / TIMER ENGINE FOR THE WHOLE MOBILE APP
 * =====================================================================
 *
 * BAKGRUND (kritisk crashrisk):
 *   `useGeofencing()` mountar ett GPS-watch (`navigator.geolocation.watchPosition`)
 *   och en lokal cache av activeTimers. Tidigare anropades hooken på flera ställen
 *   samtidigt (MobileJobs, useWorkSession, useTimerStartFlow). Dessutom använder
 *   useTimerStartFlow internt useWorkSession — så på en sida med MobileJobs
 *   öppen mountades upp till 4 oberoende GPS-watchers parallellt. Det orsakade
 *   krockande state, dubbla auto-actions och vita kraschar.
 *
 * LÖSNING:
 *   En enda provider mountar `useGeofencing` EXAKT EN GÅNG, högst upp i mobil-
 *   shell:en (MobileAppLayout / TimeAppLayout). Alla konsumenter läser från
 *   contexten via `useGeofencingContext()`. Direktanrop av `useGeofencing()`
 *   är förbjudet i feature-kod (endast denna fil får göra det).
 *
 * KONSUMENTER:
 *   • useWorkSession    — läser activeTimers + primitives (start/stop)
 *   • useTimerStartFlow — läser activeTimers + userPosition
 *   • MobileJobs (UI)   — läser activeTimers, geofenceEvent, nearbyBookings…
 */
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useGeofencing } from '@/hooks/useGeofencing';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

type GeofencingValue = ReturnType<typeof useGeofencing>;

const GeofencingContext = createContext<GeofencingValue | null>(null);

export const GeofencingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();

  // Mount-once log + dev guard against accidental double mount.
  const mountCountRef = useRef(0);
  useEffect(() => {
    mountCountRef.current += 1;
    console.log('[GeofencingProvider] mounted', { staffId: staff?.id, instance: mountCountRef.current });
    if (mountCountRef.current > 1 && import.meta.env.DEV) {
      console.error(
        '[GeofencingProvider] CRITICAL: provider mounted more than once. ' +
          'This re-introduces the multi-GPS-watcher bug. Mount it ONCE in the mobile shell.',
      );
    }
    return () => {
      console.log('[GeofencingProvider] unmounted');
    };
  }, [staff?.id]);

  // SINGLE useGeofencing call for the whole app.
  const value = useGeofencing(bookings, staff?.id);

  return <GeofencingContext.Provider value={value}>{children}</GeofencingContext.Provider>;
};

/**
 * Read the shared geofencing engine. Falls back to a clear error in dev so
 * we never silently mount a second `useGeofencing` instance by accident.
 */
export function useGeofencingContext(): GeofencingValue {
  const ctx = useContext(GeofencingContext);
  if (!ctx) {
    const msg =
      '[useGeofencingContext] No GeofencingProvider found. ' +
      'Wrap the mobile shell (MobileAppLayout / TimeAppLayout) with <GeofencingProvider>.';
    if (import.meta.env.DEV) {
      // Loud but non-fatal — render placeholder values so UI doesn't crash white.
      console.error(msg);
    }
    throw new Error(msg);
  }
  return ctx;
}

/**
 * Soft variant for components that may render outside the mobile shell
 * (e.g. shared widgets used in both desktop + mobile). Returns null if no
 * provider is present instead of throwing.
 */
export function useGeofencingContextOptional(): GeofencingValue | null {
  return useContext(GeofencingContext);
}
