import { Capacitor } from '@capacitor/core';

/**
 * App Mode Configuration
 * 
 * Determines which app is running: 'time', 'scanner', or 'web'.
 * 
 * For native builds, APP_MODE is set via the VITE_APP_MODE environment variable
 * at build time:
 *   - VITE_APP_MODE=time  → EventFlow Time
 *   - VITE_APP_MODE=scanner → EventFlow Scanner
 * 
 * For web builds, it defaults to 'web' (all routes available).
 */

export type AppMode = 'time' | 'scanner' | 'web';

function detectAppMode(): AppMode {
  const envMode = import.meta.env.VITE_APP_MODE as string | undefined;

  let resolved: AppMode;

  if (envMode === 'scanner') {
    resolved = 'scanner';
  } else if (envMode === 'time') {
    resolved = 'time';
  } else if (Capacitor.isNativePlatform()) {
    // Native without explicit mode — default to time (should not happen with proper build)
    console.warn('[AppMode] Native app without VITE_APP_MODE — defaulting to "time"');
    resolved = 'time';
  } else {
    resolved = 'web';
  }

  // Boot log for debugging mode issues
  console.info(`[AppMode] env=${envMode ?? '(unset)'} | resolved=${resolved} | native=${Capacitor.isNativePlatform()}`);

  return resolved;
}

export const APP_MODE: AppMode = detectAppMode();

/** True when running as the EventFlow Time native app */
export const isTimeApp = APP_MODE === 'time';

/** True when running as the EventFlow Scanner native app */
export const isScannerApp = APP_MODE === 'scanner';

/** True when running in a web browser (not a native app) */
export const isWebApp = APP_MODE === 'web';

/** The default route for the current app mode */
export function getDefaultRoute(): string {
  switch (APP_MODE) {
    case 'time': return '/m';
    case 'scanner': return '/scanner';
    case 'web': return '/projects';
  }
}

/** The login route for the current app mode */
export function getLoginRoute(): string {
  switch (APP_MODE) {
    case 'time': return '/m/login';
    case 'scanner': return '/scanner/login';
    case 'web': return '/auth';
  }
}
