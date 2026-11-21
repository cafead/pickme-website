#!/bin/sh
# Builds the web version of the app into ../public/app-preview, so the website serves it at /app-preview.
# It is for testing the app on an iPhone in Safari (Share > Add to Home Screen) before the App Store build.
# Run from app/:  sh scripts/web-preview.sh   (then commit public/app-preview)
set -e
cd "$(dirname "$0")/.."
OUT=../public/app-preview
rm -rf "$OUT"
EXPO_OFFLINE=1 WEB_BASE=/app-preview npx expo export --platform web --output-dir "$OUT"
cp assets/icon.png "$OUT/apple-touch-icon.png"
node -e '
const fs = require("fs"); const f = process.argv[1];
let h = fs.readFileSync(f, "utf8");
h = h.replace("</head>", [
  "<link rel=\"apple-touch-icon\" href=\"/app-preview/apple-touch-icon.png\"/>",
  "<meta name=\"apple-mobile-web-app-capable\" content=\"yes\"/>",
  "<meta name=\"mobile-web-app-capable\" content=\"yes\"/>",
  "<meta name=\"apple-mobile-web-app-title\" content=\"Pick Me\"/>",
  "<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"default\"/>",
  "<meta name=\"robots\" content=\"noindex\"/>",
  "</head>"].join("\n"));
fs.writeFileSync(f, h);
' "$OUT/index.html"
rm -f "$OUT/metadata.json"
echo "Web preview built in public/app-preview"
