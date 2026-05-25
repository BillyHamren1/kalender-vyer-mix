import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Geolocation } from '@capacitor/geolocation';
import { mobileApi } from '@/services/mobileApiService';
import { getBatterySnapshot } from '@/lib/mobile/getBatterySnapshot';

/**
 * useGpsPulseHandler
 *
 * Lyssnar på silent push från `gps-heartbeat-pulse` (data.type === 'gps_pulse')
 * och tvingar en GPS-fix som postas till mobile-app-api precis som vanliga
 * pings — med battery_source='gps_pulse'.
 *
 * Detta är vad som löser stationära luckor (lunch, möte) — Capgo-pluginen
 * skickar ingenting när telefonen är stilla i bakgrunden, och iOS suspenderar
 * JS-loopen. Silent push väcker appen i ~30 s, vilket räcker för en fix +
 * upload.
 *
 * Ingen workday-gating. Alla inloggade enheter med location permission
 * pulsar.
 */
export function useGpsPulseHandler(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const isScanner = import.meta.env.VITE_APP_MODE === 'scanner';
    if (isScanner) return;

    let mounted = true;
    const handle = (notification: any) => {
      if (!mounted) return;
      const data = notification?.data ?? notification?.notification?.data ?? {};
      if (data.type !== 'gps_pulse') return;
      void handleGpsPulse(data.issued_at as string | undefined);
    };

    const sub = PushNotifications.addListener('pushNotificationReceived', handle);

    return () => {
      mounted = false;
      sub.then((s) => s.remove?.()).catch(() => {});
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
    const recordedAt = new Date().toISOString();
    const id = `pulse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await mobileApi.uploadLocationBatch([
      {
        id,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
        source: 'gps_pulse',
        recordedAt,
        batteryLevel: battery?.batteryLevel ?? null,
        batteryPercent: battery?.batteryPercent ?? null,
        isCharging: battery?.isCharging ?? null,
        batteryCapturedAt: battery?.batteryCapturedAt ?? null,
        batterySource: 'gps_pulse',
      },
    ]);
    console.log('[gps-pulse] ping uploaded', {
      issued_at: issuedAt,
      lag_ms: issuedAt ? Date.now() - new Date(issuedAt).getTime() : null,
    });
  } catch (err) {
    console.warn('[gps-pulse] failed:', err);
  }
}
