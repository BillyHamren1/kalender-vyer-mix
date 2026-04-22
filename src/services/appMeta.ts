/**
 * App version metadata helper.
 * ─────────────────────────────
 * Returns the currently installed mobile app's version, build number and
 * platform so it can be included in every staff_locations update. The
 * server stores the latest reported value on `staff_locations` so admins
 * can see, per staff, which app version is in the field.
 *
 * - Native (Capacitor): uses @capacitor/app's getInfo() — cached on first
 *   resolve since version doesn't change without an app restart anyway.
 * - Web / non-Capacitor: returns platform 'web' with no version.
 *
 * The lookup is best-effort and never throws — if anything fails we
 * return null so callers can simply omit the field.
 */
import { Capacitor } from '@capacitor/core';

export interface AppMeta {
  app_version?: string;
  app_build?: string;
  app_platform?: 'ios' | 'android' | 'web';
}

let cached: AppMeta | null = null;
let pending: Promise<AppMeta> | null = null;

export async function getAppMeta(): Promise<AppMeta> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async (): Promise<AppMeta> => {
    try {
      const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
      if (!Capacitor.isNativePlatform()) {
        cached = { app_platform: 'web' };
        return cached;
      }
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      cached = {
        app_version: info.version,
        app_build: info.build,
        app_platform: platform === 'ios' || platform === 'android' ? platform : 'web',
      };
      return cached;
    } catch {
      cached = { app_platform: 'web' };
      return cached;
    } finally {
      pending = null;
    }
  })();

  return pending;
}

/** Synchronous accessor — returns the cached value or null if not yet resolved. */
export function getAppMetaSync(): AppMeta | null {
  return cached;
}
