# Pick Me Cafe website

The full website for Pick Me Cafe (Sigreni, Hetauda-12). One small Node.js server runs three things:

| Address | What it is | Who uses it |
| --- | --- | --- |
| `/` | The cafe website: menu, cart, eSewa/Fonepay QR payment, cake pre-orders and table booking with a Nepali (BS) calendar, events slideshow, gallery, reviews, map, WhatsApp | Customers |
| `/admin` (or `/#admin`) | The editor: change every text, photo, colour, font, price and section with a live preview beside it; orders, bookings, reviews, messages, staff logins, backup | Owner |
| `/counter` | The counter screen: live orders, cake pre-orders and table bookings, payment screenshots, status updates, printable slips | Staff or owner |

There is no build step.

## What is where

| Path | What it is |
| --- | --- |
| `server/server.js` | The server: website files, orders, bookings, reviews, messages, uploads, logins |
| `server/default-content.js` | Starting text, menu, prices and stock photos (used only on first launch) |
| `public/index.html`, `public/css/site.css`, `public/js/app.js` | The customer website |
| `public/js/admin.js`, `public/css/admin.css` | The admin editor |
| `public/counter.html` | The counter screen |
| `public/js/bs.js` | Nepali calendar (BS 2082 to 2090) |
| `data/` (created when it runs) | Saved content, orders, bookings, reviews, messages, logins, uploaded photos, payment screenshots, activity log |

## Run it on your computer

1. Install Node.js 20 or newer.
2. In this folder run `npm install`, then `npm start`.
3. Open `http://localhost:3000`. Admin is `http://localhost:3000/#admin` and the counter is `http://localhost:3000/counter`.

If you have not set a password, the server prints a temporary owner password when it first starts.

## Put it online (GitHub + Railway)

GitHub Pages cannot run the server, so GitHub holds the code and Railway runs the site.

1. Create a new repository on GitHub and upload everything in this folder (not `node_modules` or `data`).
2. On Railway, create a new project and choose to deploy from that GitHub repository. Railway detects Node and runs `npm start`.
3. Add a **volume** to the service and mount it at `/data`. This is where your content, orders and photos are kept. Without a volume they are lost on every redeploy.
4. Add these **variables** to the service:

   | Variable | Value |
   | --- | --- |
   | `ADMIN_PASSWORD` | A long password only you know |
   | `DATA_DIR` | `/data` |

5. In the service's networking settings, generate a public domain (or add your own domain).
6. Open `https://your-domain/#admin`, log in, and start editing.

Every later push to GitHub redeploys the site. Your saved content is not touched because it lives in the volume.

### About the owner password

- `ADMIN_PASSWORD` sets the owner password the first time the site starts.
- You can change the password later in admin under **Security**. That new password keeps working across restarts.
- If you forget it, change the `ADMIN_PASSWORD` variable on Railway to a new value. A changed variable always resets the owner password.

## Alerts for new orders and bookings (optional)

Every order, booking and message always appears in admin and on the counter screen, and the customer gets a button that sends the details to your WhatsApp. For automatic alerts, add these variables:

**Email** (uses Resend, which has a free plan)

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | Your API key from resend.com |
| `NOTIFY_EMAIL` | The email address that should get the alerts. Use the address you signed up to Resend with, unless you have verified your own domain there. |
| `EMAIL_FROM` | Optional. Only needed once you verify your own domain in Resend. |

**WhatsApp** (uses CallMeBot, a free third-party service for personal alerts)

| Variable | Value |
| --- | --- |
| `CALLMEBOT_APIKEY` | The key CallMeBot sends you when you register your number on callmebot.com |
| `NOTIFY_WHATSAPP` | Your number with country code, for example `9779811847040` |

The Orders tab in admin shows whether each alert is on.

## Using the admin editor

Go to `/#admin` and log in (or press Ctrl+Shift+D on the website).

