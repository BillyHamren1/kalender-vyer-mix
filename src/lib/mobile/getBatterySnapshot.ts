/**
 * Capture the device's current battery state to attach to GPS pings.
 *
 * This is purely diagnostic — it must NEVER throw, and must NEVER block
 * a GPS ping from being enqueued. If battery info can't be read for any
 * reason we return null values with `battery_source = 'unavailable'`
 * (no plugin / web platform without API) or `'error'` (plugin threw).
 *
 * Why we want it:
 *   The Time Engine debug surface needs to be able to distinguish
 *   "GPS gap because phone died" from "GPS gap because app was killed"
 *   from "GPS gap because background tracking failed". Battery level
 *   + charging state are the cheapest signals for that triage.
 */

export type BatterySource = 'capacitor_device' | 'unavailable' | 'error';

export interface BatterySnapshot {
  /** 0–1 as reported by Capacitor.Device.getBatteryInfo(). */
  battery_level: number | null;
  /** Rounded percent (0–100). */
  battery_percent: number | null;
  is_charging: boolean | null;
  /** ISO timestamp of when this snapshot was captured. */
  battery_captured_at: string;
  battery_source: BatterySource;
}

function emptySnapshot(source: BatterySource): BatterySnapshot {
  return {
    battery_level: null,
    battery_percent: null,
    is_charging: null,
    battery_captured_at: new Date().toISOString(),
    battery_source: source,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export async function getBatterySnapshot(): Promise<BatterySnapshot> {
  try {
    // Dynamic import so web builds without the plugin don't crash.
    const mod = await import('@capacitor/device').catch(() => null);
    const Device = (mod as any)?.Device;
    if (!Device || typeof Device.getBatteryInfo !== 'function') {
      return emptySnapshot('unavailable');
    }
    const info = await Device.getBatteryInfo();
    const rawLevel =
      typeof info?.batteryLevel === 'number' ? info.batteryLevel : null;
    const level = rawLevel === null ? null : clamp01(rawLevel);
    const percent = level === null ? null : Math.round(level * 100);
    const isCharging =
      typeof info?.isCharging === 'boolean' ? info.isCharging : null;

    // Web typically returns batteryLevel=1 and isCharging=false as a
    // hardcoded fallback. Treat that as "no real battery signal".
    if (level === null && isCharging === null) {
      return emptySnapshot('unavailable');
    }

    return {
      battery_level: level,
      battery_percent: percent,
      is_charging: isCharging,
      battery_captured_at: new Date().toISOString(),
      battery_source: 'capacitor_device',
    };
  } catch (err) {
    // Dev-only log; never crash the caller.
    if (typeof console !== 'undefined') {
      console.warn('[getBatterySnapshot] failed:', (err as any)?.message || err);
    }
    return emptySnapshot('error');
  }
}
