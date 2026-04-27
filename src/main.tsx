import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { APP_MODE, isScannerApp, getDefaultRoute } from './config/appMode'
import { Capacitor } from '@capacitor/core'
import { initializeGlobalDiagnostics } from './services/diagnostics/diagnostics'
import { GlobalErrorBoundary } from './components/diagnostics/GlobalErrorBoundary'

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

createRoot(document.getElementById("root")!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);
