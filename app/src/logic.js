// Menu, events, cakes and times, worked out from the website content the same way the website does.
import { BS } from './bs';

export const NP_OFFSET = 345 * 60e3;
export const npNow = () => {
  const d = new Date(Date.now() + NP_OFFSET).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
};
export const scheduleTs = (date, time) => Date.parse(`${date}T${time}:00+05:45`);
export const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const t12 = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;

// Ticked events that are within their dates today. All of them share one slideshow.
export function activeEvents(c) {
  const today = BS.todayAD();
  return ((c.events || {}).items || []).map((e) => {
    if (e.enabled === false || !/^\d{4}-\d{2}-\d{2}$/.test(e.start || '')) return null;
    const end = Date.parse(e.start) + (Number(e.days) || 1) * 864e5;
    const now = Date.parse(today);
    return now >= Date.parse(e.start) && now < end ? { e, left: Math.round((end - now) / 864e5) } : null;
  }).filter(Boolean);
}
export function eventSlides(c) {
  return activeEvents(c).flatMap(({ e, left }) => {
    const photos = (e.photos || []).filter((p) => p && p.image);
    const list = photos.length ? photos : (e.image ? [{ image: e.image }] : [{ image: null }]);
    return list.map((p, n) => ({ key: `${e.id}-${n}`, e, left, image: p.image, heading: p.caption || e.title, text: p.text || e.text }));
  });
}

// Menu groups: specials of events that are on come first, then the menu.
export function menuGroups(c) {
  const out = [];
  for (const { e } of activeEvents(c)) {
    const items = (e.menu || []).filter((it) => !it.hidden);
    if (items.length) out.push({ id: 'event-' + e.id, name: e.menuTitle || e.title, note: e.message, items, special: true });
  }
  for (const g of (c.menu || {}).categories || []) {
    if (!g.hidden) out.push({ id: g.id, name: g.name, note: g.note, items: (g.items || []).filter((it) => !it.hidden), timeFrom: g.timeFrom, timeTo: g.timeTo });
  }
  return out;
}

export function hoursOf(it, g) {
  if (it.timeFrom || it.timeTo) return { from: it.timeFrom, to: it.timeTo };
  if (g && (g.timeFrom || g.timeTo)) return { from: g.timeFrom, to: g.timeTo };
  return null;
}
export const servedNow = (h) => {
  if (!h) return true;
  const { time } = npNow();
  return !((h.from && time < h.from) || (h.to && time > h.to));
};
export const hoursText = (h) => (h.from && h.to ? `Served ${t12(h.from)} to ${t12(h.to)}` : h.from ? `Served after ${t12(h.from)}` : `Served until ${t12(h.to)}`);

// Extras (less sugar, extra shot) that apply to a menu group.
export function extrasFor(c, groupId) {
  const x = c.extras || {};
  if (x.show === false) return [];
  const out = [];
  for (const g of x.groups || []) {
    if (g.show === false || !(g.categories || []).includes(groupId)) continue;
    for (const o of g.options || []) if (o.show !== false && o.id && o.name && !out.some((y) => y.id === o.id)) out.push(o);
  }
  return out;
}

// Whole cakes anyone can pre-order (any menu item with a "whole" price).
export function wholeCakes(c) {
  const out = [];
  for (const g of menuGroups(c)) {
    for (const it of g.items) {
      const sizes = (it.prices || []).filter((p) => p.whole && Number(p.price) > 0);
      if (sizes.length && it.available !== false) out.push({ item: it, groupId: g.id, sizes });
    }
  }
  return out;
}
export const cakeOptions = (c) => (((c.cake || {}).options) || []).filter((o) => o.show !== false && o.id && o.name);
export function pounds(label) {
  const t = String(label || '').toLowerCase().replace(/(\d)\s*(?:½|1\/2|and a half|and half|& half)/, '$1.5').replace(/½/, '0.5').replace(/(^|\D)1\/2/, (m, a) => `${a}0.5`);
  if (/half/.test(t)) return 0.5;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(pound|lb|kg)/);
  if (!m) return 1;
  return m[2] === 'kg' ? Number(m[1]) * 2.2 : Number(m[1]);
}
export const cakePhoto = (c, item) => ((c.cake || {}).photos || {})[item.id] || item.image || (c.cake || {}).image;

// Is the cafe open right now, and any "closed" notice.
export function openState(c) {
  const b = c.brand || {};
  const k = c.closure || {};
  const { date, time } = npNow();
  const closedToday = k.on && !(k.until && /^\d{4}-\d{2}-\d{2}$/.test(k.until) && date > k.until);
  if (closedToday) return { open: false, notice: k.title || 'We are closed today', text: k.text };
  const open = !(time < (b.open || '07:00') || time > (b.close || '19:00'));
  return { open, notice: '', text: '' };
}

// Days for a date picker, with BS labels.
export function dayChoices(count, from) {
  const start = from || npNow().date;
  return Array.from({ length: count }, (_, i) => {
    const ad = addDays(start, i);
    const b = BS.toBS(ad);
    const p = ad.split('-').map(Number);
    const wd = BS.WEEK[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return { ad, top: i === 0 && !from ? 'Today' : i === 1 && !from ? 'Tomorrow' : wd, mid: b ? `${b.d} ${BS.MONTHS[b.m - 1]}` : ad, sub: `${p[2]} ${BS.AD_MONTHS[p[1] - 1]}`, bs: BS.label(ad) };
  });
}
// Times every 30 minutes in opening hours, marked off when too soon.
export function timeChoices(c, date, leadHours) {
  const b = c.brand || {};
  const [oh, om] = (b.open || '07:00').split(':').map(Number);
  const [ch, cm] = (b.close || '19:00').split(':').map(Number);
  const out = [];
  for (let m = oh * 60 + om; m <= ch * 60 + cm; m += 30) {
    const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const ok = scheduleTs(date, t) >= Date.now() + (leadHours || 0) * 3600e3 + 10 * 60e3;
    out.push({ t, label: t12(t), ok });
  }
  return out;
}

export const STATUS = {
  pending: { label: 'Received', text: 'We have your order and will look at it in a moment.', step: 0 },
  acknowledged: { label: 'Accepted', text: 'The cafe has accepted your order.', step: 1 },
  preparing: { label: 'Preparing', text: 'Your order is being prepared.', step: 2 },
  ready: { label: 'Ready', text: 'Your order is ready!', step: 3 },
  done: { label: 'Completed', text: 'Enjoy! Thank you for choosing Pick Me Cafe.', step: 4 },
  cancelled: { label: 'Cancelled', text: 'This order was cancelled. Please call us if you have a question.', step: -1 },
};
export const BOOKING_STATUS = {
  pending: { label: 'Requested', text: 'We will call or message you to confirm your table.' },
  confirmed: { label: 'Confirmed', text: 'Your table is confirmed. See you soon!' },
  seated: { label: 'Seated', text: 'Enjoy your time at Pick Me Cafe.' },
  done: { label: 'Completed', text: 'Thank you for visiting.' },
  declined: { label: 'Not available', text: 'Sorry, we could not keep that table. Please call us to find another time.' },
};
export const finished = (o) => (o.kind === 'booking' ? ['done', 'declined'] : ['done', 'cancelled']).includes(o.status);
