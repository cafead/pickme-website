# Pick Me Cafe website: notes for Claude

The website of Pick Me Cafe, Sigreni, Hetauda-12, Makawanpur, Nepal (open 7 AM to 7 PM, WhatsApp 9811847040). The owner edits the site in admin and asks Claude for new versions.

## How the owner works with Claude
- The owner lists changes over several messages and says **"build"** when ready. Do not change code before that. When the owner says "just answer", only answer.
- Pushing to `main` deploys the live site automatically on Railway. Test before pushing, then check the deploy.
- Before a change that could lose content, ask the owner to download a website backup (Admin > History and backup).

## Hosting
- Railway service `pickmeclaude` deploys this repository's `main` branch. Its data lives on a Railway volume mounted at `/data` (the server finds it through `RAILWAY_VOLUME_MOUNT_PATH`). `ADMIN_PASSWORD` is a Railway variable. Railway variable changes stay pending until Deploy is pressed.
- The old address `pickmeclaude-production.up.railway.app` (any `*.up.railway.app` host) answers page and file requests with a 301 to `https://pickmecafe.com.np` + the same path (`PUBLIC_HOST`, default pickmecafe.com.np). `/api/` is not redirected, because older Android test APKs still call the API there.
- Never commit backups with orders or customer phone numbers: this repository is public.

## Standing decisions
- English only. Prices in NPR. Ivory and gold look, serif headings, script accents. Phone first: test at 360 to 412 px, then computers.
- Menu: pill cards with a round gold-ringed photo; whole cakes have a gold Pre-order button.
- Pages: `/` (home, Book a Table stays here), `/menu`, `/cake`, `/gallery`, `/event/:id`. Table QR codes open the home page. `sections[].place` ('page', 'home', 'both') decides where menu, cake, gallery and guest moments show.
- Events ("Happening at Pick Me"): one slideshow of every photo of every ticked event that is within its dates. Each photo is a slide with its own heading and description on the left, the event's tag, days left and button. On computers the photo fills the box, dimmed behind the text and crisp after it; `events.photoStart` sets where the photo starts. Controls: Previous, Next and dots; no pause button; the mouse does not pause it; on phones holding a finger on the photo pauses it, a quick tap opens it large.
- The slideshow runs on a JS timer (`startSlides()`), never on CSS `animationend`: phones with reduce motion or battery saver turn animations off.
- Photo borders are chosen only under Colours, fonts and sizes (`theme.border`).
- Admin editor: one section open at a time.
- Ordering: every order starts as At the cafe, Now, Pay later (table QR guests get their table number filled in; cake pre-orders start as pickup). Dine-in needs nothing but the order; pickup, delivery, cake pre-orders, bookings and every pay-now order need a phone number. Delivery Hetauda only, Rs 150. Whole cakes need 8 hours' notice.
- Pay now (eSewa/Fonepay QR): a tap on the QR shows it full screen with the amount and steps (screenshot the QR, pay in eSewa/Fonepay/bank app, come back with the payment screenshot). Checkout is kept in sessionStorage (`pm_checkout`) and reopens when the guest comes back. Staff always call to confirm: the counter shows "Payment to check" with Call and "Payment confirmed, send the order" (marks paid + acknowledged).
- Every whole cheesecake is 1½ Pound (`cheesecakePounds()` renamed old "1 Pound" cheesecake sizes once, flag `content.fixes.cheese15`). `pounds()` reads ½.
- Photo crops: zoom 30% to 400%. Below 100% or "show the whole photo", `.pic[data-fill]` fills the frame with a blurred copy of the photo. Admin sliders move the photo the way you pull (x slider flipped; up/down slider stands upright).
- Menu tabs on phones: the chosen tab scrolls to the middle (`centreTab()`); the app's group chips do the same.
- Privacy policy at `/privacy` (for the App Store).
- A faint lock in the footer, tapped twice, asks "Staff / counter" or "Admin". Admin shows only a password box and opens `/admin`; staff enter login ID and password and go to `/counter`.

