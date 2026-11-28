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
const soon = require('./soon');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const PROOFS = path.join(DATA_DIR, 'proofs');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');
const HISTORY = path.join(DATA_DIR, 'history');
// Pictures of the paper menu, made with Save on the Print menu page (A4 at 300 dpi). Not part of backups.
const PRINTS = path.join(DATA_DIR, 'print-menus');
for (const d of [DATA_DIR, UPLOADS, PROOFS, HISTORY, PRINTS]) fs.mkdirSync(d, { recursive: true });
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
// Version 5: items get food marks. Old menus get veg / non-veg marks guessed from item names, once.
function markFood(data) {
  let touched = false;
  for (const g of (data.menu && data.menu.categories) || []) {
    for (const it of g.items || []) {
      if (Array.isArray(it.tags)) continue;
      const n = String(it.name || '');
      it.tags = /\bveg\b/i.test(n) ? ['veg'] : /chicken|sausage|\begg\b|\bmix\b|buff|mutton|pork|\bham\b|fish|prawn|bacon/i.test(n) ? ['nonveg'] : [];
      touched = true;
    }
  }
  return touched;
}
if (markFood(content.data)) content.set(content.data);
// Version 6: new sections (Guest moments) and "where it shows" for menu, cake and gallery.
const PAGEABLE = { menu: '/menu', cake: '/cake', gallery: '/gallery', moments: '/gallery' };
function ensureSections(data) {
  if (!Array.isArray(data.sections)) return false;
  let touched = false;
  const defs = freshDefaults().sections;
  defs.forEach((d, i) => {
    if (data.sections.some((x) => x.id === d.id)) return;
    const prev = i > 0 ? data.sections.findIndex((x) => x.id === defs[i - 1].id) : -1;
    data.sections.splice(prev + 1, 0, Object.assign({}, d));
    touched = true;
  });
  for (const x of data.sections) if (x.id in PAGEABLE && !['page', 'home', 'both'].includes(x.place)) { x.place = 'page'; touched = true; }
  return touched;
}
if (ensureSections(content.data)) content.set(content.data);
// Version 7: one event shows at a time, as a slideshow of its own photos. The first photo is the main photo
// (kept in "image" too, for link previews). Photo borders are chosen once, under Colours, so events lose theirs.
function tidyEvents(data) {
  let touched = false;
  const items = data.events && Array.isArray(data.events.items) ? data.events.items : [];
  for (const e of items) {
    if (!e || typeof e !== 'object') continue;
    if (!Array.isArray(e.photos)) { e.photos = []; touched = true; }
    const keep = e.photos.filter((p) => p && typeof p === 'object' && typeof p.image === 'string' && p.image);
    if (keep.length !== e.photos.length) { e.photos = keep; touched = true; }
    if (e.image && !e.photos.some((p) => p.image === e.image)) { e.photos.unshift({ image: e.image, caption: '' }); touched = true; }
    const main = e.photos[0] ? e.photos[0].image : '';
    if ((e.image || '') !== main) { e.image = main; touched = true; }
    if ('border' in e || 'borderSite' in e) { delete e.border; delete e.borderSite; touched = true; }
  }
  for (const t of data.eventTemplates || []) if (t && 'border' in t) { delete t.border; touched = true; }
  return touched;
}
if (tidyEvents(content.data)) content.set(content.data);
// Version 10: every whole cheesecake is 1½ pounds. Their "1 Pound" size is renamed once (the price stays),
// and the paper menu's columns and lines that took "1 Pound" for a cheesecake follow the new name.
const CHEESE_SIZE = '1½ Pound';
function cheesecakePounds(data) {
  data.fixes = data.fixes && typeof data.fixes === 'object' && !Array.isArray(data.fixes) ? data.fixes : {};
  if (data.fixes.cheese15) return false;
  const renamed = new Set();
  for (const g of (data.menu && data.menu.categories) || []) {
    const group = /cheese/i.test(`${g.id} ${g.name}`);
    for (const it of g.items || []) {
      if (!group && !/cheese\s*cake/i.test(it.name || '')) continue;
      for (const p of it.prices || []) {
        if (p && p.whole && /^\s*(1|one)\s*(pound|lb|lbs|p)\.?\s*$/i.test(p.label || '')) { p.label = CHEESE_SIZE; renamed.add(it.id); }
      }
    }
  }
  const pm = data.printMenu;
  if (renamed.size && pm && Array.isArray(pm.sections)) {
    for (const sec of pm.sections) {
      const touches = (sec.rows || []).some((r) => renamed.has(r.item));
      if (!touches) continue;
      for (const col of sec.cols || []) if (Array.isArray(col.from) && col.from.some((x) => /^1 pound$/i.test(x)) && !col.from.includes(CHEESE_SIZE)) col.from.push(CHEESE_SIZE);
      for (const r of sec.rows || []) if (renamed.has(r.item) && Array.isArray(r.from)) r.from = r.from.map((x) => (typeof x === 'string' && /^1 pound$/i.test(x) ? CHEESE_SIZE : x));
    }
  }
  data.fixes.cheese15 = true;
  return true;
}
if (cheesecakePounds(content.data)) { content.data._rev = (content.data._rev || 1) + 1; content.set(content.data); }
// Version 9: the printable paper menu. On first start its sections are made from the designer's
// November 2026 menu, linked to the website menu groups (found by id or by name). Hookah is paper only.
function ensurePrintMenu(data) {
  const pm = data.printMenu;
  if (!pm || typeof pm !== 'object') return false;
  let touched = false;
  if (!Array.isArray(pm.sections)) { pm.sections = []; touched = true; }
  if (!pm.over || typeof pm.over !== 'object' || Array.isArray(pm.over)) { pm.over = {}; touched = true; }
  if (pm.made) return touched;
  const cats = (data.menu && data.menu.categories) || [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const group = (...names) => {
    for (const n of names) {
      const g = cats.find((c) => norm(c.id) === norm(n) || norm(c.name) === norm(n));
      if (g) return g.id;
    }
    return null;
  };
  const findItem = (gid, name) => {
    const g = cats.find((c) => c.id === gid);
    return g ? (g.items || []).find((it) => norm(it.name) === norm(name)) : null;
  };
  let n = 0;
  const rid = () => `pr${Date.now().toString(36)}${(n++).toString(36)}`;
  const reg = ['Regular', 'Single', ''];
  const large = ['Large', 'Double'];
  const sec = (id, title, column, groups, more) => Object.assign({
    id, title, sub: '', look: 'small', subStyle: 'none', column, show: true,
    groups: groups.filter(Boolean), cols: [{ label: '', from: reg }], rows: [], gap: 0,
  }, more);
  const hot = group('hot-coffee', 'Hot Coffee', 'Hot');
  const iced = group('iced-coffee', 'Iced Coffee', 'Ice / Cold', 'Cold Coffee');
  const ramen = group('ramen');
  const cheese = group('cheesecake', 'Cheese Cake');
  const cakes = group('cakes-pastries', 'Cakes & Pastries', 'Pastries', 'Cakes');
  const ramenRows = [['Veg Ramen', 'Plain'], ['Egg Ramen', 'Egg'], ['Sausage Ramen', 'Sausage'], ['Mix Ramen', 'Mix Ramen']]
    .map(([web, paper]) => { const it = findItem(ramen, web); return it ? { id: rid(), item: it.id, name: paper, prices: [], from: [], hide: false } : null; })
    .filter(Boolean);
  const halfRows = ['Black Forest Cake', 'White Forest Cake'].map((name) => {
    const it = findItem(cakes, name) || findItem(cheese, name);
    return it && (it.prices || []).some((p) => /half/i.test(p.label || ''))
      ? { id: rid(), item: it.id, name: `${name} (1/2 P)`, prices: [], from: [(it.prices.find((p) => /half/i.test(p.label || ''))).label, ''], hide: false, extra: true }
      : null;
  }).filter(Boolean);
  const hookah = [['Lady Killer', '650'], ['Dejuva', '650'], ['Mix Hookah', '750'], ['Iced Coconut', '']]
    .map(([name, price]) => ({ id: rid(), item: null, name, prices: [price], from: [], hide: false }));
  pm.sections = [
    sec('p-hot', 'Hot Coffee', 'left', [hot], { cols: [{ label: 'Regular / Single', from: reg }, { label: 'Large / Double', from: large }] }),
    sec('p-iced', 'Ice / Cold', 'left', [iced], { cols: [{ label: 'Regular / Single', from: reg }, { label: 'Large / Double', from: large }] }),
    sec('p-tea', 'Tea', 'left', [group('tea')]),
    sec('p-mock', 'Mock', 'left', [group('mocktails', 'Mocktail')], { look: 'big', sub: 'Tail', subStyle: 'side' }),
    sec('p-non', 'Non', 'left', [group('shakes-lattes', 'Non-Coffee', 'Shakes & Lattes')], { look: 'big', sub: 'Coffee', subStyle: 'dash' }),
    sec('p-snacks', 'Snacks', 'left', [group('snacks')]),
    sec('p-ramen', 'Ramen', 'right', [ramen], { rows: ramenRows }),
    sec('p-cakes', 'Pastries & Cakes', 'right', [cheese, cakes], { rows: halfRows, cols: [{ label: 'Pastry / Slice', from: ['Slice', 'Pastry', ''] }, { label: '1 Pound', from: ['1 Pound', 'Pound', '1½ Pound'] }] }),
    sec('p-ice', 'Ice Cream', 'right', [group('ice-cream', 'Icecream')], { look: 'big', cols: [{ label: 'Regular / Single', from: reg }, { label: 'Double', from: ['Double'] }] }),
    sec('p-hookah', 'Hookah', 'right', [], { rows: hookah }),
  ];
  // Every item of the linked groups gets a line, in website order; special lines (renamed ramen, half pounds) keep their place or go last.
  for (const s of pm.sections) {
    if (!s.groups.length) continue;
    const special = s.rows;
    const lines = [];
    for (const gid of s.groups) {
      for (const it of (cats.find((c) => c.id === gid) || {}).items || []) {
        lines.push(special.find((r) => r.item === it.id && !r.extra) || { id: rid(), item: it.id, name: '', prices: [], from: [], hide: false });
      }
    }
    s.rows = lines.concat(special.filter((r) => r.extra));
  }
  pm.made = true;
  return true;
}
if (ensurePrintMenu(content.data)) content.set(content.data);
// Version 12: the delivery area starts at the cafe's map position from "Google and link previews", once.
function deliveryCentre(data) {
  data.fixes = data.fixes && typeof data.fixes === 'object' && !Array.isArray(data.fixes) ? data.fixes : {};
  if (data.fixes.delivery12) return false;
  const seo = data.seo || {};
  if (Number(seo.lat) && Number(seo.lng) && data.delivery) { data.delivery.lat = Number(seo.lat); data.delivery.lng = Number(seo.lng); }
  data.fixes.delivery12 = true;
  return true;
}
if (deliveryCentre(content.data)) content.set(content.data);
// The cafe's own "Ask for reviews" link from its Google Business Profile (27 Nov 2026), set once if still empty.
function googleReviewLink(data) {
  data.fixes = data.fixes && typeof data.fixes === 'object' && !Array.isArray(data.fixes) ? data.fixes : {};
  if (data.fixes.googleLink27) return false;
  if (data.reviews && !data.reviews.googleLink) data.reviews.googleLink = 'https://g.page/r/CckcWxfTyjsMEBM/review';
  data.fixes.googleLink27 = true;
  return true;
}
if (googleReviewLink(content.data)) content.set(content.data);
// 28 Nov 2026: sense checks on drink extras, set once (the owner can change them later in admin).
// No whipped cream on coffee (only Iced Mocha), no extra shot where the drink is already a double, no ice choices on hot drinks,
// no sugar choices on water. A large cappuccino is a double shot, so its size says so.
function extraRules(data) {
  data.fixes = data.fixes && typeof data.fixes === 'object' && !Array.isArray(data.fixes) ? data.fixes : {};
  if (data.fixes.extraRules28) return false;
  const rules = {
    'extra-shot': { skip: 'Cappuccino | Large, Espresso | Double, Doppio, Pick Me Double Shot on Ice' },
    'whipped-cream': { only: 'Iced Mocha' },
    'less-ice': { skip: 'Hot Chocolate, Hot Milk' },
    'no-ice': { skip: 'Hot Chocolate, Hot Milk' },
  };
  for (const g of (data.extras && data.extras.groups) || []) {
    for (const o of g.options || []) {
      const r = rules[o.id] || (g.id === 'tea' && /^(less|no)-sugar$/.test(o.id) ? { skip: 'Water' } : null);
      if (!r) continue;
      if (r.only && !o.only) o.only = r.only;
      if (r.skip && !o.skip) o.skip = r.skip;
    }
  }
  for (const grp of (data.menu && data.menu.categories) || []) {
    for (const it of grp.items || []) {
      if (String(it.name || '').trim().toLowerCase() !== 'cappuccino') continue;
      for (const p of it.prices || []) if (p && /^large$/i.test(String(p.label || '').trim()) && !p.note) p.note = 'double shot';
    }
  }
  data.fixes.extraRules28 = true;
  return true;
}
if (extraRules(content.data)) { content.data._rev = (content.data._rev || 1) + 1; content.set(content.data); }
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
// Version 11: accounts, points, table calls, sold out, sales, backups (server/customers.js, mounted below).
let CUST = null;
let BILLS = null; // billing and stock (version 13), set further down
// Version 12: drivers, delivery tracking and push notifications (server/delivery.js).
let DELIV = null;

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
  sizes: 'Sizes', crops: 'Photo positions', fixes: '', categories: '', items: '', prices: '', cards: '', images: '',
  extras: 'Drink extras', upsell: 'Goes well with', seo: 'Google and link previews', closure: 'Closed notice', socialBar: 'Social buttons',
  groups: '', options: '', pairs: '', printMenu: 'Paper menu',
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
      if (trail.length === 1 && trail[0] === SECTION_NAMES.printMenu) { out.push('Paper menu design changed'); return; }
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
  // Staff and drivers both sign in with a staff login; the role decides which screen they get.
  // The phone app keeps a staff login for 5 years (until Log out, a new password, or the login is switched off).
  const payload = { r: role, exp: Date.now() + (remember === 'app' ? 5 * 365 * 864e5 : remember ? 30 * 864e5 : 12 * 3600e3) };
  if (staff) { payload.sid = staff.id; payload.v = staff.v || 0; }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}
