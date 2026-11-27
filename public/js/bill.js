/* Billing at the counter (version 13): make a bill, print it on the 80 mm receipt printer, look up old bills.
 * Staff and the owner use it at /bill; the phone app shows the same page in its staff mode.
 * Printing: (1) Bluetooth straight from the page (Chrome on Android or a computer), (2) the phone app's own
 * Bluetooth printing when the page runs inside the app, (3) the browser's print window (USB / any printer),
 * (4) the RawBT printer app on Android. All four print the same bill. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rs = (n) => 'Rs ' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const money = (n) => Math.round(Number(n) * 100) / 100;
  const IN_APP = Boolean(window.ReactNativeWebView);
  const S = { me: null, content: null, setup: null, tab: 'new', cat: 'all', q: '', bill: fresh(), orders: [], day: null, bills: null, busy: false };

  function fresh() {
    return { lines: [], dKind: 'amount', dValue: '', dReason: '', name: '', pan: '', phone: '', table: '', note: '', payment: '', received: '', orderId: '', orderCode: '', ref: Math.random().toString(36).slice(2) + Date.now().toString(36) };
  }
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, bad ? 5000 : 2600);
  }
  async function api(method, url, body) {
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    if (window.PM_TOKEN) headers['X-PM-Auth'] = window.PM_TOKEN; // inside the phone app
    let r;
    try { r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }); } catch (e) { throw new Error('No internet connection. Please check it and try again.'); }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && !/auth\/login/.test(url)) { gate('Please log in.'); throw new Error('Please log in.'); }
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
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
      if (prices.length) out.push({ key: it.id, name: it.name, group: g.name, prices: prices.map((p) => ({ label: p.label || '', price: Number(p.price) })) });
    }));
    (S.setup.items || []).forEach((it) => out.push({ key: it.id, name: it.name, group: it.group || 'Other', prices: [{ label: '', price: Number(it.price) }] }));
    return out;
  }
  const groups = () => [...new Set(catalogue().map((i) => i.group))];
  function addLine(name, label, price) {
    const l = S.bill.lines.find((v) => v.name === name && v.label === label && v.price === price);
    if (l) l.qty += 1; else S.bill.lines.push({ name, label, price, qty: 1 });
    paintCart();
  }
  function totals(b) {
    const subtotal = money(b.lines.reduce((n, l) => n + l.price * l.qty, 0));
    const v = Math.max(0, Number(b.dValue) || 0);
    const discount = Math.min(subtotal, money(b.dKind === 'percent' ? subtotal * Math.min(v, 100) / 100 : v));
    return { subtotal, discount, total: money(subtotal - discount) };
  }

  /* ---------- New bill ---------- */
  function newView() {
    const gs = groups();
    return `<div class="pos">
      <div class="box">
        <input id="q" type="search" placeholder="Search an item" value="${esc(S.q)}" autocomplete="off">
        <div class="chips" id="chips"><button type="button" data-cat="all" class="${S.cat === 'all' ? 'on' : ''}">All</button>${gs.map((g) => `<button type="button" data-cat="${esc(g)}" class="${S.cat === g ? 'on' : ''}">${esc(g)}</button>`).join('')}</div>
        <div class="items" id="items"></div>
        <form class="typed" id="typed"><input name="name" placeholder="Something not on the list" maxlength="100" required><input name="price" type="number" inputmode="decimal" min="0" step="any" placeholder="Price" required><button type="submit">Add</button></form>
      </div>
      <div class="box cart" id="cart"></div>
    </div>`;
  }
  function paintItems() {
    const q = S.q.trim().toLowerCase();
    const list = catalogue().filter((i) => (q ? i.name.toLowerCase().includes(q) : S.cat === 'all' || i.group === S.cat));
    $('items').innerHTML = list.length ? list.map((i) => `<div class="item"><b>${esc(i.name)}</b><div class="sizes">${i.prices.map((p, n) => `<button type="button" data-add="${esc(i.key)}" data-n="${n}">${p.label ? `<small>${esc(p.label)}</small>` : ''}${p.price}</button>`).join('')}</div></div>`).join('') : '<p class="soft">Nothing found. Type it in the box below with its price.</p>';
  }
  function paintCart() {
    const b = S.bill;
    const t = totals(b);
    const pays = S.setup.payments;
    if (!pays.includes(b.payment)) b.payment = pays[0];
    const change = Number(b.received) > t.total ? money(Number(b.received) - t.total) : 0;
    $('cart').innerHTML = `<h2>This bill</h2>
      ${b.orderId ? `<p class="from-order">For order ${esc(b.orderCode)}. Saving this bill marks the order paid.</p>` : ''}
      ${b.lines.length ? `<ul>${b.lines.map((l, i) => `<li><span class="nm">${esc(l.name)} ${l.label ? `<small>${esc(l.label)}</small>` : ''}</span><span class="amt num">${rs(l.price * l.qty)}</span>
        <span class="qty"><button type="button" data-qty="-1" data-i="${i}" aria-label="One less">−</button><span class="num">${l.qty}</span><button type="button" data-qty="1" data-i="${i}" aria-label="One more">+</button><small class="soft num">× ${l.price}</small></span>
        <button type="button" class="quiet danger" data-del="${i}">Remove</button></li>`).join('')}</ul>` : '<p class="empty">Tap items to add them to the bill.</p>'}
      <div class="fields">
        <label>Discount<select data-f="dKind"><option value="amount"${b.dKind === 'amount' ? ' selected' : ''}>Rs off</option><option value="percent"${b.dKind === 'percent' ? ' selected' : ''}>% off</option></select></label>
        <label>How much<input data-f="dValue" type="number" inputmode="decimal" min="0" step="any" value="${esc(b.dValue)}" placeholder="0"></label>
        <label class="wide">Customer name<input data-f="name" maxlength="80" value="${esc(b.name)}" autocomplete="off"></label>
        <label>Customer PAN (9 digits)<input data-f="pan" inputmode="numeric" maxlength="9" value="${esc(b.pan)}" autocomplete="off"></label>
        <label>Phone<input data-f="phone" type="tel" maxlength="20" value="${esc(b.phone)}" autocomplete="off"></label>
        <label>Table<input data-f="table" maxlength="12" value="${esc(b.table)}" autocomplete="off"></label>
        <label>Note on the bill<input data-f="note" maxlength="200" value="${esc(b.note)}" autocomplete="off"></label>
      </div>
      <div class="sum num"><div><span>Subtotal</span><span>${rs(t.subtotal)}</span></div>${t.discount ? `<div><span>Discount</span><span>− ${rs(t.discount)}</span></div>` : ''}<div class="total"><span>Total</span><span>${rs(t.total)}</span></div></div>
      <p class="soft" style="margin-bottom:6px">Paid by</p>
      <div class="pay">${pays.map((p) => `<button type="button" data-pay="${esc(p)}" class="${b.payment === p ? 'on' : ''}">${esc(p)}</button>`).join('')}</div>
      <div class="fields" style="margin-top:10px"><label>Money received<input data-f="received" type="number" inputmode="decimal" min="0" step="any" value="${esc(b.received)}" placeholder="optional"></label><label>Change to give<input value="${change ? rs(change) : ''}" readonly tabindex="-1"></label></div>
      <div class="actions" style="margin-top:12px"><button type="button" class="main" data-do="save-print"${b.lines.length ? '' : ' disabled'}>Save and print</button><button type="button" data-do="save"${b.lines.length ? '' : ' disabled'}>Save, no print</button><button type="button" class="danger" data-do="clear">Clear</button></div>`;
  }

  /* ---------- Unpaid website and app orders ---------- */
  const TYPE = { dinein: 'At the cafe', pickup: 'Pickup', delivery: 'Delivery' };
  const unpaid = () => S.orders.filter((o) => !o.paid && !o.billNo && !['cancelled'].includes(o.status));
  function ordersView() {
    const list = unpaid();
    return `<div class="list">${list.length ? list.map((o) => `<article class="row"><header><strong>${esc(o.id)}</strong><span>${esc(o.name || 'Guest')}</span><span class="tag">${esc(TYPE[o.type] || o.type)}${o.tableNo ? ` · table ${esc(o.tableNo)}` : ''}</span><b class="num">${rs(o.total)}</b></header>
      <p class="soft">${o.lines.map((l) => `${l.qty} × ${esc(l.name)}${l.label ? ` (${esc(l.label)})` : ''}`).join(', ')}</p>
      <footer><button type="button" class="main" data-bill-order="${esc(o.id)}">Make the bill</button></footer></article>`).join('') : '<p class="box soft">No unpaid website or app orders.</p>'}</div>`;
  }
  function billOrder(id) {
    const o = S.orders.find((v) => v.id === id);
    if (!o) return;
    const b = fresh();
    b.lines = o.lines.map((l) => ({ name: l.name + (l.extras && l.extras.length ? ` + ${l.extras.join(', ')}` : ''), label: l.label || '', price: Number(l.price), qty: Number(l.qty) }));
    if (o.deliveryFee) b.lines.push({ name: 'Delivery charge', label: '', price: Number(o.deliveryFee), qty: 1 });
    const used = o.points && Number(o.points.used) > 0 ? Number(o.points.value || o.points.used) : 0;
    if (used) { b.dKind = 'amount'; b.dValue = String(used); b.dReason = 'Pick Me points'; }
    b.name = o.name || ''; b.phone = o.phone || ''; b.table = o.tableNo || ''; b.orderId = o.id; b.orderCode = o.id;
    S.bill = b;
    show('new');
  }

  /* ---------- Bills of a day ---------- */
  const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
  function billsView() {
    const d = S.bills;
    if (!d) return '<p class="box soft">Loading…</p>';
    const s = d.summary;
    const owner = S.me.role === 'admin';
    return `<div class="today"><label>Day <input type="date" id="day" value="${esc(d.date)}"></label><span><b class="num">${s.count}</b> bills</span><span>Total <b class="num">${rs(s.total)}</b></span>${Object.entries(s.byPayment).map(([k, v]) => `<span>${esc(k)} <b class="num">${rs(v)}</b></span>`).join('')}${s.discount ? `<span>Discounts <b class="num">${rs(s.discount)}</b></span>` : ''}${s.cancelled ? `<span>${s.cancelled} cancelled</span>` : ''}</div>
      <div class="list">${d.bills.length ? d.bills.map((b) => `<article class="row${b.cancelled ? ' off' : ''}"><header><strong>${esc(b.no)}</strong><span>${timeOf(b.at)}</span><span>${esc(b.customer.name || '')}${b.customer.pan ? ` · PAN ${esc(b.customer.pan)}` : ''}</span><span class="tag">${esc(b.payment)}</span>${b.cancelled ? '<span class="tag bad">Cancelled</span>' : ''}<b class="num">${rs(b.total)}</b></header>
        <p class="soft">${b.lines.map((l) => `${l.qty} × ${esc(l.name)}${l.label ? ` (${esc(l.label)})` : ''}`).join(', ')}${b.cancelled ? ` · cancelled: ${esc(b.cancelled.reason)}` : ''}</p>
        <footer><button type="button" data-open="${esc(b.id)}">See and print</button>${owner && !b.cancelled ? `<button type="button" class="danger" data-cancel="${esc(b.id)}">Cancel this bill</button>` : ''}</footer></article>`).join('') : '<p class="box soft">No bills on this day.</p>'}</div>`;
  }
  async function loadBills(date) {
    S.bills = await api('GET', '/api/desk/bills' + (date ? `?date=${date}` : ''));
  }

  /* ---------- Set-up (owner) ---------- */
  function setupView() {
    const s = S.setup;
    const today = BS.todayAD();
    return `<div class="setup">
      <form class="box" id="setup-form"><h2>What is printed on every bill</h2>
        <div class="fields">
          <label class="wide">Top line (your PAN number)<input name="header" maxlength="300" value="${esc(s.header)}"></label>
          <label class="wide">Bottom line<input name="footer" maxlength="300" value="${esc(s.footer)}"></label>
          <label class="wide">Ways to pay (separate with commas)<input name="payments" maxlength="200" value="${esc(s.payments.join(', '))}"></label>
          <label>Paper width<select name="paper"><option value="80"${s.paper === 80 ? ' selected' : ''}>80 mm (your ATPOS AT 402)</option><option value="58"${s.paper === 58 ? ' selected' : ''}>58 mm</option></select></label>
        </div>
        <p class="help">The cafe's name, address and phone come from the website (Edit website &gt; Cafe details).</p>
        <h2 style="margin-top:16px">Things sold only at the counter</h2>
        <p class="help">Website menu items are already in billing with their website prices. Add here what is not on the website: candles, party items, hookah and so on.</p>
        <table id="extra"><tbody>${(s.items || []).map(rowHtml).join('')}</tbody></table>
        <p style="margin:8px 0 14px"><button type="button" data-do="add-row">Add a line</button></p>
        <button class="main" type="submit">Save the set-up</button>
      </form>
      <form class="box" id="csv-form"><h2>Download bills for your accountant</h2>
        <div class="fields"><label>From<input type="date" name="from" value="${today}"></label><label>To<input type="date" name="to" value="${today}"></label></div>
        <p style="margin-top:10px"><button type="submit">Download (opens in Excel)</button></p>
      </form>
      <div class="box"><h2>Connecting the printer</h2>
        <ul class="help">
          <li><b>Android phone or tablet, or a computer with Bluetooth:</b> open this page in Chrome, make a bill, and choose "Print by Bluetooth". The first time, pick the printer from the list.</li>
          <li><b>Computer with the USB cable:</b> choose "Print with this device's print window" and pick the receipt printer.</li>
          <li><b>Phone app:</b> staff log in, open Billing, and the app prints by Bluetooth.</li>
          <li><b>iPhone in Safari:</b> Safari cannot use Bluetooth printers. Use the phone app instead.</li>
        </ul>
      </div>
    </div>`;
  }
  const rowHtml = (it) => `<tr><td><input data-c="name" maxlength="80" placeholder="Name" value="${esc(it.name || '')}"></td><td><input data-c="group" maxlength="40" placeholder="Group" value="${esc(it.group || '')}"></td><td style="width:96px"><input data-c="price" type="number" min="0" step="any" placeholder="Price" value="${esc(it.price ?? '')}"><input data-c="id" type="hidden" value="${esc(it.id || '')}"></td><td><button type="button" class="quiet danger" data-do="del-row" aria-label="Remove this line">✕</button></td></tr>`;

  /* ---------- the paper bill ---------- */
  function cafe() {
    const b = (S.content && S.content.brand) || {};
    return { name: (b.name || 'Pick Me Cafe').toUpperCase(), address: b.address || '', phone: b.phone || '' };
  }
  function dates(iso) {
    const ad = new Date(new Date(iso).getTime() + 345 * 60000).toISOString().slice(0, 10);
    let bs = '';
    try { const v = BS.toBS(ad); if (v) bs = `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')} BS`; } catch (e) { /* no BS date */ }
    return { ad, bs, time: timeOf(iso) };
  }
  function receiptHtml(b, copy) {
    const c = cafe(); const d = dates(b.at);
    const row = (l, r, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${l}</td><td class="r">${r}</td></tr>`;
    return `<div class="rc"><img src="/img/print-logo.png" alt=""><h3>${esc(c.name)}</h3>
      <p class="c">${esc(c.address)}${c.phone ? `<br>Phone ${esc(c.phone)}` : ''}${S.setup.header ? `<br>${esc(S.setup.header)}` : ''}</p>
      ${b.cancelled ? '<p class="void">CANCELLED BILL</p>' : ''}<hr>
      <table>${row('Bill no', esc(b.no))}${row('Date', `${d.ad} ${d.time}`)}${d.bs ? row('Miti', d.bs) : ''}${b.table ? row('Table', esc(b.table)) : ''}${b.customer.name ? row('Customer', esc(b.customer.name)) : ''}${b.customer.pan ? row('Customer PAN', esc(b.customer.pan)) : ''}${b.customer.phone ? row('Phone', esc(b.customer.phone)) : ''}</table><hr>
      <table>${b.lines.map((l) => `<tr><td colspan="2">${esc(l.name)}${l.label ? ` (${esc(l.label)})` : ''}</td></tr>${row(`&nbsp;&nbsp;${l.qty} x ${l.price}`, money(l.price * l.qty).toFixed(2))}`).join('')}</table><hr>
      <table>${row('Subtotal', b.subtotal.toFixed(2))}${b.discount.amount ? row(`Discount${b.discount.kind === 'percent' ? ` ${b.discount.value}%` : ''}`, '-' + b.discount.amount.toFixed(2)) : ''}${row('TOTAL Rs', b.total.toFixed(2), 'big')}${row('Paid by', esc(b.payment))}${b.received ? row('Received', b.received.toFixed(2)) + row('Change', b.change.toFixed(2)) : ''}</table>
      ${b.note ? `<hr><p>${esc(b.note)}</p>` : ''}<hr><p class="c">${esc(S.setup.footer)}</p>${copy ? '<p class="c">(Copy)</p>' : ''}</div>`;
  }
  // The same bill as printer commands (ESC/POS), for Bluetooth and the RawBT app.
  function receiptBytes(b, copy) {
    const W = S.setup.paper === 58 ? 32 : 48;
    const out = [];
    const put = (...a) => a.forEach((v) => out.push(v));
    const text = (s) => { for (const ch of String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/½/g, '1/2')) { const c = ch.charCodeAt(0); out.push(c >= 32 && c < 127 ? c : 63); } };
    const line = (s) => { text(s || ''); put(10); };
    const two = (l, r) => { l = String(l); r = String(r); const gap = W - l.length - r.length; if (gap < 1) { line(l); line(' '.repeat(Math.max(0, W - r.length)) + r); } else line(l + ' '.repeat(gap) + r); };
    const rule = () => line('-'.repeat(W));
    const wrap = (s) => { const words = String(s).split(/\s+/); let cur = ''; words.forEach((w) => { if ((cur + ' ' + w).trim().length > W) { line(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) line(cur); };
    const c = cafe(); const d = dates(b.at);
    put(27, 64);                      // start fresh
    put(27, 97, 1);                   // centre
    put(27, 69, 1, 29, 33, 17); line(c.name); put(29, 33, 0, 27, 69, 0); // big bold name
    if (c.address) wrap(c.address);
    if (c.phone) line('Phone ' + c.phone);
    if (S.setup.header) wrap(S.setup.header);
    if (b.cancelled) { put(27, 69, 1); line('*** CANCELLED BILL ***'); put(27, 69, 0); }
    put(27, 97, 0); rule();
    two('Bill no', b.no); two('Date', `${d.ad} ${d.time}`);
    if (d.bs) two('Miti', d.bs);
    if (b.table) two('Table', b.table);
    if (b.customer.name) two('Customer', b.customer.name);
    if (b.customer.pan) two('Customer PAN', b.customer.pan);
    if (b.customer.phone) two('Phone', b.customer.phone);
    rule();
    b.lines.forEach((l) => { wrap(l.name + (l.label ? ` (${l.label})` : '')); two(`  ${l.qty} x ${l.price}`, money(l.price * l.qty).toFixed(2)); });
    rule();
    two('Subtotal', b.subtotal.toFixed(2));
    if (b.discount.amount) two('Discount' + (b.discount.kind === 'percent' ? ` ${b.discount.value}%` : ''), '-' + b.discount.amount.toFixed(2));
    put(27, 69, 1, 29, 33, 1); two('TOTAL Rs', b.total.toFixed(2)); put(29, 33, 0, 27, 69, 0);
    two('Paid by', b.payment);
    if (b.received) { two('Received', b.received.toFixed(2)); two('Change', b.change.toFixed(2)); }
    if (b.note) { rule(); wrap(b.note); }
    rule(); put(27, 97, 1); wrap(S.setup.footer); if (copy) line('(Copy)');
    put(27, 97, 0, 10, 10, 10, 10, 29, 86, 66, 0); // feed and cut
    return new Uint8Array(out);
  }
  const b64 = (bytes) => { let s = ''; bytes.forEach((v) => { s += String.fromCharCode(v); }); return btoa(s); };

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
    const fast = ch.properties.writeWithoutResponse;
    for (let i = 0; i < bytes.length; i += 100) {
      const part = bytes.slice(i, i + 100);
      if (fast) await ch.writeValueWithoutResponse(part); else await ch.writeValue(part);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  function printWindow(b, copy) {
    document.body.classList.toggle('paper58', S.setup.paper === 58);
    $('paper').innerHTML = receiptHtml(b, copy);
    const img = $('paper').querySelector('img');
    const go = () => window.print();
    if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
  }
  async function print(b, how, copy) {
    try {
      if (how === 'app') { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'print', data: b64(receiptBytes(b, copy)), no: b.no })); toast('Sent to the printer.'); }
      else if (how === 'bt') { await printBluetooth(receiptBytes(b, copy)); toast('Sent to the printer.'); }
      else if (how === 'rawbt') { window.location.href = 'rawbt:base64,' + b64(receiptBytes(b, copy)); }
      else printWindow(b, copy);
    } catch (e) {
      if (e && e.name === 'NotFoundError') return; // the printer list was closed
      toast(e.message || 'Could not print. Check that the printer is on and close by.', true);
    }
  }
  function openBill(b, copy, printNow) {
    S.open = { b, copy };
    const android = /Android/i.test(navigator.userAgent);
    const hasBt = Boolean(navigator.bluetooth);
    $('sheet').innerHTML = `<div><div class="slip">${receiptHtml(b, copy)}</div><div class="btns">
      ${IN_APP ? '<button type="button" class="main" data-print="app">Print</button>' : ''}
      ${!IN_APP && hasBt ? '<button type="button" class="main" data-print="bt">Print by Bluetooth</button>' : ''}
      ${!IN_APP ? `<button type="button"${hasBt ? '' : ' class="main"'} data-print="win">Print with this device's print window</button>` : ''}
      ${!IN_APP && android ? '<button type="button" data-print="rawbt">Print with the RawBT printer app</button>' : ''}
      <button type="button" data-do="close-sheet">${copy ? 'Close' : 'Done, new bill'}</button></div></div>`;
    $('sheet').hidden = false;
    if (printNow) print(b, IN_APP ? 'app' : (hasBt && BT.device ? 'bt' : null), copy);
  }

  /* ---------- drawing and events ---------- */
  async function show(tab) {
    S.tab = tab;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    const v = $('view');
    if (tab === 'new') { v.innerHTML = newView(); paintItems(); paintCart(); }
    else if (tab === 'orders') { v.innerHTML = ordersView(); }
    else if (tab === 'bills') { v.innerHTML = billsView(); try { await loadBills(S.bills && S.bills.date); if (S.tab === 'bills') v.innerHTML = billsView(); } catch (e) { toast(e.message, true); } }
    else if (tab === 'setup') { v.innerHTML = setupView(); }
  }
  async function loadOrders() {
    try { S.orders = await api('GET', '/api/desk/orders'); } catch (e) { return; }
    const n = unpaid().length;
    $('n-orders').textContent = n; $('n-orders').hidden = !n;
    if (S.tab === 'orders') $('view').innerHTML = ordersView();
  }
  async function saveBill(andPrint) {
    if (S.busy) return;
    const b = S.bill;
    if (b.pan && !/^\d{9}$/.test(b.pan.trim())) return toast('A PAN number has 9 digits. Check it, or leave it empty.', true);
    S.busy = true;
    try {
      const saved = await api('POST', '/api/desk/bills', {
        ref: b.ref, lines: b.lines, discount: { kind: b.dKind, value: Number(b.dValue) || 0, reason: b.dReason },
        customer: { name: b.name, pan: b.pan.trim(), phone: b.phone }, table: b.table, note: b.note, payment: b.payment, received: Number(b.received) || 0, orderId: b.orderId,
      });
      S.bill = fresh();
      paintCart();
      toast(`Bill ${saved.no} saved.`);
      openBill(saved, false, andPrint);
      loadOrders();
    } catch (e) { toast(e.message, true); }
    S.busy = false;
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) return show(d.tab);
    if (d.cat) { S.cat = d.cat; S.q = ''; $('q').value = ''; document.querySelectorAll('#chips button').forEach((x) => x.classList.toggle('on', x.dataset.cat === S.cat)); return paintItems(); }
    if (d.add) { const it = catalogue().find((i) => i.key === d.add); const p = it && it.prices[Number(d.n)]; if (p) addLine(it.name, p.label, p.price); return; }
    if (d.qty) { const l = S.bill.lines[Number(d.i)]; if (l) { l.qty += Number(d.qty); if (l.qty < 1) S.bill.lines.splice(Number(d.i), 1); paintCart(); } return; }
    if (d.del) { S.bill.lines.splice(Number(d.del), 1); return paintCart(); }
    if (d.pay) { S.bill.payment = d.pay; return paintCart(); }
    if (d.billOrder) return billOrder(d.billOrder);
    if (d.print) return print(S.open.b, d.print, S.open.copy);
    if (d.open) { try { openBill(await api('GET', `/api/desk/bills/${d.open}`), true); } catch (err) { toast(err.message, true); } return; }
    if (d.cancel) {
      const reason = window.prompt('Why is this bill cancelled? It stays in the list, marked cancelled.');
      if (!reason) return;
      try { await api('POST', `/api/admin/bills/${d.cancel}/cancel`, { reason }); await show('bills'); toast('Bill cancelled.'); } catch (err) { toast(err.message, true); }
      return;
    }
    if (d.do === 'save-print') return saveBill(true);
    if (d.do === 'save') return saveBill(false);
    if (d.do === 'clear') { if (!S.bill.lines.length || window.confirm('Clear this bill?')) { S.bill = fresh(); paintCart(); } return; }
    if (d.do === 'close-sheet') { $('sheet').hidden = true; return; }
    if (d.do === 'add-row') { document.querySelector('#extra tbody').insertAdjacentHTML('beforeend', rowHtml({})); return; }
    if (d.do === 'del-row') { t.closest('tr').remove(); return; }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'q') { S.q = t.value; return paintItems(); }
    if (t.dataset.f) {
      S.bill[t.dataset.f] = t.value;
      // Only the totals depend on these; redraw without losing the cursor.
      if (['dValue', 'received'].includes(t.dataset.f)) { clearTimeout(S.rt); S.rt = setTimeout(() => { const f = t.dataset.f; const pos = document.activeElement === t; paintCart(); if (pos) { const n = document.querySelector(`[data-f="${f}"]`); if (n) { n.focus(); } } }, 600); }
    }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.f === 'dKind') { S.bill.dKind = t.value; paintCart(); }
    if (t.id === 'day' && t.value) { try { await loadBills(t.value); $('view').innerHTML = billsView(); } catch (err) { toast(err.message, true); } }
  });
  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'typed') {
      const price = Number(f.price.value);
      if (!f.name.value.trim() || !(price >= 0)) return;
      addLine(f.name.value.trim(), '', money(price)); f.reset();
    } else if (f.id === 'gate-form') {
      try {
        await api('POST', '/api/auth/login', { username: f.username.value.trim(), password: f.password.value, remember: f.remember.checked });
        f.password.value = ''; $('gate').hidden = true; start();
      } catch (err) { $('gate-msg').textContent = err.message; }
    } else if (f.id === 'setup-form') {
      const items = [...document.querySelectorAll('#extra tbody tr')].map((tr) => { const g = (c) => tr.querySelector(`[data-c="${c}"]`).value; return { id: g('id'), name: g('name').trim(), group: g('group').trim(), price: Number(g('price')) }; }).filter((it) => it.name);
      try {
        S.setup = await api('PUT', '/api/admin/bill-setup', { header: f.header.value, footer: f.footer.value, paper: Number(f.paper.value), payments: f.payments.value.split(','), items });
        toast('Set-up saved.'); show('setup');
      } catch (err) { toast(err.message, true); }
    } else if (f.id === 'csv-form') {
      window.location.href = `/api/admin/bills.csv?from=${f.from.value}&to=${f.to.value}`;
    }
  });
  $('logout').addEventListener('click', async () => { await api('POST', '/api/auth/logout').catch(() => {}); gate(''); });

  async function start() {
    let me;
    try { me = await api('GET', '/api/auth/me'); } catch (e) { return; }
    if (!me.role || me.role === 'driver') return gate(me.role === 'driver' ? 'Billing is for counter staff.' : '');
    S.me = me;
    $('gate').hidden = true;
    $('who').textContent = me.name ? `· ${me.name}` : '';
    $('to-admin').hidden = me.role !== 'admin' || IN_APP;
    $('tab-setup').hidden = me.role !== 'admin';
    if (IN_APP) { $('to-counter').hidden = true; $('logout').hidden = true; }
    try { [S.content, S.setup] = await Promise.all([api('GET', '/api/content'), api('GET', '/api/desk/bill-setup')]); } catch (e) { return toast(e.message, true); }
    show('new');
    loadOrders();
    clearInterval(S.poll); S.poll = setInterval(loadOrders, 20000);
  }
  start();
})();
