import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'se.fransaugust.tidrapport',
  appName: 'Tidrapport',
  webDir: 'dist',
  // Server block disabled - app loads from local dist/ files
  // server: {
  //   url: 'https://kalender-vyer-mix.lovable.app/m/login',
  //   cleartext: true
  // },
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