function readSession(req) {
  // The website uses the pm_auth cookie; the phone app sends the same token in the X-PM-Auth header.
  const m = /(?:^|;\s*)pm_auth=([^;]+)/.exec(req.headers.cookie || '');
  const raw = m ? m[1] : String(req.headers['x-pm-auth'] || '');
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const good = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p || !(p.exp > Date.now())) return null;
    if (p.r === 'admin') return { role: 'admin', name: 'Owner' };
    const st = auth.get().staff.find((x) => x.id === p.sid);
    if (!(st && st.active && (st.v || 0) === (p.v || 0))) return null;
    return { role: st.role === 'driver' ? 'driver' : 'staff', name: st.name, staff: st };
  } catch { return null; }
}
const allow = (...roles) => (req, res, next) => {
  const s = readSession(req);
  if (s && roles.includes(s.role)) { req.session = s; return next(); }
  res.status(401).json({ error: 'Please log in.' });
};
const admin = allow('admin');
const desk = allow('admin', 'staff');
const who = (req) => (req.session && req.session.staff ? `${req.session.role === 'driver' ? 'driver' : 'staff'}:${req.session.staff.username}` : 'owner');
const staffPublic = (s) => ({ id: s.id, username: s.username, name: s.name, role: s.role === 'driver' ? 'driver' : 'staff', phone: s.phone || '', active: Boolean(s.active), createdAt: s.createdAt, lastLoginAt: s.lastLoginAt || '' });
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
const PAY_LABEL = { later: 'Pay later', esewa: 'eSewa', fonepay: 'Fonepay', cod: 'Cash on delivery' };
const person = (x) => [x.name || 'Guest', x.phone].filter(Boolean).join(', ');
function orderText(o) {
  return [
    `Order ${o.id}`,
    person(o),
    `${TYPE_LABEL[o.type]}${o.address ? `: ${o.address}` : ''}${o.tableNo ? `, table ${o.tableNo}` : ''}`,
    o.schedule ? `For: ${o.schedule.bs || o.schedule.date} at ${o.schedule.time}` : 'For: as soon as possible',
    '',
    ...o.lines.map((l) => `${l.qty} x ${lineName(l)} = Rs. ${l.qty * l.price}`),
    o.deliveryFee ? `Delivery = Rs. ${o.deliveryFee}` : null,
    o.points && o.points.used ? `Points used = -Rs. ${o.points.value || o.points.used}` : null,
    o.points && o.points.asked && !o.points.used ? `Wants to use ${o.points.asked} points (staff to approve)` : null,
    `Total: Rs. ${o.total}`,
    o.cakeMessage ? `On the cake: ${o.cakeMessage}` : null,
    o.occasion ? `Occasion: ${o.occasion}` : null,
    o.notes ? `Notes: ${o.notes}` : null,
    `Payment: ${PAY_LABEL[o.payment.method] || o.payment.method}${o.payment.change ? `, bring change for Rs. ${o.payment.change}` : ''}${o.payment.txn ? `, code ${o.payment.txn}` : ''}${o.payment.proof ? ', screenshot uploaded' : ''}`,
    o.location ? `Map: https://www.google.com/maps?q=${o.location.lat},${o.location.lng}` : null,
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
// The old Railway address forwards everything to the cafe's own domain (same path), so the address bar
// shows pickmecafe.com.np. 308 for POST/PUT etc. keeps the method and body.
const PUBLIC_HOST = String(process.env.PUBLIC_HOST || 'pickmecafe.com.np').trim().toLowerCase();
app.use((req, res, next) => {
  const host = String(req.get('host') || '').toLowerCase().split(':')[0];
  if (!PUBLIC_HOST || !host.endsWith('.up.railway.app')) return next();
  res.redirect(req.method === 'GET' || req.method === 'HEAD' ? 301 : 308, `https://${PUBLIC_HOST}${req.originalUrl}`);
});
const rawImage = express.raw({ type: () => true, limit: '8mb' });
const json = express.json({ limit: '3mb' });

app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ---------- pages: what Google and link previews (WhatsApp, Facebook) read ---------- */
// Cloudflare tells browsers to keep .js and .css files for 4 hours, so every page asks for them with this
// version (?v=...), which changes with each deploy. New versions are then loaded at once.
const BUILD = String(process.env.RAILWAY_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 10);
const stamp = (html) => html
  .replace(/(src|href)="(\/(?:js|css|vendor)\/[^"?]+\.(?:js|css))"/g, `$1="$2?v=${BUILD}"`)
  .replace('</head>', `<script>window.PM_V = '${BUILD}';</script>\n</head>`);
const PAGE = stamp(fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8'));
const PRINT_PAGE = stamp(fs.readFileSync(path.join(ROOT, 'public', 'print-menu.html'), 'utf8'));
const COUNTER_PAGE = stamp(fs.readFileSync(path.join(ROOT, 'public', 'counter.html'), 'utf8'));
app.get(['/counter', '/counter/', '/counter.html'], (req, res) => { res.set('Cache-Control', 'no-cache'); res.type('html').send(COUNTER_PAGE); });
// The delivery driver's page (version 12): his deliveries, steps, and live location while the page is open.
const DRIVER_PAGE = stamp(fs.readFileSync(path.join(ROOT, 'public', 'driver.html'), 'utf8'));
// Billing at the counter (version 13): make, print and look up bills.
const BILL_PAGE = stamp(fs.readFileSync(path.join(ROOT, 'public', 'bill.html'), 'utf8'));
app.get(['/bill', '/bill/', '/bill.html'], (req, res) => { res.set('Cache-Control', 'no-cache'); res.set('X-Robots-Tag', 'noindex, nofollow'); res.type('html').send(BILL_PAGE); });
app.get(['/driver', '/driver/', '/driver.html'], (req, res) => { res.set('Cache-Control', 'no-cache'); res.set('X-Robots-Tag', 'noindex, nofollow'); res.type('html').send(DRIVER_PAGE); });
// Map pages shown inside the phone app (version 12): choose the delivery spot, and follow the driver.
const MAP_PAGES = { pick: stamp(fs.readFileSync(path.join(ROOT, 'public', 'm-pick.html'), 'utf8')), track: stamp(fs.readFileSync(path.join(ROOT, 'public', 'm-track.html'), 'utf8')) };
app.get('/m/:page', (req, res) => {
  const html = MAP_PAGES[req.params.page];
  if (!html) return res.sendStatus(404);
  res.set('Cache-Control', 'no-cache');
  res.set('X-Robots-Tag', 'noindex');
  // The app's web preview shows these in a frame on the same site.
  res.type('html').send(html);
});
const attr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const siteBase = (req) => `${req.protocol}://${req.get('host')}`;
const absUrl = (base, u) => (/^https?:\/\//i.test(u || '') ? u : /^\/(?!\/)/.test(u || '') ? base + u : '');
function liveEvents(c, includeComing) {
  const today = nepalDate();
  return (c.events.items || []).filter((e) => {
    if (e.enabled === false || !/^\d{4}-\d{2}-\d{2}$/.test(e.start || '') || !e.id) return false;
    const end = new Date(Date.parse(e.start) + (Number(e.days) || 1) * 864e5).toISOString().slice(0, 10);
    return (includeComing || e.start <= today) && today < end;
  });
}
// Structured details for Google: what the cafe is, where, when it is open, and the menu with prices.
function cafeData(c, base) {
  const seo = c.seo || {};
  const d = String(c.brand.phone || c.brand.whatsapp || '').replace(/\D/g, '');
  const phone = /^9\d{9}$/.test(d) ? `+977-${d}` : d ? `+${d}` : undefined;
  const parts = String(c.brand.address || '').split(',').map((x) => x.trim()).filter(Boolean);
  const sections = (c.menu.categories || []).filter((g) => !g.hidden).map((g) => ({
    '@type': 'MenuSection',
    name: g.name,
    hasMenuItem: (g.items || []).filter((it) => !it.hidden).map((it) => {
      const p = (it.prices || []).filter((x) => Number(x.price) > 0);
      return {
        '@type': 'MenuItem',
        name: it.name,
        ...(it.desc ? { description: it.desc } : {}),
        ...((it.tags || []).includes('veg') ? { suitableForDiet: 'https://schema.org/VegetarianDiet' } : {}),
        offers: p.map((x) => ({ '@type': 'Offer', name: x.label || undefined, price: Number(x.price), priceCurrency: 'NPR' })),
      };
    }).filter((x) => x.offers.length),
  })).filter((x) => x.hasMenuItem.length);
  const prices = sections.flatMap((x) => x.hasMenuItem.flatMap((i) => i.offers.map((o) => o.price)));
  const image = absUrl(base, seo.image || c.hero.image);
  return {
    '@context': 'https://schema.org',
    '@type': 'CafeOrCoffeeShop',
    '@id': base + '/#cafe',
    name: c.brand.name,
    url: base + '/',
    ...(image ? { image: [image] } : {}),
    ...(phone ? { telephone: phone } : {}),
    address: { '@type': 'PostalAddress', streetAddress: parts.slice(0, 2).join(', '), addressLocality: seo.city || 'Hetauda', addressRegion: seo.region || undefined, addressCountry: 'NP' },
    ...(Number(seo.lat) && Number(seo.lng) ? { geo: { '@type': 'GeoCoordinates', latitude: Number(seo.lat), longitude: Number(seo.lng) } } : {}),
    ...(/^https?:/.test(c.visit.mapLink || '') ? { hasMap: c.visit.mapLink } : {}),
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: c.brand.open, closes: c.brand.close }],
    servesCuisine: ['Coffee', 'Cheesecake', 'Mocktails', 'Desserts'],
    ...(prices.length ? { priceRange: `Rs. ${Math.min(...prices)} to Rs. ${Math.max(...prices)}` } : {}),
    currenciesAccepted: 'NPR',
    acceptsReservations: true,
    hasMenu: { '@type': 'Menu', url: base + '/#menu', hasMenuSection: sections },
    sameAs: (c.social || []).filter((x) => x.show !== false && /^https?:\/\//.test(x.url || '')).map((x) => x.url),
  };
}
function renderPage(req, opts) {
  const c = content.get();
  const base = siteBase(req);
  const seo = c.seo || {};
  const o = Object.assign({ title: seo.title || c.brand.name, description: seo.description || '', image: seo.image || c.hero.image, url: base + '/' }, opts || {});
  const image = absUrl(base, o.image);
  const head = [
    `<link rel="canonical" href="${attr(o.url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${attr(c.brand.name)}">`,
    `<meta property="og:title" content="${attr(o.title)}">`,
    `<meta property="og:description" content="${attr(o.description)}">`,
    `<meta property="og:url" content="${attr(o.url)}">`,
    image ? `<meta property="og:image" content="${attr(image)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    o.noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
    o.noindex ? '' : `<script type="application/ld+json">${JSON.stringify(cafeData(c, base)).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n');
  return PAGE
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(o.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(o.description)}">`)
    .replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${attr(/^#[0-9a-f]{3,8}$/i.test(c.theme.bg || '') ? c.theme.bg : '#FBF6EE')}">`)
    .replace('<!--SEO-->', head);
}
const sendPage = (res, html) => { res.set('Cache-Control', 'no-cache'); res.type('html').send(html); };

/* ---------- opening soon: public pages show the invitation page until the launch time ---------- */
// LAUNCH_AT (Railway variable) can move the time; default Saturday 28 Nov 2026, 3 PM Nepal time.
const LAUNCH_AT = Date.parse(process.env.LAUNCH_AT || '2026-11-28T15:00:00+05:45');
const PREVIEW_KEY = String(process.env.PREVIEW_KEY || '').trim();
const SOON_PATHS = /^\/(?:index\.html|menu|cake|gallery|event\/[^/]+)?\/?$/;
const previewMark = () => sign('preview:' + PREVIEW_KEY);
const hasPreview = (req) => {
  if (!PREVIEW_KEY) return false;
  const m = /(?:^|;\s*)pm_preview=([^;]+)/.exec(req.headers.cookie || '');
  return Boolean(m && m[1] === previewMark());
};
const soonNow = () => Number.isFinite(LAUNCH_AT) && Date.now() < LAUNCH_AT;
function previewCookie(req, res) {
  const age = Math.max(0, Math.round((LAUNCH_AT - Date.now()) / 1000)) + 7 * 86400;
  res.set('Set-Cookie', `pm_preview=${previewMark()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${req.secure ? '; Secure' : ''}`);
}
const keyOk = (k) => Boolean(PREVIEW_KEY) && typeof k === 'string' && k.length === PREVIEW_KEY.length
  && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(PREVIEW_KEY));
// The private link for the owner and staff: opens the real website on this phone or computer until the launch.
app.get('/preview/:key', (req, res) => {
  if (keyOk(req.params.key)) previewCookie(req, res);
  res.set('Cache-Control', 'no-store');
  res.redirect(302, '/');
});
app.get('/opening.ics', (req, res) => {
  if (!Number.isFinite(LAUNCH_AT)) return res.sendStatus(404);
  res.set('Cache-Control', 'no-cache');
  res.type('text/calendar').set('Content-Disposition', 'inline; filename="pick-me-cafe-opening.ics"');
  res.send(soon.calendar(content.get(), siteBase(req), LAUNCH_AT).ics);
});
app.use((req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !SOON_PATHS.test(req.path) || !soonNow()) return next();
  if (keyOk(req.query.preview)) { previewCookie(req, res); return res.redirect(302, req.path); }
  // ?soon=1 always shows the opening page (lets the logged-in owner see what guests see).
  if (req.query.soon === undefined && (req.query.table || readSession(req) || hasPreview(req))) return next();
  const c = content.get();
  const base = siteBase(req);
  res.set('Cache-Control', 'no-store');
  res.type('html').send(soon.soonPage({ c, base, launch: LAUNCH_AT, absUrl, cafeJson: JSON.stringify(cafeData(c, base)).replace(/</g, '\\u003c') }));
});

app.get(['/', '/index.html'],(req, res) => sendPage(res, renderPage(req)));
// /admin is an easier address to type and share than /#admin. Both open the editor.
app.get(['/admin', '/admin/'], (req, res) => sendPage(res, renderPage(req, { noindex: true, title: 'Admin | ' + content.get().brand.name })));
// The paper menu editor (owner only; the page asks for the password when needed).
app.get(['/admin/print-menu', '/admin/print-menu/'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.type('html').send(PRINT_PAGE);
});
// Privacy policy, for the website and the phone app (the App Store asks for one). Names and numbers come from Cafe details.
app.get(['/privacy', '/privacy/'], (req, res) => {
  const b = content.get().brand;
  const phone = attr(b.phone || '');
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy | ${attr(b.name)}</title><link rel="icon" href="/img/logo.png">
<style>body{margin:0;background:#FBF6EE;color:#3B2A1A;font:16px/1.65 -apple-system,"Segoe UI",Roboto,Arial,sans-serif}main{width:min(720px,100% - 32px);margin:40px auto 60px}h1{font:500 2rem Georgia,serif;margin:0 0 4px}h2{font:500 1.2rem Georgia,serif;margin:26px 0 6px}p,li{color:#4E3D2C}a{color:#7A5A22}small{color:#6F5B48}</style></head>
<body><main><p><a href="/">${attr(b.name)}</a></p><h1>Privacy</h1><small>For the ${attr(b.name)} website and phone app. Last updated 27 November 2026.</small>
<h2>What we collect</h2><p>Only what you type when you order, pre-order a cake, book a table, leave a review or send us a message: your name (optional), phone number, delivery address for deliveries, table number, your order and notes, and a payment screenshot or transaction code if you choose to pay by eSewa or Fonepay. A cake design photo, if you add one.</p>
<p>If you choose to make an account (it is optional): your email address or phone number, a login ID if you choose one, your password (stored only in a scrambled form we cannot read), and, if you add them, your name, delivery address, birthday (month and day) and whether you want to hear about offers.</p>
<p>Loyalty points: the points each order earns or uses, kept with the phone number given with the order.</p>
<p>Your phone or browser keeps a random number and the numbers of your orders, so it can show your orders and their status. It does not identify you to anyone else.</p>
<h2>Why</h2><p>To make and deliver your order, confirm payments and bookings, call or message you about them, show you your past orders, and keep your loyalty points. The phone app also keeps your order numbers on your phone so it can show their status and notify you. We use your email or phone only to send you sign-in codes, and offers only if you ticked that you want them.</p>
<h2>What we do not do</h2><ul><li>We do not sell or share your details with advertisers.</li><li>We do not use tracking or advertising cookies. The website uses small sign-in cookies only: one for your account if you sign in, one for cafe staff.</li><li>We never see your eSewa, Fonepay or bank login. Payments happen in those apps.</li></ul>
<h2>Who sees it</h2><p>Only the cafe owner and staff, on the cafe's order screen. The website is hosted by a cloud provider that stores the data for us, and sign-in codes are sent by an email (or SMS) service.</p>
<h2>How long, and deleting your account</h2><p>Orders and bookings are kept for the cafe's records. Points run out after the time shown on the website. You can delete your account at any time in Settings (Delete my account): your login, details and points are removed, and your past orders stay in the cafe's records without your account. You can also ask us and we will delete your details.</p>
<h2>Contact</h2><p>${attr(b.name)}, ${attr(b.address || '')}.${phone ? ` Phone or WhatsApp: <a href="tel:${phone}">${phone}</a>.` : ''}</p>
</main></body></html>`);
});
// Each event has its own address, so a shared link shows the event's photo and title.
app.get('/event/:id', (req, res) => {
  const c = content.get();
  const e = (c.events.items || []).find((x) => x.id === req.params.id && x.enabled !== false);
  if (!e) return res.redirect(302, '/');
  sendPage(res, renderPage(req, {
    title: `${e.title} | ${c.brand.name}`,
    description: e.message || e.text || (c.seo || {}).description,
    image: e.image || (e.photos || []).map((p) => p.image).find(Boolean) || '',
    url: `${siteBase(req)}/event/${encodeURIComponent(e.id)}`,
  }));
});
// Menu, Order a Cake and the galleries have their own pages.
const PAGES = {
  menu: { title: 'Menu', description: 'The Pick Me Cafe menu with prices in NPR: coffee, cheesecake, mocktails, cakes, ice cream and snacks. Order for pickup, delivery in Hetauda, or at your table.' },
  cake: { title: 'Order a Cake', description: 'Pre-order a whole cake from Pick Me Cafe, Hetauda: cheesecakes, black forest, red velvet and more, with a name or message on top.' },
  gallery: { title: 'Gallery', description: 'Photos from Pick Me Cafe in Sigreni, Hetauda, and our guests.' },
};
for (const [key, pg] of Object.entries(PAGES)) {
  app.get([`/${key}`, `/${key}/`], (req, res) => {
    const c = content.get();
    sendPage(res, renderPage(req, { title: `${pg.title} | ${c.brand.name}`, description: pg.description, url: `${siteBase(req)}/${key}`, ...(key === 'cake' && c.cake.image ? { image: c.cake.image } : {}) }));
  });
}
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /counter\nDisallow: /driver\nDisallow: /bill\nDisallow: /api/\n\nSitemap: ${siteBase(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const base = siteBase(req);
  const urls = [`${base}/`, ...Object.keys(PAGES).map((k) => `${base}/${k}`), ...liveEvents(content.get(), true).map((e) => `${base}/event/${encodeURIComponent(e.id)}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${attr(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
});
// Lets people add the website to their phone's home screen like an app.
app.get('/manifest.webmanifest', (req, res) => {
  const c = content.get();
  const logo = /^(\/(?!\/)|https:\/\/)/.test(c.brand.logo || '') ? c.brand.logo : '/img/logo.png';
  res.type('application/manifest+json').send(JSON.stringify({
    name: c.brand.name, short_name: c.brand.shortName || c.brand.name, start_url: '/', display: 'standalone',
    background_color: c.theme.bg || '#FBF6EE', theme_color: c.theme.bg || '#FBF6EE',
    icons: [{ src: logo, sizes: 'any', purpose: 'any' }],
  }));
});

/* public: content and reviews */
const soldOutNow = () => [...new Set([...(CUST ? CUST.soldOutIds() : []), ...(BILLS ? BILLS.stockOutIds() : [])])];
app.get('/api/content', (req, res) => res.json(Object.assign({}, content.get(), { soldOut: soldOutNow() })));
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
  const groups = (c.menu.categories || []).map((g) => ({ id: g.id, items: g.items, hidden: g.hidden, timeFrom: g.timeFrom, timeTo: g.timeTo }))
    .concat((c.events.items || []).filter((e) => e.enabled !== false).map((e) => ({ id: 'event-' + e.id, items: e.menu })));
  for (const g of groups) {
    for (const it of g.items || []) {
      if (it.id !== itemId) continue;
      const p = (it.prices || []).find((x) => (x.label || '') === (label || ''));
      if (!p) return null;
      const off = g.hidden || it.hidden || it.available === false || (CUST && CUST.soldOutIds().includes(it.id)) || (BILLS && BILLS.stockZero(it.id, label));
      // An item (or its group) can be served only between two times, for example a morning combo.
      const hours = it.timeFrom || it.timeTo ? { from: it.timeFrom, to: it.timeTo } : (g.timeFrom || g.timeTo ? { from: g.timeFrom, to: g.timeTo } : null);
      return { item: Object.assign({}, it, { available: off ? false : it.available }), price: p, group: g.id, hours };
    }
  }
  return null;
}
// Choices a customer can add to an item (less sugar, extra shot), from the extras sets that cover its menu group.
// Each extra can also say "only for" or "not for" some items (names, comma between; "Cappuccino | Large" = that size only),
// so a whipped cream or an extra shot is never offered where it makes no sense.
function ruleHit(list, name, label) {
  const low = (x) => String(x || '').trim().toLowerCase();
  return String(list || '').split(',').some((e) => {
    const [n, s] = e.split('|');
    return low(n) && low(n) === low(name) && (s === undefined || !low(s) || low(s) === low(label));
  });
}
function extraAllowed(o, name, label) {
  if (o.only && String(o.only).trim() && !ruleHit(o.only, name, label)) return false;
  if (o.skip && ruleHit(o.skip, name, label)) return false;
  return true;
}
function extrasFor(groupId, itemName, label) {
  const x = content.get().extras || {};
  if (x.show === false) return [];
  const out = [];
  for (const g of x.groups || []) {
    if (g.show === false || !(g.categories || []).includes(groupId)) continue;
    for (const o of g.options || []) if (o.show !== false && o.id && o.name && extraAllowed(o, itemName, label) && !out.some((y) => y.id === o.id)) out.push(o);
  }
  return out;
}
// How many pounds a cake size is, read from its name ("Half Pound", "1 Pound", "2 lb", "1 kg").
function pounds(label) {
  const t = String(label || '').toLowerCase().replace(/(\d)\s*(?:½|1\/2|and a half|and half|& half)/, '$1.5').replace(/½/, '0.5').replace(/(^|\D)1\/2/, (m, a) => `${a}0.5`);
  if (/half/.test(t)) return 0.5;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(pound|lb|kg)/);
  if (!m) return 1;
  return m[2] === 'kg' ? Number(m[1]) * 2.2 : Number(m[1]);
}
const cakeOptions = () => ((content.get().cake || {}).options || []).filter((o) => o.show !== false && o.id && o.name);
const t12 = (t) => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const lineName = (l) => `${l.name}${l.label ? ` (${l.label})` : ''}${l.extras && l.extras.length ? ` + ${l.extras.join(', ')}` : ''}`;
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
    return minLeadHours ? `This cake needs at least ${minLeadHours} hours notice. Please choose a later time.` : 'That time has already passed. Please choose a later time.';
  }
  if (ts > Date.now() + 180 * 864e5) return 'Please choose a date within the next 6 months.';
  return null;
}
const PHONE = /^\+?\d[\d\s-]{6,17}$/;
// Straight-line distance in km between two map points (for the delivery area).
function distanceKm(a, b) {
  if (!a || !b || !Number(b.lat) || !Number(b.lng)) return NaN;
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

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
  // The delivery spot chosen on the map (version 12). Deliveries are inside the delivery area only.
  let location = null;
  if (type === 'delivery' && b.location && typeof b.location === 'object') {
    const lat = Number(b.location.lat);
    const lng = Number(b.location.lng);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)) {
      location = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, acc: Math.round(Number(b.location.acc) || 0) };
      const area = c.delivery || {};
      const km = distanceKm(location, area);
      if (Number(area.radiusKm) > 0 && Number.isFinite(km) && km > Number(area.radiusKm)) return bad(res, `That spot is ${km.toFixed(1)} km from us. We deliver inside Hetauda only (up to ${area.radiusKm} km). Please move the pin, or choose Pickup.`);
    }
  }

  if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 60) return bad(res, 'Your cart is empty.');
  const lines = [];
  let hasWhole = false;
  let extraNotice = 0;
  const timed = [];
  const changedMsg = 'Something in your cart has changed. Please refresh the page and add it again.';
  for (const l of b.lines) {
    const found = findPrice(str(l.itemId, 120), str(l.label, 60));
    const qty = Math.round(Number(l.qty));
    if (!found || !(qty >= 1 && qty <= 50)) return bad(res, changedMsg);
    if (found.item.available === false || !(Number(found.price.price) > 0)) return bad(res, `${found.item.name} is not available right now. Please remove it from your cart.`);
    const whole = Boolean(found.price.whole);
    if (whole) hasWhole = true;
    // Extras and cake choices are priced here, never by the browser.
    const asked = Array.isArray(l.extras) ? [...new Set(l.extras.map((x) => str(x, 60)).filter(Boolean))].slice(0, 12) : [];
    const allowed = whole ? cakeOptions() : extrasFor(found.group, found.item.name, found.price.label || '');
    const picked = [];
    let add = 0;
    for (const id of asked) {
      const o = allowed.find((x) => x.id === id);
      if (!o) {
        const any = !whole && (content.get().extras || {}).groups && ((content.get().extras.groups || []).flatMap((g) => g.options || [])).find((x) => x.id === id);
        return bad(res, any ? `${any.name} is not available with ${found.item.name}${found.price.label ? ` (${found.price.label})` : ''}. Please remove it and try again.` : changedMsg);
      }
      const cost = Math.max(0, Number(o.price) || 0) * (whole && o.perPound ? pounds(found.price.label) : 1);
      add += Math.round(cost);
      picked.push(o.name);
      if (whole) extraNotice = Math.max(extraNotice, Number(o.notice) || 0);
    }
    if (found.hours) timed.push({ name: found.item.name, ...found.hours });
    lines.push({ itemId: found.item.id, name: found.item.name, label: found.price.label || '', extras: picked, extraIds: asked, price: Number(found.price.price) + add, qty, whole });
  }

  let schedule = null;
  const servedAt = (time) => {
    for (const t of timed) {
      if ((t.from && time < t.from) || (t.to && time > t.to)) {
        return `${t.name} is served ${t.from && t.to ? `from ${t12(t.from)} to ${t12(t.to)}` : t.from ? `after ${t12(t.from)}` : `until ${t12(t.to)}`}. Please remove it or choose another time.`;
      }
    }
    return '';
  };
  if (b.when === 'later' || hasWhole) {
    const date = str(b.date, 10);
    const time = str(b.time, 5);
    const err = checkSchedule(date, time, hasWhole ? Math.max(Number(c.cake.noticeHours) || 0, extraNotice) : 0) || servedAt(time);
    if (err) return bad(res, err);
    schedule = { date, time, bs: str(b.dateBs, 40) };
    const shut = closedFor(date);
    if (shut) return bad(res, `${shut} Please choose a later date.`);
  } else {
    const shut = closedFor('');
    if (shut) return bad(res, closedNotice().allowLater ? `${shut} You can still order for a later day: choose "Later".` : shut);
    const now = nepalTime();
    if (now < c.brand.open || now > c.brand.close) return bad(res, `We are closed right now (open ${c.brand.hoursText}). Choose "Later" to schedule your order.`);
    const off = servedAt(now);
    if (off) return bad(res, off);
  }

  // Paying online is optional. Without it the order is "pay later" (at the counter or on delivery).
  let method = str(b.method, 20);
  // Cash on delivery (version 12) is for deliveries; the guest can ask us to bring change for one note.
  const cod = method === 'cod' && type === 'delivery' && ((c.features || {}).cod !== false);
  if (!cod && (!['esewa', 'fonepay'].includes(method) || !c.payment[method] || c.payment[method].enabled === false)) method = 'later';
  const change = cod && [500, 1000].includes(Number(b.change)) ? Number(b.change) : 0;
  // Staff call the guest to confirm every online payment, so paying now needs a phone number.
  if (method !== 'later' && !PHONE.test(phone)) return bad(res, 'Please enter your phone number: we call you to confirm the payment.');
  const proof = method !== 'later' && proofExists(str(b.proof, 40)) ? str(b.proof, 40) : '';
  const txn = method !== 'later' ? str(b.txn, 60) : '';
  const refPhoto = hasWhole && proofExists(str(b.refPhoto, 40)) ? str(b.refPhoto, 40) : '';

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const deliveryFee = type === 'delivery' ? Number(c.payment.deliveryFee) || 0 : 0;
  const order = {
    id: newCode(hasWhole ? 'CAKE' : 'PM'),
    // A private key lets the customer's phone app follow this order's status.
    key: crypto.randomBytes(12).toString('hex'),
    source: str(b.source, 10) === 'app' ? 'app' : 'web',
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
    payment: { method, proof, txn, ...(change ? { change } : {}) },
    ...(location ? { location } : {}),
  };
  // Account and points (server/customers.js): links the order to a signed-in customer and takes points off.
  const pointsError = await CUST.onPlace(order, b, req);
  if (pointsError) return bad(res, pointsError);
  await orders.set([order, ...orders.get()]);
  await CUST.afterPlace(order);
  if (BILLS) await BILLS.takeStock(order.lines.map((l) => ({ key: `${l.itemId}|${l.label || ''}`, qty: l.qty }))).catch(() => {});
  DELIV.onNewOrder(order);
  audit('public', 'order-placed', order.id);
  notify(`New order ${order.id}: Rs. ${order.total}`, orderText(order));
  res.json({ ok: true, id: order.id, key: order.key, total: order.total, points: order.points || null, text: orderText(order) });
});

