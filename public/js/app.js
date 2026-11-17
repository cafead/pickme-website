/* Pick Me Cafe: customer website. Everything on the page is drawn from /api/content. */
(function () {
  'use strict';

  const PREVIEW = /[?&]preview=1/.test(location.search);
  const ADMIN = (location.hash === '#admin' || /^\/admin\/?$/.test(location.pathname)) && !PREVIEW;
  // Guests who scan the QR on their table arrive with ?table=5 and order without paying first.
  const TABLE = (() => {
    const t = (new URLSearchParams(location.search).get('table') || '').replace(/[^\w -]/g, '').slice(0, 20);
    try { if (t) sessionStorage.setItem('pm_table', t); return t || sessionStorage.getItem('pm_table') || ''; } catch (e) { return t; }
  })();
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = (u) => (/^(https?:\/\/|\/(?!\/)|#)/i.test(u || '') ? u : '');
  const rs = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN');
  const digits = (s) => String(s || '').replace(/\D/g, '');
  // In the admin preview, text carries its content path so it can be edited in place.
  const ed = (p) => (PREVIEW ? ` data-edit="${p}"` : '');

  const FONTS = {
    display: { Marcellus: '', 'Cormorant Garamond': ':wght@500;600', 'Playfair Display': ':wght@500;600', Cinzel: ':wght@500;600', 'DM Serif Display': '', Italiana: '', Fraunces: ':wght@400;500' },
    script: { Allura: '', 'Great Vibes': '', 'Pinyon Script': '', Parisienne: '', Sacramento: '', 'Dancing Script': '' },
    body: { Jost: ':wght@300;400;500;600', Lora: ':wght@400;500;600', Mulish: ':wght@400;500;600', 'DM Sans': ':wght@400;500;600', 'Nunito Sans': ':wght@400;500;600', Karla: ':wght@400;500;600', 'Plus Jakarta Sans': ':wght@400;500;600' },
  };

  const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    pin: svg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    phone: svg('<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    bag: svg('<path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    left: svg('<path d="M15 6l-6 6 6 6"/>'),
    right: svg('<path d="M9 6l6 6-6 6"/>'),
    pause: svg('<path d="M9 6v12M15 6v12"/>'),
    play: svg('<path d="M8 6l10 6-10 6z"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    heart: svg('<path d="M12 20s-7-4.400-7-9.500A4 4 0 0 1 12 8a4 4 0 0 1 7 2.500c0 5.100-7 9.500-7 9.500z"/>'),
    star: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3l2.700 5.700 6.300.8-4.600 4.300 1.200 6.200L12 17l-5.600 3 1.200-6.200L3 9.500l6.300-.8z"/></svg>',
    instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".7" fill="currentColor"/>'),
    facebook: svg('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'),
    tiktok: svg('<path d="M14 3v11.500a3.500 3.500 0 1 1-3.500-3.500"/><path d="M14 3c.3 2.600 2 4.400 4.500 4.600"/>'),
    youtube: svg('<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>'),
    whatsapp: svg('<path d="M3.500 20.500l1.200-4.300A8.500 8.500 0 1 1 8 19.400z"/><path d="M9 8.500c-.3 1 .5 2.900 2 4.400s3.400 2.300 4.400 2l.9-1.200-2-1.200-.8.700c-.8-.3-2-1.500-2.300-2.300l.700-.8-1.200-2z"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>'),
  };
  ICON.maps = ICON.pin;

  const S = { c: null, reviews: [], tab: null, cart: [], slide: 0, preset: null, inline: false, layout: false };

  // Parts of the page whose size can be changed by dragging their edge in admin ("Edit layout").
  const SIZES = {
    logo: { sel: '.nav .logo-img', axes: 'x', label: 'Logo' },
    heroPhoto: { sel: '.hero-media', axes: 'xy', label: 'Top photo' },
    heroCard: { sel: '.hero-card', axes: 'x', label: 'Floating card' },
    arch: { sel: '.arch-pic', axes: 'xy', label: 'Speciality photos' },
    slides: { sel: '.slide-pic', axes: 'y', label: 'Slideshow' },
    menuPhoto: { sel: '.mi-pic', axes: 'x', label: 'Menu list photos' },
    menuCard: { sel: '.mc', axes: 'x', label: 'Menu cards' },
    menuCardPhoto: { sel: '.mc-pic', axes: 'y', label: 'Menu card photos' },
    cakePhoto: { sel: '#cake .fade-pic', axes: 'xy', label: 'Cake section photo' },
    bookingPhoto: { sel: '#booking .fade-pic', axes: 'xy', label: 'Booking section photo' },
    storyPhoto: { sel: '.story-pic', axes: 'xy', label: 'Our story photo' },
    gallery: { sel: '.gal-item', axes: 'xy', label: 'Gallery photos' },
    reviewCard: { sel: '.rev', axes: 'x', label: 'Review cards' },
    map: { sel: '.map', axes: 'y', label: 'Map' },
  };

  /* Make big phone photos small before upload. PNGs are kept as they are when keepPng is set (logos). */
  function shrink(file, max, keepPng) {
    return new Promise((resolve) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || (keepPng && file.type !== 'image/jpeg')) return resolve(file);
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, max / Math.max(im.width, im.height));
        if (scale === 1 && file.size < 1.2e6) return resolve(file);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * scale));
        cv.height = Math.max(1, Math.round(im.height * scale));
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(im, 0, 0, cv.width, cv.height);
        cv.toBlob((b) => resolve(b || file), 'image/jpeg', 0.85);
      };
      im.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      im.src = url;
    });
  }
  window.PM = { FONTS, ICON, esc, rs, shrink, SIZES };

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
    const within = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
    set('--bg', color(t.bg, '#FBF6EE'));
    set('--surface', color(t.surface, '#FFFDF9'));
    set('--ink', color(t.ink, '#3B2A1A'));
    set('--muted', color(t.muted, '#6F5B48'));
    set('--accent', color(t.accent, '#8C6A2E'));
    set('--gold', color(t.gold, '#C4A265'));
    set('--btn', color(t.button, color(t.accent, '#8C6A2E')));
    set('--radius', within(t.radius, 0, 40, 18) + 'px');
    set('--h-scale', within(t.headingScale, 0.7, 1.5, 1));
    set('--body', within(t.bodySize, 13, 22, 16) + 'px');
    set('--wrap', within(t.width, 900, 1600, 1180) + 'px');
    set('--hero-h', within(t.heroHeight, 420, 1100, 760) + 'px');
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
    document.documentElement.classList.toggle('no-blend', t.blend === false);
  }
  function applySizes(sizes) {
    const st = document.documentElement.style;
    for (const key of Object.keys(SIZES)) {
      const v = (sizes || {})[key] || {};
      for (const ax of ['w', 'h']) {
        const n = Number(v[ax]);
        if (n >= 16 && n <= 3000) st.setProperty(`--sz-${key}-${ax}`, Math.round(n) + 'px');
        else st.removeProperty(`--sz-${key}-${ax}`);
      }
    }
  }

  /* ---------- small builders ---------- */
  const clampN = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  // Photo position and zoom set in admin. Kept per photo address.
  function cropAttrs(url) {
    const k = S.c && S.c.crops && S.c.crops[url];
    if (!k) return '';
    return ` style="--ox:${clampN(k.x, 0, 100, 50)}%;--oy:${clampN(k.y, 0, 100, 50)}%;--z:${clampN(k.z, 1, 4, 1)}"${k.fit === 'contain' ? ' data-fit="contain"' : ''}`;
  }
  const pic = (url, alt, cls) => {
    const u = safeUrl(url);
    return `<div class="pic ${cls || ''}" data-alt="${esc(alt)}">${u ? `<img src="${esc(u)}" alt="${esc(alt)}" loading="lazy"${cropAttrs(u)}>` : ''}</div>`;
  };
  const head = (o, path, extra) => `<header class="head rv">${o.script || PREVIEW ? `<p class="script"${ed(path + '.script')}>${esc(o.script)}</p>` : ''}${o.title || PREVIEW ? `<h2${ed(path + '.title')}>${esc(o.title)}</h2>` : ''}${extra || ''}</header>`;
  const btn = (label, href, cls, path) => `<a class="btn ${cls || ''}" href="${esc(safeUrl(href) || '#')}"><span${path ? ed(path) : ''}>${esc(label)}</span>${ICON.arrow}</a>`;
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
  // The earliest time we can take something, at least `leadHours` from now and inside opening hours.
  function nextSlot(c, leadHours) {
    const [oh, om] = c.brand.open.split(':').map(Number);
    const [ch, cm] = c.brand.close.split(':').map(Number);
    let t = new Date(Date.now() + 345 * 60e3 + (Number(leadHours) || 0) * 3600e3);
    t = new Date(Math.ceil(t.getTime() / 18e5) * 18e5);
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    if (mins < oh * 60 + om) t.setUTCHours(oh, om, 0, 0);
    else if (mins > ch * 60 + cm) { t.setUTCDate(t.getUTCDate() + 1); t.setUTCHours(oh, om, 0, 0); }
    const iso = t.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }
  const waNumber = (c) => digits(c.brand.whatsapp).replace(/^(?=9\d{9}$)/, '977');
  const waLink = (c, text) => `https://wa.me/${waNumber(c)}?text=${encodeURIComponent(text)}`;
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
    const k = h.card || {};
    return `<section id="hero" class="hero hero--${esc(h.layout || 'right')}">
      ${pic(h.image, 'Inside ' + c.brand.name, 'hero-media')}
      <div class="hero-text">
        ${h.script || PREVIEW ? `<p class="script hero-in"${ed('hero.script')}>${esc(h.script)}</p>` : ''}
        <h1 class="hero-in"${ed('hero.title')}>${esc(h.title)}</h1>
        ${h.line || PREVIEW ? `<p class="hero-line hero-in"${ed('hero.line')}>${esc(h.line)}</p>` : ''}
        ${h.tagline || PREVIEW ? `<p class="ital hero-in"${ed('hero.tagline')}>${esc(h.tagline)}</p>` : ''}
        <div class="pill hero-in">
          <span>${ICON.clock}<span><small class="${open ? 'dot dot--on' : 'dot'}">${open ? 'Open now' : 'Closed now'}</small><span${ed('brand.hoursText')}>${esc(c.brand.hoursText)}</span></span></span>
          <a href="${esc(safeUrl(c.visit.mapLink) || '#visit')}"${safeUrl(c.visit.mapLink) ? ' target="_blank" rel="noopener"' : ''}>${ICON.pin}<span><small>Find us</small>${esc(c.brand.address.split(',').slice(0, 2).join(','))}</span></a>
          <a href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener">${ICON.whatsapp}<span><small>Call or WhatsApp</small>${esc(c.brand.phone)}</span></a>
        </div>
        <div class="row hero-in">
          ${h.button && visible(c, 'menu') ? btn(h.button, '#menu', '', 'hero.button') : ''}
          ${h.button2 && visible(c, 'booking') ? btn(h.button2, '#booking', 'btn--ghost', 'hero.button2') : ''}
          ${h.button3 && visible(c, 'cake') ? btn(h.button3, '#cake', 'btn--ghost', 'hero.button3') : ''}
        </div>
      </div>
      ${k.show !== false && k.title && visible(c, 'cake') ? `<a class="hero-card" href="#cake">${pic(k.image, k.title, 'hero-card-pic')}<span><small${ed('hero.card.label')}>${esc(k.label)}</small><strong${ed('hero.card.title')}>${esc(k.title)}</strong><em${ed('hero.card.text')}>${esc(k.text)}</em></span></a>` : ''}
    </section>
    ${words.length ? `<div class="marquee" aria-hidden="true"><div>${strip}${strip}</div></div>` : ''}`;
  };

  function fromPrice(c, catId) {
    const cat = (c.menu.categories || []).find((x) => x.id === catId);
    const all = cat ? (cat.items || []).filter((i) => i.available !== false).flatMap((i) => (i.prices || []).map((p) => Number(p.price))).filter((n) => n > 0) : [];
    return all.length ? `From ${rs(Math.min(...all))}` : '';
  }
  R.highlights = (c) => {
    const h = c.highlights;
    return `<section id="highlights" class="sec"><div class="wrap">
      ${head(h, 'highlights')}
      <div class="trio">${(h.cards || []).map((k, i) => `
        <a class="arch rv" style="--d:${i * 90}ms" href="#menu" data-act="cat" data-id="${esc(k.category)}">
          ${pic(k.image, k.title, 'arch-pic')}
          <h3${ed(`highlights.cards.${i}.title`)}>${esc(k.title)}</h3>
          <p${ed(`highlights.cards.${i}.text`)}>${esc(k.text)}</p>
          ${fromPrice(c, k.category) ? `<span class="from">${fromPrice(c, k.category)}</span>` : ''}
        </a>`).join('')}
      </div></div></section>`;
  };

  function activeEvents(c) {
    const today = BS.todayAD();
    return (c.events.items || []).map((e, i) => {
      if (e.enabled === false || !/^\d{4}-\d{2}-\d{2}$/.test(e.start || '')) return null;
      const end = Date.parse(e.start) + (Number(e.days) || 1) * 864e5;
      const now = Date.parse(today);
      return now >= Date.parse(e.start) && now < end ? { e, i, left: Math.round((end - now) / 864e5) } : null;
    }).filter(Boolean);
  }
  R.events = (c) => {
    const list = activeEvents(c);
    if (!list.length) return '';
    if (S.slide >= list.length) S.slide = 0;
    const many = list.length > 1;
    return `<section id="events" class="sec"><div class="wrap">
      ${head(c.events, 'events')}
      <div class="slides rv" data-n="${list.length}" style="--secs:${Math.max(2, Number(c.events.seconds) || 5)}s">
        ${list.map(({ e, i, left }, n) => `<article class="slide${n === S.slide ? ' is-on' : ''}" aria-hidden="${n !== S.slide}">
          ${pic(e.image, e.title, 'slide-pic')}
          <div class="slide-text">
            <p class="slide-tags">${e.tag ? `<span class="tag"${ed(`events.items.${i}.tag`)}>${esc(e.tag)}</span>` : ''}<span class="tag tag--soft">${left} day${left === 1 ? '' : 's'} left</span></p>
            <h3${ed(`events.items.${i}.title`)}>${esc(e.title)}</h3>
            <p${ed(`events.items.${i}.text`)}>${esc(e.text)}</p>
            ${e.button ? btn(e.button, e.link || '#menu', '', `events.items.${i}.button`) : ''}
          </div></article>`).join('')}
        ${many ? `<div class="slide-bar"><i></i></div>
          <div class="slide-ctl">
            <div class="dots">${list.map(({ e }, n) => `<button type="button" data-act="slide" data-i="${n}" class="${n === S.slide ? 'is-on' : ''}" aria-label="Show ${esc(e.title)}"></button>`).join('')}</div>
            <div class="row"><button type="button" class="icon-btn" data-act="slide-step" data-d="-1" aria-label="Previous slide">${ICON.left}</button>
              <button type="button" class="icon-btn" data-act="slide-pause" aria-label="Pause or play the slideshow">${ICON.pause}</button>
              <button type="button" class="icon-btn" data-act="slide-step" data-d="1" aria-label="Next slide">${ICON.right}</button></div>
          </div>` : ''}
      </div></div></section>`;
  };

  function menuBody(c) {
    const cats = c.menu.categories || [];
    const ci = Math.max(0, cats.findIndex((x) => x.id === S.tab));
    const cat = cats[ci];
    if (!cat) return '<p class="muted">The menu is being updated.</p>';
    S.tab = cat.id;
    const cards = c.menu.layout === 'cards';
    const tabs = cats.map((x) => `<button type="button" role="tab" aria-selected="${x.id === cat.id}" class="tab${x.id === cat.id ? ' is-on' : ''}" data-act="tab" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('');
    const items = (cat.items || []).map((it, ii) => {
      const off = it.available === false;
      const base = `menu.categories.${ci}.items.${ii}`;
      const prices = off ? '<span class="mi-off">Not available today</span>' : (it.prices || []).filter((p) => Number(p.price) > 0).map((p) => `
        <button type="button" class="pchip" data-act="${p.whole ? 'cake' : 'add'}" data-item="${esc(it.id)}" data-label="${esc(p.label || '')}"
          aria-label="${p.whole ? 'Pre-order' : 'Add'} ${esc(it.name)} ${esc(p.label || '')}, ${rs(p.price)}">
          ${p.label ? `<span>${esc(p.label)}</span>` : ''}<b>${rs(p.price)}</b><i aria-hidden="true">${p.whole ? 'Pre-order' : '+'}</i>
        </button>`).join('');
      const badge = it.badge ? `<span class="badge"${ed(base + '.badge')}>${esc(it.badge)}</span>` : '';
      const text = `<h4><span${ed(base + '.name')}>${esc(it.name)}</span>${cards ? '' : badge}</h4>${it.desc || PREVIEW ? `<p${ed(base + '.desc')}>${esc(it.desc)}</p>` : ''}`;
      return cards
        ? `<article class="mc${off ? ' mi--off' : ''}"><div class="mc-top">${pic(it.image, it.name, 'mc-pic')}${badge}</div><div class="mc-body">${text}<div class="mi-prices">${prices}</div></div></article>`
        : `<article class="mi${off ? ' mi--off' : ''}">${safeUrl(it.image) ? pic(it.image, it.name, 'mi-pic') : ''}<div class="mi-body">${text}</div><div class="mi-prices">${prices}</div></article>`;
    }).join('');
    return `<div class="tabs" role="tablist" aria-label="Menu groups">${tabs}</div>
      ${cat.note ? `<p class="menu-note"${ed(`menu.categories.${ci}.note`)}>${esc(cat.note)}</p>` : ''}
      <div class="${cards ? 'menu-cards' : 'menu-list'}" role="tabpanel">${items}</div>`;
  }
  R.menu = (c) => `<section id="menu" class="sec sec--tint"><div class="wrap">
      ${head(c.menu, 'menu', c.menu.note ? `<p class="lede"${ed('menu.note')}>${esc(c.menu.note)}</p>` : '')}
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
  function cakeTotal() {
    const sel = $('#cake-select');
    const out = $('#cake-total');
    if (!sel || !out || !sel.value) return;
    const [id, label] = sel.value.split('|');
    const f = findPrice(id, label);
    const qty = Math.max(1, Math.min(20, Number($('#cake-qty').value) || 1));
    out.textContent = f ? rs(Number(f.price.price) * qty) : '';
  }
  R.cake = (c) => {
    const k = c.cake;
    const slot = nextSlot(c, k.noticeHours);
    return `<section id="cake" class="sec"><div class="wrap split">
      <div class="split-pic rv">${pic(k.image, 'Celebration cake', 'fade-pic')}</div>
      <div class="split-body rv">
        ${head(k, 'cake')}
        <p class="lede"${ed('cake.text')}>${esc(k.text)}</p>
        <form class="form" data-form="cake" novalidate>
          <label class="f f--wide"><span>Cake</span><select name="cake" id="cake-select" required>
            ${wholeCakes(c).map((w) => `<option value="${esc(w.id)}|${esc(w.label)}">${esc(w.name)}, ${esc(w.label)}: ${rs(w.price)}</option>`).join('')}
          </select></label>
          <label class="f"><span>How many</span><input name="qty" id="cake-qty" type="number" min="1" max="20" value="1" inputmode="numeric" required></label>
          <label class="f"><span>Occasion (optional)</span><input name="occasion" id="cake-occasion" maxlength="80" placeholder="Birthday, anniversary"></label>
          <label class="f f--wide"><span>Name or message on the cake (optional)</span><input name="cakeMessage" id="cake-msg" maxlength="120" placeholder="Happy Birthday Aarav"></label>
          <div class="f"><span>Date</span><div data-bsp="date" data-value="${slot.date}"></div></div>
          <label class="f"><span>Time</span><select name="time" id="cake-time" required>${timeOptions(c, slot.time)}</select></label>
          <p class="hint f--wide">We need at least ${esc(k.noticeHours)} hours to prepare a whole cake. You can add a photo of the design you want at the next step.</p>
          <p class="sum sum--big f--wide"><span>Total</span><b id="cake-total"></b></p>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span${ed('cake.button')}>${esc(k.button || 'Continue to payment')}</span>${ICON.arrow}</button>
        </form>
      </div></div></section>`;
  };

  R.booking = (c) => {
    const b = c.booking;
    const seats = String(b.seating || '').split(',').map((x) => x.trim()).filter(Boolean);
    const slot = nextSlot(c, 1);
    return `<section id="booking" class="sec sec--tint"><div class="wrap split split--flip">
      <div class="split-pic rv">${pic(b.image, 'A table at ' + c.brand.name, 'fade-pic')}</div>
      <div class="split-body rv">
        ${head(b, 'booking')}
        <p class="lede"${ed('booking.text')}>${esc(b.text)}</p>
        <form class="form" data-form="booking" novalidate>
          <label class="f"><span>Phone</span><input name="phone" id="bk-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="98XXXXXXXX" required></label>
          <label class="f"><span>Your name (optional)</span><input name="name" id="bk-name" autocomplete="name" maxlength="80"></label>
          <div class="f"><span>Date</span><div data-bsp="date" data-value="${slot.date}"></div></div>
          <label class="f"><span>Time</span><select name="time" id="bk-time" required>${timeOptions(c, slot.time)}</select></label>
          <label class="f"><span>Number of people</span><input name="people" id="bk-people" type="number" min="1" max="${esc(b.maxPeople)}" value="2" inputmode="numeric" required></label>
          ${seats.length ? `<label class="f"><span>Where would you like to sit?</span><select name="seating" id="bk-seat">${seats.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>` : ''}
          <label class="f f--wide"><span>Food or drinks to have ready (optional)</span><input name="food" id="bk-food" maxlength="600" placeholder="2 Iced Latte, 1 Blueberry Cheese Cake"></label>
          <label class="f"><span>Name on the cake (optional)</span><input name="cakeName" id="bk-cake" maxlength="120" placeholder="Happy Anniversary"></label>
          <label class="f"><span>Decoration you want (optional)</span><input name="decoration" id="bk-deco" maxlength="600" placeholder="Candles, balloons"></label>
          <label class="f f--wide"><span>Other remarks (optional)</span><textarea name="remarks" id="bk-rem" rows="2" maxlength="600"></textarea></label>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span${ed('booking.button')}>${esc(b.button || 'Request booking')}</span>${ICON.arrow}</button>
        </form>
      </div></div></section>`;
  };

  R.story = (c) => {
    const s = c.story;
    return `<section id="story" class="story">
      ${pic(s.image, 'Inside ' + c.brand.name, 'story-pic')}
      <div class="story-body rv">
        ${s.script || PREVIEW ? `<p class="script"${ed('story.script')}>${esc(s.script)}</p>` : ''}
        <h2${ed('story.title')}>${esc(s.title)}</h2>
        <p${ed('story.text')}>${esc(s.text)}</p>
        ${s.side ? `<p class="script story-side"><span${ed('story.side')}>${esc(s.side)}</span> ${ICON.heart}</p>` : ''}
      </div></section>`;
  };

  R.gallery = (c) => {
    const g = c.gallery;
    if (!(g.images || []).length) return '';
    return `<section id="gallery" class="sec"><div class="wrap">
      ${head(g, 'gallery')}
      <div class="gal">${g.images.map((im, i) => `
        <button type="button" class="gal-item rv" style="--d:${i * 70}ms" data-act="zoom" data-src="${esc(safeUrl(im.image))}" data-cap="${esc(im.caption)}" aria-label="Open photo: ${esc(im.caption || 'gallery photo')}">
          ${pic(im.image, im.caption || 'Gallery photo')}
          ${im.caption || im.tag ? `<span>${im.tag ? `<small>${esc(im.tag)}</small>` : ''}${esc(im.caption)}</span>` : ''}
        </button>`).join('')}
      </div></div></section>`;
  };

  const stars = (n) => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${ICON.star.repeat(n)}</span>`;
  const monthYear = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };
  function reviewList() {
    if (!S.reviews.length) return '<p class="muted center">Be the first to leave a review.</p>';
    return `<div class="revs">${S.reviews.map((r) => `<figure class="rev">
      <div class="rev-top">${stars(r.rating)}<small>${r.source === 'google' ? 'Google review' : 'Cafe guest'}</small></div>
      <blockquote>${esc(r.text)}</blockquote>
      ${r.favorite ? `<p class="rev-fav">Tried: ${esc(r.favorite)}</p>` : ''}
      <figcaption>${esc(r.name)}<small>${monthYear(r.createdAt)}</small></figcaption>
    </figure>`).join('')}</div>`;
  }
  R.reviews = (c) => {
    const r = c.reviews;
    const sum = r.rating ? `<span class="rev-sum"><strong>${esc(r.rating)}</strong>${stars(5)}${r.count ? `<small>${esc(r.count)} Google reviews</small>` : ''}</span>` : '';
    return `<section id="reviews" class="sec sec--tint"><div class="wrap">
      ${head(r, 'reviews', sum)}
      <div id="review-list" class="rv">${reviewList()}</div>
      <div class="row row--center rv">
        ${safeUrl(c.visit.mapLink) ? `<a class="btn btn--ghost" href="${esc(safeUrl(c.visit.mapLink))}" target="_blank" rel="noopener"><span>See us on Google Maps</span>${ICON.arrow}</a>` : ''}
      </div>
      <details class="review-box rv">
        <summary class="btn"><span${ed('reviews.formTitle')}>${esc(r.formTitle || 'Leave a review')}</span></summary>
        <form class="form" data-form="review" novalidate>
          <label class="f"><span>Your name (optional)</span><input name="name" id="rv-name" maxlength="60"></label>
          <fieldset class="f rate"><legend>Your rating</legend>
            ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="rv-s${n}" value="${n}"${n === 5 ? ' checked' : ''}><label for="rv-s${n}" aria-label="${n} stars">${ICON.star}</label>`).join('')}
          </fieldset>
          <label class="f f--wide"><span>What did you try? (optional)</span><input name="favorite" id="rv-fav" maxlength="100" placeholder="Blueberry Cheese Cake and Iced Latte"></label>
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
      ${head(v, 'visit')}
      <div class="visit">
        <div class="map rv">${embed ? `<iframe src="${esc(embed)}" title="Map showing ${esc(c.brand.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>` : '<div class="pic pic--empty" data-alt="Add a Google Maps embed link in admin"></div>'}</div>
        <div class="visit-info rv">
          <ul class="facts">
            <li>${ICON.pin}<span${ed('brand.address')}>${esc(c.brand.address)}</span></li>
            <li>${ICON.clock}<span${ed('brand.hoursText')}>${esc(c.brand.hoursText)}</span></li>
            <li>${ICON.phone}<a href="tel:${esc(digits(c.brand.phone))}">${esc(c.brand.phone)}</a></li>
          </ul>
          <div class="row">
            <a class="btn" href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener">${ICON.whatsapp}<span>Chat on WhatsApp</span></a>
            ${safeUrl(v.mapLink) ? `<a class="btn btn--ghost" href="${esc(safeUrl(v.mapLink))}" target="_blank" rel="noopener"><span>Open in Google Maps</span>${ICON.arrow}</a>` : ''}
          </div>
          <form class="form form--solo" data-form="message" novalidate>
            <h3${ed('visit.messageTitle')}>${esc(v.messageTitle)}</h3>
            <p class="hint"${ed('visit.messageText')}>${esc(v.messageText)}</p>
            <label class="f"><span>Your name (optional)</span><input name="name" id="msg-name" maxlength="80"></label>
            <label class="f"><span>Phone (optional)</span><input name="phone" id="msg-phone" type="tel" inputmode="tel" maxlength="20" placeholder="98XXXXXXXX"></label>
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
      <a class="brand" href="#hero" aria-label="${esc(c.brand.name)}, home">${logo(c)}<span${ed('brand.name')}>${esc(c.brand.name)}</span></a>
      <nav class="nav-links" id="nav-links" aria-label="Sections">${links}</nav>
      <div class="nav-right">
        <button type="button" class="cart-btn" data-act="cart" aria-label="Open cart">${ICON.bag}<span class="cart-count" hidden>0</span></button>
        <button type="button" class="nav-toggle" data-act="nav" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links">${ICON.menu}</button>
      </div></div>
      ${TABLE && !PREVIEW ? `<p class="table-bar">${ICON.bag}<span>Table ${esc(TABLE)}: add what you like from the menu, then tap the bag to send your order. Pay at the counter when you are done.</span></p>` : ''}</header>`;
  }
  function footer(c) {
    const soc = (c.social || []).filter((s) => /^https?:\/\//i.test(s.url || '')).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(s.type)}">${ICON[s.type] || ICON.link}</a>`).join('');
    return `<footer class="foot"><div class="wrap foot-in">
      <a class="brand brand--foot" href="#hero">${logo(c)}<span>${esc(c.brand.name)}</span></a>
      <p>${ICON.pin}<span>${esc(c.brand.address)}</span></p>
      <p>${ICON.clock}<span>${esc(c.brand.hoursText)}</span></p>
      <div class="soc">${soc}<a href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICON.whatsapp}</a></div>
      </div>
      <p class="foot-line">${ICON.heart}<span${ed('footer.line')}>${esc(c.footer.line)}</span></p>
      ${c.footer.note ? `<p class="foot-note"${ed('footer.note')}>${esc(c.footer.note)}</p>` : ''}
    </footer>
    <a class="wa-float" href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">${ICON.whatsapp}</a>`;
  }

  /* ---------- render ---------- */
  let observer = null;
  function setInline() {
    document.documentElement.classList.toggle('inline', S.inline);
    $$('[data-edit]').forEach((el) => { if (S.inline) el.setAttribute('contenteditable', 'plaintext-only'); else el.removeAttribute('contenteditable'); });
  }
  function render() {
    const c = S.c;
    applyTheme(c.theme);
    applySizes(c.sizes);
    document.documentElement.classList.toggle('at-table', Boolean(TABLE && !PREVIEW));
    const y = window.scrollY;
    $('#app').innerHTML = nav(c) + '<main>' + c.sections.filter((s) => s.show !== false && R[s.id]).map((s) => R[s.id](c)).join('') + '</main>' + footer(c);
    $$('[data-bsp]', $('#app')).forEach((el) => BS.mount(el, { name: el.dataset.bsp, value: el.dataset.value }));
    saveCart();
    cakeTotal();
    if (PREVIEW) { setInline(); markLayout(); }
    if (observer) observer.disconnect();
    if (document.documentElement.classList.contains('anim') && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); }
      }), { rootMargin: '0px 0px -8% 0px' });
      $$('.rv').forEach((el) => observer.observe(el));
    }
    if (PREVIEW) window.scrollTo(0, y);
  }
  function showSlide(i) {
    const slides = $$('.slide');
    if (!slides.length) return;
    S.slide = (i + slides.length) % slides.length;
    slides.forEach((s, n) => { s.classList.toggle('is-on', n === S.slide); s.setAttribute('aria-hidden', n !== S.slide); });
    $$('.dots button').forEach((d, n) => d.classList.toggle('is-on', n === S.slide));
    const bar = $('.slide-bar i');
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
  }
  document.addEventListener('animationend', (e) => { if (e.target.matches && e.target.matches('.slide-bar i')) showSlide(S.slide + 1); });

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
            <button type="button" class="btn" data-act="checkout"><span>Continue to order</span>${ICON.arrow}</button>
            <button type="button" class="btn btn--ghost" data-act="close"><span>Keep browsing</span></button></footer>`
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
    const type = TABLE ? 'dinein' : (pre.type || 'pickup');
    const later = hasWhole || pre.when === 'later' || !isOpen(c);
    const slot = pre.date ? { date: pre.date, time: pre.time } : nextSlot(c, hasWhole ? c.cake.noticeHours : 0.5);
    const methods = ['esewa', 'fonepay'].filter((m) => c.payment[m] && c.payment[m].enabled !== false);
    const phoneNeeded = type !== 'dinein';
    return `<div class="shade" data-act="close"></div>
      <div class="modal" role="dialog" aria-label="Your order">
        <header><h2>Your order</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICON.x}</button></header>
        <form class="form" data-form="checkout" novalidate>
          <div class="f--wide" id="co-sum">${sumHtml(type)}</div>
          <fieldset class="f f--wide seg"><legend>How would you like it?</legend>
            <input type="radio" name="type" id="co-dinein" value="dinein"${type === 'dinein' ? ' checked' : ''}><label for="co-dinein">At the cafe</label>
            <input type="radio" name="type" id="co-pickup" value="pickup"${type === 'pickup' ? ' checked' : ''}><label for="co-pickup">Pickup</label>
            <input type="radio" name="type" id="co-delivery" value="delivery"${type === 'delivery' ? ' checked' : ''}><label for="co-delivery">Delivery +${rs(c.payment.deliveryFee)}</label>
          </fieldset>
          <label class="f" id="co-table"${type === 'dinein' ? '' : ' hidden'}><span>Table number (optional)</span><input name="tableNo" id="co-tableno" maxlength="20" value="${esc(TABLE)}" inputmode="numeric"></label>
          <label class="f"><span id="co-phone-label">${phoneNeeded ? 'Phone' : 'Phone (optional)'}</span><input name="phone" id="co-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="98XXXXXXXX"${phoneNeeded ? ' required' : ''}></label>
          <label class="f"><span>Your name (optional)</span><input name="name" id="co-name" autocomplete="name" maxlength="80"></label>
          <label class="f f--wide" id="co-addr"${type === 'delivery' ? '' : ' hidden'}><span>Delivery address (optional, we will call if it is missing)</span><textarea name="address" id="co-address" rows="2" maxlength="300" placeholder="Tole, landmark, ward"></textarea><small class="hint">${esc(c.payment.deliveryNote)}</small></label>
          <fieldset class="f f--wide seg"><legend>When?</legend>
            ${hasWhole ? '' : `<input type="radio" name="when" id="co-now" value="now"${later ? '' : ' checked'}><label for="co-now">Now</label>`}
            <input type="radio" name="when" id="co-later" value="later"${later ? ' checked' : ''}><label for="co-later">Later</label>
          </fieldset>
          <div class="f--wide grid2" id="co-when"${later ? '' : ' hidden'}>
            <div class="f"><span>Date</span><div data-bsp="date" data-value="${slot.date}"></div></div>
            <label class="f"><span>Time</span><select name="time" id="co-time">${timeOptions(c, slot.time)}</select></label>
            ${hasWhole ? `<p class="hint f--wide">Whole cakes need at least ${esc(c.cake.noticeHours)} hours notice.</p>` : (!isOpen(c) ? `<p class="hint f--wide">We are closed right now, so please pick a time (${esc(c.brand.hoursText)}).</p>` : '')}
          </div>
          ${hasWhole ? `<label class="f"><span>Name or message on the cake (optional)</span><input name="cakeMessage" id="co-cake" maxlength="120" value="${esc(pre.cakeMessage || '')}"></label>
            <label class="f"><span>Occasion (optional)</span><input name="occasion" id="co-occasion" maxlength="80" value="${esc(pre.occasion || '')}"></label>
            <label class="f f--wide"><span>Photo of the cake design you want (optional)</span><input type="file" name="ref" id="co-ref" accept="image/png,image/jpeg,image/webp"></label>` : ''}
          <label class="f f--wide"><span>Notes for us (optional)</span><textarea name="notes" id="co-notes" rows="2" maxlength="500" placeholder="Less sugar, extra ice"></textarea></label>
          <fieldset class="f f--wide seg"><legend>Payment</legend>
            <input type="radio" name="method" id="co-later-pay" value="later" checked><label for="co-later-pay">Pay later</label>
            ${methods.map((m) => `<input type="radio" name="method" id="co-${m}" value="${m}"><label for="co-${m}">Pay now with ${esc(c.payment[m].name)}</label>`).join('')}
          </fieldset>
          <p class="hint f--wide" id="co-later-note">Pay at the counter, or when your order arrives.</p>
          <div class="f--wide pay" id="co-pay" hidden>
            <div id="co-qr"></div>
            <div><p>${esc(c.payment.instructions)}</p>
              <label class="f"><span>Payment screenshot (optional)</span><input type="file" name="proof" id="co-proof" accept="image/png,image/jpeg,image/webp"></label>
              <label class="f"><span>Or the transaction code (optional)</span><input name="txn" id="co-txn" maxlength="60" placeholder="e.g. 000ABC9"></label></div>
          </div>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span>Send order</span>${ICON.arrow}</button>
        </form>
      </div>`;
  }
  function openCheckout() {
    if (!cartLines().length) return toast('Your cart is empty.');
    openLayer(checkoutHtml());
    const pre = S.preset || {};
    $$('[data-bsp]', layer()).forEach((el) => BS.mount(el, { name: el.dataset.bsp, value: pre.date || el.dataset.value }));
  }
  function doneHtml(title, lines, text) {
    return `<div class="shade" data-act="close"></div>
      <div class="modal modal--done" role="dialog" aria-label="${esc(title)}">
        <p class="script">Thank you</p><h2>${esc(title)}</h2>
        ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        ${text ? `<a class="btn" href="${esc(waLink(S.c, text))}" target="_blank" rel="noopener">${ICON.whatsapp}<span>Also send it to us on WhatsApp</span></a>` : ''}
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
  async function sendPicture(file) {
    if (!file) return '';
    const small = await shrink(file, 1400);
    if (small.size > 8 * 1024 * 1024) throw new Error('That picture is too large. Please use one under 8 MB.');
    return (await post('/api/proof', small, small.type || 'image/jpeg')).file;
  }
  const FORMS = {
    cake(d) {
      if (!d.cake) throw new Error('Please choose a cake.');
      if (!d.date || !d.time) throw new Error('Please choose a date and time.');
      const [itemId, label] = d.cake.split('|');
      addToCart(itemId, label, Math.max(1, Math.min(20, Number(d.qty) || 1)), true);
      S.preset = { when: 'later', type: 'pickup', date: d.date, time: d.time, cakeMessage: d.cakeMessage, occasion: d.occasion };
      openCheckout();
    },
    async booking(d, form) {
      if (!d.date || !d.time) throw new Error('Please choose a date and time.');
      const res = await post('/api/bookings', { name: d.name, phone: d.phone, people: d.people, date: d.date, dateBs: d.dateBs, time: d.time, seating: d.seating, food: d.food, cakeName: d.cakeName, decoration: d.decoration, remarks: d.remarks });
      form.reset();
      render();
      openLayer(doneHtml('Booking request sent', [`Your booking number is ${res.id}.`, 'We will call or message you to confirm your table.'], res.text));
    },
    async review(d, form) {
      await post('/api/reviews', { name: d.name, rating: d.rating, favorite: d.favorite, text: d.text });
      form.reset();
      return S.c.reviews.thanks;
    },
    message(d, form) {
      if (!d.text) throw new Error('Please write your message.');
      // WhatsApp opens straight away so the browser does not block it; a copy is saved for the cafe too.
      const from = d.name ? `, this is ${d.name}${d.phone ? ` (${d.phone})` : ''}` : (d.phone ? ` (${d.phone})` : '');
      window.open(waLink(S.c, `Hello ${S.c.brand.name}${from}.\n${d.text}`), '_blank', 'noopener');
      post('/api/messages', { name: d.name, phone: d.phone, text: d.text }).catch(() => {});
      form.reset();
      return 'WhatsApp is opening with your message. Press send there.';
    },
    async checkout(d, form) {
      const payNow = d.method && d.method !== 'later';
      const file = payNow ? form.elements.proof.files[0] : null;
      if (d.type !== 'dinein' && !String(d.phone || '').trim()) throw new Error('Please enter your phone number so we can reach you.');
      if (d.when === 'later' && (!d.date || !d.time)) throw new Error('Please choose a date and time.');
      const proof = await sendPicture(file);
      const refPhoto = form.elements.ref ? await sendPicture(form.elements.ref.files[0]) : '';
      const res = await post('/api/orders', {
        name: d.name, phone: d.phone, type: d.type, address: d.address, tableNo: d.tableNo, when: d.when, date: d.date, dateBs: d.dateBs, time: d.time,
        cakeMessage: d.cakeMessage, occasion: d.occasion, refPhoto, notes: d.notes, method: d.method, proof, txn: payNow ? d.txn : '',
        lines: cartLines().map((l) => ({ itemId: l.itemId, label: l.label, qty: l.qty })),
      });
      S.cart = [];
      S.preset = null;
      saveCart();
      const atCafe = d.type === 'dinein';
      openLayer(doneHtml(atCafe ? 'Your order is in' : 'Order received', [
        `Your order number is ${res.id}. Total ${rs(res.total)}.`,
        atCafe ? 'We are preparing it and will bring it to you.' : (payNow ? 'We will check your payment and call you if anything is unclear.' : 'We will call you if anything is unclear. You can pay later.'),
      ], atCafe ? '' : res.text));
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
    const d = Object.fromEntries(Array.from(new FormData(form).entries()).filter(([, v]) => typeof v === 'string'));
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
    if (e.target.closest('form[data-form=cake]')) cakeTotal();
    const form = e.target.closest('form[data-form=checkout]');
    if (!form) return;
    if (e.target.name === 'type') {
      const t = e.target.value;
      $('#co-sum').innerHTML = sumHtml(t);
      $('#co-addr').hidden = t !== 'delivery';
      $('#co-table').hidden = t !== 'dinein';
      $('#co-phone').required = t !== 'dinein';
      $('#co-phone-label').textContent = t === 'dinein' ? 'Phone (optional)' : 'Phone';
    }
    if (e.target.name === 'when') $('#co-when').hidden = e.target.value !== 'later';
    if (e.target.name === 'method') {
      const now = e.target.value !== 'later';
      $('#co-pay').hidden = !now;
      $('#co-later-note').hidden = now;
      if (now) $('#co-qr').innerHTML = qrHtml(e.target.value);
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'cake-qty') cakeTotal();
    const el = S.inline && e.target.closest && e.target.closest('[data-edit]');
    if (el) window.parent.postMessage({ pm: 'edit', path: el.dataset.edit, value: el.textContent.replace(/\s*\n\s*/g, ' ').trim() }, location.origin);
  });

  /* ---------- clicks ---------- */
  const ACT = {
    tab(el) {
      S.tab = el.dataset.id;
      const box = $('#menu-body');
      const swap = () => { box.innerHTML = menuBody(S.c); if (PREVIEW) setInline(); };
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
      cakeTotal();
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
    slide(el) { showSlide(Number(el.dataset.i)); },
    'slide-step'(el) { showSlide(S.slide + Number(el.dataset.d)); },
    'slide-pause'(el) {
      const paused = $('.slides').classList.toggle('is-paused');
      el.innerHTML = paused ? ICON.play : ICON.pause;
    },
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
    if (S.inline && e.target.closest('[data-edit]')) { e.preventDefault(); return; }
    if (S.layout) { if (!e.target.closest('#crop-tools')) e.preventDefault(); return; }
    const el = e.target.closest('[data-act]');
    if (el && ACT[el.dataset.act]) {
      if (el.tagName === 'BUTTON' || el.classList.contains('shade')) e.preventDefault();
      ACT[el.dataset.act](el);
    }
    if (e.target.closest('.nav-links a')) $('#nav-links').classList.remove('is-open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layer().innerHTML) closeLayer();
    if (e.key === 'Enter' && S.inline && e.target.closest && e.target.closest('[data-edit]')) { e.preventDefault(); e.target.blur(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd' && !PREVIEW) { e.preventDefault(); location.hash = '#admin'; }
  });
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
    if (media && y < 900 && document.documentElement.classList.contains('anim')) media.style.transform = `translate3d(0, ${y * 0.12}px, 0) scale(calc(1.06 * var(--z, 1)))`;
  }, { passive: true });

  /* ---------- admin preview: drag edges to resize, drag photos to move them ---------- */
  const EDGE = 10;
  let drag = null;
  let tools = null;
  let toolsUrl = '';
  function markLayout() {
    document.documentElement.classList.toggle('layout-mode', S.layout);
    $$('[data-size]').forEach((el) => { delete el.dataset.size; });
    if (!S.layout) { hideTools(); return; }
    for (const [key, d] of Object.entries(SIZES)) $$(d.sel).forEach((el) => { el.dataset.size = key; el.dataset.axes = d.axes; });
  }
  function edgeOf(el, x, y) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ax = el.dataset.axes || '';
    const inY = y >= r.top - EDGE && y <= r.bottom + EDGE;
    const inX = x >= r.left - EDGE && x <= r.right + EDGE;
    const right = ax.includes('x') && inY && Math.abs(x - r.right) <= EDGE;
    const left = ax.includes('x') && !right && inY && Math.abs(x - r.left) <= EDGE;
    const bottom = ax.includes('y') && inX && Math.abs(y - r.bottom) <= EDGE;
    if (!right && !left && !bottom) return null;
    return { x: right ? 1 : left ? -1 : 0, y: bottom ? 1 : 0, r };
  }
  function findEdge(x, y) {
    let best = null;
    for (const el of $$('[data-size]')) {
      const e = edgeOf(el, x, y);
      if (e && (!best || e.r.width * e.r.height < best.e.r.width * best.e.r.height)) best = { el, e };
    }
    return best;
  }
  function sizeTip(text, x, y) {
    let tip = $('#size-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'size-tip'; document.body.appendChild(tip); }
    tip.textContent = text;
    tip.style.left = x + 14 + 'px';
    tip.style.top = y + 14 + 'px';
    tip.hidden = !text;
  }
  const cropOf = (url) => Object.assign({ x: 50, y: 50, z: 1, fit: 'cover' }, (S.c.crops || {})[url] || {});
  function paintCrop(url, k) {
    $$('img').filter((im) => im.getAttribute('src') === url).forEach((im) => {
      im.style.setProperty('--ox', k.x + '%');
      im.style.setProperty('--oy', k.y + '%');
      im.style.setProperty('--z', k.z);
      if (k.fit === 'contain') im.dataset.fit = 'contain'; else delete im.dataset.fit;
    });
  }
  function sendCrop(url, k) {
    S.c.crops = S.c.crops || {};
    S.c.crops[url] = k;
    window.parent.postMessage({ pm: 'crop', url, crop: k }, location.origin);
  }
  function hideTools() { if (tools) tools.hidden = true; toolsUrl = ''; }
  function showTools(box) {
    const img = $('img', box);
    if (!img) return hideTools();
    if (!tools) {
      tools = document.createElement('div');
      tools.id = 'crop-tools';
      tools.innerHTML = '<button type="button" data-crop="out" aria-label="Zoom out">−</button><button type="button" data-crop="in" aria-label="Zoom in">+</button><button type="button" data-crop="fit">Whole photo</button><button type="button" data-crop="reset">Reset</button>';
      tools.addEventListener('click', (e) => {
        const b = e.target.closest('[data-crop]');
        if (!b || !toolsUrl) return;
        e.preventDefault();
        e.stopPropagation();
        const k = cropOf(toolsUrl);
        if (b.dataset.crop === 'in') k.z = Math.min(4, Math.round((k.z + 0.1) * 10) / 10);
        if (b.dataset.crop === 'out') k.z = Math.max(1, Math.round((k.z - 0.1) * 10) / 10);
        if (b.dataset.crop === 'fit') k.fit = k.fit === 'contain' ? 'cover' : 'contain';
        if (b.dataset.crop === 'reset') Object.assign(k, { x: 50, y: 50, z: 1, fit: 'cover' });
        paintCrop(toolsUrl, k);
        sendCrop(toolsUrl, k);
        $('[data-crop=fit]', tools).textContent = k.fit === 'contain' ? 'Fill the frame' : 'Whole photo';
      });
      document.body.appendChild(tools);
    }
    toolsUrl = img.getAttribute('src');
    $('[data-crop=fit]', tools).textContent = cropOf(toolsUrl).fit === 'contain' ? 'Fill the frame' : 'Whole photo';
    const r = box.getBoundingClientRect();
    tools.style.left = Math.max(4, r.left + 6) + 'px';
    tools.style.top = Math.max(4, r.top + 6) + 'px';
    tools.hidden = false;
  }
  document.addEventListener('pointermove', (e) => {
    if (!S.layout) return;
    if (drag && drag.kind === 'size') {
      const w = Math.max(24, drag.w + (e.clientX - drag.sx) * drag.e.x);
      const h = Math.max(24, drag.h + (e.clientY - drag.sy) * drag.e.y);
      const st = document.documentElement.style;
      if (drag.e.x) st.setProperty(`--sz-${drag.key}-w`, Math.round(w) + 'px');
      if (drag.e.y) st.setProperty(`--sz-${drag.key}-h`, Math.round(h) + 'px');
      drag.out = { w: drag.e.x ? Math.round(w) : undefined, h: drag.e.y ? Math.round(h) : undefined };
      sizeTip(`${SIZES[drag.key].label}: ${drag.e.x ? Math.round(w) + ' wide' : ''}${drag.e.x && drag.e.y ? ', ' : ''}${drag.e.y ? Math.round(h) + ' tall' : ''}`, e.clientX, e.clientY);
      return;
    }
    if (drag && drag.kind === 'pan') {
      const k = drag.k;
      k.x = Math.round(Math.min(100, Math.max(0, drag.x0 - ((e.clientX - drag.sx) / drag.w) * 100 / k.z)));
      k.y = Math.round(Math.min(100, Math.max(0, drag.y0 - ((e.clientY - drag.sy) / drag.h) * 100 / k.z)));
      paintCrop(drag.url, k);
      return;
    }
    const hit = findEdge(e.clientX, e.clientY);
    $$('.sz-hover').forEach((el) => { if (!hit || el !== hit.el) el.classList.remove('sz-hover'); });
    if (hit) {
      hit.el.classList.add('sz-hover');
      document.documentElement.style.cursor = hit.e.x && hit.e.y ? 'nwse-resize' : hit.e.x ? 'ew-resize' : 'ns-resize';
      sizeTip(`Drag to resize: ${SIZES[hit.el.dataset.size].label}`, e.clientX, e.clientY);
      return;
    }
    sizeTip('', 0, 0);
    const box = e.target.closest && e.target.closest('.pic');
    document.documentElement.style.cursor = box && $('img', box) ? 'grab' : '';
    if (box && $('img', box)) showTools(box);
    else if (!(e.target.closest && e.target.closest('#crop-tools'))) hideTools();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!S.layout || e.button !== 0 || e.target.closest('#crop-tools')) return;
    const hit = findEdge(e.clientX, e.clientY);
    if (hit) {
      e.preventDefault();
      drag = { kind: 'size', key: hit.el.dataset.size, e: hit.e, sx: e.clientX, sy: e.clientY, w: hit.e.r.width, h: hit.e.r.height };
      return;
    }
    const box = e.target.closest('.pic');
    const img = box && $('img', box);
    if (img) {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      const url = img.getAttribute('src');
      const k = cropOf(url);
      drag = { kind: 'pan', url, k, sx: e.clientX, sy: e.clientY, w: r.width, h: r.height, x0: k.x, y0: k.y };
      document.documentElement.style.cursor = 'grabbing';
    }
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    sizeTip('', 0, 0);
    document.documentElement.style.cursor = '';
    if (d.kind === 'size' && d.out) window.parent.postMessage({ pm: 'size', key: d.key, size: d.out }, location.origin);
    if (d.kind === 'pan' && (d.k.x !== d.x0 || d.k.y !== d.y0)) sendCrop(d.url, d.k);
  });
  document.addEventListener('dragstart', (e) => { if (S.layout) e.preventDefault(); });

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
      else if (TABLE && !PREVIEW && $('#menu')) $('#menu').scrollIntoView();
    } catch (err) {
      $('#app').innerHTML = '<p class="boot">The website could not load. Please refresh the page.</p>';
    }
    if (PREVIEW && window.parent !== window) {
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || !e.data) return;
        if (e.data.pm === 'content') { S.c = e.data.content; render(); }
        if (e.data.pm === 'inline') { S.inline = Boolean(e.data.on); setInline(); }
        if (e.data.pm === 'layout') { S.layout = Boolean(e.data.on); markLayout(); }
        if (e.data.pm === 'scroll') { const t = document.getElementById(e.data.id); if (t) t.scrollIntoView({ behavior: 'smooth' }); }
      });
      window.parent.postMessage({ pm: 'ready' }, location.origin);
    }
  }
  window.addEventListener('hashchange', () => { if (!PREVIEW && !/^\/admin/.test(location.pathname) && (location.hash === '#admin') !== ADMIN) location.reload(); });
  start();
})();
