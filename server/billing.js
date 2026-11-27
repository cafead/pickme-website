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
  const { app, Store, json, str, bad, content, orders, audit, desk, admin, who, NP_OFFSET } = x;
  const book = new Store('bills.json', { next: 1, bills: [] });
  const setup = new Store('bill-setup.json', {});
  const SETUP = () => Object.assign({
    header: 'PAN No: 153336241',
    footer: 'Thank you for visiting PICK ME CAFE. Please visit again!!',
    payments: ['Cash', 'Card', 'eSewa', 'Fonepay'],
    items: [],
    paper: 80,
  }, setup.get());
  const day = (iso) => new Date(Date.parse(iso) + NP_OFFSET).toISOString().slice(0, 10);
  const money = (n) => Math.round(Number(n) * 100) / 100;
  const billNo = (n) => 'PM-' + String(n).padStart(5, '0');

  app.get('/api/desk/bill-setup', desk, (req, res) => res.json(SETUP()));
  app.put('/api/admin/bill-setup', admin, json, async (req, res) => {
    const b = req.body || {};
    const next = SETUP();
    if (b.header !== undefined) next.header = str(b.header, 300);
    if (b.footer !== undefined) next.footer = str(b.footer, 300);
    if ([58, 80].includes(Number(b.paper))) next.paper = Number(b.paper);
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

  // Bills of one day (Nepal time), newest first, with the day's totals.
  app.get('/api/desk/bills', desk, (req, res) => {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : day(new Date().toISOString());
    const list = book.get().bills.filter((b) => day(b.at) === d).reverse();
    const good = list.filter((b) => !b.cancelled);
    const byPay = {};
    good.forEach((b) => { byPay[b.payment] = money((byPay[b.payment] || 0) + b.total); });
    res.json({ date: d, bills: list, summary: { count: good.length, total: money(good.reduce((n, b) => n + b.total, 0)), discount: money(good.reduce((n, b) => n + b.discount.amount, 0)), byPayment: byPay, cancelled: list.length - good.length } });
  });
  app.get('/api/desk/bills/:id', desk, (req, res) => {
    const b = book.get().bills.find((v) => v.id === req.params.id);
    if (!b) return res.sendStatus(404);
    res.json(b);
  });

  app.post('/api/desk/bills', desk, json, async (req, res) => {
    const b = req.body || {};
    const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 200).map((l) => ({
      name: str(l && l.name, 100), label: str(l && l.label, 60), price: money(l && l.price), qty: Math.round(Number(l && l.qty)),
    })).filter((l) => l.name);
    if (!lines.length) return bad(res, 'Add at least one item to the bill.');
    if (lines.some((l) => !Number.isFinite(l.price) || l.price < 0 || l.price > 1e6 || !(l.qty >= 1 && l.qty <= 999))) return bad(res, 'One of the lines has a wrong price or quantity.');
    const subtotal = money(lines.reduce((n, l) => n + l.price * l.qty, 0));
    const dKind = b.discount && b.discount.kind === 'percent' ? 'percent' : 'amount';
    const dValue = Math.max(0, Number(b.discount && b.discount.value) || 0);
    if (dKind === 'percent' && dValue > 100) return bad(res, 'A discount cannot be more than 100%.');
    const dAmount = Math.min(subtotal, money(dKind === 'percent' ? subtotal * dValue / 100 : dValue));
    const payments = SETUP().payments;
    const payment = payments.includes(b.payment) ? b.payment : payments[0];
    const total = money(subtotal - dAmount);
    const received = Number(b.received) > 0 ? money(b.received) : 0;
    const pan = str(b.customer && b.customer.pan, 20).replace(/\s+/g, '');
    if (pan && !/^\d{9}$/.test(pan)) return bad(res, 'A PAN number has 9 digits. Check it, or leave it empty.');
    const all = book.get();
    // The same bill sent twice (a double tap, a retry after bad internet) is saved once.
    const ref = /^[a-z0-9]{8,40}$/i.test(b.ref || '') ? b.ref : '';
    const twin = ref && all.bills.find((v) => v.ref === ref);
    if (twin) return res.json(twin);
    const orderId = str(b.orderId, 40);
    const bill = {
      id: 'bl_' + crypto.randomBytes(6).toString('hex'), ref, n: all.next, no: billNo(all.next), at: new Date().toISOString(), by: who(req),
      lines, subtotal, discount: { kind: dKind, value: dValue, amount: dAmount, reason: str(b.discount && b.discount.reason, 80) }, total,
      payment, received, change: received > total ? money(received - total) : 0,
      customer: { name: str(b.customer && b.customer.name, 80), pan, phone: str(b.customer && b.customer.phone, 20) },
      table: str(b.table, 12), note: str(b.note, 200), orderId,
    };
    all.next += 1;
    all.bills.push(bill);
    await book.set(all);
    audit(who(req), 'bill', `${bill.no} Rs ${bill.total}`);
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
    if (!b.cancelled) { b.cancelled = { at: new Date().toISOString(), by: who(req), reason }; await book.set(all); audit('owner', 'bill-cancelled', `${b.no} ${reason}`); }
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
  return { addToBackup, restoreFromBackup };
};
