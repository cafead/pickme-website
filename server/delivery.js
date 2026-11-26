'use strict';
/*
 * Version 12: delivery drivers, live delivery tracking and push notifications.
 *
 * A driver is a staff login with role "driver" (Admin > Security). The counter or admin gives a delivery order
 * to a driver; the driver marks it Picked up, On the way and Delivered, and his phone sends its location while
 * a delivery is on the way. The customer's order page and app show the driver on a map.
 *
 * Push notifications go through Expo's push service (the phone apps register their Expo push token here).
 * They reach iPhones only once the Apple push key is set up in EAS, and Android once Firebase is set up.
 */
const crypto = require('crypto');

module.exports = function delivery(x) {
  const { app, Store, json, str, bad, limit, content, orders, auth, audit, allow, who, readSession, staffPublic } = x;
  const tokens = new Store('push-tokens.json', []);
  const spots = new Store('driver-spots.json', {});
  const driverOnly = allow('driver', 'admin', 'staff');
  const deskGuard = allow('admin', 'staff');
  const feature = (k) => ((content.get().features || {})[k]) !== false;
  const STEPS = ['assigned', 'picked', 'onway', 'delivered'];
  const STEP_TEXT = { assigned: 'Given to the driver', picked: 'Picked up', onway: 'On the way', delivered: 'Delivered' };

  /* ---------- push (Expo) ---------- */
  const EXPO = /^Expo(nent)?PushToken\[[\w-]+\]$/;
  async function push(list, title, body, data) {
    const to = [...new Set(list.map((t) => t.token))].filter((t) => EXPO.test(t));
    if (!to.length) return;
    const messages = to.map((t) => ({ to: t, title, body, data: data || {}, sound: 'default', priority: 'high', channelId: (data && data.channel) || 'orders' }));
    try {
      for (let i = 0; i < messages.length; i += 90) {
        const r = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(messages.slice(i, i + 90)) });
        const out = await r.json().catch(() => ({}));
        // Tokens of phones that removed the app are dropped.
        const dead = new Set();
        (out.data || []).forEach((d, n) => { if (d && d.details && d.details.error === 'DeviceNotRegistered') dead.add(messages[i + n].to); });
        if (dead.size) await tokens.set(tokens.get().filter((t) => !dead.has(t.token)));
      }
    } catch (e) { console.error('Push failed:', e.message); }
  }
  const staffTokens = () => tokens.get().filter((t) => t.kind === 'staff');
  const driverTokens = (id) => tokens.get().filter((t) => t.kind === 'driver' && t.staffId === id);
  const customerTokens = (o) => tokens.get().filter((t) => t.kind === 'customer' && ((o.device && t.device === o.device) || (o.customerId && t.customerId === o.customerId)));

  // A phone app sends its push token. Staff and drivers are known from their login; customers by device and account.
  app.post('/api/push/register', limit('pushreg', 60, 15 * 60e3), json, async (req, res) => {
    const token = str(req.body.token, 200);
    if (!EXPO.test(token)) return bad(res, 'That is not a push token.');
    const s = readSession(req);
    const c = x.readCust(req);
    const kind = s && s.role === 'driver' ? 'driver' : s ? 'staff' : 'customer';
    const row = { token, kind, staffId: s && s.staff ? s.staff.id : (s ? 'owner' : ''), customerId: c ? c.id : '', device: /^[a-f0-9]{16,64}$/.test(req.body.device || '') ? req.body.device : '', platform: str(req.body.platform, 10), at: new Date().toISOString() };
    await tokens.set([row, ...tokens.get().filter((t) => !(t.token === token && t.kind === kind))].slice(0, 2000));
    res.json({ ok: true, kind });
  });
  app.post('/api/push/unregister', json, async (req, res) => {
    const token = str(req.body.token, 200);
    await tokens.set(tokens.get().filter((t) => t.token !== token || (req.body.kind && t.kind !== req.body.kind)));
    res.json({ ok: true });
  });

  /* ---------- hooks called from server.js and customers.js ---------- */
  function onNewOrder(o) {
    push(staffTokens(), `New order ${o.id}`, `${o.type === 'delivery' ? 'Delivery' : o.type === 'pickup' ? 'Pickup' : 'At the cafe'}${o.tableNo ? `, table ${o.tableNo}` : ''} · Rs. ${o.total}`, { kind: 'order', id: o.id, channel: 'orders' });
  }
  function onTableCall(c) {
    push(staffTokens(), `Table ${c.table}: ${c.label}`, 'Tap Done on the counter screen when it is sorted.', { kind: 'call', id: c.id, channel: 'orders' });
  }
  const STATUS_PUSH = { acknowledged: 'Our staff have seen your order.', preparing: 'We are making your order.', ready: 'Your order is ready.', done: 'Your order is done. Thank you!', cancelled: 'Your order was cancelled. Please call us if this is a surprise.' };
  function onStatus(o) {
    if (STATUS_PUSH[o.status]) push(customerTokens(o), `Order ${o.id}`, STATUS_PUSH[o.status], { kind: 'status', id: o.id, channel: 'orders' });
  }

  /* ---------- drivers ---------- */
  const drivers = () => (auth.get().staff || []).filter((s) => s.role === 'driver' && s.active);
  app.get('/api/desk/drivers', deskGuard, (req, res) => {
    const now = Date.now();
    res.json(drivers().map((d) => {
      const at = (spots.get()[d.id] || {}).at;
      return { id: d.id, name: d.name, phone: d.phone || '', lastSeen: at || '', online: Boolean(at && now - Date.parse(at) < 5 * 60e3), busy: orders.get().filter((o) => o.driver && o.driver.id === d.id && !['done', 'cancelled'].includes(o.status)).length };
    }));
  });
  // Give a delivery order to a driver (or take it back with driverId empty).
  app.post('/api/desk/orders/:id/driver', deskGuard, json, async (req, res) => {
    const list = orders.get();
    const o = list.find((y) => y.id === req.params.id);
    if (!o || o.type !== 'delivery') return bad(res, 'Only delivery orders can go to a driver.');
    const by = who(req);
    const d = req.body.driverId ? drivers().find((y) => y.id === req.body.driverId) : null;
    if (req.body.driverId && !d) return bad(res, 'That driver login is switched off or removed.');
    o.log = Array.isArray(o.log) ? o.log : [];
    if (d) {
      o.driver = { id: d.id, name: d.name, phone: d.phone || '' };
      o.delivery = Object.assign({}, o.delivery, { status: 'assigned', assignedAt: new Date().toISOString() });
      o.log.push({ at: new Date().toISOString(), by, what: `Given to driver ${d.name}` });
      push(driverTokens(d.id), 'New delivery', `${o.id} · ${o.address || 'see the map'} · Rs. ${o.total}${o.payment.method === 'cod' ? ' cash' : ''}`, { kind: 'delivery', id: o.id, channel: 'deliveries' });
    } else {
      o.log.push({ at: new Date().toISOString(), by, what: `Taken back from driver ${o.driver ? o.driver.name : ''}` });
      delete o.driver;
      delete o.delivery;
    }
    await orders.set(list);
    audit(by, d ? 'driver-assigned' : 'driver-unassigned', o.id);
    res.json(o);
  });
  const myId = (req) => (req.session.staff ? req.session.staff.id : 'owner');
  const driverView = (o) => ({
    id: o.id, key: o.key, status: o.status, paid: Boolean(o.paid), createdAt: o.createdAt, name: o.name, phone: o.phone, address: o.address, notes: o.notes,
    location: o.location || null, total: o.total, payment: { method: o.payment.method, change: o.payment.change || 0 }, schedule: o.schedule,
    lines: (o.lines || []).map((l) => ({ name: l.name, label: l.label, qty: l.qty, extras: l.extras || [] })),
    delivery: o.delivery || null, driver: o.driver || null,
  });
  // The driver's list: his deliveries still to do, then today's delivered ones.
  app.get('/api/driver/orders', driverOnly, (req, res) => {
    const id = myId(req);
    const day = (iso) => new Date(Date.parse(iso) + 345 * 60e3).toISOString().slice(0, 10);
    const today = day(new Date().toISOString());
    const mine = orders.get().filter((o) => o.driver && (o.driver.id === id || req.session.role !== 'driver'));
    res.json({
      me: req.session.role === 'driver' ? staffPublic(req.session.staff) : { name: req.session.name },
      cafe: content.get().delivery || {},
      active: mine.filter((o) => !['done', 'cancelled'].includes(o.status)).map(driverView),
      done: mine.filter((o) => o.status === 'done' && day(o.createdAt) === today).slice(0, 30).map(driverView),
    });
  });
  app.post('/api/driver/orders/:id/step', driverOnly, json, async (req, res) => {
    const step = STEPS.includes(req.body.step) ? req.body.step : '';
    const list = orders.get();
    const o = list.find((y) => y.id === req.params.id);
    if (!o || !o.driver || !step) return res.sendStatus(404);
    if (req.session.role === 'driver' && o.driver.id !== myId(req)) return res.sendStatus(403);
    const by = who(req);
    const before = o.status;
    o.delivery = Object.assign({}, o.delivery, { status: step, [`${step}At`]: new Date().toISOString() });
    o.log = Array.isArray(o.log) ? o.log : [];
    o.log.push({ at: new Date().toISOString(), by, what: STEP_TEXT[step] });
    if (step === 'onway' && !['ready', 'done', 'cancelled'].includes(o.status)) o.status = 'ready';
    if (step === 'delivered') {
      o.status = 'done';
      if (req.body.cash && !o.paid) { o.paid = true; o.log.push({ at: new Date().toISOString(), by, what: 'Cash collected' }); }
    }
    if (o.status !== before) { await x.onStatusChange(o, before, by); onStatus(o); }
    if (step === 'onway') push(customerTokens(o), `Order ${o.id}`, `${o.driver.name} is on the way with your order.`, { kind: 'status', id: o.id, channel: 'orders' });
    await orders.set(list);
    audit(by, `delivery-${step}`, o.id);
    res.json(driverView(o));
  });
  // The driver's phone sends where it is, every few seconds while a delivery is picked up or on the way.
  app.post('/api/driver/location', driverOnly, limit('driverloc', 2000, 15 * 60e3), json, async (req, res) => {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return bad(res, 'No location.');
    const spot = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, acc: Math.round(Number(req.body.acc) || 0), heading: Number(req.body.heading) || null, speed: Number(req.body.speed) || null, at: new Date().toISOString() };
    const all = spots.get();
    all[myId(req)] = spot;
    await spots.set(all);
    res.json({ ok: true });
  });
  app.post('/api/driver/stop', driverOnly, async (req, res) => {
    const all = spots.get();
    delete all[myId(req)];
    await spots.set(all);
    res.json({ ok: true });
  });

  // What the customer sees about the delivery (added to the order status for its owner).
  function trackFor(o) {
    if (o.type !== 'delivery') return null;
    const out = { destination: o.location || null, cafe: content.get().delivery || null };
    if (!o.driver) return Object.assign(out, { status: 'waiting' });
    out.status = (o.delivery && o.delivery.status) || 'assigned';
    out.driver = { name: o.driver.name, phone: o.driver.phone || '' };
    const spot = spots.get()[o.driver.id];
    // The driver is shown only while this delivery is on its way and the location is fresh.
    if (feature('driverTracking') && spot && ['picked', 'onway'].includes(out.status) && Date.now() - Date.parse(spot.at) < 10 * 60e3) out.where = spot;
    return out;
  }

  return { push, onNewOrder, onTableCall, onStatus, trackFor, drivers };
};
