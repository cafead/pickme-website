/* Pick Me Cafe: customer website. Everything on the page is drawn from /api/content. */
(function () {
  'use strict';

  const PREVIEW = /[?&]preview=1/.test(location.search);
  const ADMIN = location.hash === '#admin' && !PREVIEW;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = (u) => (/^(https?:\/\/|\/(?!\/)|#)/i.test(u || '') ? u : '');
  const rs = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN');
  const digits = (s) => String(s || '').replace(/\D/g, '');

  const FONTS = {
    display: { Marcellus: '', 'Cormorant Garamond': ':wght@500;600', 'Playfair Display': ':wght@500;600', Cinzel: ':wght@500;600', 'DM Serif Display': '', Italiana: '', Fraunces: ':wght@400;500' },
    script: { Allura: '', 'Great Vibes': '', 'Pinyon Script': '', Parisienne: '', Sacramento: '', 'Dancing Script': '' },
    body: { Jost: ':wght@300;400;500;600', Lora: ':wght@400;500;600', Mulish: ':wght@400;500;600', 'DM Sans': ':wght@400;500;600', 'Nunito Sans': ':wght@400;500;600', Karla: ':wght@400;500;600' },
  };

  const svg = (d, extra) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${d}</svg>`;
  const ICON = {
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    pin: svg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>'),
    phone: svg('<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    bag: svg('<path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    heart: svg('<path d="M12 20s-7-4.400-7-9.500A4 4 0 0 1 12 8a4 4 0 0 1 7 2.500c0 5.100-7 9.500-7 9.500z"/>'),
    star: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3l2.700 5.700 6.300.8-4.600 4.300 1.200 6.200L12 17l-5.600 3 1.200-6.200L3 9.500l6.300-.8z"/></svg>',
    instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.300" cy="6.700" r=".7" fill="currentColor"/>'),
    facebook: svg('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'),
    tiktok: svg('<path d="M14 3v11.500a3.500 3.500 0 1 1-3.500-3.500"/><path d="M14 3c.3 2.600 2 4.400 4.500 4.600"/>'),
    youtube: svg('<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>'),
    whatsapp: svg('<path d="M3.500 20.500l1.200-4.300A8.500 8.500 0 1 1 8 19.400z"/><path d="M9 8.500c-.3 1 .5 2.900 2 4.400s3.400 2.300 4.400 2l.9-1.200-2-1.200-.8.700c-.8-.3-2-1.500-2.300-2.300l.7-.8-1.200-2z"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>'),
  };

  const S = { c: null, reviews: [], tab: null, cart: [], slide: 0, timer: null, preset: null };
  window.PM = { FONTS, ICON, esc, rs };

  /* ---------- theme ---------- */
  function fontLink(id, name, spec) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('link');
      el.id = id;
      el.rel = 'stylesheet';
      document.head.appendChild(el);
    }
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}${spec || ''}&display=swap`;
    if (el.getAttribute('href') !== href) el.setAttribute('href', href);
  }
  function applyTheme(t) {
    const st = document.documentElement.style;
    const set = (k, v) => st.setProperty(k, v);
    const color = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(v || '') ? v : d);
    const font = (v, d) => String(v || d).replace(/[^\w\s-]/g, '');
    set('--bg', color(t.bg, '#FBF6EE'));
    set('--surface', color(t.surface, '#FFFDF9'));
    set('--ink', color(t.ink, '#3B2A1A'));
    set('--muted', color(t.muted, '#6F5B48'));
    set('--accent', color(t.accent, '#8C6A2E'));
    set('--gold', color(t.gold, '#C4A265'));
    set('--radius', (Number(t.radius) || 0) + 'px');
    const fd = font(t.fontDisplay, 'Marcellus');
    const fs = font(t.fontScript, 'Allura');
    const fb = font(t.fontBody, 'Jost');
    set('--f-display', `"${fd}", "Cormorant Garamond", Georgia, serif`);
    set('--f-script', `"${fs}", "Brush Script MT", cursive`);
    set('--f-body', `"${fb}", "Helvetica Neue", Arial, sans-serif`);
    fontLink('font-display', fd, FONTS.display[fd]);
    fontLink('font-script', fs, FONTS.script[fs]);
    fontLink('font-body', fb, FONTS.body[fb]);
    fontLink('font-ital', 'Cormorant Garamond', ':ital,wght@1,500');
    const calm = PREVIEW || t.animations === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.toggle('anim', !calm);
  }

  /* ---------- small builders ---------- */
  const pic = (url, alt, cls) => `<div class="pic ${cls || ''}" data-alt="${esc(alt)}">${safeUrl(url) ? `<img src="${esc(safeUrl(url))}" alt="${esc(alt)}" loading="lazy">` : ''}</div>`;
  const head = (o, extra) => `<header class="head rv">${o.script ? `<p class="script">${esc(o.script)}</p>` : ''}${o.title ? `<h2>${esc(o.title)}</h2>` : ''}${extra || ''}</header>`;
  const btn = (label, href, cls) => `<a class="btn ${cls || ''}" href="${esc(safeUrl(href) || '#')}"><span>${esc(label)}</span>${ICON.arrow}</a>`;
  const logo = (c) => (safeUrl(c.brand.logo) ? `<img class="logo-img" src="${esc(safeUrl(c.brand.logo))}" alt="">` : `<span class="logo-mono" aria-hidden="true">${esc((c.brand.shortName || c.brand.name || 'P').slice(0, 1))}</span>`);
  const nepalTime = () => new Date(Date.now() + 345 * 60e3).toISOString().slice(11, 16);
  const isOpen = (c) => { const t = nepalTime(); return t >= c.brand.open && t <= c.brand.close; };
  const t12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${m < 10 ? '0' : ''}${m} ${h < 12 ? 'AM' : 'PM'}`; };
  function timeOptions(c, chosen) {
    const [oh, om] = c.brand.open.split(':').map(Number);
    const [ch, cm] = c.brand.close.split(':').map(Number);
    let out = '<option value="">Choose a time</option>';
    for (let m = oh * 60 + om; m <= ch * 60 + cm; m += 30) {
      const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      out += `<option value="${v}"${v === chosen ? ' selected' : ''}>${t12(v)}</option>`;
    }
    return out;
  }
  const waLink = (c, text) => `https://wa.me/${digits(c.brand.whatsapp)}?text=${encodeURIComponent(text)}`;
  const visible = (c, id) => c.sections.some((s) => s.id === id && s.show !== false);

  /* ---------- menu lookups and cart ---------- */
  function findPrice(itemId, label) {
    for (const cat of S.c.menu.categories) {
      for (const it of cat.items || []) {
        if (it.id !== itemId) continue;
        const p = (it.prices || []).find((x) => (x.label || '') === (label || ''));
        return p ? { item: it, price: p } : null;
      }
    }
    return null;
  }
  function cartLines() {
    return S.cart.map((l) => {
      const f = findPrice(l.itemId, l.label);
      return f && f.item.available !== false && Number(f.price.price) > 0
        ? { itemId: l.itemId, label: l.label, qty: l.qty, name: f.item.name, price: Number(f.price.price), whole: Boolean(f.price.whole) }
        : null;
    }).filter(Boolean);
  }
  function saveCart() {
    try { localStorage.setItem('pm_cart', JSON.stringify(S.cart)); } catch (e) { /* storage not available */ }
    const n = cartLines().reduce((s, l) => s + l.qty, 0);
    $$('.cart-count').forEach((el) => { el.textContent = n; el.hidden = !n; });
  }
  function addToCart(itemId, label, qty, replace) {
    const line = S.cart.find((l) => l.itemId === itemId && l.label === label);
    if (line) line.qty = replace ? qty : Math.min(50, line.qty + qty);
    else S.cart.push({ itemId, label, qty });
    S.cart = S.cart.filter((l) => l.qty > 0);
    saveCart();
  }
  function toast(msg) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('is-on'), 2600);
  }

  /* ---------- sections ---------- */
  const R = {};

  R.hero = (c) => {
    const h = c.hero;
    const open = isOpen(c);
    const words = String(h.marquee || '').split('•').map((w) => w.trim()).filter(Boolean);
    const strip = words.map((w) => `<span>${esc(w)}</span>`).join('<i aria-hidden="true">✦</i>') + '<i aria-hidden="true">✦</i>';
    return `<section id="hero" class="hero hero--${esc(h.layout || 'right')}">
      ${pic(h.image, 'Inside ' + c.brand.name, 'hero-media')}
      <div class="hero-text">
        ${h.script ? `<p class="script hero-in">${esc(h.script)}</p>` : ''}
        <h1 class="hero-in">${esc(h.title)}</h1>
        ${h.line ? `<p class="hero-line hero-in">${esc(h.line)}</p>` : ''}
        ${h.tagline ? `<p class="ital hero-in">${esc(h.tagline)}</p>` : ''}
        <div class="pill hero-in">
          <span>${ICON.clock}<span><small class="${open ? 'dot dot--on' : 'dot'}">${open ? 'Open now' : 'Closed now'}</small>${esc(c.brand.hoursText)}</span></span>
          <a href="${esc(safeUrl(c.visit.mapLink) || '#visit')}"${safeUrl(c.visit.mapLink) ? ' target="_blank" rel="noopener"' : ''}>${ICON.pin}<span><small>Find us</small>${esc(c.brand.address.split(',').slice(0, 2).join(','))}</span></a>
        </div>
        <div class="row hero-in">
          ${h.button && visible(c, 'menu') ? btn(h.button, '#menu') : ''}
          ${h.button2 && visible(c, 'booking') ? btn(h.button2, '#booking', 'btn--ghost') : ''}
        </div>
      </div>
    </section>
    ${words.length ? `<div class="marquee" aria-hidden="true"><div>${strip}${strip}</div></div>` : ''}`;
  };

  R.highlights = (c) => {
    const h = c.highlights;
    return `<section id="highlights" class="sec"><div class="wrap">
      ${head(h)}
      <div class="trio">${(h.cards || []).map((k, i) => `
        <a class="arch rv" style="--d:${i * 90}ms" href="#menu" data-act="cat" data-id="${esc(k.category)}">
          ${pic(k.image, k.title, 'arch-pic')}
          <h3>${esc(k.title)}</h3>
          <p>${esc(k.text)}</p>
        </a>`).join('')}
      </div></div></section>`;
  };

  function activeEvents(c) {
    const today = BS.todayAD();
    return (c.events.items || []).filter((e) => {
      if (e.enabled === false || !/^\d{4}-\d{2}-\d{2}$/.test(e.start || '')) return false;
      const end = new Date(Date.parse(e.start) + (Number(e.days) || 1) * 864e5).toISOString().slice(0, 10);
      return today >= e.start && today < end;
    });
  }
  R.events = (c) => {
    const list = activeEvents(c);
    if (!list.length) return '';
    if (S.slide >= list.length) S.slide = 0;
    return `<section id="events" class="sec"><div class="wrap">
      ${head(c.events)}
      <div class="slides rv" data-n="${list.length}">
        ${list.map((e, i) => `<article class="slide${i === S.slide ? ' is-on' : ''}" aria-hidden="${i !== S.slide}">
          ${pic(e.image, e.title, 'slide-pic')}
          <div class="slide-text">
            <h3>${esc(e.title)}</h3>
            <p>${esc(e.text)}</p>
            ${e.button ? btn(e.button, e.link || '#menu') : ''}
          </div></article>`).join('')}
        ${list.length > 1 ? `<div class="dots">${list.map((e, i) => `<button type="button" data-act="slide" data-i="${i}" class="${i === S.slide ? 'is-on' : ''}" aria-label="Show ${esc(e.title)}"></button>`).join('')}</div>` : ''}
      </div></div></section>`;
  };

  function menuBody(c) {
    const cats = c.menu.categories || [];
    const cat = cats.find((x) => x.id === S.tab) || cats[0];
    if (!cat) return '<p class="muted">The menu is being updated.</p>';
    S.tab = cat.id;
    const tabs = cats.map((x) => `<button type="button" role="tab" aria-selected="${x.id === cat.id}" class="tab${x.id === cat.id ? ' is-on' : ''}" data-act="tab" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('');
    const items = (cat.items || []).map((it) => {
      const off = it.available === false;
      const prices = off ? '<span class="mi-off">Not available today</span>' : (it.prices || []).filter((p) => Number(p.price) > 0).map((p) => `
        <button type="button" class="pchip" data-act="${p.whole ? 'cake' : 'add'}" data-item="${esc(it.id)}" data-label="${esc(p.label || '')}"
          aria-label="${p.whole ? 'Pre-order' : 'Add'} ${esc(it.name)} ${esc(p.label || '')}, ${rs(p.price)}">
          ${p.label ? `<span>${esc(p.label)}</span>` : ''}<b>${rs(p.price)}</b><i aria-hidden="true">${p.whole ? 'Pre-order' : '+'}</i>
        </button>`).join('');
      return `<article class="mi${off ? ' mi--off' : ''}">
        ${safeUrl(it.image) ? pic(it.image, it.name, 'mi-pic') : ''}
        <div class="mi-body"><h4>${esc(it.name)}</h4>${it.desc ? `<p>${esc(it.desc)}</p>` : ''}</div>
        <div class="mi-prices">${prices}</div>
      </article>`;
    }).join('');
    return `<div class="tabs" role="tablist" aria-label="Menu groups">${tabs}</div>
      ${cat.note ? `<p class="menu-note">${esc(cat.note)}</p>` : ''}
      <div class="menu-list" role="tabpanel">${items}</div>`;
  }
  R.menu = (c) => `<section id="menu" class="sec sec--tint"><div class="wrap">
      ${head(c.menu, c.menu.note ? `<p class="lede">${esc(c.menu.note)}</p>` : '')}
      <div id="menu-body" class="rv">${menuBody(c)}</div>
    </div></section>`;

  function wholeCakes(c) {
    const out = [];
    for (const cat of c.menu.categories || []) {
      for (const it of cat.items || []) {
        if (it.available === false) continue;
        for (const p of it.prices || []) if (p.whole && Number(p.price) > 0) out.push({ id: it.id, name: it.name, label: p.label || '', price: p.price });
      }
    }
    return out;
  }
  R.cake = (c) => {
    const k = c.cake;
    return `<section id="cake" class="sec"><div class="wrap split">
      <div class="split-pic rv">${pic(k.image, 'Celebration cake', 'fade-pic')}</div>
      <div class="split-body rv">
        ${head(k)}
        <p class="lede">${esc(k.text)}</p>
        <form class="form" data-form="cake" novalidate>
          <label class="f f--wide"><span>Cake</span><select name="cake" id="cake-select" required>
            ${wholeCakes(c).map((w) => `<option value="${esc(w.id)}|${esc(w.label)}">${esc(w.name)}, ${esc(w.label)}: ${rs(w.price)}</option>`).join('')}
          </select></label>
          <label class="f"><span>How many</span><input name="qty" id="cake-qty" type="number" min="1" max="20" value="1" inputmode="numeric" required></label>
          <label class="f"><span>Name or message on the cake</span><input name="cakeMessage" id="cake-msg" maxlength="120" placeholder="Happy Birthday Aarav"></label>
          <div class="f"><span>Date (Nepali calendar)</span><div data-bsp="date"></div></div>
          <label class="f"><span>Time</span><select name="time" id="cake-time" required>${timeOptions(c)}</select></label>
          <p class="hint f--wide">We need at least ${esc(k.noticeHours)} hours to prepare a whole cake.</p>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span>${esc(k.button || 'Continue to payment')}</span>${ICON.arrow}</button>
        </form>
      </div></div></section>`;
  };

  R.booking = (c) => {
    const b = c.booking;
    return `<section id="booking" class="sec sec--tint"><div class="wrap split split--flip">
      <div class="split-pic rv">${pic(b.image, 'A table at ' + c.brand.name, 'fade-pic')}</div>
      <div class="split-body rv">
        ${head(b)}
        <p class="lede">${esc(b.text)}</p>
        <form class="form" data-form="booking" novalidate>
          <label class="f"><span>Your name</span><input name="name" id="bk-name" autocomplete="name" maxlength="80" required></label>
          <label class="f"><span>Phone</span><input name="phone" id="bk-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="98XXXXXXXX" required></label>
          <div class="f"><span>Date (Nepali calendar)</span><div data-bsp="date"></div></div>
          <label class="f"><span>Time</span><select name="time" id="bk-time" required>${timeOptions(c)}</select></label>
          <label class="f"><span>Number of people</span><input name="people" id="bk-people" type="number" min="1" max="${esc(b.maxPeople)}" value="2" inputmode="numeric" required></label>
          <label class="f f--wide"><span>Food, decoration or cake name you want</span><textarea name="requests" id="bk-req" rows="2" maxlength="600" placeholder="Birthday decoration, a blueberry cheesecake with the name Sita"></textarea></label>
          <label class="f f--wide"><span>Other remarks</span><textarea name="remarks" id="bk-rem" rows="2" maxlength="600"></textarea></label>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span>${esc(b.button || 'Request booking')}</span>${ICON.arrow}</button>
        </form>
      </div></div></section>`;
  };

  R.story = (c) => {
    const s = c.story;
    return `<section id="story" class="story">
      ${pic(s.image, 'Inside ' + c.brand.name, 'story-pic')}
      <div class="story-body rv">
        ${s.script ? `<p class="script">${esc(s.script)}</p>` : ''}
        <h2>${esc(s.title)}</h2>
        <p>${esc(s.text)}</p>
        ${s.side ? `<p class="script story-side">${esc(s.side)} ${ICON.heart}</p>` : ''}
      </div></section>`;
  };

  R.gallery = (c) => {
    const g = c.gallery;
    if (!(g.images || []).length) return '';
    return `<section id="gallery" class="sec"><div class="wrap">
      ${head(g)}
      <div class="gal">${g.images.map((im, i) => `
        <button type="button" class="gal-item rv" style="--d:${i * 70}ms" data-act="zoom" data-src="${esc(safeUrl(im.image))}" data-cap="${esc(im.caption)}" aria-label="Open photo: ${esc(im.caption || 'gallery photo')}">
          ${pic(im.image, im.caption || 'Gallery photo')}
          ${im.caption ? `<span>${esc(im.caption)}</span>` : ''}
        </button>`).join('')}
      </div></div></section>`;
  };

  const stars = (n) => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${ICON.star.repeat(n)}</span>`;
  function reviewList() {
    if (!S.reviews.length) return '<p class="muted center">Be the first to leave a review.</p>';
    return `<div class="revs">${S.reviews.map((r) => `<figure class="rev">
      ${stars(r.rating)}
      <blockquote>${esc(r.text)}</blockquote>
      <figcaption>${esc(r.name)}${r.source === 'google' ? '<small>Google review</small>' : ''}</figcaption>
    </figure>`).join('')}</div>`;
  }
  R.reviews = (c) => {
    const r = c.reviews;
    return `<section id="reviews" class="sec sec--tint"><div class="wrap">
      ${head(r)}
      <div id="review-list" class="rv">${reviewList()}</div>
      <details class="review-box rv">
        <summary class="btn btn--ghost"><span>${esc(r.formTitle || 'Leave a review')}</span></summary>
        <form class="form" data-form="review" novalidate>
          <label class="f"><span>Your name</span><input name="name" id="rv-name" maxlength="60" required></label>
          <fieldset class="f rate"><legend>Your rating</legend>
            ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="rv-s${n}" value="${n}"${n === 5 ? ' checked' : ''}><label for="rv-s${n}" aria-label="${n} stars">${ICON.star}</label>`).join('')}
          </fieldset>
          <label class="f f--wide"><span>Your review</span><textarea name="text" id="rv-text" rows="3" maxlength="800" required></textarea></label>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span>Send review</span>${ICON.arrow}</button>
        </form>
      </details>
    </div></section>`;
  };

  R.visit = (c) => {
    const v = c.visit;
    const embed = /^https:\/\/(www\.)?google\.com\/maps/.test(v.mapEmbed || '') ? v.mapEmbed : '';
    return `<section id="visit" class="sec"><div class="wrap">
      ${head(v)}
      <div class="visit">
        <div class="map rv">${embed ? `<iframe src="${esc(embed)}" title="Map showing ${esc(c.brand.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>` : '<div class="pic pic--empty" data-alt="Add a Google Maps embed link in admin"></div>'}</div>
        <div class="visit-info rv">
          <ul class="facts">
            <li>${ICON.pin}<span>${esc(c.brand.address)}</span></li>
            <li>${ICON.clock}<span>${esc(c.brand.hoursText)}</span></li>
            <li>${ICON.phone}<a href="tel:${esc(digits(c.brand.phone))}">${esc(c.brand.phone)}</a></li>
          </ul>
          ${safeUrl(v.mapLink) ? `<a class="btn btn--ghost" href="${esc(safeUrl(v.mapLink))}" target="_blank" rel="noopener"><span>Open in Google Maps</span>${ICON.arrow}</a>` : ''}
          <form class="form form--solo" data-form="message" novalidate>
            <h3>${esc(v.messageTitle)}</h3>
            <p class="hint">${esc(v.messageText)}</p>
            <label class="f"><span>Your name</span><input name="name" id="msg-name" maxlength="80" required></label>
            <label class="f"><span>Message</span><textarea name="text" id="msg-text" rows="3" maxlength="800" required></textarea></label>
            <p class="form-msg" role="alert"></p>
            <button class="btn" type="submit">${ICON.whatsapp}<span>Send on WhatsApp</span></button>
          </form>
        </div>
      </div></div></section>`;
  };

  function nav(c) {
    const links = c.sections.filter((s) => s.show !== false && s.nav !== false && R[s.id] && s.id !== 'hero').map((s) => `<a href="#${esc(s.id)}">${esc(s.label)}</a>`).join('');
    return `<header class="nav" id="top"><div class="nav-in">
      <a class="brand" href="#hero" aria-label="${esc(c.brand.name)}, home">${logo(c)}<span>${esc(c.brand.name)}</span></a>
      <nav class="nav-links" id="nav-links" aria-label="Sections">${links}</nav>
      <div class="nav-right">
        <button type="button" class="cart-btn" data-act="cart" aria-label="Open cart">${ICON.bag}<span class="cart-count" hidden>0</span></button>
        <button type="button" class="nav-toggle" data-act="nav" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links">${ICON.menu}</button>
      </div></div></header>`;
  }
  function footer(c) {
    const soc = (c.social || []).filter((s) => safeUrl(s.url) && /^https?:/i.test(s.url)).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(s.type)}">${ICON[s.type] || ICON.link}</a>`).join('');
    return `<footer class="foot"><div class="wrap foot-in">
      <a class="brand brand--foot" href="#hero">${logo(c)}<span>${esc(c.brand.name)}</span></a>
      <p>${ICON.pin}<span>${esc(c.brand.address)}</span></p>
      <p>${ICON.clock}<span>${esc(c.brand.hoursText)}</span></p>
      <div class="soc">${soc}<a href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICON.whatsapp}</a></div>
      </div>
      <p class="foot-line">${ICON.heart}<span>${esc(c.footer.line)}</span></p>
      ${c.footer.note ? `<p class="foot-note">${esc(c.footer.note)}</p>` : ''}
    </footer>
    <a class="wa-float" href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">${ICON.whatsapp}</a>`;
  }

  /* ---------- render ---------- */
  let observer = null;
  function render() {
    const c = S.c;
    applyTheme(c.theme);
    const y = window.scrollY;
    $('#app').innerHTML = nav(c) + '<main>' + c.sections.filter((s) => s.show !== false && R[s.id]).map((s) => R[s.id](c)).join('') + '</main>' + footer(c);
    $$('[data-bsp]', $('#app')).forEach((el) => BS.mount(el, { name: el.dataset.bsp }));
    saveCart();
    startSlides();
    if (observer) observer.disconnect();
    if (document.documentElement.classList.contains('anim') && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); }
      }), { rootMargin: '0px 0px -8% 0px' });
      $$('.rv').forEach((el) => observer.observe(el));
    }
    if (PREVIEW) window.scrollTo(0, y);
  }
  function startSlides() {
    clearInterval(S.timer);
    const box = $('.slides');
    if (!box || Number(box.dataset.n) < 2) return;
    S.timer = setInterval(() => { if (!box.matches(':hover')) showSlide(S.slide + 1); }, Math.max(2, Number(S.c.events.seconds) || 5) * 1000);
  }
  function showSlide(i) {
    const slides = $$('.slide');
    if (!slides.length) return;
    S.slide = (i + slides.length) % slides.length;
    slides.forEach((s, n) => { s.classList.toggle('is-on', n === S.slide); s.setAttribute('aria-hidden', n !== S.slide); });
    $$('.dots button').forEach((d, n) => d.classList.toggle('is-on', n === S.slide));
  }

  /* ---------- cart drawer and checkout ---------- */
  const layer = () => $('#layer');
  function closeLayer() { layer().innerHTML = ''; document.body.classList.remove('lock'); }
  function openLayer(html) {
    layer().innerHTML = html;
    document.body.classList.add('lock');
    const f = $('[autofocus], button, input', layer());
    if (f) f.focus();
  }
  function cartHtml() {
    const lines = cartLines();
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
    return `<div class="shade" data-act="close"></div>
      <aside class="drawer" role="dialog" aria-label="Your cart">
        <header><h2>Your cart</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close cart">${ICON.x}</button></header>
        ${lines.length ? `<ul class="lines">${lines.map((l) => `<li>
            <div><strong>${esc(l.name)}</strong><small>${l.label ? esc(l.label) + ' · ' : ''}${rs(l.price)}</small></div>
            <div class="qty"><button type="button" data-act="qty" data-item="${esc(l.itemId)}" data-label="${esc(l.label)}" data-d="-1" aria-label="One less ${esc(l.name)}">−</button><span>${l.qty}</span><button type="button" data-act="qty" data-item="${esc(l.itemId)}" data-label="${esc(l.label)}" data-d="1" aria-label="One more ${esc(l.name)}">+</button></div>
            <b>${rs(l.price * l.qty)}</b></li>`).join('')}</ul>
          <footer><p class="sum"><span>Subtotal</span><b>${rs(total)}</b></p>
            <p class="hint">Delivery inside Hetauda adds ${rs(S.c.payment.deliveryFee)}.</p>
            <button type="button" class="btn" data-act="checkout"><span>Order and pay</span>${ICON.arrow}</button></footer>`
        : `<p class="empty">Your cart is empty. Add something from the menu.</p>`}
      </aside>`;
  }
  function sumHtml(type) {
    const lines = cartLines();
    const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const fee = type === 'delivery' ? Number(S.c.payment.deliveryFee) || 0 : 0;
    return `<ul class="lines lines--mini">${lines.map((l) => `<li><div><strong>${l.qty} × ${esc(l.name)}</strong>${l.label ? `<small>${esc(l.label)}</small>` : ''}</div><b>${rs(l.price * l.qty)}</b></li>`).join('')}
      ${fee ? `<li><div><strong>Delivery</strong></div><b>${rs(fee)}</b></li>` : ''}</ul>
      <p class="sum sum--big"><span>Total to pay</span><b id="co-total">${rs(sub + fee)}</b></p>`;
  }
  function qrHtml(method) {
    const p = S.c.payment[method] || {};
    return `${safeUrl(p.qr) ? `<img class="qr" src="${esc(safeUrl(p.qr))}" alt="${esc(p.name)} QR code">` : `<div class="qr qr--empty">The ${esc(p.name)} QR code has not been added yet.</div>`}
      ${p.account ? `<p class="hint">${esc(p.account)}</p>` : ''}`;
  }
  function checkoutHtml() {
    const c = S.c;
    const lines = cartLines();
    const hasWhole = lines.some((l) => l.whole);
    const pre = S.preset || {};
    const later = hasWhole || pre.when === 'later' || !isOpen(c);
    const methods = ['esewa', 'fonepay'].filter((m) => c.payment[m] && c.payment[m].enabled !== false);
    return `<div class="shade" data-act="close"></div>
      <div class="modal" role="dialog" aria-label="Checkout">
        <header><h2>Order and pay</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close checkout">${ICON.x}</button></header>
        <form class="form" data-form="checkout" novalidate>
          <div class="f--wide" id="co-sum">${sumHtml('pickup')}</div>
          <label class="f"><span>Your name</span><input name="name" id="co-name" autocomplete="name" maxlength="80" required></label>
          <label class="f"><span>Phone</span><input name="phone" id="co-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="98XXXXXXXX" required></label>
          <fieldset class="f f--wide seg"><legend>How would you like it?</legend>
            <input type="radio" name="type" id="co-pickup" value="pickup" checked><label for="co-pickup">Pickup</label>
            <input type="radio" name="type" id="co-dinein" value="dinein"><label for="co-dinein">Dine-in</label>
            <input type="radio" name="type" id="co-delivery" value="delivery"><label for="co-delivery">Delivery +${rs(c.payment.deliveryFee)}</label>
          </fieldset>
          <label class="f f--wide" id="co-addr" hidden><span>Delivery address</span><textarea name="address" id="co-address" rows="2" maxlength="300" placeholder="Tole, landmark, ward"></textarea><small class="hint">${esc(c.payment.deliveryNote)}</small></label>
          <fieldset class="f f--wide seg"><legend>When?</legend>
            ${hasWhole ? '' : `<input type="radio" name="when" id="co-now" value="now"${later ? '' : ' checked'}><label for="co-now">As soon as possible</label>`}
            <input type="radio" name="when" id="co-later" value="later"${later ? ' checked' : ''}><label for="co-later">Later</label>
          </fieldset>
          <div class="f--wide grid2" id="co-when"${later ? '' : ' hidden'}>
            <div class="f"><span>Date (Nepali calendar)</span><div data-bsp="date"></div></div>
            <label class="f"><span>Time</span><select name="time" id="co-time">${timeOptions(c, pre.time)}</select></label>
            ${hasWhole ? `<p class="hint f--wide">Whole cakes need at least ${esc(c.cake.noticeHours)} hours notice.</p>` : (!isOpen(c) ? `<p class="hint f--wide">We are closed right now, so please pick a time (${esc(c.brand.hoursText)}).</p>` : '')}
          </div>
          ${hasWhole ? `<label class="f f--wide"><span>Name or message on the cake</span><input name="cakeMessage" id="co-cake" maxlength="120" value="${esc(pre.cakeMessage || '')}"></label>` : ''}
          <label class="f f--wide"><span>Notes for us (optional)</span><textarea name="notes" id="co-notes" rows="2" maxlength="500"></textarea></label>
          <fieldset class="f f--wide seg"><legend>Pay with</legend>
            ${methods.map((m, i) => `<input type="radio" name="method" id="co-${m}" value="${m}"${i === 0 ? ' checked' : ''}><label for="co-${m}">${esc(c.payment[m].name)}</label>`).join('')}
          </fieldset>
          <div class="f--wide pay">
            <div id="co-qr">${methods.length ? qrHtml(methods[0]) : ''}</div>
            <div><p>${esc(c.payment.instructions)}</p>
              <label class="f"><span>Payment screenshot</span><input type="file" name="proof" id="co-proof" accept="image/png,image/jpeg,image/webp" required></label></div>
          </div>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span>Place order</span>${ICON.arrow}</button>
        </form>
      </div>`;
  }
  function openCheckout() {
    if (!cartLines().length) return toast('Your cart is empty.');
    openLayer(checkoutHtml());
    const pre = S.preset || {};
    $$('[data-bsp]', layer()).forEach((el) => BS.mount(el, { name: el.dataset.bsp, value: pre.date }));
  }
  function doneHtml(title, lines, text) {
    return `<div class="shade" data-act="close"></div>
      <div class="modal modal--done" role="dialog" aria-label="${esc(title)}">
        <p class="script">Thank you</p><h2>${esc(title)}</h2>
        ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        <a class="btn" href="${esc(waLink(S.c, text))}" target="_blank" rel="noopener">${ICON.whatsapp}<span>Send it to us on WhatsApp</span></a>
        <button type="button" class="btn btn--ghost" data-act="close"><span>Close</span></button>
      </div>`;
  }

  /* ---------- forms ---------- */
  async function post(url, body, raw) {
    const r = await fetch(url, raw ? { method: 'POST', headers: { 'Content-Type': raw }, body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  const FORMS = {
    cake(d) {
      if (!d.cake) throw new Error('Please choose a cake.');
      if (!d.date || !d.time) throw new Error('Please choose a date and time.');
      const [itemId, label] = d.cake.split('|');
      addToCart(itemId, label, Math.max(1, Math.min(20, Number(d.qty) || 1)), true);
      S.preset = { when: 'later', date: d.date, time: d.time, cakeMessage: d.cakeMessage };
      openCheckout();
    },
    async booking(d, form) {
      if (!d.date || !d.time) throw new Error('Please choose a date and time.');
      const res = await post('/api/bookings', { name: d.name, phone: d.phone, people: d.people, date: d.date, dateBs: d.dateBs, time: d.time, requests: d.requests, remarks: d.remarks });
      form.reset();
      openLayer(doneHtml('Booking request sent', [`Your booking number is ${res.id}.`, 'We will call or message you to confirm your table.'], res.text));
    },
    async review(d, form) {
      await post('/api/reviews', { name: d.name, rating: d.rating, text: d.text });
      form.reset();
      return S.c.reviews.thanks;
    },
    message(d, form) {
      if (!d.name || !d.text) throw new Error('Please write your name and message.');
      window.open(waLink(S.c, `Hello ${S.c.brand.name}, this is ${d.name}.\n${d.text}`), '_blank', 'noopener');
      form.reset();
      return 'WhatsApp is opening with your message. Press send there.';
    },
    async checkout(d, form) {
      const file = form.elements.proof.files[0];
      if (!d.name || !d.phone) throw new Error('Please enter your name and phone number.');
      if (d.when === 'later' && (!d.date || !d.time)) throw new Error('Please choose a date and time.');
      if (!file) throw new Error('Please upload a screenshot of your payment.');
      if (file.size > 8 * 1024 * 1024) throw new Error('That screenshot is too large. Please use one under 8 MB.');
      const up = await post('/api/proof', file, file.type || 'image/jpeg');
      const res = await post('/api/orders', {
        name: d.name, phone: d.phone, type: d.type, address: d.address, when: d.when, date: d.date, dateBs: d.dateBs, time: d.time,
        cakeMessage: d.cakeMessage, notes: d.notes, method: d.method, proof: up.file,
        lines: cartLines().map((l) => ({ itemId: l.itemId, label: l.label, qty: l.qty })),
      });
      S.cart = [];
      S.preset = null;
      saveCart();
      openLayer(doneHtml('Order received', [`Your order number is ${res.id}. Total ${rs(res.total)}.`, 'We will check your payment and start preparing it.'], res.text));
    },
  };
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const msg = $('.form-msg', form);
    const say = (text, ok) => { if (msg) { msg.textContent = text || ''; msg.classList.toggle('is-ok', Boolean(ok)); } };
    if (PREVIEW) return say('This is the preview. Forms work on the real website.');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const d = Object.fromEntries(new FormData(form).entries());
    const button = $('button[type=submit]', form);
    button.disabled = true;
    say('');
    try {
      const ok = await FORMS[form.dataset.form](d, form);
      if (ok) say(ok, true);
    } catch (err) {
      say(err.message);
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener('change', (e) => {
    const form = e.target.closest('form[data-form=checkout]');
    if (!form) return;
    if (e.target.name === 'type') {
      $('#co-sum').innerHTML = sumHtml(e.target.value);
      $('#co-addr').hidden = e.target.value !== 'delivery';
    }
    if (e.target.name === 'when') $('#co-when').hidden = e.target.value !== 'later';
    if (e.target.name === 'method') $('#co-qr').innerHTML = qrHtml(e.target.value);
  });

  /* ---------- clicks ---------- */
  const ACT = {
    tab(el) {
      S.tab = el.dataset.id;
      const box = $('#menu-body');
      const swap = () => { box.innerHTML = menuBody(S.c); };
      if (document.startViewTransition && document.documentElement.classList.contains('anim')) document.startViewTransition(swap);
      else swap();
    },
    cat(el) {
      if (S.c.menu.categories.some((x) => x.id === el.dataset.id)) { S.tab = el.dataset.id; $('#menu-body').innerHTML = menuBody(S.c); }
    },
    add(el) {
      addToCart(el.dataset.item, el.dataset.label, 1);
      const f = findPrice(el.dataset.item, el.dataset.label);
      toast(`${f ? f.item.name : 'Item'} added to your cart`);
      $$('.cart-btn').forEach((b) => { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
    },
    cake(el) {
      const sel = $('#cake-select');
      if (!sel) { addToCart(el.dataset.item, el.dataset.label, 1); return openCheckout(); }
      sel.value = `${el.dataset.item}|${el.dataset.label}`;
      $('#cake').scrollIntoView({ behavior: 'smooth' });
    },
    cart() { openLayer(cartHtml()); },
    qty(el) {
      const line = S.cart.find((l) => l.itemId === el.dataset.item && l.label === el.dataset.label);
      if (line) addToCart(line.itemId, line.label, line.qty + Number(el.dataset.d), true);
      openLayer(cartHtml());
    },
    checkout() { openCheckout(); },
    close() { closeLayer(); },
    slide(el) { showSlide(Number(el.dataset.i)); startSlides(); },
    nav(el) {
      const open = !$('#nav-links').classList.contains('is-open');
      $('#nav-links').classList.toggle('is-open', open);
      el.setAttribute('aria-expanded', open);
    },
    zoom(el) {
      if (!el.dataset.src) return;
      openLayer(`<div class="shade shade--dark" data-act="close"></div><figure class="zoom"><img src="${esc(el.dataset.src)}" alt="${esc(el.dataset.cap)}"><figcaption>${esc(el.dataset.cap)}</figcaption><button type="button" class="icon-btn" data-act="close" aria-label="Close photo">${ICON.x}</button></figure>`);
    },
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && ACT[el.dataset.act]) {
      if (el.tagName === 'BUTTON' || el.classList.contains('shade')) e.preventDefault();
      ACT[el.dataset.act](el);
    }
    if (e.target.closest('.nav-links a')) $('#nav-links').classList.remove('is-open');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && layer().innerHTML) closeLayer(); });
  document.addEventListener('error', (e) => {
    if (e.target.tagName !== 'IMG') return;
    const box = e.target.closest('.pic');
    if (box) { box.classList.add('pic--empty'); e.target.remove(); } else if (e.target.classList.contains('logo-img')) e.target.remove();
  }, true);
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const n = $('.nav');
    if (n) n.classList.toggle('is-stuck', y > 30);
    const media = $('.hero-media img');
    if (media && y < 900 && document.documentElement.classList.contains('anim')) media.style.transform = `translate3d(0, ${y * 0.12}px, 0) scale(1.06)`;
  }, { passive: true });

  /* ---------- start ---------- */
  async function start() {
    if (ADMIN) {
      document.documentElement.classList.add('is-admin');
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/css/admin.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = '/js/admin.js';
      document.body.appendChild(js);
      return;
    }
    try { S.cart = JSON.parse(localStorage.getItem('pm_cart') || '[]').filter((l) => l && l.itemId && l.qty > 0); } catch (e) { S.cart = []; }
    try {
      const [c, r] = await Promise.all([fetch('/api/content').then((x) => x.json()), fetch('/api/reviews').then((x) => x.json()).catch(() => [])]);
      S.c = c;
      S.reviews = Array.isArray(r) ? r : [];
      render();
      if (location.hash && location.hash.length > 1 && !PREVIEW) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    } catch (err) {
      $('#app').innerHTML = '<p class="boot">The website could not load. Please refresh the page.</p>';
    }
    if (PREVIEW && window.parent !== window) {
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || !e.data) return;
        if (e.data.pm === 'content') { S.c = e.data.content; render(); }
        if (e.data.pm === 'scroll') { const t = document.getElementById(e.data.id); if (t) t.scrollIntoView({ behavior: 'smooth' }); }
      });
      window.parent.postMessage({ pm: 'ready' }, location.origin);
    }
  }
  window.addEventListener('hashchange', () => { if ((location.hash === '#admin') !== ADMIN && !PREVIEW) location.reload(); });
  start();
})();
