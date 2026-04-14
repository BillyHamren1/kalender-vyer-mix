import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for EventFlow Scanner
 * 
 * Build:
 *   VITE_APP_MODE=scanner npm run build
 *   APP_MODE=scanner npx cap copy
 */
const config: CapacitorConfig = {
  appId: 'se.eventflow.scanner',
  appName: 'EventFlow Scanner',
  webDir: 'dist',
  server: {
    url: 'https://d42a96b9-4d25-4701-b40a-d3fe594418b5.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0A0A0B',
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    }
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0A0A0B',
    allowsLinkPreview: false,
    infoPlist: {
      NSCameraUsageDescription: 'EventFlow Scanner uses the camera to scan barcodes and QR codes for packing and warehouse workflows.',
      NSPhotoLibraryUsageDescription: 'EventFlow Scanner may access the photo library when selecting images related to scanning workflows.',
      NSPhotoLibraryAddUsageDescription: 'EventFlow Scanner may save images related to scanning workflows.',
      NSLocationWhenInUseUsageDescription: 'EventFlow Scanner uses your location to show nearby delivery addresses and optimize route planning.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'EventFlow Scanner uses your location to show nearby delivery addresses and optimize route planning.',
    },
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0A0A0B',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0B',
    },
  }
};

export default config;
