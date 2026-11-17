'use strict';
/*
 * Pick Me Cafe server.
 * Serves the website, stores content/orders/bookings/reviews as JSON files
 * in DATA_DIR, and protects the admin API with a password.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const defaults = require('./default-content');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const PROOFS = path.join(DATA_DIR, 'proofs');
for (const d of [DATA_DIR, UPLOADS, PROOFS]) fs.mkdirSync(d, { recursive: true });

/* ---------- tiny JSON file store ---------- */
class Store {
  constructor(name, fallback) {
    this.file = path.join(DATA_DIR, name);
    this.queue = Promise.resolve();
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.data = fallback;
    }
  }
  get() { return this.data; }
  set(data) {
    this.data = data;
    const text = JSON.stringify(data, null, 1);
    this.queue = this.queue.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, text);
      await fs.promises.rename(tmp, this.file);
    }).catch((e) => console.error('Could not save', this.file, e.message));
    return this.queue;
  }
}

function fillDefaults(saved, def) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return def;
  for (const k of Object.keys(def)) {
    if (saved[k] === undefined) saved[k] = def[k];
    else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) saved[k] = fillDefaults(saved[k], def[k]);
  }
  return saved;
}

const content = new Store('content.json', null);
content.data = fillDefaults(content.data, JSON.parse(JSON.stringify(defaults)));
const orders = new Store('orders.json', []);
const bookings = new Store('bookings.json', []);
const reviews = new Store('reviews.json', []);

/* ---------- admin password and sessions ---------- */
function readOrCreate(file, make) {
  const p = path.join(DATA_DIR, file);
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { /* create below */ }
  const v = make();
  fs.writeFileSync(p, v, { mode: 0o600 });
  return v;
}
const SECRET = readOrCreate('secret.key', () => crypto.randomBytes(32).toString('hex'));
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = readOrCreate('admin-password.txt', () => crypto.randomBytes(9).toString('base64url'));
  console.log('\n  ADMIN_PASSWORD is not set. Temporary admin password: ' + ADMIN_PASSWORD);
  console.log('  Set the ADMIN_PASSWORD variable to choose your own.\n');
}
const sign = (s) => crypto.createHmac('sha256', SECRET + ADMIN_PASSWORD).update(s).digest('hex');
const sameText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
function makeToken() {
  const exp = String(Date.now() + 7 * 864e5);
  return `${exp}.${sign(exp)}`;
}
function isAdmin(req) {
  const m = /(?:^|;\s*)pm_admin=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  return Boolean(exp && sig && Number(exp) > Date.now() && sameText(sig, sign(exp)));
}
const admin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Please log in.' }));

/* ---------- helpers ---------- */
const hits = new Map();
function limit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes.' });
    list.push(now);
    hits.set(key, list);
    next();
  };
}
setInterval(() => hits.clear(), 60 * 60e3).unref();

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max);
const bad = (res, error) => res.status(400).json({ error });
const newId = (prefix) => `${prefix}-${Date.now().toString(36).slice(-4)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
const NP_OFFSET = 345 * 60e3; // Nepal is UTC+5:45

function nepalNow() {
  const d = new Date(Date.now() + NP_OFFSET);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}
function scheduleTs(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return NaN;
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (h > 23 || mi > 59) return NaN;
  return Date.UTC(y, m - 1, d, h, mi) - NP_OFFSET;
}
function sniffImage(buf, allowSvg) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 0, 4) === 'GIF8') return allowSvg ? 'gif' : null;
  if (allowSvg && /<svg[\s>]/i.test(buf.toString('utf8', 0, 2000))) return 'svg';
  return null;
}

/* ---------- notifications (optional) ---------- */
async function notify(subject, text) {
  const jobs = [];
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
    jobs.push(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Pick Me Cafe <onboarding@resend.dev>',
        to: process.env.NOTIFY_EMAIL.split(',').map((s) => s.trim()),
        subject,
        text,
      }),
    }).then(async (r) => { if (!r.ok) console.error('Email failed:', r.status, await r.text()); }));
  }
  if (process.env.CALLMEBOT_APIKEY && process.env.NOTIFY_WHATSAPP) {
    const u = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(process.env.NOTIFY_WHATSAPP)}`
      + `&text=${encodeURIComponent(`${subject}\n${text}`)}&apikey=${encodeURIComponent(process.env.CALLMEBOT_APIKEY)}`;
    jobs.push(fetch(u).then((r) => { if (!r.ok) console.error('WhatsApp alert failed:', r.status); }));
  }
  await Promise.allSettled(jobs.map((j) => j.catch((e) => console.error('Notify error:', e.message))));
}

