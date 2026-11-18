'use strict';
/*
 * Pick Me Cafe server.
 * Serves the website (/), the admin editor (/#admin) and the staff counter (/counter).
 * Content, orders, bookings, reviews, messages and logins are JSON files in DATA_DIR.
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
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');
const HISTORY = path.join(DATA_DIR, 'history');
for (const d of [DATA_DIR, UPLOADS, PROOFS, HISTORY]) fs.mkdirSync(d, { recursive: true });
const QRCode = require('qrcode');
const AdmZip = require('adm-zip');
const SEED_DIR = path.join(ROOT, 'seed');
const FRESH_START = !fs.existsSync(path.join(DATA_DIR, 'content.json'));

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
      await fs.promises.writeFile(tmp, text, { mode: 0o600 });
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
const freshDefaults = () => JSON.parse(JSON.stringify(defaults));

const content = new Store('content.json', null);
content.data = fillDefaults(content.data, freshDefaults());
if (typeof content.data._rev !== 'number') content.data._rev = 1;
// The website no longer says "Nepali calendar" (the calendar itself is still Nepali).
if (/from the Nepali calendar/.test(content.data.booking.text || '')) {
  content.data.booking.text = content.data.booking.text.replace('Choose a date from the Nepali calendar', 'Choose a date');
  content.set(content.data);
}
const orders = new Store('orders.json', []);
const bookings = new Store('bookings.json', []);
// Order steps: pending -> acknowledged -> preparing -> ready -> done (or cancelled). "Paid" is ticked separately.
const ORDER_STEPS = ['pending', 'acknowledged', 'preparing', 'ready', 'done', 'cancelled'];
const BOOKING_STEPS = ['pending', 'confirmed', 'seated', 'done', 'declined'];
(function renameOldSteps() {
  const map = { new: 'pending', accepted: 'acknowledged', completed: 'done' };
  for (const store of [orders, bookings]) {
    let changed = false;
    for (const x of store.get()) if (map[x.status]) { x.status = map[x.status]; changed = true; }
    if (changed) store.set(store.get());
  }
})();
const reviews = new Store('reviews.json', []);
const messages = new Store('messages.json', []);
const auth = new Store('auth.json', {});
const trash = new Store('trash.json', []);

/* ---------- activity log ---------- */
function audit(by, action, ref) {
  fs.appendFile(AUDIT_FILE, `${new Date().toISOString()}\t${by || '-'}\t${action}\t${ref || ''}\n`, () => {});
}
function auditTail(max) {
  try {
    const text = fs.readFileSync(AUDIT_FILE, 'utf8');
    return text.split('\n').filter(Boolean).slice(-max).reverse().map((l) => {
      const [at, by, action, ref] = l.split('\t');
      return { at, by, action, ref: ref || '' };
    });
  } catch { return []; }
}

/* ---------- website version history ---------- */
const SECTION_NAMES = {
  brand: 'Cafe details', theme: 'Colours and fonts', sections: 'Sections', hero: 'Top of page', highlights: 'Specialities',
  events: 'Events', menu: 'Menu', cake: 'Cake pre-order', booking: 'Table booking', story: 'Our story', gallery: 'Gallery',
  reviews: 'Reviews section', visit: 'Map and messages', social: 'Social links', payment: 'Payment', footer: 'Footer',
  sizes: 'Sizes', crops: 'Photo positions', categories: '', items: '', prices: '', cards: '', images: '',
};
const isPhoto = (v) => typeof v === 'string' && /^(https?:\/\/|\/uploads\/)/.test(v);
function shortValue(v) {
  if (v === undefined || v === null || v === '') return '(empty)';
  if (isPhoto(v)) return 'a photo';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
  const t = String(v);
  return t.length > 40 ? `"${t.slice(0, 40)}..."` : (typeof v === 'string' ? `"${t}"` : t);
}
// Describes what changed between two versions of the website, in plain words.
function describeChanges(a, b) {
  const out = [];
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const label = (o) => (o && typeof o === 'object' ? (o.name || o.title || o.label || o.caption || o.type || o.id || '') : '');
  function walk(x, y, trail) {
    if (out.length >= 30 || same(x, y)) return;
    const where = trail.filter(Boolean).join(' › ') || 'Website';
    if (Array.isArray(x) && Array.isArray(y)) {
      const key = (o, i) => (o && typeof o === 'object' && (o.id || o.name || o.title)) || `#${i}`;
      const xm = new Map(x.map((o, i) => [key(o, i), o]));
      const ym = new Map(y.map((o, i) => [key(o, i), o]));
      for (const [k, o] of ym) if (!xm.has(k)) out.push(`${where}: added ${label(o) || shortValue(o)}`);
      for (const [k, o] of xm) if (!ym.has(k)) out.push(`${where}: removed ${label(o) || shortValue(o)}`);
      for (const [k, o] of ym) if (xm.has(k)) walk(xm.get(k), o, trail.concat(label(o)));
      const kept = [...ym.keys()].filter((k) => xm.has(k));
      const before = [...xm.keys()].filter((k) => ym.has(k));
      if (kept.join('|') !== before.join('|')) out.push(`${where}: order changed`);
      return;
    }
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
      if (trail.length === 1 && trail[0] === SECTION_NAMES.crops) { out.push('Photo positions changed'); return; }
      if (trail.length === 1 && trail[0] === SECTION_NAMES.sizes) { out.push('Sizes changed'); return; }
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (k === '_rev' || k === 'id') continue;
        walk(x[k], y[k], trail.concat(k in SECTION_NAMES ? SECTION_NAMES[k] : k));
      }
      return;
    }
    if (trail[0] === SECTION_NAMES.sizes) { out.push('Sizes changed'); return; }
    if (x === undefined && y && typeof y === 'object') { out.push(`${where}: added`); return; }
    if (y === undefined && x && typeof x === 'object') { out.push(`${where}: removed`); return; }
    out.push(isPhoto(x) || isPhoto(y) ? `${where}: photo changed` : `${where}: ${shortValue(x)} → ${shortValue(y)}`);
  }
  walk(a, b, []);
  return out;
}
function listHistory() {
  return fs.readdirSync(HISTORY).filter((f) => f.endsWith('.json')).sort().reverse();
}
async function addHistory(entry, data) {
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await fs.promises.writeFile(path.join(HISTORY, `${id}.json`), JSON.stringify({ id, ...entry, content: data }));
  for (const old of listHistory().slice(150)) fs.unlink(path.join(HISTORY, old), () => {});
  return id;
}
async function moveToBin(kind, item, by) {
  if (!item) return;
  await trash.set([{ key: `${kind}:${item.id}`, kind, at: new Date().toISOString(), by, item }, ...trash.get()].slice(0, 300));
}

