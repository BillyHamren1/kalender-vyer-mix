import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Capacitor } from '@capacitor/core'

// If running as a native Capacitor app, redirect to mobile app
if (Capacitor.isNativePlatform()) {
  const currentPath = window.location.pathname
  if (!currentPath.startsWith('/m')) {
    window.location.replace('/m/login')
  }
}

createRoot(document.getElementById("root")!).render(<App />);
