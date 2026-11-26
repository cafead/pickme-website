// Store builds (EAS) are version 1.0.2; their build numbers are counted by EAS ("appVersionSource": "remote").
// The test APKs built on GitHub get 1.0.<build>, so a new APK installs over the old one.
// Over-the-air updates (EAS Update) go to phones with the same version (runtimeVersion "appVersion").
const STORE_VERSION = '1.0.2';
module.exports = ({ config }) => {
  const build = Number(process.env.BUILD_NUMBER) || 0;
  return {
    ...config,
    version: build ? `1.0.${build}` : STORE_VERSION,
    android: { ...config.android, ...(build ? { versionCode: build } : {}) },
    ios: { ...config.ios, ...(build ? { buildNumber: String(build) } : {}) },
    // The web preview (for testing on iPhone in Safari) is served by the website at /app-preview.
    experiments: { ...(config.experiments || {}), baseUrl: process.env.WEB_BASE || '' },
    web: { ...config.web, name: 'Pick Me Cafe', shortName: 'Pick Me', themeColor: '#FAF6EF', backgroundColor: '#FAF6EF' },
  };
};
