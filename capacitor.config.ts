import type { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.NODE_ENV === 'development';

const config: CapacitorConfig = {
  appId: 'com.hemu.games',
  appName: 'Games',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: isDev
  },
  android: {
    allowMixedContent: isDev,
    backgroundColor: '#050505'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