/* ---------- passwords and sessions ---------- */
const scrypt = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
const makeHash = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: scrypt(pw, salt) }; };
function checkHash(rec, pw) {
  if (!rec || !rec.salt || !rec.hash || typeof pw !== 'string' || !pw) return false;
  const a = Buffer.from(scrypt(pw, rec.salt), 'hex');
  const b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const envMark = (pw) => crypto.createHash('sha256').update('pm:' + pw).digest('hex');
const newSecret = () => crypto.randomBytes(48).toString('hex');

(function initAuth() {
  const a = auth.get();
  let changed = false;
  if (!a.secret) { a.secret = newSecret(); changed = true; }
  if (!Array.isArray(a.staff)) { a.staff = []; changed = true; }
  const env = process.env.ADMIN_PASSWORD;
  if (env && a.envMark !== envMark(env)) {
    // A new ADMIN_PASSWORD variable always (re)sets the owner password.
    Object.assign(a, makeHash(env), { envMark: envMark(env) });
    changed = true;
  } else if (!a.hash) {
    const temp = crypto.randomBytes(9).toString('base64url');
    Object.assign(a, makeHash(temp));
    changed = true;
    console.log('\n  ADMIN_PASSWORD is not set. Temporary owner password: ' + temp);
    console.log('  Change it in admin under Security, or set the ADMIN_PASSWORD variable.\n');
  }
  if (changed) auth.set(a);
})();

const sign = (body) => crypto.createHmac('sha256', auth.get().secret).update(body).digest('base64url');
function issue(role, remember, staff) {
  const payload = { r: role, exp: Date.now() + (remember ? 30 * 864e5 : 12 * 3600e3) };
  if (staff) { payload.sid = staff.id; payload.v = staff.v || 0; }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}
function readSession(req) {
  const m = /(?:^|;\s*)pm_auth=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  const good = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p || !(p.exp > Date.now())) return null;
    if (p.r === 'admin') return { role: 'admin', name: 'Owner' };
    const st = auth.get().staff.find((x) => x.id === p.sid);
    return st && st.active && (st.v || 0) === (p.v || 0) ? { role: 'staff', name: st.name, staff: st } : null;
  } catch { return null; }
}
const allow = (...roles) => (req, res, next) => {
  const s = readSession(req);
  if (s && roles.includes(s.role)) { req.session = s; return next(); }
  res.status(401).json({ error: 'Please log in.' });
};
const admin = allow('admin');
const desk = allow('admin', 'staff');
const who = (req) => (req.session && req.session.role === 'staff' ? 'staff:' + req.session.staff.username : 'owner');
const staffPublic = (s) => ({ id: s.id, username: s.username, name: s.name, active: Boolean(s.active), createdAt: s.createdAt, lastLoginAt: s.lastLoginAt || '' });
function setCookie(req, res, token, remember) {
  const secure = req.secure ? '; Secure' : '';
  const age = token ? (remember ? `; Max-Age=${30 * 86400}` : '') : '; Max-Age=0';
  res.set('Set-Cookie', `pm_auth=${token}; Path=/; HttpOnly; SameSite=Lax${age}${secure}`);
}

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
const loginFails = new Map();
const loginBlocked = (req) => { const f = loginFails.get(req.ip); return Boolean(f && f.reset > Date.now() && f.n >= 10); };
function loginFailed(req) {
  let f = loginFails.get(req.ip);
  if (!f || f.reset < Date.now()) { f = { n: 0, reset: Date.now() + 15 * 60e3 }; loginFails.set(req.ip, f); }
  f.n += 1;
}

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max);
const bad = (res, error) => res.status(400).json({ error });
const NP_OFFSET = 345 * 60e3; // Nepal is UTC+5:45
function newCode(prefix) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i++) s += letters[bytes[i] % letters.length];
  const d = new Date(Date.now() + NP_OFFSET).toISOString().slice(2, 10).replace(/-/g, '');
  return `${prefix}-${d}-${s}`;
}
const nepalTime = () => new Date(Date.now() + NP_OFFSET).toISOString().slice(11, 16);
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
const PROOF_NAME = /^[a-f0-9]{24}\.(png|jpg|webp)$/;
const proofExists = (f) => PROOF_NAME.test(f) && fs.existsSync(path.join(PROOFS, f));

