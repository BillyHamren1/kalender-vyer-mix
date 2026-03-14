import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Default Capacitor config — used for development / web preview.
 * 
 * For production native builds, use:
 *   - capacitor.time.config.ts    (EventFlow Time)
 *   - capacitor.scanner.config.ts (EventFlow Scanner)
 * 
 * Copy the desired config to capacitor.config.ts before building:
 *   cp capacitor.time.config.ts capacitor.config.ts
 *   VITE_APP_MODE=time npm run build && npx cap sync
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
