/**
 * Shared helpers for recovering from stale Vite module / lazy-route fetch failures.
 *
 * Used by:
 *  - src/main.tsx (boot + vite:preloadError)
 *  - src/utils/lazyWithRecovery.ts (route-level React.lazy)
 *  - src/components/diagnostics/GlobalErrorBoundary.tsx (render-time fallback)
 */

const MODULE_RECOVERY_KEY = 'eventflow-module-recovery';
const MODULE_RECOVERY_QUERY = '__lovable_module_reload';
const RECOVERY_COOLDOWN_MS = 30_000;

const MODULE_ERROR_FRAGMENTS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'failed to load module script',
  'the server responded with a status of 404',
  'failed to load resource',
  'error loading dynamically imported module',
  'unable to preload css',
];

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  return String(error ?? 'Okänt fel');
};

export const isStaleModuleError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  return MODULE_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment));
};

export const hasRecentRecoveryAttempt = (): boolean => {
  try {
    const raw = window.sessionStorage.getItem(MODULE_RECOVERY_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < RECOVERY_COOLDOWN_MS;
  } catch {
    return false;
  }
};

export const markRecoveryAttempt = () => {
  try {
    window.sessionStorage.setItem(MODULE_RECOVERY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};

export const clearRecoveryAttempt = () => {
  try {
    window.sessionStorage.removeItem(MODULE_RECOVERY_KEY);
  } catch {
    /* ignore */
  }
};

export const cleanupRecoveryQuery = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(MODULE_RECOVERY_QUERY)) return;
    url.searchParams.delete(MODULE_RECOVERY_QUERY);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
};

export const purgeBrowserCaches = async (): Promise<void> => {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
};

/**
 * Hard-reload after purging caches/SW. Strips the recovery query param so the
 * new document URL is clean.
 */
export const reloadWithFreshDocument = (): void => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(MODULE_RECOVERY_QUERY);
    const cleanHref = `${url.pathname}${url.search}${url.hash}`;
    if (cleanHref !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, '', cleanHref);
    }
  } catch {
    /* ignore */
  }

  void purgeBrowserCaches().finally(() => {
    window.location.reload();
  });
};

/**
 * Try to recover from a stale-module error.
 * Returns true if an automatic recovery (hard reload) was scheduled.
 * Returns false if cooldown blocked the attempt — caller should show manual UI.
 */
export const attemptModuleRecovery = (error: unknown): boolean => {
  if (!isStaleModuleError(error)) return false;
  if (hasRecentRecoveryAttempt()) return false;
  markRecoveryAttempt();
  reloadWithFreshDocument();
  return true;
};

/**
 * User-initiated retry: bypass cooldown and force a fresh fetch.
 */
export const forceManualRecovery = (): void => {
  clearRecoveryAttempt();
  reloadWithFreshDocument();
};
