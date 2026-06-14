import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.avarnic.kainbu',
  appName: 'Kainbu',
  webDir: 'build',
  plugins: {
    LiveUpdate: {
      appId: 'com.avarnic.kainbu',
      channel: 'production',
      autoUpdate: 'nativeVersion',
    },
  },
  android: {
    backgroundColor: '#0e0f11',
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK',
    },
  },
};

export default config;
