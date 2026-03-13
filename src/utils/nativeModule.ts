/**
 * Native module selection helpers.
 * Stores the user's last-chosen module ("scanner" | "report")
 * so the native app can resume into the correct flow on next launch.
 */

const STORAGE_KEY = 'app_last_module';

export type NativeModule = 'scanner' | 'report';

export function getLastModule(): NativeModule | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'scanner' || val === 'report') return val;
    return null;
  } catch {
    return null;
  }
}

export function setLastModule(module: NativeModule): void {
  try {
    localStorage.setItem(STORAGE_KEY, module);
  } catch {
    // Storage not available — ignore
  }
}

export function isNativePlatform(): boolean {
  return (
    typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true
  );
}
