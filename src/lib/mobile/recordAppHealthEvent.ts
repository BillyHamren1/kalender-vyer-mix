/**
 * Records a lightweight app health event for diagnostics.
 *
 * Never throws, never blocks the app, never creates work time. All failures
 * are silently logged — losing diagnostics is preferable to crashing the app.
 *
 * Used by useAppHealthReporter + manual hooks for permission-denied etc.
 */
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { getBatterySnapshot } from './getBatterySnapshot';
import { getAppMeta } from '@/services/appMeta';

export type AppHealthEventType =
  | 'app_start'
  | 'app_foreground'
  | 'app_background'
  | 'workday_timer_started'
  | 'workday_timer_stopped'
  | 'location_permission_denied'
  | 'location_permission_restored'
  | 'battery_snapshot'
  // Skickas när adaptiv locationMode byter läge — admin kan se EXAKT
  // varför en telefon pingade glest (t.ex. mode=idle distanceFilter=500m
  // → telefonen står stilla → inga GPS-events från OS).
  | 'location_mode_changed'
  // Lågfrekvent puls från useAppHealthReporter (var 5:e min när appen
  // är i förgrunden). Gör att admin kan se "App PÅ" även när telefonen
  // står helt stilla och inte byter app-state. INGEN arbetstid skapas.
  | 'heartbeat';

export interface RecordAppHealthEventInput {
  organizationId: string;
  staffId: string;
  eventType: AppHealthEventType;
  occurredAt?: string;
  appState?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * Skip the battery snapshot. Defaults to false (include). Some events such
   * as app_background may want to skip to avoid hanging during teardown.
   */
  skipBattery?: boolean;
}

export async function recordAppHealthEvent(input: RecordAppHealthEventInput): Promise<{ ok: boolean }> {
  try {
    if (!input.organizationId || !input.staffId || !input.eventType) {
      return { ok: false };
    }

    let battery_level: number | null = null;
    let battery_percent: number | null = null;
    let is_charging: boolean | null = null;
    if (!input.skipBattery) {
      try {
        const snap = await getBatterySnapshot();
        battery_level = snap.battery_level;
        battery_percent = snap.battery_percent;
        is_charging = snap.is_charging;
      } catch {
        /* ignore battery errors */
      }
    }

    let app_version: string | null = null;
    let platform: string | null = null;
    try {
      const meta = await getAppMeta();
      app_version = meta.app_version ?? null;
      platform = meta.app_platform ?? Capacitor.getPlatform();
    } catch {
      try {
        platform = Capacitor.getPlatform();
      } catch {
        /* noop */
      }
    }

    await supabase.functions.invoke('record-staff-app-health-event', {
      body: {
        organizationId: input.organizationId,
        staffId: input.staffId,
        eventType: input.eventType,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        batteryLevel: battery_level,
        batteryPercent: battery_percent,
        isCharging: is_charging,
        appState: input.appState ?? null,
        platform,
        appVersion: app_version,
        metadata: input.metadata ?? {},
      },
    });
    return { ok: true };
  } catch (err) {
    // Soft-fail: never let diagnostics crash the app.
    // eslint-disable-next-line no-console
    console.warn('[app-health] failed to record event', input.eventType, err);
    return { ok: false };
  }
}