const TYPE_LABEL = { dinein: 'Dine-in', pickup: 'Pickup', delivery: 'Delivery' };
function orderText(o) {
  return [
    `Order ${o.id}`,
    `${o.name}, ${o.phone}`,
    `${TYPE_LABEL[o.type]}${o.address ? `: ${o.address}` : ''}`,
    o.schedule ? `For: ${o.schedule.bs || o.schedule.date} at ${o.schedule.time}` : 'For: as soon as possible',
    '',
    ...o.lines.map((l) => `${l.qty} x ${l.name}${l.label ? ` (${l.label})` : ''} = Rs. ${l.qty * l.price}`),
    o.deliveryFee ? `Delivery = Rs. ${o.deliveryFee}` : null,
    `Total: Rs. ${o.total}`,
    o.cakeMessage ? `On the cake: ${o.cakeMessage}` : null,
    o.notes ? `Notes: ${o.notes}` : null,
    `Payment: ${o.payment.method} screenshot uploaded`,
  ].filter((x) => x !== null).join('\n');
}
function bookingText(b) {
  return [
    `Booking ${b.id}`,
    `${b.name}, ${b.phone}`,
    `${b.bs || b.date} at ${b.time}, ${b.people} people`,
    b.requests ? `Requests: ${b.requests}` : null,
    b.remarks ? `Remarks: ${b.remarks}` : null,
  ].filter(Boolean).join('\n');
}

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

const rawImage = express.raw({ type: () => true, limit: '8mb' });
const json = express.json({ limit: '3mb' });

/* public: content and reviews */
app.get('/api/content', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(content.get());
});
app.get('/api/reviews', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(reviews.get().filter((r) => r.approved).map(({ id, name, rating, text, source, createdAt }) => ({ id, name, rating, text, source, createdAt })));
});
app.post('/api/reviews', limit('review', 5, 30 * 60e3), json, async (req, res) => {
  const name = str(req.body.name, 60);
  const text = str(req.body.text, 800);
  const rating = Math.round(Number(req.body.rating));
  if (!name || text.length < 3) return bad(res, 'Please write your name and a few words.');
  if (!(rating >= 1 && rating <= 5)) return bad(res, 'Please choose a star rating.');
  const r = { id: newId('RV'), name, text, rating, source: 'site', approved: false, createdAt: new Date().toISOString() };
  await reviews.set([r, ...reviews.get()]);
  notify(`New review from ${name} (${rating}/5)`, `${text}\n\nApprove it in the admin page to show it on the website.`);
  res.json({ ok: true });
});

/* public: payment screenshot */
app.post('/api/proof', limit('proof', 12, 30 * 60e3), rawImage, async (req, res) => {
  const ext = sniffImage(req.body, false);
  if (!ext) return bad(res, 'Please upload a PNG or JPG screenshot.');
  const file = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(PROOFS, file), req.body);
  res.json({ file });
});

/* public: orders */
function findPrice(itemId, label) {
  for (const c of content.get().menu.categories || []) {
    for (const it of c.items || []) {
      if (it.id !== itemId) continue;
      const p = (it.prices || []).find((x) => (x.label || '') === (label || ''));
      return p ? { item: it, price: p } : null;
    }
  }
  return null;
}
function checkSchedule(date, time, minLeadHours) {
  const c = content.get();
  const ts = scheduleTs(date, time);
  if (Number.isNaN(ts)) return 'Please choose a date and time.';
  if (time < c.brand.open || time > c.brand.close) return `We are open ${c.brand.hoursText}. Please choose a time in those hours.`;
  if (ts < Date.now() + minLeadHours * 3600e3 - 60e3) {
    return minLeadHours ? `Whole cakes need at least ${minLeadHours} hours notice. Please choose a later time.` : 'That time has already passed. Please choose a later time.';
  }
  if (ts > Date.now() + 180 * 864e5) return 'Please choose a date within the next 6 months.';
  return null;
}

