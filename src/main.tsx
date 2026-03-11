import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Native Capacitor app: redirect to /scanner before React mounts.
// Uses history.replaceState to avoid full page reload loop.
const isNative = typeof (window as any).Capacitor !== 'undefined' 
  && (window as any).Capacitor.isNativePlatform 
  && (window as any).Capacitor.isNativePlatform();

if (isNative && !window.location.pathname.startsWith('/scanner')) {
  window.history.replaceState(null, '', '/scanner');
}

createRoot(document.getElementById("root")!).render(<App />);
