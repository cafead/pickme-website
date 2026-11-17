# Pick Me Cafe website

The full website for Pick Me Cafe (Sigreni, Hetauda-12): menu with cart and ordering, eSewa/Fonepay QR payment with screenshot upload, table booking and cake pre-orders with a Nepali (BS) calendar, events slideshow, gallery, reviews, Google map, WhatsApp, and an admin page at `#admin` where everything can be edited with a live preview.

One small Node.js server runs both the website and the admin API. There is no build step.

## What is where

| Path | What it is |
| --- | --- |
| `server/server.js` | The server: website files, orders, bookings, reviews, uploads, admin login |
| `server/default-content.js` | Starting text, menu and prices (used only on first launch) |
| `public/index.html`, `public/css/site.css`, `public/js/app.js` | The customer website |
| `public/js/admin.js`, `public/css/admin.css` | The admin page |
| `public/js/bs.js` | Nepali calendar (BS 2082 to 2090) |
| `data/` (created when it runs) | Saved content, orders, bookings, reviews, uploaded photos, payment screenshots |

## Run it on your computer

1. Install Node.js 20 or newer.
2. In this folder run `npm install`, then `npm start`.
3. Open `http://localhost:3000`. The admin page is `http://localhost:3000/#admin`.

If you have not set a password, the server prints a temporary admin password when it starts.

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

## Alerts for new orders and bookings (optional)

Every order and booking always appears in the admin page, and the customer gets a button that sends the details to your WhatsApp. For automatic alerts, add these variables:

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

## Using the admin page

Go to `/#admin` and log in.

- **Edit website**: the left side has every part of the site. Open one, change text, photos, colours, fonts, prices or order, and the right side shows the result straight away. Nothing is public until you press **Save**.
- **Photos**: every photo has an Upload button. The site starts with stock photos from Unsplash; replace them with your own.
- **Logo**: Cafe details and logo.
- **Menu**: each group is a tab on the site. Items can have one price or several sizes. Tick "Whole cake: pre-order only" for a price that needs notice.
- **Payment QR codes**: upload the eSewa and Fonepay QR pictures. Until you do, checkout shows a note that the QR is not added yet.
- **Events**: add an event with a start date and the number of days it should show. It appears and disappears on its own.
- **Social links and map**: fill in your Instagram, Facebook and TikTok links, and the Google Maps links.
- **Orders**: see each order, open the payment screenshot, tick "Payment checked", and change the status.
- **Bookings**: confirm or decline table requests.
- **Reviews**: tick "Show on website" for the ones you want. Paste Google reviews with "Add a review yourself".

## How payment works for now

The customer scans your QR, pays, and uploads a screenshot. The order is saved as unpaid until you tick "Payment checked" in admin. The site does not talk to eSewa or Fonepay, so always check the money arrived. A real payment integration can be added later in `server/server.js` where orders are created.

## Notes

- Prices are always taken from the saved menu on the server, so a customer cannot change a price in their browser.
- Whole cakes need the notice set in admin (8 hours to start with). Times must be inside opening hours.
- The Nepali calendar covers BS 2082 to 2090. Add more years to the `DAYS` table in `public/js/bs.js` when needed.
- Data is stored as JSON files, which suits one cafe. Back up the volume now and then.
