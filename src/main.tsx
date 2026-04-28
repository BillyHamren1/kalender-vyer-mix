import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isScannerApp, getDefaultRoute } from './config/appMode'
import { Capacitor } from '@capacitor/core'
import { initializeGlobalDiagnostics, reportDiagnostic } from './services/diagnostics/diagnostics'
import { GlobalErrorBoundary } from './components/diagnostics/GlobalErrorBoundary'

const root = createRoot(document.getElementById('root')!);
const MODULE_RECOVERY_KEY = 'eventflow-module-recovery';
const MODULE_RECOVERY_QUERY = '__lovable_module_reload';

// Detect scanner mode and swap icons/manifest dynamically
if (isScannerApp) {
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.setAttribute('href', '/manifest-scanner.json');

  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.setAttribute('href', '/app-icon-scanner-192.png');

  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (appleIcon) appleIcon.setAttribute('href', '/app-icon-scanner-192.png');

  const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appTitle) appTitle.setAttribute('content', 'Scanner');

  document.title = 'EventFlow Scanner';
}

// Native Capacitor app: redirect to the correct default route before React mounts.
if (Capacitor.isNativePlatform() && window.location.pathname === '/') {
  window.history.replaceState(null, '', getDefaultRoute());
}

initializeGlobalDiagnostics();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error ?? 'Okänt fel');
};

const shouldRecoverFromModuleError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return [
    'failed to fetch dynamically imported module',
    'importing a module script failed',
    'failed to load module script',
    'the server responded with a status of 404',
    'failed to load resource',
    'error loading dynamically imported module',
  ].some((fragment) => message.includes(fragment));
};

const hasRecentRecoveryAttempt = () => {
  try {
    const raw = window.sessionStorage.getItem(MODULE_RECOVERY_KEY);
    if (!raw) return false;
    const timestamp = Number(raw);
    return Number.isFinite(timestamp) && Date.now() - timestamp < 30_000;
  } catch {
    return false;
  }
};

const purgeBrowserCaches = async () => {
  // 1. Clear Cache Storage (covers any SW-cached HTML/JS)
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Ignore — we'll still reload.
  }

  // 2. Unregister any service workers so they can't replay old responses
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // Ignore.
  }
};

const markRecoveryAttempt = () => {
  try {
    window.sessionStorage.setItem(MODULE_RECOVERY_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures.
  }
};

const clearRecoveryAttempt = () => {
  try {
    window.sessionStorage.removeItem(MODULE_RECOVERY_KEY);
  } catch {
    // Ignore storage failures.
  }
};

const cleanupRecoveryQuery = () => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(MODULE_RECOVERY_QUERY)) return;

  url.searchParams.delete(MODULE_RECOVERY_QUERY);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
};

const reloadWithFreshDocument = () => {
  // Strip the recovery query param so the new document URL is clean.
  const url = new URL(window.location.href);
  url.searchParams.delete(MODULE_RECOVERY_QUERY);
  const cleanHref = `${url.pathname}${url.search}${url.hash}`;
  if (cleanHref !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, '', cleanHref);
  }

  void purgeBrowserCaches().finally(() => {
    // Hard reload — bypasses HTTP cache for the document and forces fresh module URLs.
    window.location.reload();
  });
};

const renderBootError = (message: string) => {
  root.render(
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-card-foreground">Appen kunde inte laddas</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={() => {
            // User-initiated retry: bypass cooldown and force a fresh fetch.
            try { window.sessionStorage.removeItem(MODULE_RECOVERY_KEY); } catch {}
            reloadWithFreshDocument();
          }}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Töm cache och ladda om
        </button>
      </div>
    </div>
  );
};

const handleModuleLoadFailure = (error: unknown, source: 'boot' | 'preload') => {
  const message = getErrorMessage(error);

  reportDiagnostic({
    code: source === 'boot' ? 'BOOT_MODULE_LOAD_FAILED' : 'VITE_PRELOAD_ERROR',
    source: 'vite',
    severity: 'critical',
    error,
    metadata: {
      phase: source,
      href: window.location.href,
    },
  });

  if (shouldRecoverFromModuleError(error) && !hasRecentRecoveryAttempt()) {
    markRecoveryAttempt();
    reloadWithFreshDocument();
    return;
  }

  renderBootError('Previewn verkar ha fastnat på en gammal modulversion. Klicka för att tömma cachen och försöka igen.');
};

window.addEventListener('vite:preloadError', (event) => {
  const preloadEvent = event as Event & { payload?: unknown; preventDefault?: () => void };
  preloadEvent.preventDefault?.();
  handleModuleLoadFailure(preloadEvent.payload ?? new Error('Vite preload error'), 'preload');
});

const mountApp = async () => {
  try {
    const { default: App } = await import('./App');
    clearRecoveryAttempt();
    cleanupRecoveryQuery();

    root.render(
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    );
  } catch (error) {
    handleModuleLoadFailure(error, 'boot');
  }
};

void mountApp();
