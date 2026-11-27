/* Billing at the counter (version 13, reworked 27 Nov 2026 evening): make a bill, print it on the 80 mm
 * receipt printer, keep table tabs open, count stock, give and take Pick Me points, print the day's report.
 * Staff and the owner use it at /bill; the phone app shows the same page in its staff mode.
 * Printing: (1) the phone app's Bluetooth printing when the page runs inside the app, (2) Bluetooth straight from
 * the page (Chrome on Android or a computer), (3) the browser's print window (USB / any printer), (4) the RawBT
 * printer app on Android. All four print the same paper. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Math.round(Number(n) * 100) / 100;
  const rs = (n) => 'Rs ' + money(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const IN_APP = Boolean(window.ReactNativeWebView);
  const toApp = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const S = { me: null, content: null, setup: null, tab: 'new', cat: 'all', q: '', bill: fresh(), orders: [], tabs: [], bills: null, busy: false, pts: null, cartOpen: false, logo: null };

  function fresh() {
    return { lines: [], dKind: 'amount', dValue: '', dReason: '', name: '', pan: '', phone: '', table: '', note: '', payment: '', received: '', usePoints: '', orderId: '', tabId: '', tabTitle: '', ref: rid() };
  }
  /* A short buzz on every tap, so staff feel that the tap was taken (setting kept on this device). */
  const vibeOn = () => { try { return localStorage.getItem('pm_vibe') !== 'off'; } catch (e) { return true; } };
  function buzz() {
    if (!vibeOn()) return;
    if (IN_APP) toApp({ type: 'tap' }); else if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* not allowed */ } }
  }
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, bad ? 5000 : 2400);
  }
  async function api(method, url, body) {
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    if (window.PM_TOKEN) headers['X-PM-Auth'] = window.PM_TOKEN; // inside the phone app
    let r;
    try { r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }); } catch (e) { throw new Error('No internet connection. Please check it and try again.'); }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && !/auth\/login/.test(url)) { gate('Please log in.'); throw new Error('Please log in.'); }
    if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.code = data.code; throw e; }
    return data;
  }
  function gate(msg) {
    if (IN_APP) { $('view').innerHTML = '<p class="box">Please log in again in the app (Me &gt; staff login), then open Billing.</p>'; return; }
    $('gate').hidden = false; $('gate-msg').textContent = msg || '';
  }

  /* ---------- the things that can be sold ---------- */
  function catalogue() {
    const out = [];
    ((S.content.menu || {}).categories || []).forEach((g) => (g.items || []).forEach((it) => {
      const prices = (it.prices || []).filter((p) => Number(p.price) > 0);
      if (prices.length) out.push({ id: it.id, name: it.name, group: g.name, prices: prices.map((p) => ({ label: p.label || '', price: Number(p.price), key: `${it.id}|${p.label || ''}` })) });
    }));
    (S.setup.items || []).forEach((it) => out.push({ id: it.id, name: it.name, group: it.group || 'Other', prices: [{ label: '', price: Number(it.price), key: `${it.id}|` }] }));
    return out;
  }
  const groups = () => [...new Set(catalogue().map((i) => i.group))];
  const left = (key) => { const n = (S.setup.stock || {})[key]; return Number.isFinite(n) ? n : null; };
  const onBill = (key) => S.bill.lines.filter((l) => l.key === key).reduce((n, l) => n + l.qty, 0);
  function addLine(key, name, label, price) {
    const l = S.bill.lines.find((v) => v.key === key && v.name === name && v.label === label && v.price === price);
    if (l) l.qty += 1; else S.bill.lines.push({ key, name, label, price, qty: 1 });
    changed();
  }
  function totals(b) {
    const subtotal = money(b.lines.reduce((n, l) => n + l.price * l.qty, 0));
    const v = Math.max(0, Number(b.dValue) || 0);
    const discount = Math.min(subtotal, money(b.dKind === 'percent' ? subtotal * Math.min(v, 100) / 100 : v));
    const points = Math.min(Math.max(0, Math.floor(Number(b.usePoints) || 0)), Math.floor(subtotal - discount));
    return { subtotal, discount, points, total: money(subtotal - discount - points), count: b.lines.reduce((n, l) => n + l.qty, 0) };
  }
  // After any change to the bill: redraw what shows it, and keep an open tab saved.
  function changed() {
    if (S.tab !== 'new') return;
    paintCounts(); paintCart(); paintDock();
    if (S.bill.tabId) { clearTimeout(S.tabT); S.tabT = setTimeout(saveTab, 700); }
  }

  /* ---------- New bill ---------- */
  function newView() {
    const gs = groups();
    return `<div id="tabstrip"></div><div class="pos">
      <div class="box">
        <input id="q" type="search" placeholder="Search an item" value="${esc(S.q)}" autocomplete="off">
        <div class="chips" id="chips"><button type="button" data-cat="all" class="${S.cat === 'all' ? 'on' : ''}">All</button>${gs.map((g) => `<button type="button" data-cat="${esc(g)}" class="${S.cat === g ? 'on' : ''}">${esc(g)}</button>`).join('')}</div>
        <div class="items" id="items"></div>
        <form class="typed" id="typed"><input name="name" placeholder="Something not on the list" maxlength="100" required><input name="price" type="number" inputmode="decimal" min="0" step="any" placeholder="Price" required><button type="submit">Add</button></form>
      </div>
      <div class="box cart" id="cart"></div>
    </div>
    <button type="button" class="dock" id="dock" data-do="open-cart"></button>`;
  }
  function paintItems() {
    const q = S.q.trim().toLowerCase();
    const list = catalogue().filter((i) => (q ? i.name.toLowerCase().includes(q) : S.cat === 'all' || i.group === S.cat));
    $('items').innerHTML = list.length ? list.map((i) => `<div class="item"><b>${esc(i.name)}</b><div class="sizes">${i.prices.map((p, n) => {
      const have = left(p.key);
      return `<button type="button" data-add="${esc(i.id)}" data-n="${n}" data-key="${esc(p.key)}"${have === 0 ? ' class="gone"' : ''}>${p.label ? `<small>${esc(p.label)}</small>` : ''}${p.price}${have !== null ? `<i class="left">${have === 0 ? 'none left' : have + ' left'}</i>` : ''}<span class="n" hidden></span></button>`;
    }).join('')}</div></div>`).join('') : '<p class="soft">Nothing found. Type it in the box below with its price.</p>';
    paintCounts();
  }
  // The number on each item button: how many of it are on this bill.
  function paintCounts() {
    document.querySelectorAll('#items [data-key]').forEach((b) => { const n = onBill(b.dataset.key); const tag = b.querySelector('.n'); tag.textContent = n; tag.hidden = !n; b.classList.toggle('has', n > 0); });
  }
  // Phones: the bill so far stays at the bottom of the screen; a tap opens the whole bill.
  function paintDock() {
    const d = $('dock'); if (!d) return;
    const t = totals(S.bill);
    const last = S.bill.lines.slice(-3).reverse().map((l) => `${l.qty}× ${esc(l.name)}`).join(', ');
    d.innerHTML = t.count ? `<span class="dock-n">${t.count}</span><span class="dock-what">${last}${S.bill.lines.length > 3 ? '…' : ''}</span><b class="num">${rs(t.total)}</b><span class="dock-go">See bill</span>` : '<span class="dock-what">Tap items to add them to the bill</span>';
    d.classList.toggle('empty', !t.count);
    document.body.classList.toggle('cart-open', S.cartOpen);
  }
  function paintTabs() {
    const el = $('tabstrip'); if (!el) return;
    el.innerHTML = S.tabs.length || S.bill.tabId ? `<div class="chips tabchips"><span class="soft">Open tabs:</span>${S.tabs.map((t) => `<button type="button" data-tab-open="${esc(t.id)}" class="${S.bill.tabId === t.id ? 'on' : ''}">${esc(t.title)} · ${rs(t.lines.reduce((n, l) => n + l.price * l.qty, 0))}</button>`).join('')}${S.bill.tabId ? '<button type="button" data-do="leave-tab">+ New bill</button>' : ''}</div>` : '';
  }
  function paintCart() {
    const b = S.bill;
    const t = totals(b);
    const pays = S.setup.payments;
    if (!pays.includes(b.payment)) b.payment = pays[0];
    const change = Number(b.received) > t.total ? money(Number(b.received) - t.total) : 0;
    const cap = Number(S.setup.maxDiscount);
    const over = t.subtotal > 0 && t.discount / t.subtotal * 100 > cap + 1e-9 && S.me.role !== 'admin';
    const L = S.content.loyalty || {};
    const ptsOn = !(S.content.features && S.content.features.points === false);
    const p = S.pts && S.pts.phone === (b.phone || '').replace(/\D/g, '').slice(-10) ? S.pts : null;
    $('cart').innerHTML = `<h2>${b.tabId ? `Tab: ${esc(b.tabTitle)}` : 'This bill'}<button type="button" class="quiet cart-x" data-do="close-cart">Back to items</button></h2>
      ${b.orderId ? `<p class="from-order">For order ${esc(b.orderId)}. Saving this bill marks the order paid.</p>` : ''}
      ${b.lines.length ? `<ul>${b.lines.map((l, i) => `<li><span class="nm">${esc(l.name)} ${l.label ? `<small>${esc(l.label)}</small>` : ''}</span><span class="amt num">${rs(l.price * l.qty)}</span>
        <span class="qty"><button type="button" data-qty="-1" data-i="${i}" aria-label="One less">−</button><span class="num">${l.qty}</span><button type="button" data-qty="1" data-i="${i}" aria-label="One more">+</button><small class="soft num">× ${l.price}</small></span>
        <button type="button" class="quiet danger" data-del="${i}">Remove</button></li>`).join('')}</ul>` : '<p class="empty">Tap items to add them to the bill.</p>'}
      <div class="fields">
        <label>Discount<select data-f="dKind"><option value="amount"${b.dKind === 'amount' ? ' selected' : ''}>Rs off</option><option value="percent"${b.dKind === 'percent' ? ' selected' : ''}>% off</option></select></label>
        <label>How much<input data-f="dValue" type="number" inputmode="decimal" min="0" step="any" value="${esc(b.dValue)}" placeholder="0"></label>
        ${over ? `<p class="wide warn">More than ${cap}% off: the owner's password is asked when you save.</p>` : ''}
        <label class="wide">Customer name<input data-f="name" maxlength="80" value="${esc(b.name)}" autocomplete="off"></label>
        <label>Customer PAN (9 digits)<input data-f="pan" inputmode="numeric" maxlength="9" value="${esc(b.pan)}" autocomplete="off"></label>
        <label>Phone (for points)<input data-f="phone" type="tel" maxlength="20" value="${esc(b.phone)}" autocomplete="off"></label>
        ${ptsOn && p ? `<p class="wide pts">${esc(p.account && p.account.name ? p.account.name + ': ' : '')}<b>${p.balance}</b> points${b.orderId ? '' : ` · this bill earns <b>${Math.floor(t.total * Number(L.percent || 5) / 100)}</b>`}</p>${p.balance >= Number(L.minSpend || 50) && !b.orderId ? `<label class="wide">Use points (1 point = Rs ${Number(L.rupeesPerPoint || 1)})<input data-f="usePoints" type="number" inputmode="numeric" min="0" max="${p.balance}" step="1" value="${esc(b.usePoints)}" placeholder="0 to ${p.balance}"></label>` : ''}` : ''}
        <label>Table<input data-f="table" maxlength="12" value="${esc(b.table)}" autocomplete="off"></label>
        <label>Note on the bill<input data-f="note" maxlength="200" value="${esc(b.note)}" autocomplete="off"></label>
      </div>
      <div class="sum num"><div><span>Subtotal</span><span>${rs(t.subtotal)}</span></div>${t.discount ? `<div><span>Discount</span><span>− ${rs(t.discount)}</span></div>` : ''}${t.points ? `<div><span>Points used</span><span>− ${rs(t.points)}</span></div>` : ''}<div class="total"><span>Total</span><span>${rs(t.total)}</span></div></div>
      <p class="soft" style="margin-bottom:6px">Paid by</p>
      <div class="pay">${pays.map((x) => `<button type="button" data-pay="${esc(x)}" class="${b.payment === x ? 'on' : ''}">${esc(x)}</button>`).join('')}</div>
      <div class="fields" style="margin-top:10px"><label>Money received<input data-f="received" type="number" inputmode="decimal" min="0" step="any" value="${esc(b.received)}" placeholder="optional"></label><label>Change to give<input value="${change ? rs(change) : ''}" readonly tabindex="-1"></label></div>
      <div class="actions" style="margin-top:12px"><button type="button" class="main" data-do="save-print"${b.lines.length ? '' : ' disabled'}>Save and print</button><button type="button" data-do="save"${b.lines.length ? '' : ' disabled'}>Save, no print</button>
        ${b.tabId ? '<button type="button" data-do="leave-tab">Keep the tab open</button><button type="button" class="danger" data-do="drop-tab">Delete this tab</button>' : `<button type="button" data-do="keep-tab"${b.lines.length && !b.orderId ? '' : ' disabled'}>Keep open as a table tab</button><button type="button" class="danger" data-do="clear">Clear</button>`}</div>`;
    paintTabs();
  }

  /* ---------- table tabs ---------- */
  async function loadTabs() { try { S.tabs = await api('GET', '/api/desk/tabs'); paintTabs(); } catch (e) { /* next time */ } }
  async function saveTab() {
    const b = S.bill;
    if (!b.tabId) return;
    try { await api('PUT', `/api/desk/tabs/${b.tabId}`, { title: b.tabTitle, lines: b.lines, name: b.name, pan: b.pan, phone: b.phone, note: b.note }); await loadTabs(); } catch (e) { toast(e.message, true); }
  }
  function openTab(id) {
    const t = S.tabs.find((v) => v.id === id); if (!t) return;
    const b = fresh();
    Object.assign(b, { lines: t.lines.map((l) => ({ ...l })), name: t.name || '', pan: t.pan || '', phone: t.phone || '', note: t.note || '', table: t.title, tabId: t.id, tabTitle: t.title });
    S.bill = b; lookPoints(); changed();
  }

  /* ---------- Pick Me points for the guest's phone ---------- */
  async function lookPoints() {
    const digits = (S.bill.phone || '').replace(/\D/g, '');
    if (digits.length < 10) { if (S.pts) { S.pts = null; S.bill.usePoints = ''; } return; }
    const phone = digits.slice(-10);
    if (S.pts && S.pts.phone === phone) return;
    try { const r = await api('GET', `/api/desk/points/${phone}`); S.pts = { phone, balance: r.balance, account: r.account }; if (S.tab === 'new') paintCart(); } catch (e) { /* no points shown */ }
  }

  /* ---------- website and app orders ---------- */
  const TYPE = { dinein: 'At the cafe', pickup: 'Pickup', delivery: 'Delivery' };
  const NAMES = { pending: 'New', acknowledged: 'Acknowledged', preparing: 'Preparing', ready: 'Ready', done: 'Done' };
  const nepalDay = (iso) => new Date(new Date(iso).getTime() + 345 * 60000).toISOString().slice(0, 10);
  const toBill = (o) => !o.paid && !o.billNo && o.status !== 'cancelled';
  const shownOrders = () => S.orders.filter((o) => o.status !== 'cancelled' && (toBill(o) || nepalDay(o.createdAt) === nepalDay(new Date().toISOString())));
  function ordersView() {
    const list = shownOrders();
    return `<div class="list">${list.length ? list.map((o) => `<article class="row" id="o-${esc(o.id)}"><header><strong>${esc(o.id)}</strong><span>${esc(o.name || 'Guest')}</span><span class="tag">${esc(TYPE[o.type] || o.type)}${o.tableNo ? ` · table ${esc(o.tableNo)}` : ''}</span><span class="tag">${esc(NAMES[o.status] || o.status)}</span><span class="tag${o.paid ? '' : ' bad'}">${o.paid ? (o.billNo ? `Bill ${esc(o.billNo)}` : 'Paid') : 'Not paid'}</span><b class="num">${rs(o.total)}</b></header>
      <p class="soft">${o.lines.map((l) => `${l.qty} × ${esc(l.name)}${l.label ? ` (${esc(l.label)})` : ''}`).join(', ')}</p>
      <footer>${toBill(o) ? `<button type="button" class="main" data-bill-order="${esc(o.id)}">Make the bill</button>` : ''}<button type="button" data-print-order="${esc(o.id)}">Print the order</button></footer></article>`).join('') : '<p class="box soft">No website or app orders today.</p>'}</div>`;
  }
  function billOrder(id) {
    const o = S.orders.find((v) => v.id === id);
    if (!o) return;
    const b = fresh();
    b.lines = o.lines.map((l) => ({ key: '', name: l.name + (l.extras && l.extras.length ? ` + ${l.extras.join(', ')}` : ''), label: l.label || '', price: Number(l.price), qty: Number(l.qty) }));
    if (o.deliveryFee) b.lines.push({ key: '', name: 'Delivery charge', label: '', price: Number(o.deliveryFee), qty: 1 });
    const used = o.points && Number(o.points.used) > 0 ? Number(o.points.value || o.points.used) : 0;
    if (used) { b.dKind = 'amount'; b.dValue = String(used); b.dReason = 'Pick Me points'; }
    b.name = o.name || ''; b.phone = o.phone || ''; b.table = o.tableNo || ''; b.orderId = o.id;
    S.bill = b; S.cartOpen = true;
    show('new');
  }

  /* ---------- Bills of a day ---------- */
  const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
  function billsView() {
    const d = S.bills;
    if (!d) return '<p class="box soft">Loading…</p>';
    const s = d.summary;
    const owner = S.me.role === 'admin';
    return `<div class="today"><label>Day <input type="date" id="day" value="${esc(d.date)}"></label><span><b class="num">${s.count}</b> bills</span><span>Total <b class="num">${rs(s.total)}</b></span>${Object.entries(s.byPayment).map(([k, v]) => `<span>${esc(k)} <b class="num">${rs(v)}</b></span>`).join('')}${s.discount ? `<span>Discounts <b class="num">${rs(s.discount)}</b></span>` : ''}${s.cancelled ? `<span>${s.cancelled} cancelled</span>` : ''}<button type="button" data-do="day-report">Print the day's report</button></div>
      <div class="list">${d.bills.length ? d.bills.map((b) => `<article class="row${b.cancelled ? ' off' : ''}"><header><strong>${esc(b.no)}</strong><span>${timeOf(b.at)}</span><span>${esc(b.customer.name || '')}${b.customer.pan ? ` · PAN ${esc(b.customer.pan)}` : ''}</span><span class="tag">${esc(b.payment)}</span>${b.cancelled ? '<span class="tag bad">Cancelled</span>' : ''}<b class="num">${rs(b.total)}</b></header>
        <p class="soft">${b.lines.map((l) => `${l.qty} × ${esc(l.name)}${l.label ? ` (${esc(l.label)})` : ''}`).join(', ')}${b.cancelled ? ` · cancelled: ${esc(b.cancelled.reason)}` : ''}</p>
        <footer><button type="button" data-open="${esc(b.id)}">See and print</button>${owner && !b.cancelled ? `<button type="button" class="danger" data-cancel="${esc(b.id)}">Cancel this bill</button>` : ''}</footer></article>`).join('') : '<p class="box soft">No bills on this day.</p>'}</div>`;
  }
  async function loadBills(date) { S.bills = await api('GET', '/api/desk/bills' + (date ? `?date=${date}` : '')); }

  /* ---------- Stock: things that are counted ---------- */
  function stockView() {
    const st = S.setup.stock || {};
    const all = [];
    catalogue().forEach((i) => i.prices.forEach((p) => all.push({ key: p.key, name: i.name + (p.label ? ` (${p.label})` : '') })));
    const counted = all.filter((x) => st[x.key] !== undefined);
    return `<div class="setup"><div class="box"><h2>Counted items</h2>
      <p class="help">Type how many are left of things you count, like cake slices. Every bill and every website or app order takes them off. At 0 the website and the app show it as sold out by themselves. Things that are not listed here are never counted.</p>
      ${counted.length ? `<table class="stock"><tbody>${counted.map((x) => `<tr><td>${esc(x.name)}</td><td style="width:110px"><input type="number" min="0" step="1" inputmode="numeric" data-stock="${esc(x.key)}" value="${st[x.key]}" aria-label="Left"></td><td><button type="button" class="quiet danger" data-unstock="${esc(x.key)}" aria-label="Stop counting">✕</button></td></tr>`).join('')}</tbody></table>` : '<p class="soft">Nothing is counted yet.</p>'}
      <form id="stock-form" class="typed" style="grid-template-columns:1fr 110px auto"><select name="key" required><option value="">Count another item…</option>${all.filter((x) => st[x.key] === undefined).map((x) => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('')}</select><input name="left" type="number" min="0" step="1" inputmode="numeric" placeholder="How many" required><button type="submit">Add</button></form>
    </div></div>`;
  }

  /* ---------- Set-up (owner) ---------- */
  function setupView() {
    const s = S.setup;
    const today = BS.todayAD();
    const show = s.show || {};
    return `<div class="setup">
      <form class="box" id="setup-form"><h2>What is printed on every bill</h2>
        <p class="help">Everything on the paper is set here. The logo is always printed. After a change, press "Save the set-up", then "Print a test bill".</p>
        <div class="logo-set"><div class="slip logo-now">${S.logo ? `<img src="${S.logo.url}" alt="The logo as it prints">` : 'No logo'}</div>
          <div><label class="btn">Upload a logo<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" hidden></label>
          ${s.logo ? '<button type="button" data-do="logo-own">Use the cafe\'s round mark again</button>' : ''}
          <p class="help">A black picture on white works best. It is printed in black and white.</p></div></div>
        <input type="hidden" name="logo" value="${esc(s.logo || '')}">
        <div class="fields">
          <label>Words under the logo (part of the logo; empty = none)<input name="logoText" maxlength="30" value="${esc(s.logoText || '')}"></label>
          <label>Logo width in mm (15 to 60)<input name="logoWidth" type="number" min="15" max="60" step="1" value="${Math.round((Number(s.logoWidth) || 320) / 8)}"></label>
          <label class="wide">Extra big line under the logo (empty = none)<input name="name" maxlength="40" value="${esc(s.name || '')}"></label>
          <label class="wide">Address line (empty = not printed)<input name="address" maxlength="120" value="${esc(paperAddress())}"></label>
          <label class="wide">Phone (empty = not printed)<input name="phone" maxlength="60" value="${esc(paperPhone())}"></label>
          <label class="wide">More top lines (one per line, for example your PAN number)<textarea name="header" rows="3" maxlength="400">${esc(s.header)}</textarea></label>
          <label class="wide">Bottom lines (one per line)<textarea name="footer" rows="3" maxlength="400">${esc(s.footer)}</textarea></label>
          <label class="check"><input type="checkbox" name="miti"${show.miti !== false ? ' checked' : ''}> Print the Nepali date</label>
          <label class="check"><input type="checkbox" name="ad"${show.ad === true ? ' checked' : ''}> Also print the English date</label>
          <label>Paper width<select name="paper"><option value="80"${s.paper === 80 ? ' selected' : ''}>80 mm (your ATPOS AT 402)</option><option value="58"${s.paper === 58 ? ' selected' : ''}>58 mm</option></select></label>
          <label>Letters per line (fewer = wider right edge)<input name="cols" type="number" min="24" max="48" step="1" value="${esc(s.cols)}"></label>
          <label>Empty space on the left (letters)<input name="margin" type="number" min="0" max="8" step="1" value="${esc(s.margin)}"></label>
          <label>Ways to pay (separate with commas)<input name="payments" maxlength="200" value="${esc(s.payments.join(', '))}"></label>
          <label class="wide">Biggest discount staff may give, in % (more needs your password or your login)<input name="maxDiscount" type="number" min="0" max="100" step="any" value="${esc(s.maxDiscount)}"></label>
        </div>
        <h2 style="margin-top:16px">Things sold only at the counter</h2>
        <p class="help">Website menu items are already in billing with their website prices, and a price changed on the website changes here within a minute. Add here what is not on the website: candles, party items and so on.</p>
        <table id="extra"><tbody>${(s.items || []).map(rowHtml).join('')}</tbody></table>
        <p style="margin:8px 0 14px"><button type="button" data-do="add-row">Add a line</button></p>
        <div class="actions"><button class="main" type="submit">Save the set-up</button><button type="button" data-do="test-print">Print a test bill</button></div>
      </form>
      <form class="box" id="csv-form"><h2>Download bills for your accountant</h2>
        <div class="fields"><label>From<input type="date" name="from" value="${today}"></label><label>To<input type="date" name="to" value="${today}"></label></div>
        <p style="margin-top:10px"><button type="submit">Download (opens in Excel)</button></p>
      </form>
      <div class="box"><h2>Connecting the printer</h2>
        <ul class="help">
          <li><b>Phone app (Android, iPhone):</b> staff log in, open Billing, and the app prints by Bluetooth.</li>
          <li><b>Android phone or tablet, or a computer with Bluetooth:</b> open this page in Chrome, make a bill, and choose "Print by Bluetooth". The first time, pick the printer from the list.</li>
          <li><b>Computer with the USB cable:</b> choose "Print with this device's print window" and pick the receipt printer.</li>
          <li><b>iPhone in Safari:</b> Safari cannot use Bluetooth printers. Use the phone app instead.</li>
        </ul>
      </div>
    </div>`;
  }
  const rowHtml = (it) => `<tr><td><input data-c="name" maxlength="80" placeholder="Name" value="${esc(it.name || '')}"></td><td><input data-c="group" maxlength="40" placeholder="Group" value="${esc(it.group || '')}"></td><td style="width:96px"><input data-c="price" type="number" min="0" step="any" placeholder="Price" value="${esc(it.price ?? '')}"><input data-c="id" type="hidden" value="${esc(it.id || '')}"></td><td><button type="button" class="quiet danger" data-do="del-row" aria-label="Remove this line">✕</button></td></tr>`;

  /* ---------- what goes on the paper ----------
   * Every paper (bill, order, day report) is a list of rows; the same rows make the on-screen copy and the
   * printer commands, so both always say the same thing.
   * Rows: ['logo'] ['title', text] ['c', text] ['b', text] ['rule'] ['two', left, right] ['big', left, right] ['text', text] */
  function cafe() {
    const b = (S.content && S.content.brand) || {};
    return { name: (b.name || 'Pick Me Cafe').toUpperCase(), address: b.address || '', phone: b.phone || '' };
  }
  const lines = (s) => String(s || '').split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  function dates(iso) {
    const ad = nepalDay(iso);
    let bs = '';
    try { const v = BS.toBS(ad); if (v) bs = `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')} BS`; } catch (e) { /* no BS date */ }
    return { ad, bs, time: timeOf(iso) };
  }
  // The address and phone on the paper: what the owner typed in Set-up, else the website's (without the country).
  const paperAddress = () => (S.setup.address !== undefined ? S.setup.address : cafe().address.replace(/,?\s*Nepal\.?$/i, ''));
  const paperPhone = () => (S.setup.phone !== undefined ? S.setup.phone : cafe().phone);
  function head(rows) {
    rows.push(['logo']);
    if (S.setup.name) rows.push(['title', S.setup.name]);
    if (paperAddress()) rows.push(['c', paperAddress()]);
    if (paperPhone()) rows.push(['c', 'Phone ' + paperPhone()]);
    lines(S.setup.header).forEach((l) => rows.push(['c', l]));
  }
  // The date rows: Nepali date (Miti) by default; the English date only if switched on in Set-up.
  function dateRows(rows, iso) {
    const d = dates(iso); const show = S.setup.show || {};
    const ad = show.ad === true || show.miti === false || !d.bs;
    if (show.miti !== false && d.bs) rows.push(['two', 'Date', `${d.bs.replace(' BS', '')} ${d.time}`]);
    if (ad) rows.push(['two', show.miti !== false && d.bs ? 'Date (AD)' : 'Date', `${d.ad} ${d.time}`]);
  }
  function billRows(b, copy) {
    const rows = [];
    head(rows);
    if (b.cancelled) rows.push(['b', '*** CANCELLED BILL ***']);
    rows.push(['rule'], ['two', 'Bill no', b.no]);
    dateRows(rows, b.at);
    if (b.table) rows.push(['two', 'Table', b.table]);
    if (b.customer.name) rows.push(['two', 'Customer', b.customer.name]);
    if (b.customer.pan) rows.push(['two', 'Customer PAN', b.customer.pan]);
    if (b.customer.phone) rows.push(['two', 'Phone', b.customer.phone]);
    rows.push(['rule']);
    b.lines.forEach((l) => { rows.push(['text', l.name + (l.label ? ` (${l.label})` : '')], ['two', `  ${l.qty} x ${l.price}`, money(l.price * l.qty).toFixed(2)]); });
    rows.push(['rule'], ['two', 'Subtotal', b.subtotal.toFixed(2)]);
    if (b.discount.amount) rows.push(['two', 'Discount' + (b.discount.kind === 'percent' ? ` ${b.discount.value}%` : ''), '-' + b.discount.amount.toFixed(2)]);
    if (b.points && b.points.used) rows.push(['two', `Points used (${b.points.used})`, '-' + Number(b.points.value).toFixed(2)]);
    rows.push(['big', 'TOTAL Rs', b.total.toFixed(2)], ['two', 'Paid by', b.payment]);
    if (b.received) rows.push(['two', 'Received', b.received.toFixed(2)], ['two', 'Change', b.change.toFixed(2)]);
    if (b.points && b.points.earned) rows.push(['two', 'Pick Me points earned', String(b.points.earned)]);
    if (b.note) rows.push(['rule'], ['text', b.note]);
    rows.push(['rule']);
    lines(S.setup.footer).forEach((l) => rows.push(['c', l]));
    if (copy) rows.push(['c', '(Copy)']);
    return rows;
  }
  function orderRows(o) {
    const rows = [];
    head(rows);
    rows.push(['b', 'ORDER (not a bill)'], ['rule'], ['two', 'Order', o.id]);
    dateRows(rows, o.createdAt);
    rows.push(['two', 'Type', (TYPE[o.type] || o.type) + (o.tableNo ? `, table ${o.tableNo}` : '')]);
    if (o.name) rows.push(['two', 'Customer', o.name]);
    if (o.phone) rows.push(['two', 'Phone', o.phone]);
    if (o.address) rows.push(['text', 'Address: ' + o.address]);
    rows.push(['rule']);
    o.lines.forEach((l) => { rows.push(['text', l.name + (l.label ? ` (${l.label})` : '') + (l.extras && l.extras.length ? ` + ${l.extras.join(', ')}` : '')], ['two', `  ${l.qty} x ${l.price}`, money(l.price * l.qty).toFixed(2)]); });
    rows.push(['rule']);
    if (o.deliveryFee) rows.push(['two', 'Delivery', Number(o.deliveryFee).toFixed(2)]);
    if (o.points && Number(o.points.used) > 0) rows.push(['two', 'Points used', '-' + Number(o.points.value || o.points.used).toFixed(2)]);
    rows.push(['big', 'TOTAL Rs', Number(o.total).toFixed(2)], ['two', 'Payment', o.paid ? 'Paid' : 'Not paid yet']);
    if (o.cakeMessage) rows.push(['text', 'On the cake: ' + o.cakeMessage]);
    if (o.notes) rows.push(['text', 'Notes: ' + o.notes]);
    rows.push(['rule']);
    return rows;
  }
  function reportRows(d) {
    const s = d.summary; const rows = [];
    head(rows);
    const day = dates(d.date + 'T12:00:00+05:45');
    rows.push(['b', "DAY'S REPORT"], ['rule'], ['two', 'Day', (S.setup.show || {}).miti !== false && day.bs ? day.bs.replace(' BS', '') : d.date], ['two', 'Printed', `${dates(new Date().toISOString()).time}`]);
    if (s.first) rows.push(['two', 'Bills', `${s.first} to ${s.last}`]);
    rows.push(['two', 'Number of bills', String(s.count)], ['rule']);
    Object.entries(s.byPayment).forEach(([k, v]) => rows.push(['two', k, Number(v).toFixed(2)]));
    rows.push(['big', 'TOTAL Rs', Number(s.total).toFixed(2)], ['rule'], ['two', 'Discounts given', Number(s.discount).toFixed(2)]);
    if (s.pointsUsed) rows.push(['two', 'Points used', String(s.pointsUsed)]);
    rows.push(['two', 'Cancelled bills', `${s.cancelled} (${Number(s.cancelledTotal || 0).toFixed(2)})`], ['rule'], ['text', 'Cash counted: ____________'], ['text', ''], ['text', 'Signed: ____________'], ['rule']);
    return rows;
  }
  function rowsHtml(rows) {
    const two = (l, r, cls) => `<div class="two${cls ? ' ' + cls : ''}"><span>${esc(l)}</span><span>${esc(r)}</span></div>`;
    return `<div class="rc">${rows.map((r) => ({
      logo: S.logo ? `<img src="${S.logo.url}" alt="Logo" style="width:${Math.round(S.logo.wb * 8 / 576 * 72)}mm;max-width:100%">` : '', title: `<h3>${esc(r[1])}</h3>`, c: `<p class="c">${esc(r[1])}</p>`, b: `<p class="c"><b>${esc(r[1])}</b></p>`,
      rule: '<hr>', two: two(r[1], r[2]), big: two(r[1], r[2], 'big'), text: `<p>${esc(r[1]) || '&nbsp;'}</p>`,
    }[r[0]])).join('')}</div>`;
  }
  // The logo as printer dots (black and white). By default the cafe's round mark with the words from Set-up drawn
  // under it; an uploaded logo is used whole, with the words under it if any are set.
  const MARK_PART = 690 / 1048; // the round mark is the top part of /img/print-logo.png (the rest is the old wordmark)
  function loadLogo() {
    return new Promise((resolve) => {
      const own = !S.setup.logo;
      const img = new Image();
      img.onload = () => {
        try {
          const w = Math.max(120, Math.min(480, Math.round((Number(S.setup.logoWidth) || 320) / 8) * 8));
          const words = String(S.setup.logoText || '').trim();
          const srcH = own ? Math.round(img.height * MARK_PART) : img.height;
          const pw = own ? Math.round(w * 0.6) : w;               // the round mark is narrower than the words
          const ph = Math.round(srcH * pw / img.width);
          const c = document.createElement('canvas');
          const g = c.getContext('2d');
          let size = 0;
          if (words) { // letters spread out, fitted to the width
            g.font = '600 100px Georgia, "Times New Roman", serif';
            const spaced = words.split('').join('\u200A');
            size = Math.min(64, Math.floor(100 * (w - 4) / g.measureText(spaced).width));
          }
          const h = ph + (words ? Math.round(size * 1.5) : 0);
          c.width = w; c.height = h;
          g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
          g.drawImage(img, 0, 0, img.width, srcH, Math.round((w - pw) / 2), 0, pw, ph);
          if (words) { g.fillStyle = '#000'; g.font = `600 ${size}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(words.split('').join('\u200A'), w / 2, ph + Math.round(size * 0.8)); }
          const px = g.getImageData(0, 0, w, h).data; const wb = w / 8; const bits = new Uint8Array(wb * h);
          for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const i = (y * w + x) * 4; if (px[i + 3] > 80 && (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) < 150) bits[y * wb + (x >> 3)] |= 0x80 >> (x & 7); }
          S.logo = { wb, h, bits, url: c.toDataURL('image/png') };
        } catch (e) { S.logo = null; }
        resolve();
      };
      img.onerror = () => { S.logo = null; resolve(); };
      img.src = S.setup.logo || '/img/print-logo.png';
    });
  }
  // The rows as printer commands (ESC/POS).
  function rowsBytes(rows) {
    const full = S.setup.paper === 58 ? 32 : 48;
    const margin = Math.min(Number(S.setup.margin) || 0, 8);
    const W = Math.max(24, Math.min(Number(S.setup.cols) || 44, full - margin));
    const out = [];
    const put = (...a) => a.forEach((v) => out.push(v));
    const text = (s) => { for (const ch of String(s).replace(/½/g, '1/2').normalize('NFKD').replace(/[̀-ͯ]/g, '')) { const c = ch.charCodeAt(0); out.push(c >= 32 && c < 127 ? c : 63); } };
    const pad = ' '.repeat(margin);
    const line = (s) => { text(pad + (s || '')); put(10); };
    const centre = (s, width) => { s = String(s); const w = width || W; const gap = Math.max(0, Math.floor((w - s.length) / 2)); return ' '.repeat(gap) + s; };
    const wrap = (s, w) => { const res = []; let cur = ''; String(s).split(/\s+/).forEach((word) => { while (word.length > w) { if (cur) { res.push(cur); cur = ''; } res.push(word.slice(0, w)); word = word.slice(w); } if ((cur + ' ' + word).trim().length > w) { res.push(cur); cur = word; } else cur = (cur + ' ' + word).trim(); }); if (cur) res.push(cur); return res.length ? res : ['']; };
    const two = (l, r, w) => { l = String(l); r = String(r); const gap = w - l.length - r.length; if (gap < 1) { const parts = wrap(l, w); return [...parts, ' '.repeat(Math.max(0, w - r.length)) + r]; } return [l + ' '.repeat(gap) + r]; };
    put(27, 64, 27, 97, 0);
    rows.forEach((r) => {
      if (r[0] === 'logo') {
        if (!S.logo) return;
        // The picture goes in short strips, centred by the printer. Short strips let the printer print while the
        // rest is still arriving, so a slow Bluetooth link cannot overflow it (that printed rubbish on 27 Nov 2026).
        const wb = S.logo.wb;
        put(27, 97, 1);
        for (let y0 = 0; y0 < S.logo.h; y0 += 24) {
          const n = Math.min(24, S.logo.h - y0);
          put(29, 118, 48, 0, wb & 255, wb >> 8, n & 255, n >> 8);
          for (let i = y0 * wb; i < (y0 + n) * wb; i += 1) out.push(S.logo.bits[i]);
        }
        put(27, 97, 0, 10);
      } else if (r[0] === 'title') { put(27, 69, 1, 29, 33, 17); wrap(r[1], Math.floor(W / 2)).forEach((l) => { text(' '.repeat(Math.floor(margin / 2)) + centre(l, Math.floor(W / 2))); put(10); }); put(29, 33, 0, 27, 69, 0); }
      else if (r[0] === 'c') wrap(r[1], W).forEach((l) => line(centre(l)));
      else if (r[0] === 'b') { put(27, 69, 1); wrap(r[1], W).forEach((l) => line(centre(l))); put(27, 69, 0); }
      else if (r[0] === 'rule') line('-'.repeat(W));
      else if (r[0] === 'two') two(r[1], r[2], W).forEach(line);
      else if (r[0] === 'big') { put(27, 69, 1, 29, 33, 1); two(r[1], r[2], W).forEach(line); put(29, 33, 0, 27, 69, 0); }
      else wrap(r[1], W).forEach(line);
    });
    put(10, 10, 10, 10, 29, 86, 66, 0); // feed and cut
    return new Uint8Array(out);
  }
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]); return btoa(s); };

  /* ---------- printing ---------- */
  // Bluetooth printers of this kind (ESC/POS over Bluetooth LE) use one of these services.
  const BLE_SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb', '0000fff0-0000-1000-8000-00805f9b34fb', '0000ae30-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb'];
  const BT = { device: null, ch: null };
  async function btChannel() {
    if (BT.ch && BT.device && BT.device.gatt.connected) return BT.ch;
    if (!BT.device) BT.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    const server = await BT.device.gatt.connect();
    for (const id of BLE_SERVICES) {
      let service;
      try { service = await server.getPrimaryService(id); } catch (e) { continue; }
      const chars = await service.getCharacteristics();
      const ch = chars.find((c) => c.properties.writeWithoutResponse) || chars.find((c) => c.properties.write);
      if (ch) { BT.ch = ch; return ch; }
    }
    BT.device = null;
    throw new Error('That device did not accept a bill. Choose the receipt printer from the list.');
  }
  async function printBluetooth(bytes) {
    const ch = await btChannel();
    // Small pieces with pauses, so the printer drops nothing; a piece that fails is tried again.
    let fast = ch.properties.writeWithoutResponse;
    let sent = 0;
    for (let i = 0; i < bytes.length; i += 100) {
      const part = bytes.slice(i, i + 100);
      let ok = false; let last = null;
      for (let attempt = 0; attempt < 6 && !ok; attempt += 1) {
        try { if (fast) await ch.writeValueWithoutResponse(part); else await ch.writeValueWithResponse(part); ok = true; } catch (e) {
          last = e;
          if (attempt === 3 && ch.properties.write && ch.properties.writeWithoutResponse) fast = !fast;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      if (!ok) { BT.ch = null; throw new Error(`The printer stopped part way. Switch it off and on, then print again. (${String((last && last.message) || '').slice(0, 100)})`); }
      sent += 100;
      await new Promise((r) => setTimeout(r, fast ? 35 : 5));
      if (sent >= 1000) { sent = 0; await new Promise((r) => setTimeout(r, 150)); }
    }
  }
  function printWindow(rows) {
    document.body.classList.toggle('paper58', S.setup.paper === 58);
    $('paper').innerHTML = rowsHtml(rows);
    const img = $('paper').querySelector('img');
    const go = () => window.print();
    if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
  }
  async function print(rows, how, label) {
    try {
      if (how === 'app') { toApp({ type: 'print', data: b64(rowsBytes(rows)), no: label || '' }); }
      else if (how === 'bt') { await printBluetooth(rowsBytes(rows)); toast('Sent to the printer.'); }
      else if (how === 'rawbt') { window.location.href = 'rawbt:base64,' + b64(rowsBytes(rows)); }
      else printWindow(rows);
    } catch (e) {
      if (e && e.name === 'NotFoundError') return; // the printer list was closed
      toast(e.message || 'Could not print. Check that the printer is on and close by.', true);
    }
  }
  // Shows a paper on the screen with the ways to print it. printNow sends it straight to the printer when one is known.
  function openPaper(rows, { label, done, printNow } = {}) {
    S.open = { rows, label };
    const android = /Android/i.test(navigator.userAgent);
    const hasBt = Boolean(navigator.bluetooth);
    $('sheet').innerHTML = `<div><div class="slip">${rowsHtml(rows)}</div><div class="btns">
      ${IN_APP ? '<button type="button" class="main" data-print="app">Print</button>' : ''}
      ${!IN_APP && hasBt ? '<button type="button" class="main" data-print="bt">Print by Bluetooth</button>' : ''}
      ${!IN_APP ? `<button type="button"${hasBt ? '' : ' class="main"'} data-print="win">Print with this device's print window</button>` : ''}
      ${!IN_APP && android ? '<button type="button" data-print="rawbt">Print with the RawBT printer app</button>' : ''}
      <button type="button" data-do="close-sheet">${done || 'Close'}</button></div></div>`;
    $('sheet').hidden = false;
    if (printNow && (IN_APP || (hasBt && BT.device))) print(rows, IN_APP ? 'app' : 'bt', label);
  }
  // Asks for the owner's password (a discount above the staff limit).
  function askOwner(message) {
    return new Promise((resolve) => {
      $('sheet').innerHTML = `<div><form id="owner-form" class="btns"><h2 style="font-size:1.05rem">Owner's password</h2><p class="soft">${esc(message)}</p><input name="pw" type="password" autocomplete="off" required aria-label="Owner's password"><button class="main" type="submit">Allow this discount</button><button type="button" data-do="owner-no">Cancel</button></form></div>`;
      $('sheet').hidden = false;
      S.ownerDone = (v) => { $('sheet').hidden = true; S.ownerDone = null; resolve(v); };
      setTimeout(() => { const i = document.querySelector('#owner-form input'); if (i) i.focus(); }, 50);
    });
  }

  /* ---------- drawing and events ---------- */
  async function show(tab) {
    S.tab = tab;
    if (tab !== 'new') { S.cartOpen = false; document.body.classList.remove('cart-open'); }
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    const v = $('view');
    if (tab === 'new') { v.innerHTML = newView(); paintItems(); paintCart(); paintDock(); }
    else if (tab === 'orders') { v.innerHTML = ordersView(); }
    else if (tab === 'bills') { v.innerHTML = billsView(); try { await loadBills(S.bills && S.bills.date); if (S.tab === 'bills') v.innerHTML = billsView(); } catch (e) { toast(e.message, true); } }
    else if (tab === 'stock') { v.innerHTML = stockView(); }
    else if (tab === 'setup') { v.innerHTML = setupView(); }
  }
  async function loadOrders() {
    try { S.orders = await api('GET', '/api/desk/orders'); } catch (e) { return; }
    const n = S.orders.filter(toBill).length;
    $('n-orders').textContent = n; $('n-orders').hidden = !n;
    if (S.tab === 'orders' && $('sheet').hidden) $('view').innerHTML = ordersView();
  }
  // Prices, items and stock follow the website: fetched again every minute.
  async function refresh() {
    try {
      const [c, s] = await Promise.all([api('GET', '/api/content'), api('GET', '/api/desk/bill-setup')]);
      const was = JSON.stringify([S.content.menu, S.setup.items, S.setup.stock]);
      S.content = c;
      if (S.tab !== 'setup') { const logoWas = JSON.stringify([S.setup.logo, S.setup.logoText, S.setup.logoWidth]); S.setup = s; if (logoWas !== JSON.stringify([s.logo, s.logoText, s.logoWidth])) loadLogo(); }
      if (S.tab === 'new' && was !== JSON.stringify([c.menu, s.items, s.stock])) paintItems();
      if (S.tab === 'stock' && !document.activeElement.matches('input, select')) $('view').innerHTML = stockView();
    } catch (e) { /* next minute */ }
  }
  async function saveBill(andPrint) {
    if (S.busy) return;
    const b = S.bill;
    if (b.pan && !/^\d{9}$/.test(b.pan.trim())) return toast('A PAN number has 9 digits. Check it, or leave it empty.', true);
    S.busy = true;
    const body = {
      ref: b.ref, lines: b.lines, discount: { kind: b.dKind, value: Number(b.dValue) || 0, reason: b.dReason },
      customer: { name: b.name, pan: b.pan.trim(), phone: b.phone }, table: b.table, note: b.note, payment: b.payment, received: Number(b.received) || 0,
      orderId: b.orderId, tabId: b.tabId, usePoints: Math.floor(Number(b.usePoints) || 0),
    };
    try {
      let saved;
      for (;;) {
        try { saved = await api('POST', '/api/desk/bills', body); break; } catch (e) {
          if (e.code !== 'owner') throw e;
          const pw = await askOwner(e.message);
          if (!pw) { S.busy = false; return; }
          body.ownerPassword = pw;
        }
      }
      clearTimeout(S.tabT);
      S.bill = fresh(); S.pts = null; S.cartOpen = false;
      changed();
      toast(`Bill ${saved.no} saved.`);
      openPaper(billRows(saved, false), { label: saved.no, done: 'Done, new bill', printNow: andPrint });
      loadOrders(); loadTabs(); refresh();
    } catch (e) { toast(e.message, true); }
    S.busy = false;
  }
  async function keepTab() {
    const b = S.bill;
    let title = (b.table || '').trim();
    if (!title) { title = (window.prompt('Table number or a name for this tab:') || '').trim(); if (!title) return; }
    b.tabId = 't_' + rid(); b.tabTitle = /^\d+$/.test(title) ? `Table ${title}` : title; b.table = b.table || title;
    await saveTab();
    S.bill = fresh(); S.pts = null; S.cartOpen = false; changed();
    toast('Tab kept open. Tap it at the top to add more or to take the payment.');
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    buzz();
    const d = t.dataset;
    if (d.tab) return show(d.tab);
    if (d.cat) { S.cat = d.cat; S.q = ''; $('q').value = ''; document.querySelectorAll('#chips button').forEach((x) => x.classList.toggle('on', x.dataset.cat === S.cat)); return paintItems(); }
    if (d.add) {
      const it = catalogue().find((i) => i.id === d.add); const p = it && it.prices[Number(d.n)];
      if (!p) return;
      const have = left(p.key);
      if (have !== null && onBill(p.key) >= have) return toast(have === 0 ? `${it.name} is sold out.` : `Only ${have} left of ${it.name}.`, true);
      return addLine(p.key, it.name, p.label, p.price);
    }
    if (d.qty) {
      const l = S.bill.lines[Number(d.i)]; if (!l) return;
      const have = l.key ? left(l.key) : null;
      if (Number(d.qty) > 0 && have !== null && onBill(l.key) >= have) return toast(`Only ${have} left of ${l.name}.`, true);
      l.qty += Number(d.qty); if (l.qty < 1) S.bill.lines.splice(Number(d.i), 1);
      return changed();
    }
    if (d.del) { S.bill.lines.splice(Number(d.del), 1); return changed(); }
    if (d.pay) { S.bill.payment = d.pay; return paintCart(); }
    if (d.tabOpen) return openTab(d.tabOpen);
    if (d.billOrder) return billOrder(d.billOrder);
    if (d.printOrder) { const o = S.orders.find((v) => v.id === d.printOrder); if (o) openPaper(orderRows(o), { label: o.id, printNow: true }); return; }
    if (d.print) return print(S.open.rows, d.print, S.open.label);
    if (d.open) { try { const b = await api('GET', `/api/desk/bills/${d.open}`); openPaper(billRows(b, true), { label: b.no }); } catch (err) { toast(err.message, true); } return; }
    if (d.cancel) {
      const reason = window.prompt('Why is this bill cancelled? It stays in the list, marked cancelled.');
      if (!reason) return;
      try { await api('POST', `/api/admin/bills/${d.cancel}/cancel`, { reason }); await show('bills'); toast('Bill cancelled.'); } catch (err) { toast(err.message, true); }
      return;
    }
    if (d.unstock) { try { S.setup.stock = (await api('POST', '/api/desk/stock', { key: d.unstock, left: null })).stock; show('stock'); } catch (err) { toast(err.message, true); } return; }
    if (d.do === 'save-print') return saveBill(true);
    if (d.do === 'save') return saveBill(false);
    if (d.do === 'clear') { if (!S.bill.lines.length || window.confirm('Clear this bill?')) { S.bill = fresh(); S.pts = null; changed(); } return; }
    if (d.do === 'keep-tab') return keepTab();
    if (d.do === 'leave-tab') { clearTimeout(S.tabT); await saveTab(); S.bill = fresh(); S.pts = null; S.cartOpen = false; return changed(); }
    if (d.do === 'drop-tab') { if (!window.confirm(`Delete the tab "${S.bill.tabTitle}" and everything on it?`)) return; clearTimeout(S.tabT); try { await api('DELETE', `/api/desk/tabs/${S.bill.tabId}`); } catch (err) { return toast(err.message, true); } S.bill = fresh(); S.cartOpen = false; await loadTabs(); return changed(); }
    if (d.do === 'open-cart') { S.cartOpen = true; paintDock(); window.scrollTo(0, 0); return; }
    if (d.do === 'close-cart') { S.cartOpen = false; paintDock(); return; }
    if (d.do === 'close-sheet') { $('sheet').hidden = true; return; }
    if (d.do === 'owner-no') { if (S.ownerDone) S.ownerDone(''); return; }
    if (d.do === 'day-report') { if (S.bills) openPaper(reportRows(S.bills), { label: 'report' }); return; }
    if (d.do === 'test-print') {
      const now = new Date().toISOString();
      return openPaper(billRows({ no: 'TEST', at: now, table: '4', customer: { name: 'Test customer', pan: '123456789', phone: '' }, lines: [{ name: 'Coconut Snow White Cheese Cake', label: 'Slice', price: 290, qty: 1 }, { name: 'Cappuccino', label: 'Large', price: 220, qty: 2 }], subtotal: 730, discount: { kind: 'percent', value: 10, amount: 73 }, total: 657, payment: 'Cash', received: 1000, change: 343, note: 'This is a test. Save the set-up first to try new settings.' }, false), { label: 'TEST' });
    }
    if (d.do === 'vibe') { try { localStorage.setItem('pm_vibe', vibeOn() ? 'off' : 'on'); } catch (err) { /* private mode */ } paintVibe(); buzz(); return; }
    if (d.do === 'logo-own') { document.querySelector('#setup-form [name=logo]').value = ''; S.setup.logo = ''; await loadLogo(); document.querySelector('.logo-now').innerHTML = S.logo ? `<img src="${S.logo.url}" alt="">` : ''; toast('Press "Save the set-up" to keep it.'); return; }
    if (d.do === 'add-row') { document.querySelector('#extra tbody').insertAdjacentHTML('beforeend', rowHtml({})); return; }
    if (d.do === 'del-row') { t.closest('tr').remove(); return; }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'q') { S.q = t.value; return paintItems(); }
    if (t.dataset.f) {
      const f = t.dataset.f;
      S.bill[f] = t.value;
      if (S.bill.tabId) { clearTimeout(S.tabT); S.tabT = setTimeout(saveTab, 1200); }
      if (f === 'phone') { clearTimeout(S.pt); S.pt = setTimeout(lookPoints, 500); }
      // The totals depend on these; redraw after a pause and put the cursor back.
      if (['dValue', 'received', 'usePoints'].includes(f)) { clearTimeout(S.rt); S.rt = setTimeout(() => { const had = document.activeElement === t; paintCart(); paintDock(); if (had) { const n = document.querySelector(`[data-f="${f}"]`); if (n) n.focus(); } }, 700); }
    }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.f === 'dKind') { S.bill.dKind = t.value; paintCart(); paintDock(); }
    if (t.id === 'day' && t.value) { try { await loadBills(t.value); $('view').innerHTML = billsView(); } catch (err) { toast(err.message, true); } }
    if (t.id === 'logo-file' && t.files && t.files[0]) {
      const file = t.files[0];
      if (file.size > 8 * 1024 * 1024) return toast('That picture is too big. Use one under 8 MB.', true);
      try {
        const up = await fetch('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        const data = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(data.error || 'Could not upload the picture.');
        if (/\.svg$/.test(data.url)) throw new Error('Upload the logo as a PNG or JPG picture.');
        document.querySelector('#setup-form [name=logo]').value = data.url;
        S.setup.logo = data.url; await loadLogo();
        document.querySelector('.logo-now').innerHTML = S.logo ? `<img src="${S.logo.url}" alt="">` : '';
        toast('Logo uploaded. Press "Save the set-up" to keep it.');
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (t.dataset.stock) { try { S.setup.stock = (await api('POST', '/api/desk/stock', { key: t.dataset.stock, left: t.value })).stock; toast('Saved.'); } catch (err) { toast(err.message, true); } }
  });
  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'typed') {
      const price = Number(f.price.value);
      if (!f.name.value.trim() || !(price >= 0)) return;
      addLine('', f.name.value.trim(), '', money(price)); f.reset();
    } else if (f.id === 'owner-form') {
      if (S.ownerDone) S.ownerDone(f.pw.value);
    } else if (f.id === 'stock-form') {
      try { S.setup.stock = (await api('POST', '/api/desk/stock', { key: f.key.value, left: f.left.value })).stock; show('stock'); } catch (err) { toast(err.message, true); }
    } else if (f.id === 'gate-form') {
      try {
        await api('POST', '/api/auth/login', { username: f.username.value.trim(), password: f.password.value, remember: f.remember.checked });
        f.password.value = ''; $('gate').hidden = true; start();
      } catch (err) { $('gate-msg').textContent = err.message; }
    } else if (f.id === 'setup-form') {
      const items = [...document.querySelectorAll('#extra tbody tr')].map((tr) => { const g = (c) => tr.querySelector(`[data-c="${c}"]`).value; return { id: g('id'), name: g('name').trim(), group: g('group').trim(), price: Number(g('price')) }; }).filter((it) => it.name);
      try {
        S.setup = await api('PUT', '/api/admin/bill-setup', { header: f.header.value, footer: f.footer.value, paper: Number(f.paper.value), cols: Number(f.cols.value), margin: Number(f.margin.value), maxDiscount: Number(f.maxDiscount.value), show: { miti: f.miti.checked, ad: f.ad.checked }, logo: f.logo.value, logoText: f.logoText.value, logoWidth: Number(f.logoWidth.value) * 8, name: f.name.value, address: f.address.value, phone: f.phone.value, payments: f.payments.value.split(','), items });
        await loadLogo();
        toast('Set-up saved.'); show('setup');
      } catch (err) { toast(err.message, true); }
    } else if (f.id === 'csv-form') {
      window.location.href = `/api/admin/bills.csv?from=${f.from.value}&to=${f.to.value}`;
    }
  });
  $('logout').addEventListener('click', async () => { await api('POST', '/api/auth/logout').catch(() => {}); gate(''); });
  function paintVibe() { const b = $('vibe'); if (b) b.textContent = vibeOn() ? 'Vibration: on' : 'Vibration: off'; }

  async function start() {
    let me;
    try { me = await api('GET', '/api/auth/me'); } catch (e) { return; }
    if (!me.role || me.role === 'driver') return gate(me.role === 'driver' ? 'Billing is for counter staff.' : '');
    S.me = me;
    $('gate').hidden = true;
    $('who').textContent = me.name ? `· ${me.name}` : '';
    $('to-admin').hidden = me.role !== 'admin' || IN_APP;
    $('tab-setup').hidden = me.role !== 'admin';
    $('vibe').hidden = IN_APP || !navigator.vibrate; // the app has its own vibration setting
    paintVibe();
    if (IN_APP) { $('to-counter').hidden = true; $('logout').hidden = true; }
    try { [S.content, S.setup] = await Promise.all([api('GET', '/api/content'), api('GET', '/api/desk/bill-setup')]); } catch (e) { return toast(e.message, true); }
    await loadLogo();
    await loadOrders();
    const m = /^#order=(.+)$/.exec(window.location.hash);
    if (m) {
      const id = decodeURIComponent(m[1]);
      window.history.replaceState(null, '', window.location.pathname);
      const o = S.orders.find((v) => v.id === id);
      if (o && toBill(o)) billOrder(id); else { await show('orders'); if (o) openPaper(orderRows(o), { label: o.id }); }
    } else show('new');
    loadTabs();
    clearInterval(S.poll); S.poll = setInterval(() => { loadOrders(); loadTabs(); }, 20000);
    clearInterval(S.poll2); S.poll2 = setInterval(refresh, 60000);
  }
  window.PM_BILL = { rowsBytes, billRows, loadLogo, state: S }; // for tests
  start();
})();
