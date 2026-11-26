// Store builds (EAS) are version 1.0.2; their build numbers are counted by EAS ("appVersionSource": "remote").
// The test APKs built on GitHub get 1.0.<build>, so a new APK installs over the old one.
// Over-the-air updates (EAS Update) go to phones with the same version (runtimeVersion "appVersion").
const STORE_VERSION = '1.0.2';
const fs = require('fs');
const path = require('path');
// Android push (Firebase): google-services.json is not kept in this public repository. EAS builds get it from the
// EAS file variable GOOGLE_SERVICES_JSON; the GitHub test build writes it from a GitHub secret into app/.
const googleServices = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : undefined);
// APP_VARIANT=test makes "Pick Me Test", a separate app that installs next to the real one (for staff and the
// driver to try a version before the stores approve it).
module.exports = ({ config }) => {
  const build = Number(process.env.BUILD_NUMBER) || 0;
  const test = process.env.APP_VARIANT === 'test';
  return {
    ...config,
    ...(test ? { name: 'Pick Me Test' } : {}),
    version: test ? `${STORE_VERSION}-test.${build}` : build ? `1.0.${build}` : STORE_VERSION,
    android: { ...config.android, ...(build ? { versionCode: build } : {}), ...(test ? { package: 'np.com.pickmecafe.app.test' } : {}), ...(googleServices && !test ? { googleServicesFile: googleServices } : {}) },
    ios: { ...config.ios, ...(build ? { buildNumber: String(build) } : {}) },
    // The web preview (for testing on iPhone in Safari) is served by the website at /app-preview.
    experiments: { ...(config.experiments || {}), baseUrl: process.env.WEB_BASE || '' },
    web: { ...config.web, name: 'Pick Me Cafe', shortName: 'Pick Me', themeColor: '#FAF6EF', backgroundColor: '#FAF6EF' },
  };
};