/* public: order and booking status, for the phone app (needs the private key given when it was placed) */
const sameKey = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && a.length > 0
  && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
app.get('/api/orders/:id/status', limit('status', 600, 15 * 60e3), (req, res) => {
  const o = orders.get().find((x) => x.id === req.params.id);
  if (!o || !sameKey(o.key, str(req.query.key, 40))) return res.status(404).json({ error: 'We could not find that order.' });
  const last = (o.log || [])[(o.log || []).length - 1];
  res.json({
    id: o.id, status: o.status, paid: Boolean(o.paid), type: o.type, total: o.total, createdAt: o.createdAt,
    updatedAt: last ? last.at : o.createdAt, schedule: o.schedule, hasWhole: Boolean(o.hasWhole), tableNo: o.tableNo || '',
    points: o.points ? { used: o.points.used || 0, asked: o.points.asked || 0, approved: o.points.approved } : null, pointsEarned: o.pointsEarned || 0,
    payment: { method: o.payment.method, change: o.payment.change || 0 }, delivery: DELIV.trackFor(o),
    subtotal: o.subtotal, deliveryFee: o.deliveryFee || 0,
    lines: (o.lines || []).map((l) => ({ itemId: l.itemId, name: l.name, label: l.label, qty: l.qty, price: l.price, extras: l.extras || [], extraIds: l.extraIds || [], whole: Boolean(l.whole) })),
  });
});
app.get('/api/bookings/:id/status', limit('status', 600, 15 * 60e3), (req, res) => {
  const b = bookings.get().find((x) => x.id === req.params.id);
  if (!b || !sameKey(b.key, str(req.query.key, 40))) return res.status(404).json({ error: 'We could not find that booking.' });
  const last = (b.log || [])[(b.log || []).length - 1];
  res.json({ id: b.id, status: b.status, people: b.people, date: b.date, time: b.time, bs: b.bs, updatedAt: last ? last.at : b.createdAt });
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
    key: crypto.randomBytes(12).toString('hex'),
    source: str(b.source, 10) === 'app' ? 'app' : 'web',
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
  res.json({ ok: true, id: booking.id, key: booking.key, text: bookingText(booking) });
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
    const role = st.role === 'driver' ? 'driver' : 'staff';
    audit(`${role}:${st.username}`, 'login');
    const token = issue('staff', req.body.app ? 'app' : remember, st);
    setCookie(req, res, token, remember);
    return res.json({ ok: true, role, name: st.name, ...(req.body.app ? { token } : {}) });
  }
  if (!checkHash(a, req.body.password)) {
    loginFailed(req);
    audit('owner', 'login-failed');
    return res.status(401).json({ error: 'Wrong password.' });
  }
  audit('owner', 'login');
  const token = issue('admin', remember || Boolean(req.body.app));
  setCookie(req, res, token, remember);
  res.json({ ok: true, role: 'admin', name: 'Owner', ...(req.body.app ? { token } : {}) });
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
  delete next.soldOut;
  next.fixes = Object.assign({}, current.fixes, next.fixes);
  tidyEvents(next);
  ensurePrintMenu(next);
  const changes = describeChanges(current, next);
  if (!listHistory().length) await addHistory({ at: new Date().toISOString(), by: 'owner', note: 'Website before your first save', changes: [] }, current);
  next._rev = current._rev + 1;
  await content.set(next);
  const note = str(req.query.note, 80);
  await addHistory({ at: new Date().toISOString(), by: 'owner', note, changes }, next);
  audit('owner', note ? `website-saved (${note})` : 'website-saved');
  await dropUnusedMomentFiles(next);
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
  if (req.query.moment === '1') await noteMomentFile(file);
  res.json({ url: `/uploads/${file}` });
});
// Full-quality photos for guest albums (a photographer's photos can be large).
app.post('/api/admin/upload-full', admin, express.raw({ type: () => true, limit: '40mb' }), async (req, res) => {
  const ext = sniffImage(req.body, false);
  if (!ext) return bad(res, 'Please upload a PNG, JPG or WEBP photo.');
  const file = `${crypto.randomBytes(10).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOADS, file), req.body);
  await noteMomentFile(file);
  res.json({ url: `/uploads/${file}` });
});
// Album photos are deleted from disk once no saved album uses them (after "Delete album" and Save).
async function noteMomentFile(file) {
  const m = meta.get();
  m.momentFiles = (m.momentFiles || []).concat(file).slice(-5000);
  await meta.set(m);
}
async function dropUnusedMomentFiles(data) {
  const m = meta.get();
  const list = m.momentFiles || [];
  if (!list.length) return;
  const used = JSON.stringify(data);
  const keep = [];
  for (const file of list) {
    if (used.includes(`/uploads/${file}`)) { keep.push(file); continue; }
    await fs.promises.unlink(path.join(UPLOADS, file)).catch(() => {});
  }
  if (keep.length !== list.length) { m.momentFiles = keep; await meta.set(m); }
}
const albumLive = (a) => {
  const today = nepalDate();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : today;
  const end = new Date(Date.parse(start) + Math.max(1, Number(a.days) || 1) * 864e5).toISOString().slice(0, 10);
  return start <= today && today < end;
};
// Download a whole album as one .zip (only albums that allow downloads and are showing).
app.get('/api/moments/:id.zip', limit('zip', 30, 15 * 60e3), (req, res) => {
  const a = ((content.get().moments || {}).albums || []).find((x) => x.id === req.params.id);
  if (!a || !a.download || !albumLive(a)) return res.status(404).send('This album is not available to download.');
  const zip = new AdmZip();
  let n = 0;
  for (const ph of a.photos || []) {
    const u = String(ph.full || ph.image || '');
    const m = u.match(/^\/uploads\/([a-f0-9]{16,40}\.(?:png|jpe?g|webp|gif))$/);
    if (!m) continue;
    const fp = path.join(UPLOADS, m[1]);
    if (!fs.existsSync(fp)) continue;
    n += 1;
    zip.addFile(`Pick-Me-${String(n).padStart(2, '0')}${path.extname(m[1])}`, fs.readFileSync(fp));
  }
  if (!n) return res.status(404).send('No photos to download.');
  const name = String(a.title || 'Pick Me photos').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') || 'Pick-Me-photos';
  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', `attachment; filename="${name}.zip"`);
  res.send(zip.toBuffer());
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
  const st = { id: 's_' + crypto.randomBytes(6).toString('hex'), username, name, role: req.body.role === 'driver' ? 'driver' : 'staff', phone: str(req.body.phone, 20), ...makeHash(req.body.password), active: true, v: 1, createdAt: new Date().toISOString() };
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
  if (req.body.phone !== undefined) st.phone = str(req.body.phone, 20);
  if (['staff', 'driver'].includes(req.body.role) && req.body.role !== (st.role || 'staff')) { st.role = req.body.role; st.v = (st.v || 0) + 1; audit('owner', 'staff-role', `${st.username} ${st.role}`); }
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
    const before = row.status;
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
    if (name === 'orders' && row.status !== before) { await CUST.onStatus(row, before, who(req)); DELIV.onStatus(row); }
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
      o.lines.map((l) => `${l.qty} x ${lineName(l)}`).join('; '),
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
CUST = require('./customers')({
  app, Store, json, str, bad, limit, content, orders, bookings, reviews, messages, audit, desk, admin, who, meta, AdmZip, notify,
  sign: (body) => sign(body), makeHash, checkHash, NP_OFFSET, DATA_DIR,
  onTableCall: (c) => DELIV && DELIV.onTableCall(c),
});
DELIV = require('./delivery')({
  app, Store, json, str, bad, limit, content, orders, auth, audit, allow, who, readSession, staffPublic,
  readCust: (req) => CUST.readCust(req),
  onStatusChange: (o, before, by) => CUST.onStatus(o, before, by),
});
// Version 13: bills made at the counter (server/billing.js).
BILLS = require('./billing')({
  app, Store, json, str, bad, content, orders, audit, desk, admin, who, NP_OFFSET,
  isOwner: (req) => { const s = readSession(req); return Boolean(s && s.role === 'admin'); },
  // The owner's password typed at the counter (for a big discount). Wrong tries count like wrong logins.
  ownerOk: (req, pw) => { if (loginBlocked(req)) return false; const ok = checkHash(auth.get(), pw); if (!ok) loginFailed(req); return ok; },
  loyalty: { on: () => CUST.pointsOn(), rules: () => CUST.loyaltyRules(), normPhone: (p) => CUST.normPhone(p), balance: (p) => CUST.pointsOf(p).balance, add: (...a) => CUST.addPoints(...a) },
});
function makeBackup(full) {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({ kind: BACKUP_KIND, format: 1, createdAt: new Date().toISOString(), full: Boolean(full), cafe: content.get().brand.name }, null, 1)));
  zip.addFile('content.json', Buffer.from(JSON.stringify(content.get(), null, 1)));
  for (const f of fs.readdirSync(UPLOADS)) if (FILE_NAME.test(f)) zip.addLocalFile(path.join(UPLOADS, f), 'uploads/');
  if (full) {
    for (const [name, store] of Object.entries({ orders, bookings, reviews, messages })) zip.addFile(`${name}.json`, Buffer.from(JSON.stringify(store.get(), null, 1)));
    for (const f of fs.readdirSync(PROOFS)) if (PROOF_NAME.test(f)) zip.addLocalFile(path.join(PROOFS, f), 'proofs/');
    CUST.addToBackup(zip);
    BILLS.addToBackup(zip);
  }
  return zip.toBuffer();
}
// Reads a backup. Photos and records are added; nothing that exists is deleted.
async function restoreBackup(buf, by) {
  let zip;
  try { zip = new AdmZip(buf); } catch { throw new Error('That file is not a Pick Me backup (.zip).'); }
  // A zip made on a Mac by compressing the backup folder has everything inside one folder,
  // plus __MACOSX extras. Find the folder that holds manifest.json and read from there.
  const entries = zip.getEntries().filter((e) => !e.isDirectory && !/(^|\/)(__MACOSX|\.DS_Store)(\/|$)/.test(e.entryName));
  const top = entries.find((e) => /^([^/]+\/)?manifest\.json$/.test(e.entryName));
  const base = top ? top.entryName.slice(0, -'manifest.json'.length) : '';
  const read = (name) => { const e = zip.getEntry(base + name); return e ? JSON.parse(e.getData().toString('utf8')) : null; };
  let manifest;
  try { manifest = read('manifest.json'); } catch { manifest = null; }
  if (!manifest || manifest.kind !== BACKUP_KIND) throw new Error('That file is not a Pick Me backup (.zip).');
  const out = { photos: 0, orders: 0, bookings: 0, reviews: 0, messages: 0, website: false, createdAt: manifest.createdAt };
  for (const e of entries) {
    if (!e.entryName.startsWith(base)) continue;
    const rest = e.entryName.slice(base.length);
    const [dir, file] = rest.split('/');
    if (!file || rest.split('/').length !== 2) continue;
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
  Object.assign(out, await CUST.restoreFromBackup((n) => { try { return read(n); } catch { return null; } }));
  Object.assign(out, await BILLS.restoreFromBackup((n) => { try { return read(n); } catch { return null; } }));
  const saved = read('content.json');
  if (saved && saved.brand && saved.menu) {
    delete saved.soldOut;
    const current = content.get();
    if (!listHistory().length) await addHistory({ at: new Date().toISOString(), by, note: 'Website before the backup was restored', changes: [] }, current);
    const next = fillDefaults(saved, freshDefaults());
    markFood(next);
    ensureSections(next);
    tidyEvents(next);
    ensurePrintMenu(next);
    cheesecakePounds(next);
    extraRules(next);
    deliveryCentre(next);
    googleReviewLink(next);
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

/* owner: saved pictures of the paper menu */
const PRINT_ID = /^\d{13}-[a-f0-9]{6}$/;
const printList = () => (meta.get().printMenus || []).filter((x) => x && PRINT_ID.test(x.id));
app.get('/api/admin/print-defaults', admin, (req, res) => res.json(freshDefaults().printMenu));
app.get('/api/admin/print-menus', admin, (req, res) => res.json(printList()));
app.post('/api/admin/print-menus', admin, express.raw({ type: () => true, limit: '40mb' }), async (req, res) => {
  if (sniffImage(req.body, false) !== 'png') return bad(res, 'The menu picture could not be made. Please try again.');
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await fs.promises.writeFile(path.join(PRINTS, `${id}.png`), req.body);
  const w = req.body.readUInt32BE(16);
  const h = req.body.readUInt32BE(20);
  const m = meta.get();
  const list = [{ id, at: new Date().toISOString(), w, h, bytes: req.body.length, note: str(req.query.note, 80) }].concat(printList());
  // Keep the 60 newest pictures.
  for (const old of list.slice(60)) {
    fs.unlink(path.join(PRINTS, `${old.id}.png`), () => {});
    fs.unlink(path.join(PRINTS, `${old.id}-thumb.jpg`), () => {});
  }
  m.printMenus = list.slice(0, 60);
  await meta.set(m);
  audit('owner', 'paper-menu-picture-saved', id);
  res.json({ ok: true, id, w, h });
});
app.post('/api/admin/print-menus/:id/thumb', admin, rawImage, async (req, res) => {
  if (!PRINT_ID.test(req.params.id) || !printList().some((x) => x.id === req.params.id)) return res.sendStatus(404);
  if (sniffImage(req.body, false) !== 'jpg') return bad(res, 'Please send a JPG.');
  await fs.promises.writeFile(path.join(PRINTS, `${req.params.id}-thumb.jpg`), req.body);
  res.json({ ok: true });
});
app.get('/api/admin/print-menus/:file', admin, (req, res) => {
  const m = /^(\d{13}-[a-f0-9]{6})(-thumb)?\.(png|jpg)$/.exec(req.params.file);
  if (!m || (m[2] ? m[3] !== 'jpg' : m[3] !== 'png')) return res.sendStatus(404);
  const item = printList().find((x) => x.id === m[1]);
  if (!item) return res.sendStatus(404);
  if (req.query.download === '1') {
    const day = String(item.at).slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="pick-me-menu-${day}-${m[1].slice(-6)}.png"`);
  }
  res.set('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(PRINTS, req.params.file), (e) => { if (e && !res.headersSent) res.sendStatus(404); });
});
app.delete('/api/admin/print-menus/:id', admin, async (req, res) => {
  if (!PRINT_ID.test(req.params.id)) return res.sendStatus(404);
  const m = meta.get();
  m.printMenus = printList().filter((x) => x.id !== req.params.id);
  await meta.set(m);
  fs.unlink(path.join(PRINTS, `${req.params.id}.png`), () => {});
  fs.unlink(path.join(PRINTS, `${req.params.id}-thumb.jpg`), () => {});
  audit('owner', 'paper-menu-picture-deleted', req.params.id);
  res.json({ ok: true });
});

/* files */
// The phone app's web version (built from app/ by app/scripts/web-preview.sh), for testing on iPhone in Safari.
app.get(['/app-preview', '/app-preview/'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT, 'public', 'app-preview', 'index.html'), (e) => { if (e && !res.headersSent) res.sendStatus(404); });
});
app.use('/uploads', express.static(UPLOADS, {
  maxAge: '30d',
  setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"),
}));
app.use(express.static(path.join(ROOT, 'public'), {
  extensions: ['html'],
  index: false,
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
