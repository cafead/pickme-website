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

## Code
- Node 20 + Express, no build step. `server/server.js`, defaults in `server/default-content.js` (fresh install only), content in `DATA_DIR/content.json`.
- `fillDefaults()` adds new object keys only; arrays are never merged, so per-item changes need a migration (`markFood`, `ensureSections`, `tidyEvents`), which also run after a backup restore.
- Front end: `public/index.html` + `public/js/app.js` (site), `public/js/admin.js` (editor), `public/counter.html` (staff screen), `public/css/site.css`, `public/css/admin.css`.
- Backups: `.zip` with `manifest.json` (kind "pick-me-backup"), `content.json`, `uploads/`, and for full backups orders, bookings, reviews, messages and `proofs/`. Restore also accepts a zip with everything inside one folder (Mac "Compress").
- Testing: run `DATA_DIR=/tmp/x ADMIN_PASSWORD=test-pass-123 PORT=3111 node server/server.js` and check pages in headless Chrome at phone and computer sizes, with reduced motion on and off.
