import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { getDefaultRoute } from './config/appMode'
import { Capacitor } from '@capacitor/core'

// Native Capacitor app: redirect to the correct default route before React mounts.
// Uses history.replaceState to avoid full page reload loop.
if (Capacitor.isNativePlatform() && window.location.pathname === '/') {
  window.history.replaceState(null, '', getDefaultRoute());
}

createRoot(document.getElementById("root")!).render(<App />);
