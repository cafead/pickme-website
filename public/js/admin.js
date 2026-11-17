/* Pick Me Cafe admin (#admin): edit the website with a live preview, and manage orders, bookings and reviews. */
(function () {
  'use strict';
  const { FONTS, esc, rs } = window.PM;
  const root = document.getElementById('admin');
  const A = { view: 'edit', content: null, saved: '', me: {}, orders: [], bookings: [], reviews: [], open: new WeakSet(), timer: null, poll: null };

  /* ---------- helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
  function set(o, k, v) {
    const parts = k.split('.');
    const last = parts.pop();
    const target = parts.reduce((a, p) => (a[p] == null ? (a[p] = {}) : a[p]), o);
    target[last] = v;
  }
  const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

  async function api(method, url, body, rawType) {
    const opt = { method, headers: {} };
    if (rawType) { opt.headers['Content-Type'] = rawType; opt.body = body; }
    else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(url, opt);
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== '/api/admin/login') { login(); throw new Error('Please log in again.'); }
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }
  function flash(text, bad) {
    const el = document.getElementById('ad-flash');
    if (!el) return;
    el.textContent = text;
    el.className = 'ad-flash is-on' + (bad ? ' is-bad' : '');
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { el.className = 'ad-flash'; }, 3200);
  }

  /* ---------- what can be edited ---------- */
  const f = (k, l, type, extra) => Object.assign({ k, l, type: type || 'text' }, extra || {});
  const fontOptions = (kind) => Object.keys(FONTS[kind]).map((n) => [n, n]);
  const catOptions = () => A.content.menu.categories.map((c) => [c.id, c.name]);
  const priceLine = (it) => (it.prices || []).map((p) => `${p.label ? p.label + ' ' : ''}${p.price}`).join(' / ');
  function eventState(e) {
    if (e.enabled === false) return 'off';
    const today = BS.todayAD();
    const end = new Date(Date.parse(e.start || today) + (Number(e.days) || 1) * 864e5).toISOString().slice(0, 10);
    return today < e.start ? 'scheduled' : today >= end ? 'ended' : 'showing now';
  }

  const PANELS = [
    { title: 'Cafe details and logo', scroll: 'hero', fields: [
      f('brand.name', 'Cafe name'), f('brand.logo', 'Logo', 'image'), f('brand.address', 'Address'),
      f('brand.phone', 'Phone number shown on the site'), f('brand.whatsapp', 'WhatsApp number with country code (977...)'),
      f('brand.open', 'Opens at', 'time'), f('brand.close', 'Closes at', 'time'), f('brand.hoursText', 'Opening hours as written on the site'),
    ] },
    { title: 'Colours and fonts', scroll: 'hero', fields: [
      f('theme.bg', 'Page background', 'color'), f('theme.surface', 'Cards and boxes', 'color'), f('theme.ink', 'Text', 'color'),
      f('theme.muted', 'Soft text', 'color'), f('theme.accent', 'Main colour (buttons, headings)', 'color'), f('theme.gold', 'Fine lines and decoration', 'color'),
      f('theme.fontDisplay', 'Heading font', 'select', { options: () => fontOptions('display') }),
      f('theme.fontScript', 'Handwriting font', 'select', { options: () => fontOptions('script') }),
      f('theme.fontBody', 'Text font', 'select', { options: () => fontOptions('body') }),
      f('theme.radius', 'Corner roundness (0 to 40)', 'number'), f('theme.animations', 'Animations on', 'toggle'),
    ] },
    { title: 'Section order and visibility', scroll: 'hero', note: 'Use the arrows to move a section up or down the page.', fields: [
      f('sections', '', 'list', { fixed: true, title: (s) => `${s.label}${s.show === false ? ' (hidden)' : ''}`, fields: [
        f('label', 'Name in the top menu'), f('show', 'Show this section', 'toggle'), f('nav', 'Show in the top menu', 'toggle'),
      ] }),
    ] },
    { title: 'Top of page (hero)', scroll: 'hero', fields: [
      f('hero.script', 'Handwritten line'), f('hero.title', 'Big title'), f('hero.line', 'Line under the title'), f('hero.tagline', 'Tagline'),
      f('hero.image', 'Photo', 'image'),
      f('hero.layout', 'Photo position', 'select', { options: () => [['right', 'Photo on the right'], ['left', 'Photo on the left'], ['full', 'Photo behind the text']] }),
      f('hero.button', 'First button'), f('hero.button2', 'Second button'), f('hero.marquee', 'Moving strip (separate words with •)'),
    ] },
    { title: 'Specialities (three cards)', scroll: 'highlights', fields: [
      f('highlights.script', 'Handwritten line'), f('highlights.title', 'Title'),
      f('highlights.cards', 'Cards', 'list', { title: (k) => k.title, add: 'Add card', blank: () => ({ title: 'New card', text: '', image: '', category: '' }), fields: [
        f('title', 'Title'), f('text', 'Text', 'area'), f('image', 'Photo', 'image'), f('category', 'Opens this menu group', 'select', { options: catOptions }),
      ] }),
    ] },
    { title: 'Events and themes (slideshow)', scroll: 'events', note: 'An event shows from its start date for the number of days you set. With two or more showing, they slide automatically.', fields: [
      f('events.script', 'Handwritten line'), f('events.title', 'Title'), f('events.seconds', 'Seconds per slide', 'number'),
      f('events.items', 'Events', 'list', { title: (e) => `${e.title} (${eventState(e)})`, add: 'Add event', blank: () => ({ id: uid('event'), enabled: true, title: 'New event', text: '', image: '', button: '', link: '#menu', start: BS.todayAD(), days: 7 }), fields: [
        f('enabled', 'Switched on', 'toggle'), f('title', 'Title'), f('text', 'Description', 'area'), f('image', 'Photo', 'image'),
        f('start', 'Start showing on', 'date'), f('days', 'Show for how many days', 'number'),
        f('button', 'Button text (optional)'), f('link', 'Button goes to (#menu, #cake, #booking or a web link)'),
      ] }),
    ] },
    { title: 'Menu, prices and food photos', scroll: 'menu', note: 'Each group is a tab on the site. Open a group to edit its items.', fields: [
      f('menu.script', 'Handwritten line'), f('menu.title', 'Title'), f('menu.note', 'Note under the title'),
      f('menu.categories', 'Groups', 'list', { title: (c) => `${c.name} (${(c.items || []).length})`, add: 'Add group', blank: () => ({ id: uid('group'), name: 'New group', note: '', items: [] }), fields: [
        f('name', 'Group name'), f('note', 'Note shown above the items'),
        f('items', 'Items', 'list', { title: (i) => `${i.name}${i.available === false ? ' (off)' : ''}: ${priceLine(i)}`, add: 'Add item', blank: () => ({ id: uid('item'), name: 'New item', desc: '', image: '', available: true, prices: [{ label: '', price: 0 }] }), fields: [
          f('name', 'Name'), f('desc', 'Short description (optional)'), f('available', 'Available', 'toggle'), f('image', 'Photo (optional)', 'image'),
          f('prices', 'Prices', 'list', { title: (p) => `${p.label || 'Price'}: Rs. ${p.price}${p.whole ? ' (whole cake)' : ''}`, add: 'Add size or price', blank: () => ({ label: '', price: 0 }), fields: [
            f('label', 'Size name (leave empty if there is one price)'), f('price', 'Price in NPR', 'number'), f('whole', 'Whole cake: pre-order only', 'toggle'),
          ] }),
        ] }),
      ] }),
    ] },
    { title: 'Cake pre-order', scroll: 'cake', fields: [
      f('cake.script', 'Handwritten line'), f('cake.title', 'Title'), f('cake.text', 'Text', 'area'), f('cake.image', 'Photo', 'image'),
      f('cake.noticeHours', 'Hours of notice needed', 'number'), f('cake.button', 'Button text'),
    ] },
    { title: 'Table booking', scroll: 'booking', fields: [
      f('booking.script', 'Handwritten line'), f('booking.title', 'Title'), f('booking.text', 'Text', 'area'), f('booking.image', 'Photo', 'image'),
      f('booking.maxPeople', 'Largest group you accept', 'number'), f('booking.button', 'Button text'),
    ] },
    { title: 'Our story', scroll: 'story', fields: [
      f('story.script', 'Handwritten line'), f('story.title', 'Title'), f('story.text', 'Text', 'area'), f('story.side', 'Handwritten side note'), f('story.image', 'Photo', 'image'),
    ] },
    { title: 'Gallery photos', scroll: 'gallery', fields: [
      f('gallery.script', 'Handwritten line'), f('gallery.title', 'Title (optional)'),
      f('gallery.images', 'Photos', 'list', { title: (g) => g.caption || 'Photo', add: 'Add photo', blank: () => ({ image: '', caption: '' }), fields: [f('image', 'Photo', 'image'), f('caption', 'Caption')] }),
    ] },
    { title: 'Reviews section text', scroll: 'reviews', note: 'Choose which reviews show in the Reviews tab above.', fields: [
      f('reviews.script', 'Handwritten line'), f('reviews.title', 'Title'), f('reviews.formTitle', 'Button text'), f('reviews.thanks', 'Thank-you message', 'area'),
    ] },
    { title: 'Map and messages', scroll: 'visit', note: 'For the map on the page: in Google Maps choose Share, then Embed a map, and paste the link that starts with https://www.google.com/maps', fields: [
      f('visit.script', 'Handwritten line'), f('visit.title', 'Title'), f('visit.mapLink', 'Google Maps link (for the button)'), f('visit.mapEmbed', 'Google Maps embed link (for the map on the page)', 'area'),
      f('visit.messageTitle', 'Message box title'), f('visit.messageText', 'Message box text', 'area'),
    ] },
    { title: 'Social media links', scroll: 'visit', note: 'Only links that are filled in show on the site.', fields: [
      f('social', '', 'list', { title: (s) => `${s.type}${s.url ? '' : ' (no link yet)'}`, add: 'Add social link', blank: () => ({ type: 'instagram', url: '' }), fields: [
        f('type', 'Which one', 'select', { options: () => ['instagram', 'facebook', 'tiktok', 'youtube', 'link'].map((x) => [x, x]) }), f('url', 'Link (https://...)'),
      ] }),
    ] },
    { title: 'Payment QR codes and delivery', scroll: 'menu', note: 'Upload your eSewa and Fonepay QR pictures here. Customers see them at checkout.', fields: [
      f('payment.deliveryFee', 'Delivery charge in NPR', 'number'), f('payment.deliveryNote', 'Delivery note'), f('payment.instructions', 'Payment instructions', 'area'),
      f('payment.esewa.enabled', 'Accept eSewa', 'toggle'), f('payment.esewa.qr', 'eSewa QR picture', 'image'), f('payment.esewa.account', 'eSewa name or number shown under the QR'),
      f('payment.fonepay.enabled', 'Accept Fonepay', 'toggle'), f('payment.fonepay.qr', 'Fonepay QR picture', 'image'), f('payment.fonepay.account', 'Fonepay name shown under the QR'),
    ] },
    { title: 'Footer', scroll: 'visit', fields: [f('footer.line', 'Closing line'), f('footer.note', 'Small note (optional)')] },
  ];

  /* ---------- form builder ---------- */
  function changed() {
    status();
    clearTimeout(A.timer);
    A.timer = setTimeout(pushPreview, 140);
  }
  function pushPreview() {
    const frame = document.getElementById('ad-frame');
    if (frame && frame.contentWindow) frame.contentWindow.postMessage({ pm: 'content', content: A.content }, location.origin);
  }
  function status() {
    const dirty = JSON.stringify(A.content) !== A.saved;
    const el = document.getElementById('ad-status');
    if (el) { el.textContent = dirty ? 'You have unsaved changes' : 'All changes saved'; el.classList.toggle('is-dirty', dirty); }
    const save = document.getElementById('ad-save');
    if (save) save.disabled = !dirty;
    return dirty;
  }

  function imageField(field, obj, done) {
    const thumb = h('div', { class: 'ad-thumb' });
    const url = h('input', { type: 'text', placeholder: 'Photo link, or upload', value: get(obj, field.k) || '', 'aria-label': field.l + ' link' });
    const show = () => { const v = get(obj, field.k); thumb.replaceChildren(v ? h('img', { src: v, alt: '' }) : h('span', {}, 'No photo')); };
    const apply = (v) => { set(obj, field.k, v); url.value = v; show(); done(); };
    url.addEventListener('change', () => apply(url.value.trim()));
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const picked = file.files[0];
      if (!picked) return;
      try {
        flash('Uploading photo...');
        const res = await api('POST', '/api/admin/upload', picked, picked.type || 'image/jpeg');
        apply(res.url);
        flash('Photo uploaded. Remember to save.');
      } catch (e) { flash(e.message, true); }
      file.value = '';
    } });
    show();
    return h('div', { class: 'ad-image' }, thumb, h('div', { class: 'ad-image-tools' }, url,
      h('div', { class: 'ad-row' }, h('button', { type: 'button', class: 'ad-btn', onclick: () => file.click() }, 'Upload photo'),
        h('button', { type: 'button', class: 'ad-btn ad-btn--quiet', onclick: () => apply('') }, 'Remove')), file));
  }

  function listField(field, obj) {
    const wrap = h('div', { class: 'ad-list' });
    const draw = () => {
      if (!Array.isArray(get(obj, field.k))) set(obj, field.k, []);
      const arr = get(obj, field.k);
      wrap.replaceChildren();
      arr.forEach((item, i) => {
        const title = h('span', { class: 'ad-item-title' }, field.title(item) || '(empty)');
        const move = (to) => (e) => { e.preventDefault(); if (to < 0 || to >= arr.length) return; arr.splice(to, 0, arr.splice(i, 1)[0]); changed(); draw(); };
        const tools = h('span', { class: 'ad-item-tools' },
          h('button', { type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: move(i - 1) }, '↑'),
          h('button', { type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === arr.length - 1, onclick: move(i + 1) }, '↓'),
          !field.fixed && h('button', { type: 'button', title: 'Delete', 'aria-label': 'Delete', class: 'is-del', onclick: (e) => {
            e.preventDefault();
            if (!window.confirm(`Delete "${field.title(item)}"?`)) return;
            arr.splice(i, 1); changed(); draw();
          } }, '✕'));
        const body = h('div', { class: 'ad-item-body' });
        let built = false;
        const build = () => { if (!built) { body.append(buildFields(field.fields, item, () => { title.textContent = field.title(item) || '(empty)'; })); built = true; } };
        const d = h('details', { class: 'ad-item' }, h('summary', {}, title, tools), body);
        if (A.open.has(item)) { d.open = true; build(); }
        d.addEventListener('toggle', () => { if (d.open) { A.open.add(item); build(); } else A.open.delete(item); });
        wrap.append(d);
      });
      if (!field.fixed) {
        wrap.append(h('button', { type: 'button', class: 'ad-btn ad-add', onclick: () => { const it = field.blank(); arr.push(it); A.open.add(it); changed(); draw(); } }, '+ ' + (field.add || 'Add')));
      }
    };
    draw();
    return wrap;
  }

  let fieldSeq = 0;
  function buildFields(fields, obj, onAny) {
    const frag = document.createDocumentFragment();
    const done = () => { changed(); if (onAny) onAny(); };
    for (const field of fields) {
      const id = `adf-${++fieldSeq}`;
      const val = get(obj, field.k);
      let control;
      if (field.type === 'list') {
        frag.append(h('div', { class: 'ad-field' }, field.l && h('span', { class: 'ad-label' }, field.l), listField(field, obj)));
        continue;
      }
      if (field.type === 'image') {
        frag.append(h('div', { class: 'ad-field' }, h('span', { class: 'ad-label' }, field.l), imageField(field, obj, done)));
        continue;
      }
      if (field.type === 'toggle') {
        control = h('input', { type: 'checkbox', id, checked: val !== false && val !== undefined ? Boolean(val) : field.k === 'whole' ? false : val !== false, onchange: (e) => { set(obj, field.k, e.target.checked); done(); } });
        frag.append(h('label', { class: 'ad-field ad-check', for: id }, control, h('span', {}, field.l)));
        continue;
      }
      if (field.type === 'area') {
        control = h('textarea', { id, rows: 3, value: val == null ? '' : val, oninput: (e) => { set(obj, field.k, e.target.value); done(); } });
      } else if (field.type === 'select') {
        const options = field.options();
        control = h('select', { id, onchange: (e) => { set(obj, field.k, e.target.value); done(); } },
          options.map(([v, label]) => h('option', { value: v, selected: v === val }, label)));
        if (!options.some(([v]) => v === val)) control.prepend(h('option', { value: val || '', selected: true }, val || 'Choose'));
      } else if (field.type === 'color') {
        const text = h('input', { type: 'text', value: val || '', 'aria-label': field.l + ' code', oninput: (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { set(obj, field.k, e.target.value); picker.value = e.target.value; done(); } } });
        const picker = h('input', { type: 'color', id, value: /^#[0-9a-f]{6}$/i.test(val || '') ? val : '#000000', oninput: (e) => { set(obj, field.k, e.target.value); text.value = e.target.value; done(); } });
        control = h('div', { class: 'ad-color' }, picker, text);
      } else {
        control = h('input', { type: field.type, id, value: val == null ? '' : val, oninput: (e) => {
          set(obj, field.k, field.type === 'number' ? Number(e.target.value) || 0 : e.target.value); done();
        } });
      }
      frag.append(h('div', { class: 'ad-field' }, h('label', { class: 'ad-label', for: id }, field.l), control));
    }
    return frag;
  }

  /* ---------- views ---------- */
  function editView() {
    const panel = h('aside', { class: 'ad-panel' }, h('p', { class: 'ad-intro' }, 'Open a part of the website, change it, and watch the preview. Nothing goes live until you press Save.'));
    PANELS.forEach((p) => {
      const body = h('div', { class: 'ad-group-body' });
      let built = false;
      const d = h('details', { class: 'ad-group' }, h('summary', {}, p.title), body);
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        if (!built) { if (p.note) body.append(h('p', { class: 'ad-note' }, p.note)); body.append(buildFields(p.fields, A.content)); built = true; }
        const frame = document.getElementById('ad-frame');
        if (frame && frame.contentWindow) frame.contentWindow.postMessage({ pm: 'scroll', id: p.scroll }, location.origin);
      });
      panel.append(d);
    });
    const frame = h('iframe', { id: 'ad-frame', src: '/?preview=1', title: 'Live preview of the website' });
    const wrap = h('div', { class: 'ad-frame-wrap' }, frame);
    const size = (cls, label) => h('button', { type: 'button', class: 'ad-btn ad-btn--quiet', onclick: () => { wrap.className = 'ad-frame-wrap ' + cls; } }, label);
    return h('div', { class: 'ad-split' }, panel, h('section', { class: 'ad-preview' },
      h('div', { class: 'ad-prev-bar' }, h('strong', {}, 'Live preview'), h('span', { class: 'ad-row' }, size('', 'Computer'), size('is-phone', 'Phone'))), wrap));
  }

  const TYPE = { dinein: 'Dine-in', pickup: 'Pickup', delivery: 'Delivery' };
  const options = (list, cur) => list.map((s) => `<option value="${s}"${s === cur ? ' selected' : ''}>${s}</option>`).join('');
  const contact = (x) => `<a href="tel:${esc(x.phone)}">${esc(x.phone)}</a> · <a href="https://wa.me/${esc(x.phone.replace(/\D/g, '').replace(/^(?=9\d{9}$)/, '977'))}" target="_blank" rel="noopener">WhatsApp</a>`;
  function listView(kind) {
    const box = h('div', { class: 'ad-page' });
    const alerts = `<p class="ad-note">Email alerts: <b>${A.me.email ? 'on' : 'off'}</b> · WhatsApp alerts: <b>${A.me.whatsapp ? 'on' : 'off'}</b>. The README explains how to switch them on. This list refreshes every 45 seconds.</p>`;
    if (kind === 'orders') {
      box.innerHTML = `<h2>Orders</h2>${alerts}` + (A.orders.length ? A.orders.map((o) => `
        <article class="ad-card${o.status === 'new' ? ' is-new' : ''}">
          <header><strong>${esc(o.id)}</strong><span>${when(o.createdAt)}</span><span class="ad-tag">${TYPE[o.type]}</span><b>${rs(o.total)}</b></header>
          <p>${esc(o.name)} · ${contact(o)}</p>
          <p><b>For:</b> ${o.schedule ? `${esc(o.schedule.bs || o.schedule.date)} at ${esc(o.schedule.time)}` : 'as soon as possible'}</p>
          ${o.address ? `<p><b>Address:</b> ${esc(o.address)}</p>` : ''}
          <ul>${o.lines.map((l) => `<li>${l.qty} × ${esc(l.name)}${l.label ? ` (${esc(l.label)})` : ''} <span>${rs(l.qty * l.price)}</span></li>`).join('')}${o.deliveryFee ? `<li>Delivery <span>${rs(o.deliveryFee)}</span></li>` : ''}</ul>
          ${o.cakeMessage ? `<p><b>On the cake:</b> ${esc(o.cakeMessage)}</p>` : ''}
          ${o.notes ? `<p><b>Notes:</b> ${esc(o.notes)}</p>` : ''}
          <footer>
            <label>Status <select data-patch="orders" data-id="${esc(o.id)}" data-key="status">${options(['new', 'accepted', 'ready', 'completed', 'cancelled'], o.status)}</select></label>
            <label class="ad-check"><input type="checkbox" data-patch="orders" data-id="${esc(o.id)}" data-key="paid"${o.paid ? ' checked' : ''}><span>Payment checked</span></label>
            <a class="ad-btn" href="/api/admin/proof/${esc(o.payment.proof)}" target="_blank" rel="noopener">See ${esc(o.payment.method)} screenshot</a>
            <button type="button" class="ad-btn ad-btn--quiet" data-del="orders" data-id="${esc(o.id)}">Delete</button>
          </footer>
        </article>`).join('') : '<p class="ad-empty">No orders yet.</p>');
    } else if (kind === 'bookings') {
      box.innerHTML = `<h2>Table bookings</h2>${alerts}` + (A.bookings.length ? A.bookings.map((b) => `
        <article class="ad-card${b.status === 'new' ? ' is-new' : ''}">
          <header><strong>${esc(b.id)}</strong><span>asked ${when(b.createdAt)}</span><b>${esc(b.people)} people</b></header>
          <p><b>${esc(b.bs || b.date)} at ${esc(b.time)}</b></p>
          <p>${esc(b.name)} · ${contact(b)}</p>
          ${b.requests ? `<p><b>Requests:</b> ${esc(b.requests)}</p>` : ''}
          ${b.remarks ? `<p><b>Remarks:</b> ${esc(b.remarks)}</p>` : ''}
          <footer>
            <label>Status <select data-patch="bookings" data-id="${esc(b.id)}" data-key="status">${options(['new', 'confirmed', 'declined', 'done'], b.status)}</select></label>
            <button type="button" class="ad-btn ad-btn--quiet" data-del="bookings" data-id="${esc(b.id)}">Delete</button>
          </footer>
        </article>`).join('') : '<p class="ad-empty">No bookings yet.</p>');
    } else {
      box.innerHTML = `<h2>Reviews</h2>
        <p class="ad-note">Tick "Show on website" for the reviews you want visitors to see. To show a Google review, copy it from Google Maps and add it below.</p>
        <form class="ad-card ad-newrev" id="ad-newrev">
          <header><strong>Add a review yourself</strong></header>
          <div class="ad-grid">
            <label>Name<input name="name" required maxlength="60"></label>
            <label>Stars<select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></label>
            <label>From<select name="source"><option value="google">Google review</option><option value="site">Guest in the cafe</option></select></label>
          </div>
          <label>Review<textarea name="text" rows="2" required maxlength="800"></textarea></label>
          <footer><button class="ad-btn" type="submit">Add and show on website</button></footer>
        </form>`
        + (A.reviews.length ? A.reviews.map((r) => `
        <article class="ad-card${r.approved ? '' : ' is-new'}">
          <header><strong>${esc(r.name)}</strong><span>${'★'.repeat(r.rating)}</span><span class="ad-tag">${r.source === 'google' ? 'Google' : 'Website'}</span><span>${when(r.createdAt)}</span></header>
          <p>${esc(r.text)}</p>
          <footer>
            <label class="ad-check"><input type="checkbox" data-patch="reviews" data-id="${esc(r.id)}" data-key="approved"${r.approved ? ' checked' : ''}><span>Show on website</span></label>
            <button type="button" class="ad-btn ad-btn--quiet" data-del="reviews" data-id="${esc(r.id)}">Delete</button>
          </footer>
        </article>`).join('') : '<p class="ad-empty">No reviews yet.</p>');
    }
    return box;
  }

  async function loadLists() {
    const [o, b, r] = await Promise.all([api('GET', '/api/admin/orders'), api('GET', '/api/admin/bookings'), api('GET', '/api/admin/reviews')]);
    A.orders = o; A.bookings = b; A.reviews = r;
    const count = { orders: o.filter((x) => x.status === 'new').length, bookings: b.filter((x) => x.status === 'new').length, reviews: r.filter((x) => !x.approved).length };
    for (const [k, n] of Object.entries(count)) {
      const el = document.querySelector(`[data-count="${k}"]`);
      if (el) { el.textContent = n; el.hidden = !n; }
    }
  }
  function show(view) {
    A.view = view;
    document.querySelectorAll('.ad-tabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.view === view));
    const body = document.getElementById('ad-body');
    const busy = body.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (view === 'edit') { if (!body.querySelector('.ad-split')) body.replaceChildren(editView()); return; }
    if (!busy || !body.querySelector('.ad-page')) body.replaceChildren(listView(view));
  }

  function shell() {
    const tab = (view, label) => h('button', { type: 'button', 'data-view': view, onclick: () => {
      if (view !== 'edit' && A.view === 'edit' && status() && !window.confirm('You have unsaved changes to the website. Leave the editor anyway? (They stay until you reload.)')) return;
      if (view !== 'edit') document.getElementById('ad-body').replaceChildren();
      show(view);
    } }, label, view !== 'edit' && h('span', { class: 'ad-count', 'data-count': view, hidden: true }, '0'));
    root.replaceChildren(
      h('header', { class: 'ad-top' },
        h('strong', { class: 'ad-name' }, 'Pick Me Cafe admin'),
        h('nav', { class: 'ad-tabs', 'aria-label': 'Admin sections' }, tab('edit', 'Edit website'), tab('orders', 'Orders'), tab('bookings', 'Bookings'), tab('reviews', 'Reviews')),
        h('span', { class: 'ad-right' },
          h('span', { id: 'ad-status', class: 'ad-status' }, 'All changes saved'),
          h('button', { type: 'button', id: 'ad-save', class: 'ad-btn ad-btn--main', disabled: true, onclick: save }, 'Save'),
          h('button', { type: 'button', class: 'ad-btn ad-btn--quiet', onclick: discard }, 'Undo changes'),
          h('a', { class: 'ad-btn ad-btn--quiet', href: '/', target: '_blank', rel: 'noopener' }, 'Open site'),
          h('button', { type: 'button', class: 'ad-btn ad-btn--quiet', onclick: async () => { await api('POST', '/api/admin/logout'); login(); } }, 'Log out'))),
      h('div', { id: 'ad-body', class: 'ad-body' }),
      h('div', { id: 'ad-flash', class: 'ad-flash', role: 'status' }));
  }
  async function save() {
    try {
      await api('PUT', '/api/admin/content', A.content);
      A.saved = JSON.stringify(A.content);
      status();
      flash('Saved. The website is updated.');
    } catch (e) { flash(e.message, true); }
  }
  async function discard() {
    if (status() && !window.confirm('Undo every change since your last save?')) return;
    A.content = JSON.parse(A.saved);
    document.getElementById('ad-body').replaceChildren();
    show('edit');
    status();
  }

  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (!t.dataset.patch) return;
    try {
      await api('PATCH', `/api/admin/${t.dataset.patch}/${t.dataset.id}`, { [t.dataset.key]: t.type === 'checkbox' ? t.checked : t.value });
      await loadLists();
      flash('Updated.');
    } catch (err) { flash(err.message, true); }
  });
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-del]');
    if (!t || !window.confirm('Delete this for good?')) return;
    try {
      await api('DELETE', `/api/admin/${t.dataset.del}/${t.dataset.id}`);
      await loadLists();
      document.getElementById('ad-body').replaceChildren();
      show(A.view);
    } catch (err) { flash(err.message, true); }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'ad-newrev') return;
    e.preventDefault();
    try {
      await api('POST', '/api/admin/reviews', Object.fromEntries(new FormData(e.target).entries()));
      await loadLists();
      document.getElementById('ad-body').replaceChildren();
      show('reviews');
      flash('Review added.');
    } catch (err) { flash(err.message, true); }
  });
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.pm === 'ready') pushPreview(); });
  window.addEventListener('beforeunload', (e) => { if (A.content && JSON.stringify(A.content) !== A.saved) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- login and start ---------- */
  function login() {
    clearInterval(A.poll);
    A.content = null;
    const msg = h('p', { class: 'ad-login-msg', role: 'alert' });
    const pass = h('input', { type: 'password', id: 'ad-pass', autocomplete: 'current-password', required: true });
    root.replaceChildren(h('form', { class: 'ad-login', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', '/api/admin/login', { password: pass.value }); boot(); } catch (err) { msg.textContent = err.message; }
    } }, h('h1', {}, 'Pick Me Cafe admin'), h('label', { for: 'ad-pass' }, 'Admin password'), pass, msg,
    h('button', { class: 'ad-btn ad-btn--main', type: 'submit' }, 'Log in'), h('a', { href: '/' }, 'Back to the website')));
    pass.focus();
  }
  async function boot() {
    A.me = await fetch('/api/admin/me').then((r) => r.json());
    if (!A.me.admin) return login();
    A.content = await fetch('/api/content').then((r) => r.json());
    A.saved = JSON.stringify(A.content);
    shell();
    show('edit');
    loadLists().catch(() => {});
    clearInterval(A.poll);
    A.poll = setInterval(async () => {
      try { await loadLists(); if (A.view !== 'edit') show(A.view); } catch (e) { /* shown at next action */ }
    }, 45000);
  }
  boot();
})();
