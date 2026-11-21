// The build number goes up with every APK built on GitHub, so a new APK installs over the old one.
module.exports = ({ config }) => {
  const build = Number(process.env.BUILD_NUMBER) || 1;
  return {
    ...config,
    version: `1.0.${build}`,
    android: { ...config.android, versionCode: build },
    ios: { ...config.ios, buildNumber: String(build) },
    // The web preview (for testing on iPhone in Safari) is served by the website at /app-preview.
    experiments: { ...(config.experiments || {}), baseUrl: process.env.WEB_BASE || '' },
    web: { ...config.web, name: 'Pick Me Cafe', shortName: 'Pick Me', themeColor: '#FAF6EF', backgroundColor: '#FAF6EF' },
  };
};