app.post('/api/orders', limit('order', 10, 15 * 60e3), json, async (req, res) => {
  const b = req.body || {};
  const c = content.get();
  const name = str(b.name, 80);
  const phone = str(b.phone, 20);
  if (!name) return bad(res, 'Please enter your name.');
  if (!/^\+?\d[\d\s-]{6,17}$/.test(phone)) return bad(res, 'Please enter a valid phone number.');
  if (!TYPE_LABEL[b.type]) return bad(res, 'Please choose dine-in, pickup or delivery.');
  const address = b.type === 'delivery' ? str(b.address, 300) : '';
  if (b.type === 'delivery' && address.length < 5) return bad(res, 'Please enter your delivery address in Hetauda.');

  if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 60) return bad(res, 'Your cart is empty.');
  const lines = [];
  let hasWhole = false;
  for (const l of b.lines) {
    const found = findPrice(str(l.itemId, 120), str(l.label, 60));
    const qty = Math.round(Number(l.qty));
    if (!found || !(qty >= 1 && qty <= 50)) return bad(res, 'Something in your cart has changed. Please refresh the page and add it again.');
    if (found.item.available === false || !(Number(found.price.price) > 0)) return bad(res, `${found.item.name} is not available right now. Please remove it from your cart.`);
    if (found.price.whole) hasWhole = true;
    lines.push({ itemId: found.item.id, name: found.item.name, label: found.price.label || '', price: Number(found.price.price), qty, whole: Boolean(found.price.whole) });
  }

  let schedule = null;
  if (b.when === 'later' || hasWhole) {
    const date = str(b.date, 10);
    const time = str(b.time, 5);
    const err = checkSchedule(date, time, hasWhole ? Number(c.cake.noticeHours) || 0 : 0);
    if (err) return bad(res, err);
    schedule = { date, time, bs: str(b.dateBs, 40) };
  } else {
    const now = nepalNow().time;
    if (now < c.brand.open || now > c.brand.close) return bad(res, `We are closed right now (open ${c.brand.hoursText}). Choose "Later" to schedule your order.`);
  }

  const method = str(b.method, 20);
  const pay = c.payment[method];
  if (!['esewa', 'fonepay'].includes(method) || !pay || pay.enabled === false) return bad(res, 'Please choose a payment method.');
  const proof = str(b.proof, 40);
  if (!/^[a-f0-9]{24}\.(png|jpg|webp)$/.test(proof) || !fs.existsSync(path.join(PROOFS, proof))) return bad(res, 'Please upload a screenshot of your payment.');

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const deliveryFee = b.type === 'delivery' ? Number(c.payment.deliveryFee) || 0 : 0;
  const order = {
    id: newId('PM'),
    createdAt: new Date().toISOString(),
    status: 'new',
    paid: false,
    name, phone, type: b.type, address,
    lines, subtotal, deliveryFee, total: subtotal + deliveryFee,
    schedule,
    cakeMessage: hasWhole ? str(b.cakeMessage, 120) : '',
    notes: str(b.notes, 500),
    payment: { method, proof },
  };
  await orders.set([order, ...orders.get()]);
  notify(`New order ${order.id}: Rs. ${order.total}`, orderText(order));
  res.json({ ok: true, id: order.id, total: order.total, text: orderText(order) });
});

/* public: table bookings */
app.post('/api/bookings', limit('booking', 6, 15 * 60e3), json, async (req, res) => {
  const b = req.body || {};
  const c = content.get();
  const name = str(b.name, 80);
  const phone = str(b.phone, 20);
  const people = Math.round(Number(b.people));
  if (!name) return bad(res, 'Please enter your name.');
  if (!/^\+?\d[\d\s-]{6,17}$/.test(phone)) return bad(res, 'Please enter a valid phone number.');
  const max = Number(c.booking.maxPeople) || 30;
  if (!(people >= 1 && people <= max)) return bad(res, `Please enter the number of people (1 to ${max}).`);
  const date = str(b.date, 10);
  const time = str(b.time, 5);
  const err = checkSchedule(date, time, 0);
  if (err) return bad(res, err);
  const booking = {
    id: newId('BK'),
    createdAt: new Date().toISOString(),
    status: 'new',
    name, phone, people, date, time,
    bs: str(b.dateBs, 40),
    requests: str(b.requests, 600),
    remarks: str(b.remarks, 600),
  };
  await bookings.set([booking, ...bookings.get()]);
  notify(`New table booking ${booking.id}`, bookingText(booking));
  res.json({ ok: true, id: booking.id, text: bookingText(booking) });
});

