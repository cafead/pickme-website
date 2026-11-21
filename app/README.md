# Pick Me Cafe phone app

The Pick Me Cafe app for Android (and later iPhone), built with Expo (React Native).

- Menu, prices, photos, events, cakes and opening hours all come from the website admin (`/api/content`), so changing them in admin changes the app too.
- Orders and table bookings go to the same counter screen as website orders (they are marked `source: app`).
- The app follows each order and booking with `/api/orders/:id/status?key=` and `/api/bookings/:id/status?key=` (the key is returned when it is placed) and shows a notification when the status changes.
- The server address is in `src/api.js` (`BASE`). Change it when the site moves to pickmecafe.com.np.

## Screens
Home (events slideshow, guest favourites, call/WhatsApp), Menu (search, sizes, extras), Cakes (pre-order a whole cake), Book (table booking), Orders (live status).

## Getting the Android app
Every change to `app/` builds a new APK on GitHub (`.github/workflows/android-apk.yml`). The newest one:
https://github.com/cafead/pickme-website/releases/latest/download/PickMeCafe.apk

The APK is signed with the standard debug key from the Expo template, which is fine for installing directly. Google Play needs a proper upload key (EAS Build makes one).

## Developing
```
cd app
npm ci
EXPO_OFFLINE=1 npx expo export --platform android   # checks that everything bundles
EXPO_OFFLINE=1 npx expo export --platform web       # a browser preview for screenshots
```
