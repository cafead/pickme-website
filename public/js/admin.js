/* Pick Me Cafe admin (#admin): edit the website with a live preview, and manage orders, bookings, reviews, messages and security. */
(function () {
  'use strict';
  const { FONTS, esc, rs, shrink } = window.PM;
  const root = document.getElementById('admin');
  const A = { view: 'edit', content: null, saved: '', me: {}, orders: [], bookings: [], reviews: [], messages: [], staff: [], log: [], open: new WeakSet(), timer: null, poll: null, inline: false };

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
  const frame = () => document.getElementById('ad-frame');
  const tell = (msg) => { const f = frame(); if (f && f.contentWindow) f.contentWindow.postMessage(msg, location.origin); };

  async function api(method, url, body, rawType) {
    const opt = { method, headers: {} };
    if (rawType) { opt.headers['Content-Type'] = rawType; opt.body = body; }
    else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(url, opt);
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && !/\/auth\/login|\/admin\/password/.test(url)) { login(); throw new Error('Please log in again.'); }
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
    { title: 'Colours, fonts and sizes', scroll: 'hero', fields: [
      f('theme.bg', 'Page background', 'color'), f('theme.surface', 'Cards and boxes', 'color'), f('theme.ink', 'Text', 'color'),
      f('theme.muted', 'Soft text', 'color'), f('theme.accent', 'Headings and highlights', 'color'), f('theme.button', 'Buttons', 'color'), f('theme.gold', 'Fine lines and decoration', 'color'),
      f('theme.fontDisplay', 'Heading font', 'select', { options: () => fontOptions('display') }),
      f('theme.fontScript', 'Handwriting font', 'select', { options: () => fontOptions('script') }),
      f('theme.fontBody', 'Text font', 'select', { options: () => fontOptions('body') }),
      f('theme.headingScale', 'Heading size (0.7 to 1.5, normal is 1)', 'number', { step: 0.05 }), f('theme.bodySize', 'Text size in px (13 to 22)', 'number'),
      f('theme.width', 'Page width in px (900 to 1600)', 'number'), f('theme.heroHeight', 'Height of the top photo area in px (420 to 1100)', 'number'),
      f('theme.radius', 'Corner roundness (0 to 40)', 'number'),
      f('theme.blend', 'Blend photos into the background', 'toggle'), f('theme.animations', 'Animations on', 'toggle'),
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
      f('hero.button', 'First button (goes to the menu)'), f('hero.button2', 'Second button (table booking)'), f('hero.button3', 'Third button (cake order)'),
      f('hero.marquee', 'Moving strip (separate words with •)'),
      f('hero.card.show', 'Show the small floating card', 'toggle'), f('hero.card.image', 'Card photo', 'image'),
      f('hero.card.label', 'Card small label'), f('hero.card.title', 'Card title'), f('hero.card.text', 'Card text'),
    ] },
    { title: 'Specialities (three cards)', scroll: 'highlights', note: 'The "From Rs." price under each card comes from the menu group it opens.', fields: [
      f('highlights.script', 'Handwritten line'), f('highlights.title', 'Title'),
      f('highlights.cards', 'Cards', 'list', { title: (k) => k.title, add: 'Add card', blank: () => ({ title: 'New card', text: '', image: '', category: '' }), fields: [
        f('title', 'Title'), f('text', 'Text', 'area'), f('image', 'Photo', 'image'), f('category', 'Opens this menu group', 'select', { options: catOptions }),
      ] }),
    ] },
    { title: 'Events and themes (slideshow)', scroll: 'events', note: 'Each slide shows from its start date for the number of days you set, then disappears on its own. With two or more showing, they slide automatically.', fields: [
      f('events.script', 'Handwritten line'), f('events.title', 'Title'), f('events.seconds', 'Seconds per slide', 'number'),
      f('events.items', 'Slides', 'list', { title: (e) => `${e.title} (${eventState(e)})`, add: 'Add slide', blank: () => ({ id: uid('event'), enabled: true, tag: '', title: 'New event', text: '', image: '', button: '', link: '#menu', start: BS.todayAD(), days: 7 }), fields: [
        f('enabled', 'Switched on', 'toggle'), f('tag', 'Small label (for example Christmas Week)'), f('title', 'Title'), f('text', 'Description', 'area'), f('image', 'Photo', 'image'),
        f('start', 'Start showing on', 'date'), f('days', 'Show for how many days', 'number'),
        f('button', 'Button text (optional)'), f('link', 'Button goes to (#menu, #cake, #booking or a web link)'),
      ] }),
    ] },
    { title: 'Menu, prices and food photos', scroll: 'menu', note: 'Each group is a tab on the site. Open a group to edit its items.', fields: [
      f('menu.script', 'Handwritten line'), f('menu.title', 'Title'), f('menu.note', 'Note under the title'),
      f('menu.layout', 'How items are shown', 'select', { options: () => [['list', 'Simple list with small photos'], ['cards', 'Cards with large photos']] }),
      f('menu.categories', 'Groups', 'list', { title: (c) => `${c.name} (${(c.items || []).length})`, add: 'Add group', blank: () => ({ id: uid('group'), name: 'New group', note: '', items: [] }), fields: [
        f('name', 'Group name'), f('note', 'Note shown above the items'),
        f('items', 'Items', 'list', { title: (i) => `${i.name}${i.available === false ? ' (off)' : ''}: ${priceLine(i)}`, add: 'Add item', blank: () => ({ id: uid('item'), name: 'New item', desc: '', badge: '', image: '', available: true, prices: [{ label: '', price: 0 }] }), fields: [
          f('name', 'Name'), f('desc', 'Short description (optional)'), f('badge', 'Small badge, for example Bestseller (optional)'), f('available', 'Available', 'toggle'), f('image', 'Photo (optional)', 'image'),
          f('prices', 'Prices', 'list', { title: (p) => `${p.label || 'Price'}: Rs. ${p.price}${p.whole ? ' (whole cake)' : ''}`, add: 'Add size or price', blank: () => ({ label: '', price: 0 }), fields: [
            f('label', 'Size name (leave empty if there is one price)'), f('price', 'Price in NPR', 'number'), f('whole', 'Whole cake: pre-order only', 'toggle', { def: false }),
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
      f('booking.maxPeople', 'Largest group you accept', 'number'), f('booking.seating', 'Seating choices, separated by commas (leave empty to hide)'), f('booking.button', 'Button text'),
    ] },
    { title: 'Our story', scroll: 'story', fields: [
      f('story.script', 'Handwritten line'), f('story.title', 'Title'), f('story.text', 'Text', 'area'), f('story.side', 'Handwritten side note'), f('story.image', 'Photo', 'image'),
    ] },
    { title: 'Gallery photos', scroll: 'gallery', fields: [
      f('gallery.script', 'Handwritten line'), f('gallery.title', 'Title (optional)'),
      f('gallery.images', 'Photos', 'list', { title: (g) => g.caption || 'Photo', add: 'Add photo', blank: () => ({ image: '', caption: '', tag: '' }), fields: [f('image', 'Photo', 'image'), f('caption', 'Caption'), f('tag', 'Small label above the caption (optional)')] }),
    ] },
    { title: 'Reviews section', scroll: 'reviews', note: 'Choose which reviews show in the Reviews tab above. Fill in your real Google rating and review count to show them; leave them empty to hide.', fields: [
      f('reviews.script', 'Handwritten line'), f('reviews.title', 'Title'), f('reviews.rating', 'Your Google rating, for example 4.8'), f('reviews.count', 'Number of Google reviews, for example 120'),
      f('reviews.formTitle', 'Button text'), f('reviews.thanks', 'Thank-you message', 'area'),
    ] },
    { title: 'Map and messages', scroll: 'visit', note: 'For the map on the page: in Google Maps choose Share, then Embed a map, and paste the link that starts with https://www.google.com/maps', fields: [
      f('visit.script', 'Handwritten line'), f('visit.title', 'Title'), f('visit.mapLink', 'Google Maps link (for the buttons)'), f('visit.mapEmbed', 'Google Maps embed link (for the map on the page)', 'area'),
      f('visit.messageTitle', 'Message box title'), f('visit.messageText', 'Message box text', 'area'),
    ] },
    { title: 'Social media links', scroll: 'visit', note: 'Only links that are filled in show on the site.', fields: [
      f('social', '', 'list', { title: (s) => `${s.type}${s.url ? '' : ' (no link yet)'}`, add: 'Add social link', blank: () => ({ type: 'instagram', url: '' }), fields: [
        f('type', 'Which one', 'select', { options: () => ['instagram', 'facebook', 'tiktok', 'youtube', 'maps', 'link'].map((x) => [x, x]) }), f('url', 'Link (https://...)'),
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
  function pushPreview() { tell({ pm: 'content', content: A.content }); }
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
        const small = await shrink(picked, 1800, true);
        const res = await api('POST', '/api/admin/upload', small, small.type || 'image/jpeg');
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
        control = h('input', { type: 'checkbox', id, checked: val === undefined ? field.def !== false : Boolean(val), onchange: (e) => { set(obj, field.k, e.target.checked); done(); } });
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
        control = h('input', { type: field.type, id, step: field.step, value: val == null ? '' : val, oninput: (e) => {
          set(obj, field.k, field.type === 'number' ? Number(e.target.value) || 0 : e.target.value); done();
        } });
      }
      frag.append(h('div', { class: 'ad-field' }, h('label', { class: 'ad-label', for: id }, field.l), control));
    }
    return frag;
  }

  /* ---------- edit view ---------- */
  function buildPanel() {
    const panel = h('aside', { class: 'ad-panel' }, h('p', { class: 'ad-intro' }, 'Open a part of the website, change it, and watch the preview. Or switch on "Edit text on the page" and type straight into the preview. Nothing goes live until you press Save.'));
    PANELS.forEach((p) => {
      const body = h('div', { class: 'ad-group-body' });
      let built = false;
      const d = h('details', { class: 'ad-group' }, h('summary', {}, p.title), body);
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        if (!built) { if (p.note) body.append(h('p', { class: 'ad-note' }, p.note)); body.append(buildFields(p.fields, A.content)); built = true; }
        tell({ pm: 'scroll', id: p.scroll });
      });
      panel.append(d);
    });
    return panel;
  }
  function editView() {
    const wrap = h('div', { class: 'ad-frame-wrap' }, h('iframe', { id: 'ad-frame', src: '/?preview=1', title: 'Live preview of the website' }));
    const size = (cls, label) => h('button', { type: 'button', class: 'ad-btn ad-btn--quiet', onclick: () => { wrap.className = 'ad-frame-wrap ' + cls; } }, label);
    const inlineBtn = h('button', { type: 'button', class: 'ad-btn', 'aria-pressed': 'false', onclick: () => {
      A.inline = !A.inline;
      inlineBtn.textContent = A.inline ? 'Editing text on the page: on' : 'Edit text on the page';
      inlineBtn.classList.toggle('ad-btn--main', A.inline);
      inlineBtn.setAttribute('aria-pressed', A.inline);
      tell({ pm: 'inline', on: A.inline });
      if (A.inline) flash('Click any dashed text in the preview and type.');
      else { document.querySelector('.ad-panel').replaceWith(buildPanel()); pushPreview(); }
    } }, 'Edit text on the page');
    A.inline = false;
    return h('div', { class: 'ad-split' }, buildPanel(), h('section', { class: 'ad-preview' },
      h('div', { class: 'ad-prev-bar' }, h('strong', {}, 'Live preview'), h('span', { class: 'ad-row' }, inlineBtn, size('', 'Computer'), size('is-phone', 'Phone'))), wrap));
  }

  /* ---------- list views ---------- */
  const TYPE = { dinein: 'Dine-in', pickup: 'Pickup', delivery: 'Delivery' };
  const options = (list, cur) => list.map((s) => `<option value="${s}"${s === cur ? ' selected' : ''}>${s}</option>`).join('');
  const waNum = (p) => String(p || '').replace(/\D/g, '').replace(/^(?=9\d{9}$)/, '977');
  const contact = (x) => `<a href="tel:${esc(x.phone)}">${esc(x.phone)}</a> · <a href="https://wa.me/${esc(waNum(x.phone))}" target="_blank" rel="noopener">WhatsApp</a>`;
  const line = (label, v) => (v ? `<p><b>${label}:</b> ${esc(v)}</p>` : '');
  const alerts = () => `<p class="ad-note">Email alerts: <b>${A.me.email ? 'on' : 'off'}</b> · WhatsApp alerts: <b>${A.me.whatsapp ? 'on' : 'off'}</b>. The README explains how to switch them on. This list refreshes every 30 seconds. Staff can use the <a href="/counter" target="_blank" rel="noopener">counter screen</a>.</p>`;

  function orderCard(o) {
    return `<article class="ad-card${o.status === 'new' ? ' is-new' : ''}">
      <header><strong>${esc(o.id)}</strong><span>${when(o.createdAt)}</span><span class="ad-tag">${TYPE[o.type]}</span><b>${rs(o.total)}</b></header>
      <p>${esc(o.name)} · ${contact(o)}</p>
      <p><b>For:</b> ${o.schedule ? `${esc(o.schedule.bs || o.schedule.date)} at ${esc(o.schedule.time)}` : 'as soon as possible'}</p>
      ${line('Address', o.address)}${line('Table', o.tableNo)}
      <ul>${o.lines.map((l) => `<li>${l.qty} × ${esc(l.name)}${l.label ? ` (${esc(l.label)})` : ''} <span>${rs(l.qty * l.price)}</span></li>`).join('')}${o.deliveryFee ? `<li>Delivery <span>${rs(o.deliveryFee)}</span></li>` : ''}</ul>
      ${line('On the cake', o.cakeMessage)}${line('Occasion', o.occasion)}${line('Notes', o.notes)}${line(`${o.payment.method} transaction code`, o.payment.txn)}
      <footer>
        <label>Status <select data-patch="desk/orders" data-id="${esc(o.id)}" data-key="status">${options(['new', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'], o.status)}</select></label>
        <label class="ad-check"><input type="checkbox" data-patch="desk/orders" data-id="${esc(o.id)}" data-key="paid"${o.paid ? ' checked' : ''}><span>Payment checked</span></label>
        ${o.payment.proof ? `<a class="ad-btn" href="/api/desk/proof/${esc(o.payment.proof)}" target="_blank" rel="noopener">See ${esc(o.payment.method)} screenshot</a>` : ''}
        ${o.refPhoto ? `<a class="ad-btn" href="/api/desk/proof/${esc(o.refPhoto)}" target="_blank" rel="noopener">See cake design photo</a>` : ''}
        <button type="button" class="ad-btn ad-btn--quiet" data-del="orders" data-id="${esc(o.id)}">Delete</button>
      </footer></article>`;
  }
  function listView(kind) {
    const box = h('div', { class: 'ad-page' });
    if (kind === 'orders') {
      box.innerHTML = `<h2>Orders</h2>${alerts()}` + (A.orders.length ? A.orders.map(orderCard).join('') : '<p class="ad-empty">No orders yet.</p>');
    } else if (kind === 'bookings') {
      box.innerHTML = `<h2>Table bookings</h2>${alerts()}` + (A.bookings.length ? A.bookings.map((b) => `
        <article class="ad-card${b.status === 'new' ? ' is-new' : ''}">
          <header><strong>${esc(b.id)}</strong><span>asked ${when(b.createdAt)}</span><b>${esc(b.people)} people</b></header>
          <p><b>${esc(b.bs || b.date)} at ${esc(b.time)}</b>${b.seating ? ` · ${esc(b.seating)}` : ''}</p>
          <p>${esc(b.name)} · ${contact(b)}</p>
          ${line('Food ready on arrival', b.food)}${line('Name on cake', b.cakeName)}${line('Decoration', b.decoration)}${line('Remarks', b.remarks)}
          <footer>
            <label>Status <select data-patch="desk/bookings" data-id="${esc(b.id)}" data-key="status">${options(['new', 'confirmed', 'seated', 'declined', 'done'], b.status)}</select></label>
            <button type="button" class="ad-btn ad-btn--quiet" data-del="bookings" data-id="${esc(b.id)}">Delete</button>
          </footer>
        </article>`).join('') : '<p class="ad-empty">No bookings yet.</p>');
    } else if (kind === 'reviews') {
      box.innerHTML = `<h2>Reviews</h2>
        <p class="ad-note">Tick "Show on website" for the reviews you want visitors to see. To show a Google review, copy it from Google Maps and add it below.</p>
        <form class="ad-card ad-form" id="ad-newrev">
          <header><strong>Add a review yourself</strong></header>
          <div class="ad-grid">
            <label>Name<input name="name" required maxlength="60"></label>
            <label>Stars<select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></label>
            <label>From<select name="source"><option value="google">Google review</option><option value="site">Guest in the cafe</option></select></label>
          </div>
          <label>What they tried (optional)<input name="favorite" maxlength="100"></label>
          <label>Review<textarea name="text" rows="2" required maxlength="800"></textarea></label>
          <footer><button class="ad-btn" type="submit">Add and show on website</button></footer>
        </form>`
        + (A.reviews.length ? A.reviews.map((r) => `
        <article class="ad-card${r.approved ? '' : ' is-new'}">
          <header><strong>${esc(r.name)}</strong><span>${'★'.repeat(r.rating)}</span><span class="ad-tag">${r.source === 'google' ? 'Google' : 'Website'}</span><span>${when(r.createdAt)}</span></header>
          <p>${esc(r.text)}</p>${line('Tried', r.favorite)}
          <footer>
            <label class="ad-check"><input type="checkbox" data-patch="admin/reviews" data-id="${esc(r.id)}" data-key="approved"${r.approved ? ' checked' : ''}><span>Show on website</span></label>
            <button type="button" class="ad-btn ad-btn--quiet" data-del="reviews" data-id="${esc(r.id)}">Delete</button>
          </footer>
        </article>`).join('') : '<p class="ad-empty">No reviews yet.</p>');
    } else if (kind === 'messages') {
      box.innerHTML = `<h2>Messages</h2><p class="ad-note">Messages sent from the "Send us a message" box. The customer also sends the same text to your WhatsApp.</p>`
        + (A.messages.length ? A.messages.map((m) => `
        <article class="ad-card${m.read ? '' : ' is-new'}">
          <header><strong>${esc(m.name)}</strong><span>${when(m.createdAt)}</span></header>
          <p>${esc(m.text)}</p>
          ${m.phone ? `<p>${contact(m)}</p>` : ''}
          <footer>
            <label class="ad-check"><input type="checkbox" data-patch="admin/messages" data-id="${esc(m.id)}" data-key="read"${m.read ? ' checked' : ''}><span>Read</span></label>
            <button type="button" class="ad-btn ad-btn--quiet" data-del="messages" data-id="${esc(m.id)}">Delete</button>
          </footer>
        </article>`).join('') : '<p class="ad-empty">No messages yet.</p>');
    } else {
      box.innerHTML = `<h2>Security and staff</h2>
        <form class="ad-card ad-form" id="ad-pass-form">
          <header><strong>Change the owner password</strong></header>
          <div class="ad-grid ad-grid--2">
            <label>Current password<input type="password" name="current" autocomplete="current-password" required></label>
            <label>New password (8 or more characters)<input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
          </div>
          <footer><button class="ad-btn" type="submit">Change password</button>
            <button class="ad-btn ad-btn--quiet" type="button" data-do="signout-all">Sign out on every device</button></footer>
        </form>
        <div class="ad-card">
          <header><strong>Staff logins for the counter screen</strong><a class="ad-btn ad-btn--quiet" href="/counter" target="_blank" rel="noopener">Open counter screen</a></header>
          <p class="ad-note">Staff can see and update orders and bookings at /counter. They cannot edit the website.</p>
          ${A.staff.length ? `<ul class="ad-staff">${A.staff.map((s) => `<li><span><b>${esc(s.name)}</b> · login ID ${esc(s.username)}${s.active ? '' : ' · switched off'}${s.lastLoginAt ? ` · last login ${when(s.lastLoginAt)}` : ''}</span>
            <span class="ad-row"><button type="button" class="ad-btn ad-btn--quiet" data-staff="reset" data-id="${esc(s.id)}">New password</button>
            <button type="button" class="ad-btn ad-btn--quiet" data-staff="toggle" data-id="${esc(s.id)}" data-on="${s.active}">${s.active ? 'Switch off' : 'Switch on'}</button>
            <button type="button" class="ad-btn ad-btn--quiet" data-staff="remove" data-id="${esc(s.id)}">Remove</button></span></li>`).join('')}</ul>` : '<p class="ad-empty">No staff logins yet.</p>'}
          <form class="ad-form" id="ad-staff-form">
            <div class="ad-grid">
              <label>Name<input name="name" required maxlength="80"></label>
              <label>Login ID<input name="username" required maxlength="30" autocapitalize="none" placeholder="e.g. sita"></label>
              <label>Password (6 or more)<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
            </div>
            <footer><button class="ad-btn" type="submit">Add staff login</button></footer>
          </form>
        </div>
        <div class="ad-card">
          <header><strong>Backup</strong></header>
          <p class="ad-note">Downloads the website content, orders, bookings, reviews and messages as one file. Uploaded photos are not included.</p>
          <footer><a class="ad-btn" href="/api/admin/export">Download backup</a></footer>
        </div>
        <div class="ad-card">
          <header><strong>Recent activity</strong></header>
          ${A.log.length ? `<div class="ad-log"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Number</th></tr></thead><tbody>${A.log.map((l) => `<tr><td>${when(l.at)}</td><td>${esc(l.by)}</td><td>${esc(l.action)}</td><td>${esc(l.ref)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="ad-empty">Nothing yet.</p>'}
        </div>`;
    }
    return box;
  }

  async function loadLists() {
    const [o, b, r, m] = await Promise.all([api('GET', '/api/desk/orders'), api('GET', '/api/desk/bookings'), api('GET', '/api/admin/reviews'), api('GET', '/api/admin/messages')]);
    A.orders = o; A.bookings = b; A.reviews = r; A.messages = m;
    const count = { orders: o.filter((x) => x.status === 'new').length, bookings: b.filter((x) => x.status === 'new').length, reviews: r.filter((x) => !x.approved).length, messages: m.filter((x) => !x.read).length };
    for (const [k, n] of Object.entries(count)) {
      const el = document.querySelector(`[data-count="${k}"]`);
      if (el) { el.textContent = n; el.hidden = !n; }
    }
  }
  async function loadSecurity() {
    [A.staff, A.log] = await Promise.all([api('GET', '/api/admin/staff'), api('GET', '/api/admin/audit')]);
  }
  function show(view, force) {
    A.view = view;
    document.querySelectorAll('.ad-tabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.view === view));
    const body = document.getElementById('ad-body');
    if (view === 'edit') { if (!body.querySelector('.ad-split')) body.replaceChildren(editView()); return; }
    const busy = !force && body.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!busy || !body.querySelector('.ad-page')) body.replaceChildren(listView(view));
  }
  async function reload(view) {
    if (view === 'security') await loadSecurity(); else await loadLists();
    show(view, true);
  }

  function shell() {
    const tab = (view, label) => h('button', { type: 'button', 'data-view': view, onclick: async () => {
      if (view !== 'edit' && A.view === 'edit' && status() && !window.confirm('You have unsaved changes to the website. Leave the editor anyway? They are lost if you leave.')) return;
      if (view === 'edit') return show('edit', true);
      try { await reload(view); } catch (e) { flash(e.message, true); }
    } }, label, !/edit|security/.test(view) && h('span', { class: 'ad-count', 'data-count': view, hidden: true }, '0'));
    root.replaceChildren(
      h('header', { class: 'ad-top' },
        h('strong', { class: 'ad-name' }, 'Pick Me Cafe admin'),
        h('nav', { class: 'ad-tabs', 'aria-label': 'Admin sections' }, tab('edit', 'Edit website'), tab('orders', 'Orders'), tab('bookings', 'Bookings'), tab('reviews', 'Reviews'), tab('messages', 'Messages'), tab('security', 'Security')),
        h('span', { class: 'ad-right' },
          h('span', { id: 'ad-status', class: 'ad-status' }, 'All changes saved'),
          h('button', { type: 'button', id: 'ad-save', class: 'ad-btn ad-btn--main', disabled: true, onclick: save }, 'Save'),
          h('button', { type: 'button', class: 'ad-btn ad-btn--quiet', onclick: discard }, 'Undo changes'),
          h('a', { class: 'ad-btn ad-btn--quiet', href: '/', target: '_blank', rel: 'noopener' }, 'Open site'),
          h('button', { type: 'button', class: 'ad-btn ad-btn--quiet', onclick: async () => { await api('POST', '/api/auth/logout'); login(); } }, 'Log out'))),
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
  function discard() {
    if (status() && !window.confirm('Undo every change since your last save?')) return;
    A.content = JSON.parse(A.saved);
    document.getElementById('ad-body').replaceChildren();
    show('edit', true);
    status();
  }

  const formData = (form) => Object.fromEntries(new FormData(form).entries());
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (!t.dataset.patch) return;
    try {
      await api('PATCH', `/api/${t.dataset.patch}/${t.dataset.id}`, { [t.dataset.key]: t.type === 'checkbox' ? t.checked : t.value });
      await loadLists();
      flash('Updated.');
    } catch (err) { flash(err.message, true); }
  });
  root.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    const staff = e.target.closest('[data-staff]');
    const doIt = e.target.closest('[data-do]');
    try {
      if (del && window.confirm('Delete this for good?')) {
        await api('DELETE', `/api/admin/${del.dataset.del}/${del.dataset.id}`);
        await reload(A.view);
      } else if (staff) {
        const id = staff.dataset.id;
        if (staff.dataset.staff === 'remove' && window.confirm('Remove this staff login?')) await api('DELETE', `/api/admin/staff/${id}`);
        else if (staff.dataset.staff === 'toggle') await api('PATCH', `/api/admin/staff/${id}`, { active: staff.dataset.on !== 'true' });
        else if (staff.dataset.staff === 'reset') {
          const pw = window.prompt('New password for this staff login (6 or more characters):');
          if (!pw) return;
          await api('PATCH', `/api/admin/staff/${id}`, { password: pw });
          flash('Staff password changed.');
        } else return;
        await reload('security');
      } else if (doIt && doIt.dataset.do === 'signout-all' && window.confirm('Sign out every device, including staff? You stay logged in here.')) {
        await api('POST', '/api/admin/signout-all');
        flash('Every other device is signed out.');
        await reload('security');
      }
    } catch (err) { flash(err.message, true); }
  });
  root.addEventListener('submit', async (e) => {
    const id = e.target.id;
    if (!/^ad-(newrev|pass-form|staff-form)$/.test(id)) return;
    e.preventDefault();
    try {
      if (id === 'ad-newrev') { await api('POST', '/api/admin/reviews', formData(e.target)); await reload('reviews'); flash('Review added.'); }
      if (id === 'ad-pass-form') { await api('POST', '/api/admin/password', formData(e.target)); await reload('security'); flash('Password changed. Other devices are signed out.'); }
      if (id === 'ad-staff-form') { await api('POST', '/api/admin/staff', formData(e.target)); await reload('security'); flash('Staff login added.'); }
    } catch (err) { flash(err.message, true); }
  });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !A.content) return;
    if (e.data.pm === 'ready') { pushPreview(); if (A.inline) tell({ pm: 'inline', on: true }); }
    if (e.data.pm === 'edit' && typeof e.data.path === 'string' && /^[\w.]+$/.test(e.data.path) && !/__proto__|constructor|prototype/.test(e.data.path)) { set(A.content, e.data.path, String(e.data.value)); status(); }
  });
  window.addEventListener('beforeunload', (e) => { if (A.content && JSON.stringify(A.content) !== A.saved) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- login and start ---------- */
  function login() {
    clearInterval(A.poll);
    A.content = null;
    const msg = h('p', { class: 'ad-login-msg', role: 'alert' });
    const pass = h('input', { type: 'password', id: 'ad-pass', autocomplete: 'current-password', required: true });
    const keep = h('input', { type: 'checkbox', id: 'ad-keep', checked: true });
    root.replaceChildren(h('form', { class: 'ad-login', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', '/api/auth/login', { password: pass.value, remember: keep.checked }); boot(); } catch (err) { msg.textContent = err.message; }
    } }, h('h1', {}, 'Pick Me Cafe admin'), h('label', { for: 'ad-pass' }, 'Owner password'), pass,
    h('label', { class: 'ad-check', for: 'ad-keep' }, keep, h('span', {}, 'Keep me signed in on this device')), msg,
    h('button', { class: 'ad-btn ad-btn--main', type: 'submit' }, 'Log in'),
    h('a', { href: '/counter' }, 'Staff? Go to the counter screen'), h('a', { href: '/' }, 'Back to the website')));
    pass.focus();
  }
  async function boot() {
    A.me = await fetch('/api/auth/me').then((r) => r.json());
    if (A.me.role !== 'admin') return login();
    A.content = await fetch('/api/content').then((r) => r.json());
    A.saved = JSON.stringify(A.content);
    shell();
    show('edit');
    loadLists().catch(() => {});
    clearInterval(A.poll);
    A.poll = setInterval(async () => {
      try { await loadLists(); if (!/edit|security/.test(A.view)) show(A.view); } catch (e) { /* shown at next action */ }
    }, 30000);
  }
  boot();
})();