/* admin: session */
app.post('/api/admin/login', limit('login', 8, 15 * 60e3), json, (req, res) => {
  if (!sameText(req.body.password || '', ADMIN_PASSWORD)) return res.status(401).json({ error: 'Wrong password.' });
  const secure = req.secure ? '; Secure' : '';
  res.set('Set-Cookie', `pm_admin=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${secure}`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.set('Set-Cookie', 'pm_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    admin: isAdmin(req),
    email: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL),
    whatsapp: Boolean(process.env.CALLMEBOT_APIKEY && process.env.NOTIFY_WHATSAPP),
  });
});

/* admin: content and uploads */
app.put('/api/admin/content', admin, json, async (req, res) => {
  const c = req.body;
  const ok = c && typeof c === 'object' && c.brand && c.theme && Array.isArray(c.sections)
    && c.menu && Array.isArray(c.menu.categories) && c.payment && c.cake && c.booking;
  if (!ok) return bad(res, 'That content is not complete, so it was not saved.');
  await content.set(fillDefaults(c, JSON.parse(JSON.stringify(defaults))));
  res.json({ ok: true });
});
app.post('/api/admin/upload', admin, rawImage, async (req, res) => {
  const ext = sniffImage(req.body, true);
  if (!ext) return bad(res, 'Please upload a PNG, JPG, WEBP, GIF or SVG image.');
  const file = `${crypto.randomBytes(10).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOADS, file), req.body);
  res.json({ url: `/uploads/${file}` });
});
app.get('/api/admin/proof/:file', admin, (req, res) => {
  if (!/^[a-f0-9]{24}\.(png|jpg|webp)$/.test(req.params.file)) return res.sendStatus(404);
  res.sendFile(path.join(PROOFS, req.params.file), (e) => { if (e && !res.headersSent) res.sendStatus(404); });
});

/* admin: orders, bookings, reviews */
function listRoutes(name, store, fields) {
  app.get(`/api/admin/${name}`, admin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(store.get());
  });
  app.patch(`/api/admin/${name}/:id`, admin, json, async (req, res) => {
    const list = store.get();
    const row = list.find((x) => x.id === req.params.id);
    if (!row) return res.sendStatus(404);
    for (const [k, check] of Object.entries(fields)) {
      if (req.body[k] !== undefined && check(req.body[k])) row[k] = req.body[k];
    }
    await store.set(list);
    res.json(row);
  });
  app.delete(`/api/admin/${name}/:id`, admin, async (req, res) => {
    await store.set(store.get().filter((x) => x.id !== req.params.id));
    res.json({ ok: true });
  });
}
const oneOf = (...v) => (x) => v.includes(x);
const isBool = (x) => typeof x === 'boolean';
listRoutes('orders', orders, { status: oneOf('new', 'accepted', 'ready', 'completed', 'cancelled'), paid: isBool });
listRoutes('bookings', bookings, { status: oneOf('new', 'confirmed', 'declined', 'done') });
listRoutes('reviews', reviews, { approved: isBool });
app.post('/api/admin/reviews', admin, json, async (req, res) => {
  const name = str(req.body.name, 60);
  const text = str(req.body.text, 800);
  const rating = Math.round(Number(req.body.rating));
  if (!name || !text || !(rating >= 1 && rating <= 5)) return bad(res, 'Please fill in the name, stars and review.');
  const r = { id: newId('RV'), name, text, rating, source: req.body.source === 'google' ? 'google' : 'site', approved: true, createdAt: new Date().toISOString() };
  await reviews.set([r, ...reviews.get()]);
  res.json(r);
});

/* files */
app.use('/uploads', express.static(UPLOADS, {
  maxAge: '30d',
  setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"),
}));
app.use(express.static(path.join(ROOT, 'public'), {
  setHeaders: (res, file) => { if (/\.(html|js|css)$/.test(file)) res.set('Cache-Control', 'no-cache'); },
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const tooBig = err && err.type === 'entity.too.large';
  if (!tooBig) console.error(err);
  res.status(tooBig ? 413 : 500).json({ error: tooBig ? 'That file is too large (8 MB at most).' : 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => console.log(`Pick Me Cafe is running on port ${PORT}. Data folder: ${DATA_DIR}`));
