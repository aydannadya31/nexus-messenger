import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexus.messenger',
  appName: 'NexusMessenger',
  webDir: 'dist',
  server: {
    url: 'https://aydannadya31.github.io/nexus-messenger/',
    // Google giris akisi WebView icinde kalmali. Capacitor, allowNavigation'da
    // olmayan adresleri dis tarayiciya attigi icin kullanici APK'ya donemiyordu.
    allowNavigation: ['*.google.com', '*.firebaseapp.com']
  }
};

export default config;