## Opening soon page (until the launch)
- `server/soon.js` + a middleware in `server/server.js`: until `LAUNCH_AT` (Railway variable; default 2026-11-28T15:00:00+05:45, Saturday 3 PM Nepal time) the public pages `/`, `/menu`, `/cake`, `/gallery`, `/event/:id` show an invitation page (hero photo, countdown, Save the date = `/opening.ics` or Google Calendar on Android, Directions, WhatsApp). At the launch time the server serves the normal site and an open page reloads by itself. After the launch the code does nothing and can be removed later.
- Real site before the launch: logged-in owner/staff (`pm_auth`), table QR (`?table=N`), or the private link `/preview/<PREVIEW_KEY>` (Railway variable) which sets a signed `pm_preview` cookie. `?soon=1` always shows the opening page (for the owner to check it while logged in). `/admin`, `/counter`, `/privacy`, `/app-preview` and `/api` are never blocked.

## Print menu (paper menu)
- `/admin/print-menu` (owner only; link "Print menu" in the admin tabs): `public/print-menu.html`, `public/js/print-menu.js`, `public/css/print-menu.css`. A4 preview on the left third, settings on the right; on phones the paper sits on top.
- Items and prices are the website menu's own (`content.menu`), so editing them there changes the website. Layout and looks are in `content.printMenu` (`page`, `logo`, `styles` per kind of text, `over` = per-text changes keyed `s:<section>:title|sub|c<i>` and `r:<line>:n|p<i>`, `sections[]` with `groups`, `cols[].from` = website size names, `rows[]` with `item` (null = paper only, like Hookah), `name` (paper-only name), `from[]` (size per column, `__none` = empty), `extra` (second line for the same item, like half pounds)). `ensurePrintMenu()` builds the sections once (`made`).
- Look by default = the owner's previous paper menu (Rokkitt for Equitan Slab, Jost for Futura; free fonts self-hosted in `public/fonts/print`), content = the designer's November 2026 menu. Never more than one A4: a too-long menu is shrunk evenly to fit.
- Save = save the content + a 2480 × 3508 PNG (A4, 300 dpi, made in the browser with `public/vendor/modern-screenshot.js`) kept in `DATA_DIR/print-menus` (60 newest, not in backups, listed in `meta.printMenus`) and downloaded to the device. Print = the browser's print of the A4 sheet.

## Phone app (app/)
- Expo (React Native) app in `app/`, see `app/README.md`. It talks to https://pickmecafe.com.np (`SERVER` in `app/src/api.js`; the domain is on Cloudflare DNS pointing to Railway, so a hosting move only needs the DNS changed), reads `/api/content` and places orders and bookings through the same API as the website, with `source: 'app'`.
- Every push that changes `app/` builds an Android APK with GitHub Actions and publishes it on the Releases page (latest: /releases/latest/download/PickMeCafe.apk). Railway ignores changes in `app/` and `.github/`.
- iPhone testing before the App Store: the website serves the app's web version at `/app-preview` (open in Safari, Share > Add to Home Screen). It is a built copy in `public/app-preview`: after app changes, rebuild it with `sh app/scripts/web-preview.sh` (from `app/`, after `npm ci`) and commit it. No notifications on the web version.
- App Store builds use EAS (`app/eas.json`, production profile). First build from the owner's Mac: `cd app && npx eas-cli build -p ios --profile production --auto-submit` (signs in to Expo and Apple once). Export compliance is set (no non-exempt encryption).
- The owner plans to publish on the App Store through Arpana Thapa Magar's individual Apple developer account (she is the registered proprietor) and later on Google Play.

## Code
- Node 20 + Express, no build step. `server/server.js`, defaults in `server/default-content.js` (fresh install only), content in `DATA_DIR/content.json`.
- `fillDefaults()` adds new object keys only; arrays are never merged, so per-item changes need a migration (`markFood`, `ensureSections`, `tidyEvents`), which also run after a backup restore.
- Front end: `public/index.html` + `public/js/app.js` (site), `public/js/admin.js` (editor), `public/counter.html` (staff screen), `public/css/site.css`, `public/css/admin.css`.
- Backups: `.zip` with `manifest.json` (kind "pick-me-backup"), `content.json`, `uploads/`, and for full backups orders, bookings, reviews, messages and `proofs/`. Restore also accepts a zip with everything inside one folder (Mac "Compress").
- Testing: run `DATA_DIR=/tmp/x ADMIN_PASSWORD=test-pass-123 PORT=3111 node server/server.js` and check pages in headless Chrome at phone and computer sizes, with reduced motion on and off.
