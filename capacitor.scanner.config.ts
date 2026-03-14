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
  }
};

export default config;
