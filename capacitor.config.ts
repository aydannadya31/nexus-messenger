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
  },
  android: {
    // UA, ilk sayfa yuklenmeden once uygulanmali. MainActivity.onCreate cok geci
    // kaliyordu; "wv" isareti Google'in gomulu WebView'i reddetmesine yol acti ve
    // "NexusApp" isareti ilk yuklemede gorunmedigi icin native tespiti basarisiz oldu.
    overrideUserAgent:
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 NexusApp'
  }
};

export default config;
