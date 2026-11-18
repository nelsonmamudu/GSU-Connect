import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gsuconnect.app',
  appName: 'GSU Connect',
  webDir: 'dist',
  backgroundColor: '#047857',
  server: {
    url: 'https://gsu-connect.vercel.app',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#047857',
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: '#047857',
      style: 'DARK',
    },
  },
};

export default config;