/* ---------- alerts (optional) ---------- */
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
  await Promise.allSettled(jobs.map((j) => j.catch((e) => console.error('Alert error:', e.message))));
}

const TYPE_LABEL = { dinein: 'Dine-in', pickup: 'Pickup', delivery: 'Delivery' };
const PAY_LABEL = { later: 'Pay later', esewa: 'eSewa', fonepay: 'Fonepay' };
const person = (x) => [x.name || 'Guest', x.phone].filter(Boolean).join(', ');
function orderText(o) {
  return [
    `Order ${o.id}`,
    person(o),
    `${TYPE_LABEL[o.type]}${o.address ? `: ${o.address}` : ''}${o.tableNo ? `, table ${o.tableNo}` : ''}`,
    o.schedule ? `For: ${o.schedule.bs || o.schedule.date} at ${o.schedule.time}` : 'For: as soon as possible',
    '',
    ...o.lines.map((l) => `${l.qty} x ${l.name}${l.label ? ` (${l.label})` : ''} = Rs. ${l.qty * l.price}`),
    o.deliveryFee ? `Delivery = Rs. ${o.deliveryFee}` : null,
    `Total: Rs. ${o.total}`,
    o.cakeMessage ? `On the cake: ${o.cakeMessage}` : null,
    o.occasion ? `Occasion: ${o.occasion}` : null,
    o.notes ? `Notes: ${o.notes}` : null,
    `Payment: ${PAY_LABEL[o.payment.method] || o.payment.method}${o.payment.txn ? `, code ${o.payment.txn}` : ''}${o.payment.proof ? ', screenshot uploaded' : ''}`,
  ].filter((x) => x !== null).join('\n');
}
function bookingText(b) {
  return [
    `Booking ${b.id}`,
    person(b),
    `${b.bs || b.date} at ${b.time}, ${b.people} people${b.seating ? `, ${b.seating}` : ''}`,
    b.food ? `Food ready on arrival: ${b.food}` : null,
    b.cakeName ? `Name on cake: ${b.cakeName}` : null,
    b.decoration ? `Decoration: ${b.decoration}` : null,
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
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  if (req.path.startsWith('/counter')) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
const rawImage = express.raw({ type: () => true, limit: '8mb' });
const json = express.json({ limit: '3mb' });

app.get('/api/health', (req, res) => res.json({ ok: true }));
// /admin is an easier address to type and share than /#admin. Both open the editor.
app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

/* public: content and reviews */
app.get('/api/content', (req, res) => res.json(content.get()));
app.get('/api/reviews', (req, res) => {
  res.json(reviews.get().filter((r) => r.approved).map(({ id, name, rating, text, favorite, source, createdAt }) => ({ id, name, rating, text, favorite, source, createdAt })));
});
app.post('/api/reviews', limit('review', 20, 30 * 60e3), json, async (req, res) => {
  const name = str(req.body.name, 60) || 'Guest';
  const text = str(req.body.text, 800);
  const rating = Math.round(Number(req.body.rating)) || 5;
  if (text.length < 3) return bad(res, 'Please write a few words.');
  if (!(rating >= 1 && rating <= 5)) return bad(res, 'Please choose a star rating.');
  const r = { id: newCode('RV'), name, text, rating, favorite: str(req.body.favorite, 100), source: 'site', approved: false, createdAt: new Date().toISOString() };
  await reviews.set([r, ...reviews.get()]);
  audit('public', 'review-sent', r.id);
  notify(`New review from ${name} (${rating}/5)`, `${text}\n\nApprove it in the admin page to show it on the website.`);
  res.json({ ok: true });
});

/* public: messages */
app.post('/api/messages', limit('message', 30, 30 * 60e3), json, async (req, res) => {
  const m = { id: newCode('MS'), createdAt: new Date().toISOString(), read: false, name: str(req.body.name, 80), phone: str(req.body.phone, 20), text: str(req.body.text, 1500) };
  if (!m.text) return bad(res, 'Please write your message.');
  await messages.set([m, ...messages.get()]);
  notify(`New message from ${m.name || 'a guest'}`, `${m.phone}\n${m.text}`);
  res.json({ ok: true });
});

/* public: payment screenshot or cake reference photo */
app.post('/api/proof', limit('proof', 80, 30 * 60e3), rawImage, async (req, res) => {
  const ext = sniffImage(req.body, false);
  if (!ext) return bad(res, 'Please upload a PNG or JPG picture.');
  const file = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(PROOFS, file), req.body);
  res.json({ file });
});

/* public: orders */
// Looks up a price in the menu, or in the special menu of a switched-on event.
function findPrice(itemId, label) {
  const c = content.get();
  const groups = (c.menu.categories || []).map((g) => ({ items: g.items, hidden: g.hidden }))
    .concat((c.events.items || []).filter((e) => e.enabled !== false).map((e) => ({ items: e.menu })));
  for (const g of groups) {
    for (const it of g.items || []) {
      if (it.id !== itemId) continue;
      const p = (it.prices || []).find((x) => (x.label || '') === (label || ''));
      if (!p) return null;
      const off = g.hidden || it.hidden || it.available === false;
      return { item: Object.assign({}, it, { available: off ? false : it.available }), price: p };
    }
  }
  return null;
}
const nepalDate = () => new Date(Date.now() + NP_OFFSET).toISOString().slice(0, 10);
// The "closed today" notice. Returns it while it applies, otherwise null.
function closedNotice() {
  const k = content.get().closure || {};
  if (!k.on) return null;
  if (k.until && /^\d{4}-\d{2}-\d{2}$/.test(k.until) && nepalDate() > k.until) return null;
  return k;
}
function closedFor(date) {
  const k = closedNotice();
  if (!k) return null;
  const last = k.until || nepalDate();
  if (!date || date <= last || !k.allowLater) { const t = String(k.title || 'We are closed today').trim(); return /[.!?]$/.test(t) ? t : t + '.'; }
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
const PHONE = /^\+?\d[\d\s-]{6,17}$/;

// Many guests share the cafe Wi-Fi (one address), so the order limits are generous.
app.post('/api/orders', limit('order', 80, 15 * 60e3), json, async (req, res) => {
  const b = req.body || {};
  const c = content.get();
  const type = TYPE_LABEL[b.type] ? b.type : 'dinein';
  const name = str(b.name, 80);
  const phone = str(b.phone, 20);
  // Guests ordering at their table need nothing but their order. Everyone else leaves a phone number.
  if (type !== 'dinein' && !PHONE.test(phone)) return bad(res, 'Please enter your phone number so we can reach you.');
  if (phone && !PHONE.test(phone)) return bad(res, 'That phone number does not look right. Please check it.');
  const address = type === 'delivery' ? str(b.address, 300) : '';

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
    const shut = closedFor(date);
    if (shut) return bad(res, `${shut} Please choose a later date.`);
  } else {
    const shut = closedFor('');
    if (shut) return bad(res, closedNotice().allowLater ? `${shut} You can still order for a later day: choose "Later".` : shut);
    const now = nepalTime();
    if (now < c.brand.open || now > c.brand.close) return bad(res, `We are closed right now (open ${c.brand.hoursText}). Choose "Later" to schedule your order.`);
  }

  // Paying online is optional. Without it the order is "pay later" (at the counter or on delivery).
  let method = str(b.method, 20);
  if (!['esewa', 'fonepay'].includes(method) || !c.payment[method] || c.payment[method].enabled === false) method = 'later';
  const proof = method !== 'later' && proofExists(str(b.proof, 40)) ? str(b.proof, 40) : '';
  const txn = method !== 'later' ? str(b.txn, 60) : '';
  const refPhoto = hasWhole && proofExists(str(b.refPhoto, 40)) ? str(b.refPhoto, 40) : '';

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const deliveryFee = type === 'delivery' ? Number(c.payment.deliveryFee) || 0 : 0;
  const order = {
    id: newCode(hasWhole ? 'CAKE' : 'PM'),
    createdAt: new Date().toISOString(),
    status: 'pending',
    paid: false,
    log: [{ at: new Date().toISOString(), by: 'customer', what: 'Order placed' }],
    name, phone, type, address,
    tableNo: type === 'dinein' ? str(b.tableNo, 20) : '',
    lines, subtotal, deliveryFee, total: subtotal + deliveryFee,
    schedule,
    hasWhole,
    cakeMessage: hasWhole ? str(b.cakeMessage, 120) : '',
    occasion: hasWhole ? str(b.occasion, 80) : '',
    refPhoto,
    notes: str(b.notes, 500),
    payment: { method, proof, txn },
  };
  await orders.set([order, ...orders.get()]);
  audit('public', 'order-placed', order.id);
  notify(`New order ${order.id}: Rs. ${order.total}`, orderText(order));
  res.json({ ok: true, id: order.id, total: order.total, text: orderText(order) });
});

/* public: table bookings */
app.post('/api/bookings', limit('booking', 30, 15 * 60e3), json, async (req, res) => {
  const b = req.body || {};
  const c = content.get();
  const name = str(b.name, 80);
  const phone = str(b.phone, 20);
  const people = Math.round(Number(b.people)) || 2;
  if (!PHONE.test(phone)) return bad(res, 'Please enter your phone number so we can confirm your table.');
  const max = Number(c.booking.maxPeople) || 30;
  if (!(people >= 1 && people <= max)) return bad(res, `Please enter the number of people (1 to ${max}).`);
  const date = str(b.date, 10);
  const time = str(b.time, 5);
  const err = checkSchedule(date, time, 0);
  if (err) return bad(res, err);
  const shut = closedFor(date);
  if (shut) return bad(res, `${shut} Please choose another day.`);
  const booking = {
    id: newCode('TBL'),
    createdAt: new Date().toISOString(),
    status: 'pending',
    log: [{ at: new Date().toISOString(), by: 'customer', what: 'Booking requested' }],
    name, phone, people, date, time,
    bs: str(b.dateBs, 40),
    seating: str(b.seating, 60),
    food: str(b.food, 600),
    cakeName: str(b.cakeName, 120),
    decoration: str(b.decoration, 600),
    remarks: str(b.remarks, 600),
  };
  await bookings.set([booking, ...bookings.get()]);
  audit('public', 'table-booked', booking.id);
  notify(`New table booking ${booking.id}`, bookingText(booking));
  res.json({ ok: true, id: booking.id, text: bookingText(booking) });
});

/* login: owner (password only) or staff (login ID + password) */
app.post('/api/auth/login', json, async (req, res) => {
  if (loginBlocked(req)) return res.status(429).json({ error: 'Too many wrong passwords. Please wait 15 minutes.' });
  const remember = Boolean(req.body.remember);
  const username = str(req.body.username, 40).toLowerCase();
  const a = auth.get();
  if (username) {
    const st = a.staff.find((x) => x.username === username);
    if (!st || !st.active || !checkHash(st, req.body.password)) {
      loginFailed(req);
      audit('staff:' + username.replace(/[^a-z0-9._-]/g, '?'), 'login-failed');
      return res.status(401).json({ error: 'Wrong login ID or password.' });
    }
    st.lastLoginAt = new Date().toISOString();
    await auth.set(a);
    audit('staff:' + st.username, 'login');
    setCookie(req, res, issue('staff', remember, st), remember);
    return res.json({ ok: true, role: 'staff', name: st.name });
  }
  if (!checkHash(a, req.body.password)) {
    loginFailed(req);
    audit('owner', 'login-failed');
    return res.status(401).json({ error: 'Wrong password.' });
  }
  audit('owner', 'login');
  setCookie(req, res, issue('admin', remember), remember);
  res.json({ ok: true, role: 'admin', name: 'Owner' });
});
app.post('/api/auth/logout', (req, res) => { setCookie(req, res, '', false); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => {
  const s = readSession(req);
  res.json({
    role: s ? s.role : null,
    name: s ? s.name : '',
    cafe: content.get().brand.name,
    email: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL),
    whatsapp: Boolean(process.env.CALLMEBOT_APIKEY && process.env.NOTIFY_WHATSAPP),
  });
});

/* owner: content and uploads */
app.put('/api/admin/content', admin, json, async (req, res) => {
  const c = req.body;
  const ok = c && typeof c === 'object' && c.brand && c.theme && Array.isArray(c.sections)
    && c.menu && Array.isArray(c.menu.categories) && c.payment && c.cake && c.booking;
  if (!ok) return bad(res, 'That content is not complete, so it was not saved.');
  const current = content.get();
  // Two devices editing at once: refuse to overwrite a newer save unless asked to.
  if (c._rev !== current._rev && req.query.force !== '1') {
    return res.status(409).json({ error: 'The website was saved from another device after you opened this editor.', rev: current._rev });
  }
  const next = fillDefaults(c, freshDefaults());
  const changes = describeChanges(current, next);
  if (!listHistory().length) await addHistory({ at: new Date().toISOString(), by: 'owner', note: 'Website before your first save', changes: [] }, current);
  next._rev = current._rev + 1;
  await content.set(next);
  const note = str(req.query.note, 80);
  await addHistory({ at: new Date().toISOString(), by: 'owner', note, changes }, next);
  audit('owner', note ? `website-saved (${note})` : 'website-saved');
  res.json({ ok: true, rev: next._rev });
});
app.get('/api/admin/history', admin, (req, res) => {
  res.json(listHistory().map((f) => {
    try {
      const { id, at, by, note, changes } = JSON.parse(fs.readFileSync(path.join(HISTORY, f), 'utf8'));
      return { id, at, by, note, changes };
    } catch { return null; }
  }).filter(Boolean));
});
app.get('/api/admin/history/:id', admin, (req, res) => {
  if (!/^\d+-[a-f0-9]{6}$/.test(req.params.id)) return res.sendStatus(404);
  fs.readFile(path.join(HISTORY, `${req.params.id}.json`), 'utf8', (e, t) => {
    if (e) return res.sendStatus(404);
    res.json(JSON.parse(t).content);
  });
});
app.get('/api/admin/bin', admin, (req, res) => res.json(trash.get()));
app.post('/api/admin/bin/restore', admin, json, async (req, res) => {
  const entry = trash.get().find((t) => t.key === req.body.key);
  const stores = { orders, bookings, reviews, messages };
  if (!entry || !stores[entry.kind]) return res.sendStatus(404);
  const store = stores[entry.kind];
  if (!store.get().some((x) => x.id === entry.item.id)) {
    await store.set([entry.item, ...store.get()].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))));
  }
  await trash.set(trash.get().filter((t) => t.key !== entry.key));
  audit('owner', `${entry.kind}-restored`, entry.item.id);
  res.json({ ok: true });
});
// QR codes for the tables. Each one opens the menu with the table number filled in.
app.get('/api/admin/qr', admin, async (req, res) => {
  const text = str(req.query.text, 300);
  if (!/^https?:\/\//.test(text)) return res.sendStatus(400);
  res.set('Content-Type', 'image/svg+xml');
  res.send(await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2B2118', light: '#ffffff' } }));
});
app.post('/api/admin/upload', admin, rawImage, async (req, res) => {
  const ext = sniffImage(req.body, true);
  if (!ext) return bad(res, 'Please upload a PNG, JPG, WEBP, GIF or SVG image.');
  const file = `${crypto.randomBytes(10).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOADS, file), req.body);
  res.json({ url: `/uploads/${file}` });
});

/* owner: security */
app.post('/api/admin/password', admin, json, async (req, res) => {
  const a = auth.get();
  if (!checkHash(a, req.body.current)) return res.status(401).json({ error: 'The current password is not right.' });
  if (typeof req.body.next !== 'string' || req.body.next.length < 8) return bad(res, 'The new password needs at least 8 characters.');
  Object.assign(a, makeHash(req.body.next), { secret: newSecret() });
  await auth.set(a);
  audit('owner', 'password-changed');
  setCookie(req, res, issue('admin', true), true);
  res.json({ ok: true });
});
app.post('/api/admin/signout-all', admin, async (req, res) => {
  const a = auth.get();
  a.secret = newSecret();
  a.staff.forEach((s) => { s.v = (s.v || 0) + 1; });
  await auth.set(a);
  audit('owner', 'signed-out-everywhere');
  setCookie(req, res, issue('admin', true), true);
  res.json({ ok: true });
});
app.get('/api/admin/staff', admin, (req, res) => res.json(auth.get().staff.map(staffPublic)));
app.post('/api/admin/staff', admin, json, async (req, res) => {
  const a = auth.get();
  const username = str(req.body.username, 40).toLowerCase();
  const name = str(req.body.name, 80);
  if (!name) return bad(res, 'Enter the staff member\'s name.');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return bad(res, 'The login ID needs 3 to 30 letters, numbers, dots or dashes.');
  if (a.staff.some((x) => x.username === username)) return bad(res, 'That login ID is already used.');
  if (typeof req.body.password !== 'string' || req.body.password.length < 6) return bad(res, 'The staff password needs at least 6 characters.');
  if (checkHash(a, req.body.password)) return bad(res, 'The staff password must be different from the owner password.');
  const st = { id: 's_' + crypto.randomBytes(6).toString('hex'), username, name, ...makeHash(req.body.password), active: true, v: 1, createdAt: new Date().toISOString() };
  a.staff.push(st);
  await auth.set(a);
  audit('owner', 'staff-added', username);
  res.json(staffPublic(st));
});
app.patch('/api/admin/staff/:id', admin, json, async (req, res) => {
  const a = auth.get();
  const st = a.staff.find((x) => x.id === req.params.id);
  if (!st) return res.sendStatus(404);
  if (typeof req.body.password === 'string' && req.body.password) {
    if (req.body.password.length < 6) return bad(res, 'The staff password needs at least 6 characters.');
    if (checkHash(a, req.body.password)) return bad(res, 'The staff password must be different from the owner password.');
    Object.assign(st, makeHash(req.body.password));
    st.v = (st.v || 0) + 1;
    audit('owner', 'staff-password-reset', st.username);
  }
  if (typeof req.body.active === 'boolean' && req.body.active !== st.active) {
    st.active = req.body.active;
    st.v = (st.v || 0) + 1;
    audit('owner', st.active ? 'staff-enabled' : 'staff-disabled', st.username);
  }
  await auth.set(a);
  res.json(staffPublic(st));
});
app.delete('/api/admin/staff/:id', admin, async (req, res) => {
  const a = auth.get();
  const st = a.staff.find((x) => x.id === req.params.id);
  if (st) audit('owner', 'staff-removed', st.username);
  a.staff = a.staff.filter((x) => x.id !== req.params.id);
  await auth.set(a);
  res.json({ ok: true });
});
app.get('/api/admin/export', admin, (req, res) => {
  audit('owner', 'backup-downloaded');
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="pick-me-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.end(JSON.stringify({ kind: 'pick-me-backup', exportedAt: new Date().toISOString(), content: content.get(), orders: orders.get(), bookings: bookings.get(), reviews: reviews.get(), messages: messages.get() }, null, 1));
});
app.get('/api/admin/audit', admin, (req, res) => res.json(auditTail(200)));

/* owner and staff: orders, bookings, payment pictures */
app.get('/api/desk/proof/:file', desk, (req, res) => {
  if (!PROOF_NAME.test(req.params.file)) return res.sendStatus(404);
  res.sendFile(path.join(PROOFS, req.params.file), (e) => { if (e && !res.headersSent) res.sendStatus(404); });
});
function listRoutes(base, name, store, fields, guard) {
  app.get(`/api/${base}/${name}`, guard, (req, res) => {
    const d = String(req.query.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.json(store.get().slice(0, 400));
    // One day: placed that day, or due that day (?by=due).
    const day = (iso) => new Date(Date.parse(iso) + NP_OFFSET).toISOString().slice(0, 10);
    const due = (x) => (x.schedule && x.schedule.date) || x.date || day(x.createdAt);
    res.json(store.get().filter((x) => (req.query.by === 'due' ? due(x) : day(x.createdAt)) === d));
  });
  app.patch(`/api/${base}/${name}/:id`, guard, json, async (req, res) => {
    const list = store.get();
    const row = list.find((x) => x.id === req.params.id);
    if (!row) return res.sendStatus(404);
    const done = [];
    for (const [k, check] of Object.entries(fields)) {
      if (req.body[k] !== undefined && check(req.body[k]) && row[k] !== req.body[k]) { row[k] = req.body[k]; done.push(`${k}=${req.body[k]}`); }
    }
    row.updatedAt = new Date().toISOString();
    row.updatedBy = who(req);
    if (Array.isArray(row.log) || name === 'orders' || name === 'bookings') {
      row.log = Array.isArray(row.log) ? row.log : [];
      for (const d of done) {
        const [k, v] = d.split('=');
        const what = k === 'paid' ? (v === 'true' ? 'Marked paid' : 'Marked not paid') : `Marked ${v}`;
        row.log.push({ at: row.updatedAt, by: who(req), what });
      }
    }
    await store.set(list);
    audit(who(req), `${name}-updated ${done.join(' ')}`, row.id);
    res.json(row);
  });
  app.delete(`/api/admin/${name}/:id`, admin, async (req, res) => {
    await moveToBin(name, store.get().find((x) => x.id === req.params.id), who(req));
    await store.set(store.get().filter((x) => x.id !== req.params.id));
    audit('owner', `${name}-deleted`, req.params.id);
    res.json({ ok: true });
  });
}
const oneOf = (...v) => (x) => v.includes(x);
const isBool = (x) => typeof x === 'boolean';
listRoutes('desk', 'orders', orders, { status: oneOf(...ORDER_STEPS), paid: isBool }, desk);
listRoutes('desk', 'bookings', bookings, { status: oneOf(...BOOKING_STEPS) }, desk);

// One day's orders as a spreadsheet file (opens in Excel or Google Sheets).
app.get('/api/desk/day.csv', desk, (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : nepalDate();
  const due = req.query.by === 'due';
  const day = (iso) => new Date(Date.parse(iso) + NP_OFFSET).toISOString().slice(0, 10);
  const list = orders.get().filter((o) => (due ? (o.schedule ? o.schedule.date : day(o.createdAt)) : day(o.createdAt)) === date);
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['Order', 'Placed', 'For', 'Type', 'Table', 'Name', 'Phone', 'Items', 'Total (Rs)', 'Payment', 'Paid', 'Status', 'Notes']];
  for (const o of list.slice().reverse()) {
    rows.push([
      o.id, new Date(Date.parse(o.createdAt) + NP_OFFSET).toISOString().slice(11, 16), o.schedule ? `${o.schedule.date} ${o.schedule.time}` : 'now',
      TYPE_LABEL[o.type] || o.type, o.tableNo, o.name, o.phone,
      o.lines.map((l) => `${l.qty} x ${l.name}${l.label ? ` (${l.label})` : ''}`).join('; '),
      o.total, PAY_LABEL[o.payment.method] || o.payment.method, o.paid ? 'yes' : 'no', o.status, [o.cakeMessage && `Cake: ${o.cakeMessage}`, o.notes].filter(Boolean).join(' | '),
    ]);
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="pick-me-orders-${date}.csv"`);
  res.send('\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n'));
});
listRoutes('admin', 'reviews', reviews, { approved: isBool }, admin);
listRoutes('admin', 'messages', messages, { read: isBool }, admin);
app.post('/api/admin/reviews', admin, json, async (req, res) => {
  const name = str(req.body.name, 60) || 'Guest';
  const text = str(req.body.text, 800);
  const rating = Math.round(Number(req.body.rating));
  if (!text || !(rating >= 1 && rating <= 5)) return bad(res, 'Please fill in the stars and review.');
  const r = { id: newCode('RV'), name, text, rating, favorite: str(req.body.favorite, 100), source: req.body.source === 'google' ? 'google' : 'site', approved: true, createdAt: new Date().toISOString() };
  await reviews.set([r, ...reviews.get()]);
  res.json(r);
});

