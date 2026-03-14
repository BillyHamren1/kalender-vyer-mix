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
