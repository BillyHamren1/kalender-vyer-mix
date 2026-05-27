import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { enqueueLocationPoint, forceFlushLocationQueue } from '@/services/locationSyncQueue';
import { getBatterySnapshot } from '@/lib/mobile/getBatterySnapshot';

/**
 * useGpsPulseHandler
 *
 * Lyssnar på window-eventet `gps-pulse-received` (dispatchad från
 * `pushNotificationService` när en silent push med `data.type === 'gps_pulse'`
 * tas emot från `gps-heartbeat-pulse`).
 *
 * När eventet kommer tvingar vi en GPS-fix och lägger punkten i den lokala
 * `locationSyncQueue` — sedan force-flushar vi så batchen går iväg direkt.
 * Ingen direktkontakt med mobileApi.uploadLocationBatch — kön äger uploaden.
 *
 * Det är detta som löser stationära luckor (lunch, möte) — Capgo-pluginen
 * skickar ingenting när telefonen är stilla i bakgrunden, och iOS suspenderar
 * JS-loopen. Silent push väcker appen i ~30 s, vilket räcker för en fix +
 * enqueue + flush.
 *
 * Ingen workday-gating. Alla inloggade enheter med location permission pulsar.
 */
export function useGpsPulseHandler(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!Capacitor.isNativePlatform()) return;
    const isScanner = import.meta.env.VITE_APP_MODE === 'scanner';
    if (isScanner) return;

    let mounted = true;

    const onPulse = (ev: Event) => {
      if (!mounted) return;
      const detail = (ev as CustomEvent).detail as { issued_at?: string } | undefined;
      void handleGpsPulse(detail?.issued_at);
    };

    window.addEventListener('gps-pulse-received', onPulse);

    return () => {
      mounted = false;
      window.removeEventListener('gps-pulse-received', onPulse);
    };
  }, []);
}

async function handleGpsPulse(issuedAt: string | undefined): Promise<void> {
  try {
    // Permission-koll — tysta no-op om inte tillåtet
    const perm = await Geolocation.checkPermissions().catch(() => null);
    if (perm && perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      console.log('[gps-pulse] no location permission — skip');
      return;
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0,
    });

    const battery = await getBatterySnapshot().catch(() => null);

    const id = enqueueLocationPoint({
      id: `pulse_${issuedAt ?? Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      speed: pos.coords.speed ?? null,
      source: 'gps_pulse',
      recordedAt: new Date().toISOString(),
      batteryLevel: battery?.battery_level ?? null,
      batteryPercent: battery?.battery_percent ?? null,
      isCharging: battery?.is_charging ?? null,
      batteryCapturedAt: battery?.battery_captured_at ?? null,
      batterySource: 'gps_pulse',
    });

    await forceFlushLocationQueue('gps_pulse');

    console.log('[gps-pulse] enqueued + flushed', {
      id,
      issued_at: issuedAt,
      lag_ms: issuedAt ? Date.now() - new Date(issuedAt).getTime() : null,
    });
  } catch (err) {
    console.warn('[gps-pulse] failed:', err);
  }
}