- **Edit website**: the left side has every part of the site. Open one, change it, and the right side shows the result straight away. Nothing is public until you press **Save**.
- **Edit text on the page**: switch this on above the preview, then click any dashed text in the preview and type.
- **Photos**: every photo has an Upload button. Large phone photos are made smaller automatically. The site starts with stock photos from Unsplash, including one per menu item; check each one and replace it with your own.
- **Logo**: Cafe details and logo.
- **Colours, fonts and sizes**: colours, three fonts, heading and text size, page width, height of the top area, corner roundness, and whether photos blend into the background.
- **Menu**: each group is a tab on the site. Items can have a photo, a short description, a badge, and one price or several sizes. Choose between a simple list and photo cards. Tick "Whole cake: pre-order only" for a price that needs notice.
- **Payment QR codes**: upload the eSewa and Fonepay QR pictures. Until you do, checkout shows a note that the QR is not added yet.
- **Events**: each slide has a start date and a number of days. It appears and disappears on its own.
- **Reviews section**: type your real Google rating and review count to show them; leave them empty to hide.
- **Orders, Bookings, Reviews, Messages**: see and update each one. Tick "Show on website" for the reviews you want. Paste Google reviews with "Add a review yourself".
- **Edit text and Edit layout** (above the preview): type straight onto the page, or drag the edge of a photo or box to resize it (the page makes room on its own). Drag a photo to move it inside its frame; the small bar on it zooms in, zooms out, shows the whole photo, or resets. Each photo field also has "Adjust position and zoom" sliders. Sizes apply on computers; phones keep their own layout.
- **Adding and removing**: in "Menu, prices and food photos", use "Add group", "Add item" and "Add size or price", and the Delete button on any group, item or price.
- **History**: every save is kept. Each entry lists what changed (for example "Menu › Hot Coffee › Espresso › Single › price: 140 → 150"). Open an older version, check it in the preview, and press Save to bring it back. Deleted orders, bookings, reviews and messages can be brought back here too, and the activity log is here.
- **Table QR**: makes a printable QR code for each table. Guests scan it, see the menu, and order without a phone number or payment. The order arrives with the table number.
- **Security**: change the owner password, sign out every device, add staff logins, and download a backup.
- **Two devices**: you can be logged in on several devices at once. If the website is saved on one device while another has the editor open, the second one is asked before it overwrites the newer save.

## Using the counter screen

Go to `/counter`. Staff log in with the login ID and password you made for them under Security; the owner can leave the login ID empty.

- Three tabs: Orders, Cake pre-orders, Table bookings. The screen refreshes every 12 seconds and shows a notice when something new arrives.
- Change the status, tick "Payment checked", open the payment screenshot or the customer's cake design photo, print a slip, or message the customer on WhatsApp.
- Staff cannot edit the website, delete anything, or see reviews, messages and logins.

## Ordering and payment

- **At the cafe**: guests choose "At the cafe" (or scan the table QR). They need nothing but their order; phone and name are optional and there is no payment step.
- **Pickup, delivery, cake pre-orders and table bookings**: the only required field is the phone number. Everything else is optional, and dates and times are filled in with the earliest possible time.
- **Payment**: "Pay later" is the default (at the counter or on delivery). Guests who want to pay now choose eSewa or Fonepay, scan your QR, and can upload a screenshot or type the transaction code. The order is saved as unpaid until someone ticks "Payment checked". The site does not talk to eSewa or Fonepay, so always check the money arrived.
- **Where orders go**: every order and booking appears straight away in admin and on the counter screen. For an automatic WhatsApp message to your phone, set up the WhatsApp alert above. Guests ordering for pickup or delivery also get a button to send the order to your WhatsApp themselves.

## Notes

- Prices are always taken from the saved menu on the server, so a customer cannot change a price in their browser.
- Whole cakes need the notice set in admin (8 hours to start with). Times must be inside opening hours.
- Menu descriptions and badges start empty, apart from "House special" on the Pick Me Double Shot on Ice. Add your own in admin.
- Every date picker uses the Nepali (BS) calendar, with the English date shown small under each day. It covers BS 2082 to 2090. Add more years to the `DAYS` table in `public/js/bs.js` when needed.
- Data is stored as JSON files, which suits one cafe. Download a backup now and then.
