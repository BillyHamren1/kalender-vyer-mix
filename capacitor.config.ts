import type { CapacitorConfig } from '@capacitor/cli';

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
