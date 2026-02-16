import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Native Capacitor app: always start on mobile login
// This runs synchronously before React mounts
const isNative = typeof (window as any).Capacitor !== 'undefined' 
  && (window as any).Capacitor.isNativePlatform 
  && (window as any).Capacitor.isNativePlatform();

if (isNative && !window.location.pathname.startsWith('/m')) {
  window.location.pathname = '/m/login';
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
