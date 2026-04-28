import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isScannerApp, getDefaultRoute } from './config/appMode'
import { Capacitor } from '@capacitor/core'
import { initializeGlobalDiagnostics, reportDiagnostic } from './services/diagnostics/diagnostics'
import { GlobalErrorBoundary } from './components/diagnostics/GlobalErrorBoundary'

import {
  attemptModuleRecovery,
  cleanupRecoveryQuery,
  clearRecoveryAttempt,
  forceManualRecovery,
  isStaleModuleError,
} from './utils/moduleRecovery'

const root = createRoot(document.getElementById('root')!);

const renderBootError = (message: string) => {
  root.render(
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-card-foreground">Appen kunde inte laddas</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={forceManualRecovery}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Töm cache och ladda om
        </button>
      </div>
    </div>
  );
};

const handleModuleLoadFailure = (error: unknown, source: 'boot' | 'preload') => {
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

  if (isStaleModuleError(error) && attemptModuleRecovery(error)) {
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
