# Pick Me Cafe website: notes for Claude

The website of Pick Me Cafe, Sigreni, Hetauda-12, Makawanpur, Nepal (open 7 AM to 7 PM, WhatsApp 9811847040). The owner edits the site in admin and asks Claude for new versions.

## How the owner works with Claude
- The owner lists changes over several messages and says **"build"** when ready. Do not change code before that. When the owner says "just answer", only answer.
- Pushing to `main` deploys the live site automatically on Railway. Test before pushing, then check the deploy.
- Before a change that could lose content, ask the owner to download a website backup (Admin > History and backup).

## Hosting
- Railway service `pickmeclaude` deploys this repository's `main` branch. Its data lives on a Railway volume mounted at `/data` (the server finds it through `RAILWAY_VOLUME_MOUNT_PATH`). `ADMIN_PASSWORD` is a Railway variable. Railway variable changes stay pending until Deploy is pressed.
- Never commit backups with orders or customer phone numbers: this repository is public.

## Standing decisions
- English only. Prices in NPR. Ivory and gold look, serif headings, script accents. Phone first: test at 360 to 412 px, then computers.
- Menu: pill cards with a round gold-ringed photo; whole cakes have a gold Pre-order button.
- Pages: `/` (home, Book a Table stays here), `/menu`, `/cake`, `/gallery`, `/event/:id`. Table QR codes open the home page. `sections[].place` ('page', 'home', 'both') decides where menu, cake, gallery and guest moments show.
- Events ("Happening at Pick Me"): one slideshow of every photo of every ticked event that is within its dates. Each photo is a slide with its own heading and description on the left, the event's tag, days left and button. On computers the photo fills the box, dimmed behind the text and crisp after it; `events.photoStart` sets where the photo starts. Controls: Previous, Next and dots; no pause button; the mouse does not pause it; on phones holding a finger on the photo pauses it, a quick tap opens it large.
- The slideshow runs on a JS timer (`startSlides()`), never on CSS `animationend`: phones with reduce motion or battery saver turn animations off.
- Photo borders are chosen only under Colours, fonts and sizes (`theme.border`).
- Admin editor: one section open at a time.
- Ordering: dine-in needs nothing but the order; pickup, delivery, cake pre-orders and bookings need only a phone number. Pay later is the default; eSewa/Fonepay QR optional. Delivery Hetauda only, Rs 150. Whole cakes need 8 hours' notice.
- A faint lock in the footer, tapped twice, opens a login: the owner password goes to `/admin`, staff logins (Admin > Security) go to `/counter`.

## Print menu (paper menu)
- `/admin/print-menu` (owner only; link "Print menu" in the admin tabs): `public/print-menu.html`, `public/js/print-menu.js`, `public/css/print-menu.css`. A4 preview on the left third, settings on the right; on phones the paper sits on top.
- Items and prices are the website menu's own (`content.menu`), so editing them there changes the website. Layout and looks are in `content.printMenu` (`page`, `logo`, `styles` per kind of text, `over` = per-text changes keyed `s:<section>:title|sub|c<i>` and `r:<line>:n|p<i>`, `sections[]` with `groups`, `cols[].from` = website size names, `rows[]` with `item` (null = paper only, like Hookah), `name` (paper-only name), `from[]` (size per column, `__none` = empty), `extra` (second line for the same item, like half pounds)). `ensurePrintMenu()` builds the sections once (`made`).
- Look by default = the owner's previous paper menu (Rokkitt for Equitan Slab, Jost for Futura; free fonts self-hosted in `public/fonts/print`), content = the designer's November 2026 menu. Never more than one A4: a too-long menu is shrunk evenly to fit.
- Save = save the content + a 2480 × 3508 PNG (A4, 300 dpi, made in the browser with `public/vendor/modern-screenshot.js`) kept in `DATA_DIR/print-menus` (60 newest, not in backups, listed in `meta.printMenus`) and downloaded to the device. Print = the browser's print of the A4 sheet.

## Phone app (app/)
- Expo (React Native) app in `app/`, see `app/README.md`. It reads `/api/content` and places orders and bookings through the same API as the website, with `source: 'app'`.
- Every push that changes `app/` builds an Android APK with GitHub Actions and publishes it on the Releases page (latest: /releases/latest/download/PickMeCafe.apk). Railway ignores changes in `app/` and `.github/`.
- iPhone testing before the App Store: the website serves the app's web version at `/app-preview` (open in Safari, Share > Add to Home Screen). It is a built copy in `public/app-preview`: after app changes, rebuild it with `sh app/scripts/web-preview.sh` (from `app/`, after `npm ci`) and commit it. No notifications on the web version.
- The owner plans to publish on the App Store through Arpana Thapa Magar's individual Apple developer account (she is the registered proprietor) and later on Google Play.

## Code
- Node 20 + Express, no build step. `server/server.js`, defaults in `server/default-content.js` (fresh install only), content in `DATA_DIR/content.json`.
- `fillDefaults()` adds new object keys only; arrays are never merged, so per-item changes need a migration (`markFood`, `ensureSections`, `tidyEvents`), which also run after a backup restore.
- Front end: `public/index.html` + `public/js/app.js` (site), `public/js/admin.js` (editor), `public/counter.html` (staff screen), `public/css/site.css`, `public/css/admin.css`.
- Backups: `.zip` with `manifest.json` (kind "pick-me-backup"), `content.json`, `uploads/`, and for full backups orders, bookings, reviews, messages and `proofs/`. Restore also accepts a zip with everything inside one folder (Mac "Compress").
- Testing: run `DATA_DIR=/tmp/x ADMIN_PASSWORD=test-pass-123 PORT=3111 node server/server.js` and check pages in headless Chrome at phone and computer sizes, with reduced motion on and off.
