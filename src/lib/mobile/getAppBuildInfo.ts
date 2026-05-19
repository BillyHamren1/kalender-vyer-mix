/**
 * getAppBuildInfo
 * ─────────────────────────────────────────────────────────────────────────
 * Returnerar metadata om vilken byggnad av Time-appen som är installerad
 * + plattform/OS/enhet. Skickas med på app-health-events och GPS-pings så
 * vi kan se i admin/debug exakt vilken version varje användare kör.
 *
 * Best-effort:
 * - Native (Capacitor):  @capacitor/app + @capacitor/device
 * - Web/utan plugins:    returnerar platform 'web' och så mycket vi kan
 *
 * Cachas första lyckade resolve eftersom värdena inte ändras utan
 * app-restart. Kastar ALDRIG.
 */
import { Capacitor } from '@capacitor/core';

export interface AppBuildInfo {
  appVersion: string | null;
  appBuild: string | null;
  platform: 'ios' | 'android' | 'web' | null;
  osVersion: string | null;
  deviceModel: string | null;
  appId: string | null;
}

const EMPTY: AppBuildInfo = {
  appVersion: null,
  appBuild: null,
  platform: null,
  osVersion: null,
  deviceModel: null,
  appId: null,
};

let cached: AppBuildInfo | null = null;
let pending: Promise<AppBuildInfo> | null = null;

function normPlatform(p: string | null | undefined): 'ios' | 'android' | 'web' | null {
  if (p === 'ios' || p === 'android' || p === 'web') return p;
  return null;
}

export async function getAppBuildInfo(): Promise<AppBuildInfo> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async (): Promise<AppBuildInfo> => {
    const out: AppBuildInfo = { ...EMPTY };
    try {
      out.platform = normPlatform(Capacitor.getPlatform());

      // @capacitor/app — appVersion / appBuild / appId
      if (Capacitor.isNativePlatform()) {
        try {
          const { App } = await import('@capacitor/app');
          const info = await App.getInfo();
          out.appVersion = info?.version ?? null;
          out.appBuild = info?.build ?? null;
          out.appId = info?.id ?? null;
        } catch {
          /* plugin saknas eller call failed — best effort */
        }

        // @capacitor/device — osVersion / deviceModel
        try {
          const { Device } = await import('@capacitor/device');
          const info = await Device.getInfo();
          out.osVersion = info?.osVersion ?? null;
          out.deviceModel = info?.model ?? null;
          if (!out.platform) out.platform = normPlatform(info?.platform ?? null);
        } catch {
          /* plugin saknas */
        }
      } else {
        // Web — låt UA bidra med "device model" så det inte är helt tomt.
        try {
          if (typeof navigator !== 'undefined') {
            out.deviceModel = navigator.userAgent?.slice(0, 120) ?? null;
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* never throw */
    } finally {
      cached = out;
      pending = null;
    }
    return out;
  })();

  return pending;
}

/** Synchronous accessor — returnerar cachat värde eller null om det inte resolvat än. */
export function getAppBuildInfoSync(): AppBuildInfo | null {
  return cached;
}

/** Testhjälpare — rensa cache mellan unit-tester. */
export function _resetAppBuildInfoCacheForTests(): void {
  cached = null;
  pending = null;
}
