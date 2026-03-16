import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for EventFlow Time
 * 
 * Build:
 *   VITE_APP_MODE=time npm run build
 *   APP_MODE=time npx cap copy
 */
const config: CapacitorConfig = {
  appId: 'se.eventflow.time',
  appName: 'EventFlow Time',
  webDir: 'dist',
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
    infoPlist: {
      NSCameraUsageDescription: 'EventFlow uses the camera to scan barcodes, QR codes, and capture images for work-related tasks.',
      NSPhotoLibraryUsageDescription: 'EventFlow uses the photo library when selecting or attaching images related to work tasks.',
      NSPhotoLibraryAddUsageDescription: 'EventFlow may save images to your photo library when handling work-related media.',
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
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  }
};

export default config;
