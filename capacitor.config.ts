import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.d42a96b94d254701b40ad3fe594418b5',
  appName: 'kalender-vyer-mix',
  webDir: 'dist',
  server: {
    url: 'https://d42a96b9-4d25-4701-b40a-d3fe594418b5.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    BarcodeScanner: {
      // Enable camera permission request
    }
  }
};

export default config;