/* ---------- backups ----------
 * A backup is a .zip file:
 *   manifest.json   { kind: "pick-me-backup", format: 1, createdAt, full }
 *   content.json    every text, price, setting, size and photo position on the website
 *   uploads/...     every photo uploaded in admin
 *   orders.json, bookings.json, reviews.json, messages.json, proofs/...   (full backups only)
 * Passwords and staff logins are never put in a backup.
 * A backup placed in the seed/ folder of a new version is used automatically on a fresh install,
 * and offered in admin otherwise.
 */
const BACKUP_KIND = 'pick-me-backup';
const FILE_NAME = /^[a-f0-9]{16,40}\.(png|jpe?g|webp|gif|svg)$/;
const meta = new Store('meta.json', {});
function makeBackup(full) {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({ kind: BACKUP_KIND, format: 1, createdAt: new Date().toISOString(), full: Boolean(full), cafe: content.get().brand.name }, null, 1)));
  zip.addFile('content.json', Buffer.from(JSON.stringify(content.get(), null, 1)));
  for (const f of fs.readdirSync(UPLOADS)) if (FILE_NAME.test(f)) zip.addLocalFile(path.join(UPLOADS, f), 'uploads/');
  if (full) {
    for (const [name, store] of Object.entries({ orders, bookings, reviews, messages })) zip.addFile(`${name}.json`, Buffer.from(JSON.stringify(store.get(), null, 1)));
    for (const f of fs.readdirSync(PROOFS)) if (PROOF_NAME.test(f)) zip.addLocalFile(path.join(PROOFS, f), 'proofs/');
  }
  return zip.toBuffer();
}
// Reads a backup. Photos and records are added; nothing that exists is deleted.
async function restoreBackup(buf, by) {
  let zip;
  try { zip = new AdmZip(buf); } catch { throw new Error('That file is not a Pick Me backup (.zip).'); }
  const read = (name) => { const e = zip.getEntry(name); return e ? JSON.parse(e.getData().toString('utf8')) : null; };
  let manifest;
  try { manifest = read('manifest.json'); } catch { manifest = null; }
  if (!manifest || manifest.kind !== BACKUP_KIND) throw new Error('That file is not a Pick Me backup (.zip).');
  const out = { photos: 0, orders: 0, bookings: 0, reviews: 0, messages: 0, website: false, createdAt: manifest.createdAt };
  for (const e of zip.getEntries()) {
    const [dir, file] = e.entryName.split('/');
    if (e.isDirectory || !file || e.entryName.split('/').length !== 2) continue;
    if (dir === 'uploads' && FILE_NAME.test(file) && !fs.existsSync(path.join(UPLOADS, file))) { fs.writeFileSync(path.join(UPLOADS, file), e.getData()); out.photos += 1; }
    if (dir === 'proofs' && PROOF_NAME.test(file) && !fs.existsSync(path.join(PROOFS, file))) fs.writeFileSync(path.join(PROOFS, file), e.getData());
  }
  for (const [name, store] of Object.entries({ orders, bookings, reviews, messages })) {
    const rows = read(`${name}.json`);
    if (!Array.isArray(rows)) continue;
    const have = new Set(store.get().map((x) => x.id));
    const add = rows.filter((x) => x && x.id && !have.has(x.id));
    if (add.length) {
      await store.set(store.get().concat(add).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))));
      out[name] = add.length;
    }
  }
  const saved = read('content.json');
  if (saved && saved.brand && saved.menu) {
    const current = content.get();
    if (!listHistory().length) await addHistory({ at: new Date().toISOString(), by, note: 'Website before the backup was restored', changes: [] }, current);
    const next = fillDefaults(saved, freshDefaults());
    next._rev = (current._rev || 1) + 1;
    const when = String(manifest.createdAt || '').slice(0, 10);
    await content.set(next);
    await addHistory({ at: new Date().toISOString(), by, note: `restored the backup from ${when}`, changes: describeChanges(current, next) }, next);
    out.website = true;
  }
  audit(by, 'backup-restored', String(manifest.createdAt || ''));
  return out;
}
function seedFiles() {
  try { return fs.readdirSync(SEED_DIR).filter((f) => /\.zip$/i.test(f)).sort(); } catch { return []; }
}
app.get('/api/admin/backup', admin, (req, res) => {
  const full = req.query.full === '1';
  audit('owner', full ? 'full-backup-downloaded' : 'website-backup-downloaded');
  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', `attachment; filename="pick-me-${full ? 'full' : 'website'}-backup-${nepalDate()}.zip"`);
  res.send(makeBackup(full));
});
app.post('/api/admin/restore', admin, express.raw({ type: () => true, limit: '600mb' }), async (req, res) => {
  try { res.json({ ok: true, ...(await restoreBackup(req.body, 'owner')) }); } catch (e) { bad(res, e.message); }
});
app.get('/api/admin/seed', admin, (req, res) => {
  const done = meta.get().seedsUsed || [];
  const file = seedFiles().filter((f) => !done.includes(f)).pop();
  if (!file) return res.json({ file: null });
  try {
    const m = JSON.parse(new AdmZip(path.join(SEED_DIR, file)).getEntry('manifest.json').getData().toString('utf8'));
    res.json({ file, createdAt: m.createdAt });
  } catch { res.json({ file: null }); }
});
app.post('/api/admin/seed', admin, json, async (req, res) => {
  const file = seedFiles().find((f) => f === req.body.file);
  if (!file) return res.sendStatus(404);
  const m = meta.get();
  m.seedsUsed = (m.seedsUsed || []).concat(file);
  await meta.set(m);
  if (req.body.use === false) return res.json({ ok: true, skipped: true });
  try { res.json({ ok: true, ...(await restoreBackup(fs.readFileSync(path.join(SEED_DIR, file)), 'owner')) }); } catch (e) { bad(res, e.message); }
});

/* files */
app.use('/uploads', express.static(UPLOADS, {
  maxAge: '30d',
  setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"),
}));
app.use(express.static(path.join(ROOT, 'public'), {
  extensions: ['html'],
  setHeaders: (res, file) => { if (/\.(html|js|css)$/.test(file)) res.set('Cache-Control', 'no-cache'); },
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const tooBig = err && err.type === 'entity.too.large';
  if (!tooBig) console.error(err);
  res.status(tooBig ? 413 : 500).json({ error: tooBig ? 'That file is too large (8 MB at most).' : 'Something went wrong. Please try again.' });
});

(async function useSeedOnFreshStart() {
  const file = seedFiles().pop();
  if (!FRESH_START || !file) return;
  try {
    const out = await restoreBackup(fs.readFileSync(path.join(SEED_DIR, file)), 'setup');
    await meta.set(Object.assign(meta.get(), { seedsUsed: seedFiles() }));
    console.log(`Used the backup ${file}: ${out.photos} photos${out.website ? ', website content' : ''}.`);
  } catch (e) { console.error('Could not use the backup in seed/:', e.message); }
})();

app.listen(PORT, () => console.log(`Pick Me Cafe is running on port ${PORT}. Data folder: ${DATA_DIR}`));
