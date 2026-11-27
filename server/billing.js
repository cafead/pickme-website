'use strict';
/*
 * Version 13: billing at the counter (replaces the Loyverse app).
 *
 * Staff and the owner make a bill on /bill: items from the website menu, counter-only items (candles, hookah...),
 * or a typed line; a discount; the customer's name, PAN and phone; the payment type. Every bill gets the next
 * bill number and is kept in bills.json. Bills are never deleted: a wrong one is cancelled (owner only) and
 * stays in the list as cancelled.
 *
 * Files: bills.json { next, bills[] }, bill-setup.json { header, footer, payments[], items[] }.
 */
const crypto = require('crypto');

module.exports = function billing(x) {
  const { app, Store, json, str, bad, content, orders, audit, desk, admin, who, NP_OFFSET, ownerOk, isOwner, loyalty } = x;
  const tabs = new Store('bill-tabs.json', []);
  const book = new Store('bills.json', { next: 1, bills: [] });
  const setup = new Store('bill-setup.json', {});
  const SETUP = () => Object.assign({
    header: 'PAN No: 153336241',
    footer: 'Thank you for visiting PICK ME CAFE. Please visit again!!',
    payments: ['Cash', 'Card', 'eSewa', 'Fonepay'],
    items: [],
    paper: 80,
    cols: 44,          // letters per line on the paper (48 fills an 80 mm roll edge to edge)
    margin: 2,         // empty letters on the left, so nothing sits on the paper's edge
    show: { miti: true, ad: false },   // which dates are printed: Nepali (Miti) and/or English (AD)
    logo: '',          // an uploaded logo (/uploads/...); empty = the cafe's own round mark
    logoText: 'PICK ME CAFE', // words drawn under the logo, as part of the picture
    logoWidth: 320,    // dots (8 dots = 1 mm)
    name: '',          // an extra big text line under the logo; empty = none
    // address and phone: not set = taken from the website (address without the country); '' = not printed
    maxDiscount: 10,   // staff may give up to this many percent; more needs the owner
    stock: {},         // "<item id>|<size>" -> how many are left (only counted items are listed)
  }, setup.get());
  const stockKey = (v) => (typeof v === 'string' && v.length <= 200 && v.includes('|') ? v : '');
  const stockLeft = (key) => { const n = SETUP().stock[key]; return Number.isFinite(n) ? n : null; };
  // Website: a size with 0 left cannot be ordered; an item whose every size is counted and at 0 shows as sold out.
  const stockZero = (itemId, label) => stockLeft(`${itemId}|${label || ''}`) === 0;
  function stockOutIds() {
    const st = SETUP().stock; const out = [];
    (content.get().menu.categories || []).forEach((g) => (g.items || []).forEach((it) => {
      const sizes = (it.prices || []).filter((p) => Number(p.price) > 0);
      if (sizes.length && sizes.every((p) => st[`${it.id}|${p.label || ''}`] === 0)) out.push(it.id);
    }));
    return out;
  }
  // Takes sold things off the count (never below 0). Used by bills and by website and app orders.
  async function takeStock(list) {
    const cur = setup.get();
    const st = Object.assign({}, SETUP().stock);
    let changed = false;
    (list || []).forEach((l) => { const k = stockKey(l.key); if (k && Number.isFinite(st[k])) { st[k] = Math.max(0, st[k] - (Number(l.qty) || 0)); changed = true; } });
    if (changed) await setup.set(Object.assign({}, cur, { stock: st }));
  }
  const day = (iso) => new Date(Date.parse(iso) + NP_OFFSET).toISOString().slice(0, 10);
  const money = (n) => Math.round(Number(n) * 100) / 100;
  const billNo = (n) => 'PM-' + String(n).padStart(5, '0');

  app.get('/api/desk/bill-setup', desk, (req, res) => res.json(SETUP()));
  app.put('/api/admin/bill-setup', admin, json, async (req, res) => {
    const b = req.body || {};
    const next = SETUP();
    if (b.header !== undefined) next.header = String(b.header || '').split(/\r?\n/).map((l) => str(l, 60)).filter(Boolean).slice(0, 6).join('\n');
    if (b.footer !== undefined) next.footer = String(b.footer || '').split(/\r?\n/).map((l) => str(l, 60)).filter(Boolean).slice(0, 6).join('\n');
    if ([58, 80].includes(Number(b.paper))) next.paper = Number(b.paper);
    if (b.cols !== undefined) { const n = Math.round(Number(b.cols)); if (!(n >= 24 && n <= 48)) return bad(res, 'Letters per line must be between 24 and 48.'); next.cols = n; }
    if (b.margin !== undefined) { const n = Math.round(Number(b.margin)); if (!(n >= 0 && n <= 8)) return bad(res, 'The left margin must be between 0 and 8.'); next.margin = n; }
    if (b.show && typeof b.show === 'object') next.show = { miti: b.show.miti !== false, ad: b.show.ad === true };
    if (b.logo !== undefined) { const u = str(b.logo, 120); if (u && !/^\/uploads\/[a-f0-9]{20}\.(png|jpg|jpeg|webp|gif)$/.test(u)) return bad(res, 'Upload the logo as a PNG or JPG picture.'); next.logo = u; }
    if (b.logoText !== undefined) next.logoText = str(b.logoText, 30);
    if (b.logoWidth !== undefined) { const n = Math.round(Number(b.logoWidth) / 8) * 8; if (!(n >= 120 && n <= 480)) return bad(res, 'The logo width must be between 15 and 60 mm.'); next.logoWidth = n; }
    if (b.name !== undefined) next.name = str(b.name, 40);
    if (b.address !== undefined) next.address = str(b.address, 120);
    if (b.phone !== undefined) next.phone = str(b.phone, 60);
    if (b.maxDiscount !== undefined) { const n = Number(b.maxDiscount); if (!(n >= 0 && n <= 100)) return bad(res, 'The staff discount limit must be between 0 and 100.'); next.maxDiscount = n; }
    if (b.stock && typeof b.stock === 'object') {
      const st = {};
      Object.entries(b.stock).slice(0, 500).forEach(([k, v]) => { const n = Math.round(Number(v)); if (stockKey(k) && v !== '' && v !== null && n >= 0 && n <= 99999) st[k] = n; });
      next.stock = st;
    }
    if (Array.isArray(b.payments)) {
      const p = [...new Set(b.payments.map((v) => str(v, 30)).filter(Boolean))].slice(0, 10);
      if (!p.length) return bad(res, 'Keep at least one payment type.');
      next.payments = p;
    }
    if (Array.isArray(b.items)) {
      next.items = b.items.slice(0, 400).map((it) => ({
        id: /^b_[a-f0-9]{8}$/.test(it && it.id) ? it.id : 'b_' + crypto.randomBytes(4).toString('hex'),
        name: str(it && it.name, 80), group: str(it && it.group, 40) || 'Other', price: money(it && it.price),
      })).filter((it) => it.name && it.price >= 0 && Number.isFinite(it.price));
    }
    await setup.set(next);
    audit('owner', 'bill-setup');
    res.json(next);
  });

  // Counting stock: staff type how many are left (a fresh tray of slices), or clear the count.
  app.post('/api/desk/stock', desk, json, async (req, res) => {
    const k = stockKey(req.body && req.body.key);
    if (!k) return bad(res, 'Choose an item.');
    const st = Object.assign({}, SETUP().stock);
    if (req.body.left === null || req.body.left === '') delete st[k];
    else { const n = Math.round(Number(req.body.left)); if (!(n >= 0 && n <= 99999)) return bad(res, 'Type how many are left.'); st[k] = n; }
    await setup.set(Object.assign({}, setup.get(), { stock: st }));
    audit(who(req), 'stock', `${k} = ${st[k] === undefined ? 'not counted' : st[k]}`);
    res.json({ stock: st });
  });

  /* Open tabs: a table's bill that stays open while the guests keep ordering. */
  app.get('/api/desk/tabs', desk, (req, res) => res.json(tabs.get()));
  app.put('/api/desk/tabs/:id', desk, json, async (req, res) => {
    if (!/^t_[a-z0-9]{6,30}$/.test(req.params.id)) return bad(res, 'Wrong tab.');
    const b = req.body || {};
    const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 200).map((l) => ({ key: stockKey(l && l.key), name: str(l && l.name, 100), label: str(l && l.label, 60), price: money(l && l.price), qty: Math.round(Number(l && l.qty)) })).filter((l) => l.name && l.qty >= 1 && l.price >= 0);
    const title = str(b.title, 30);
    if (!title) return bad(res, 'Give the tab a table number or a name.');
    const list = tabs.get().slice();
    const at = list.findIndex((t) => t.id === req.params.id);
    if (at < 0 && list.length >= 100) return bad(res, 'Too many open tabs. Close some first.');
    const tab = { id: req.params.id, title, lines, name: str(b.name, 80), pan: str(b.pan, 20), phone: str(b.phone, 20), note: str(b.note, 200), by: who(req), openedAt: at >= 0 ? list[at].openedAt : new Date().toISOString(), at: new Date().toISOString() };
    if (at >= 0) list[at] = tab; else list.push(tab);
    await tabs.set(list);
    res.json(tab);
  });
  app.delete('/api/desk/tabs/:id', desk, async (req, res) => {
    const t = tabs.get().find((v) => v.id === req.params.id);
    if (t) { await tabs.set(tabs.get().filter((v) => v.id !== req.params.id)); audit(who(req), 'tab-dropped', `${t.title} (${t.lines.length} lines)`); }
    res.json({ ok: true });
  });

  // Bills of one day (Nepal time), newest first, with the day's totals.
  app.get('/api/desk/bills', desk, (req, res) => {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : day(new Date().toISOString());
    const list = book.get().bills.filter((b) => day(b.at) === d).reverse();
    const good = list.filter((b) => !b.cancelled);
    const byPay = {};
    good.forEach((b) => { byPay[b.payment] = money((byPay[b.payment] || 0) + b.total); });
    res.json({ date: d, bills: list, summary: { count: good.length, total: money(good.reduce((n, b) => n + b.total, 0)), discount: money(good.reduce((n, b) => n + b.discount.amount, 0)), byPayment: byPay, cancelled: list.length - good.length, cancelledTotal: money(list.filter((b) => b.cancelled).reduce((n, b) => n + b.total, 0)), pointsUsed: good.reduce((n, b) => n + ((b.points && b.points.used) || 0), 0), first: list.length ? list[list.length - 1].no : '', last: list.length ? list[0].no : '' } });
  });
  app.get('/api/desk/bills/:id', desk, (req, res) => {
    const b = book.get().bills.find((v) => v.id === req.params.id);
    if (!b) return res.sendStatus(404);
    res.json(b);
  });

  app.post('/api/desk/bills', desk, json, async (req, res) => {
    const b = req.body || {};
    const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 200).map((l) => ({
      key: stockKey(l && l.key), name: str(l && l.name, 100), label: str(l && l.label, 60), price: money(l && l.price), qty: Math.round(Number(l && l.qty)),
    })).filter((l) => l.name);
    if (!lines.length) return bad(res, 'Add at least one item to the bill.');
    if (lines.some((l) => !Number.isFinite(l.price) || l.price < 0 || l.price > 1e6 || !(l.qty >= 1 && l.qty <= 999))) return bad(res, 'One of the lines has a wrong price or quantity.');
    const subtotal = money(lines.reduce((n, l) => n + l.price * l.qty, 0));
    const dKind = b.discount && b.discount.kind === 'percent' ? 'percent' : 'amount';
    const dValue = Math.max(0, Number(b.discount && b.discount.value) || 0);
    if (dKind === 'percent' && dValue > 100) return bad(res, 'A discount cannot be more than 100%.');
    const dAmount = Math.min(subtotal, money(dKind === 'percent' ? subtotal * dValue / 100 : dValue));
    // Staff may give a discount up to the limit; a bigger one needs the owner (logged in, or the owner's password).
    const cap = Number(SETUP().maxDiscount);
    const share = subtotal > 0 ? dAmount / subtotal * 100 : 0;
    if (share > cap + 1e-9 && !isOwner(req)) {
      const pw = typeof b.ownerPassword === 'string' ? b.ownerPassword : '';
      if (!pw) return res.status(403).json({ error: `A discount above ${cap}% needs the owner's password.`, code: 'owner' });
      if (!ownerOk(req, pw)) { audit(who(req), 'discount-refused', `${share.toFixed(1)}%`); return res.status(403).json({ error: 'That is not the owner password.', code: 'owner' }); }
    }
    // Pick Me points: the guest's phone can spend points on the bill and earns points on what is paid in money.
    const L = loyalty.on() ? loyalty.rules() : null;
    const phone = loyalty.normPhone(b.customer && b.customer.phone);
    let used = 0;
    if (L && phone && Number(b.usePoints) > 0) {
      used = Math.floor(Number(b.usePoints));
      const have = loyalty.balance(phone);
      if (used > have) return bad(res, `This number has only ${have} points.`);
      if (used < Number(L.minSpend)) return bad(res, `Points can be used from ${L.minSpend} points.`);
      used = Math.min(used, Math.floor((subtotal - dAmount) / (Number(L.rupeesPerPoint) || 1)));
    }
    const pointsValue = money(used * (L ? Number(L.rupeesPerPoint) || 1 : 1));
    const payments = SETUP().payments;
    const payment = payments.includes(b.payment) ? b.payment : payments[0];
    const total = money(subtotal - dAmount - pointsValue);
    const received = Number(b.received) > 0 ? money(b.received) : 0;
    const pan = str(b.customer && b.customer.pan, 20).replace(/\s+/g, '');
    if (pan && !/^\d{9}$/.test(pan)) return bad(res, 'A PAN number has 9 digits. Check it, or leave it empty.');
    const all = book.get();
    // The same bill sent twice (a double tap, a retry after bad internet) is saved once.
    const ref = /^[a-z0-9]{8,40}$/i.test(b.ref || '') ? b.ref : '';
    const twin = ref && all.bills.find((v) => v.ref === ref);
    if (twin) return res.json(twin);
    const orderId = str(b.orderId, 40);
    const tabId = /^t_[a-z0-9]{6,30}$/.test(b.tabId || '') ? b.tabId : '';
    // A bill for a website or app order earns its points through the order itself, not twice.
    const earn = L && phone && !orderId ? Math.floor(total * Number(L.percent) / 100 / (Number(L.rupeesPerPoint) || 1)) : 0;
    const bill = {
      id: 'bl_' + crypto.randomBytes(6).toString('hex'), ref, n: all.next, no: billNo(all.next), at: new Date().toISOString(), by: who(req),
      lines, subtotal, discount: { kind: dKind, value: dValue, amount: dAmount, reason: str(b.discount && b.discount.reason, 80) }, total,
      payment, received, change: received > total ? money(received - total) : 0,
      customer: { name: str(b.customer && b.customer.name, 80), pan, phone: str(b.customer && b.customer.phone, 20) },
      table: str(b.table, 12), note: str(b.note, 200), orderId,
      ...(used || earn ? { points: { phone, used, value: pointsValue, earned: earn } } : {}),
    };
    all.next += 1;
    all.bills.push(bill);
    await book.set(all);
    audit(who(req), 'bill', `${bill.no} Rs ${bill.total}`);
    if (used) await loyalty.add(phone, -used, 'spend', { by: who(req), note: `Bill ${bill.no}` });
    if (earn) await loyalty.add(phone, earn, 'earn', { by: who(req), note: `Bill ${bill.no}` });
    if (tabId) await tabs.set(tabs.get().filter((t) => t.id !== tabId));
    // Counted items go down (an order's items were already taken off when it was placed).
    if (!orderId) await takeStock(lines);
    // A bill made for a website or app order marks that order as paid.
    if (orderId) {
      const list = orders.get();
      const o = list.find((v) => v.id === orderId);
      if (o && !o.paid) { o.paid = true; o.billNo = bill.no; (o.log = o.log || []).push({ at: bill.at, by: who(req), text: `Bill ${bill.no} made, marked paid` }); await orders.set(list); }
    }
    res.json(bill);
  });

  app.post('/api/admin/bills/:id/cancel', admin, json, async (req, res) => {
    const all = book.get();
    const b = all.bills.find((v) => v.id === req.params.id);
    if (!b) return res.sendStatus(404);
    const reason = str(req.body && req.body.reason, 120);
    if (!reason) return bad(res, 'Write why this bill is cancelled.');
    if (!b.cancelled) {
      b.cancelled = { at: new Date().toISOString(), by: who(req), reason }; await book.set(all); audit('owner', 'bill-cancelled', `${b.no} ${reason}`);
      // Points go back the way they came.
      if (b.points && b.points.used) await loyalty.add(b.points.phone, b.points.used, 'refund', { by: 'owner', note: `Bill ${b.no} cancelled` });
      if (b.points && b.points.earned) await loyalty.add(b.points.phone, -b.points.earned, 'reverse', { by: 'owner', note: `Bill ${b.no} cancelled` });
    }
    res.json(b);
  });

  // Owner: all bills between two days as a spreadsheet file (for the accountant).
  app.get('/api/admin/bills.csv', admin, (req, res) => {
    const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
    const today = day(new Date().toISOString());
    const from = ok(req.query.from) ? req.query.from : today;
    const to = ok(req.query.to) ? req.query.to : today;
    const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const rows = [['Bill no', 'Date', 'Time', 'Customer', 'PAN', 'Phone', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment', 'By', 'Cancelled', 'Reason']];
    book.get().bills.filter((b) => day(b.at) >= from && day(b.at) <= to).forEach((b) => {
      const t = new Date(Date.parse(b.at) + NP_OFFSET).toISOString();
      rows.push([b.no, t.slice(0, 10), t.slice(11, 16), b.customer.name, b.customer.pan, b.customer.phone, b.lines.map((l) => `${l.qty} x ${l.name}${l.label ? ` (${l.label})` : ''}`).join('; '), b.subtotal, b.discount.amount, b.total, b.payment, b.by, b.cancelled ? 'yes' : '', b.cancelled ? b.cancelled.reason : '']);
    });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="pick-me-bills-${from}-to-${to}.csv"`);
    res.end('﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'));
  });

  function addToBackup(zip) {
    zip.addFile('bills.json', Buffer.from(JSON.stringify(book.get(), null, 1)));
    zip.addFile('bill-setup.json', Buffer.from(JSON.stringify(setup.get(), null, 1)));
  }
  // Restoring adds bills that are missing; nothing that exists is changed.
  async function restoreFromBackup(read) {
    const out = { bills: 0 };
    const old = read('bills.json');
    if (old && Array.isArray(old.bills)) {
      const all = book.get();
      const have = new Set(all.bills.map((b) => b.id));
      const add = old.bills.filter((b) => b && b.id && b.no && !have.has(b.id));
      if (add.length) {
        all.bills = all.bills.concat(add).sort((a, b) => String(a.at).localeCompare(String(b.at)));
        all.next = Math.max(all.next, Number(old.next) || 1, ...all.bills.map((b) => (b.n || 0) + 1));
        await book.set(all);
        out.bills = add.length;
      }
    }
    const s = read('bill-setup.json');
    if (s && typeof s === 'object' && !Object.keys(setup.get()).length) await setup.set(s);
    return out;
  }
  return { addToBackup, restoreFromBackup, stockZero, stockOutIds, takeStock };
};
