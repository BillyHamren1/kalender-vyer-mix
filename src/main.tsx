import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { APP_MODE, isScannerApp, getDefaultRoute } from './config/appMode'
import { Capacitor } from '@capacitor/core'
import { initializeGlobalDiagnostics } from './services/diagnostics/diagnostics'
import { GlobalErrorBoundary } from './components/diagnostics/GlobalErrorBoundary'

const root = createRoot(document.getElementById('root')!);
const BOOT_RECOVERY_KEY = 'boot-recovery-reloaded-once';

const renderBootFailure = () => {
  root.render(
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-card-foreground">Appen kunde inte laddas</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ladda om sidan för att hämta senaste versionen.</p>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(BOOT_RECOVERY_KEY);
            window.location.reload();
          }}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Ladda om
        </button>
      </div>
    </div>
  );
};

const recoverBootImportFailure = async (error: unknown) => {
  console.error('[boot] failed to load app entry', error);
  const hasReloaded = sessionStorage.getItem(BOOT_RECOVERY_KEY) === 'true';

  if (!hasReloaded) {
    sessionStorage.setItem(BOOT_RECOVERY_KEY, 'true');
    window.location.reload();
    return;
  }

  renderBootFailure();
};

const mountApp = async () => {
  try {
    const { default: App } = await import('./App.tsx');
    sessionStorage.removeItem(BOOT_RECOVERY_KEY);
    root.render(
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    );
  } catch (error) {
    await recoverBootImportFailure(error);
  }
};

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

void mountApp();
