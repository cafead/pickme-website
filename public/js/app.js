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
  // Which page this is: the home page, or the menu, cake or gallery page.
  const PAGE = (() => { const m = location.pathname.match(/^\/(menu|cake|gallery)\/?$/); return m ? m[1] : 'home'; })();
  const PAGEABLE = { menu: '/menu', cake: '/cake', gallery: '/gallery', moments: '/gallery' };
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
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
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
    book: svg('<path d="M4 5.500A1.500 1.500 0 0 1 5.500 4H11v16H5.500A1.500 1.500 0 0 1 4 18.500z"/><path d="M20 5.500A1.500 1.500 0 0 0 18.500 4H13v16h5.500a1.500 1.500 0 0 0 1.500-1.500z"/>'),
    cake: svg('<path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 15c2 1.500 4 1.500 5.300 0 1.300 1.500 4.100 1.500 5.400 0 1.300 1.500 3.300 1.500 5.300 0"/><path d="M12 11V7.500"/><path d="M12 3.500c.8.8 1 1.800 0 2.500-1-.7-.8-1.700 0-2.500z"/>'),
    calendar: svg('<rect x="3.500" y="5" width="17" height="15" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>'),
    chat: svg('<path d="M4 18.500V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8z"/><path d="M8.500 9.500h7M8.500 12.500h4"/>'),
    search: svg('<circle cx="11" cy="11" r="6.500"/><path d="M20 20l-4.200-4.200"/>'),
    cartSmall: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.200l2.300 11h10.300l2-8H6.400"/><circle cx="9.500" cy="19" r="1.400"/><circle cx="16.500" cy="19" r="1.400"/></svg>',
    download: svg('<path d="M12 4v11M7.500 10.500L12 15l4.500-4.500"/><path d="M5 19h14"/>'),
    share: svg('<circle cx="18" cy="5.500" r="2.500"/><circle cx="6" cy="12" r="2.500"/><circle cx="18" cy="18.500" r="2.500"/><path d="M8.200 10.800l7.600-4.100M8.200 13.200l7.600 4.100"/>'),
    google: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.600 12.200c0-.7-.1-1.300-.2-2H12v3.800h5.400a4.600 4.600 0 0 1-2 3v2.500h3.200c1.900-1.700 3-4.300 3-7.300z"/><path fill="#34A853" d="M12 22c2.700 0 5-.9 6.600-2.400l-3.200-2.500c-.9.600-2 1-3.400 1-2.600 0-4.800-1.800-5.600-4.100H3.100v2.600A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.400 14c-.2-.6-.3-1.300-.3-2s.1-1.400.3-2V7.400H3.100a10 10 0 0 0 0 9.200z"/><path fill="#EA4335" d="M12 6c1.500 0 2.800.5 3.800 1.500l2.900-2.900A10 10 0 0 0 3.100 7.400L6.400 10C7.200 7.700 9.400 6 12 6z"/></svg>',
  };
  ICON.maps = ICON.pin;

  const S = { c: null, reviews: [], tab: null, cart: [], slide: 0, preset: null, inline: false, layout: false, q: '', filter: '', groups: {}, album: 0, lb: null };
  const WIDE = () => matchMedia('(min-width: 821px)').matches;
  // Small marks on menu items. Veg and non-veg use the usual green and brown squares.
  const MARKS = {
    veg: { label: 'Veg', icon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#2E7D4F" stroke-width="1.6"/><circle cx="8" cy="8" r="3.600" fill="#2E7D4F"/></svg>' },
    nonveg: { label: 'Non-veg', icon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#8E2A1E" stroke-width="1.600"/><path d="M8 4.200l3.900 7H4.100z" fill="#8E2A1E"/></svg>' },
    eggless: { label: 'Eggless' },
    sugarfree: { label: 'Sugar-free' },
    nuts: { label: 'Contains nuts' },
    spicy: { label: 'Spicy' },
  };

  // Parts of the page whose size can be changed by dragging their edge in admin ("Edit layout").
  const SIZES = {
    logo: { sel: '.nav .logo-img', axes: 'x', label: 'Logo' },
    heroPhoto: { sel: '.hero-media', axes: 'xy', label: 'Top photo' },
    heroCard: { sel: '.hero-card', axes: 'x', label: 'Floating card' },
    arch: { sel: '.arch-pic', axes: 'xy', label: 'Speciality photos' },
    slides: { sel: '#events .slide', axes: 'y', label: 'Event slideshow' },
    menuPhoto: { sel: '.mi-ring', axes: 'x', label: 'Menu photos (round)' },
    menuCard: { sel: '.mc', axes: 'x', label: 'Menu cards' },
    menuCardPhoto: { sel: '.mc-pic', axes: 'y', label: 'Menu card photos' },
    cakePhoto: { sel: '#cake .fade-pic', axes: 'xy', label: 'Cake section photo' },
    bookingPhoto: { sel: '#booking .fade-pic', axes: 'xy', label: 'Booking section photo' },
    storyPhoto: { sel: '.story-pic', axes: 'xy', label: 'Our story photo' },
    gallery: { sel: '#gallery .sl-item', axes: 'xy', label: 'Gallery photos' },
    reviewCard: { sel: '.rev', axes: 'x', label: 'Review cards' },
    map: { sel: '.map', axes: 'xy', label: 'Map' },
  };

  /* Make big phone photos small before upload: no wider than `max`, and re-saved when the file is heavy.
     WebP is used when the browser can make it (about a third smaller than JPG). PNGs are kept as they are when keepPng is set (logos, QR codes). */
  function shrink(file, max, keepPng) {
    return new Promise((resolve) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || (keepPng && file.type === 'image/png' && file.size < 1.5e6)) return resolve(file);
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, max / Math.max(im.width, im.height));
        if (scale === 1 && file.size < 350e3) return resolve(file);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * scale));
        cv.height = Math.max(1, Math.round(im.height * scale));
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(im, 0, 0, cv.width, cv.height);
        const done = (b) => resolve(b && b.size < file.size ? b : file);
        cv.toBlob((b) => {
          if (b && b.type === 'image/webp') return done(b);
          cv.toBlob(done, 'image/jpeg', 0.82);
        }, 'image/webp', 0.8);
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
    set('--sec-gap', within(t.sectionGap, 0, 200, 56) + 'px');
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
  // Zoom can go below 100%; then (and for "show the whole photo") the empty part of the frame
  // is filled with a soft, blurred copy of the same photo, so it blends in.
  const ZMIN = 0.3;
  const needsFill = (k) => Boolean(k && (k.fit === 'contain' || clampN(k.z, ZMIN, 4, 1) < 1));
  const fillUrl = (u) => `url('${String(u).replace(/['\\()\s]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0'))}')`;
  function cropAttrs(url) {
    const k = S.c && S.c.crops && S.c.crops[url];
    if (!k) return '';
    return ` style="--ox:${clampN(k.x, 0, 100, 50)}%;--oy:${clampN(k.y, 0, 100, 50)}%;--z:${clampN(k.z, ZMIN, 4, 1)}"${k.fit === 'contain' ? ' data-fit="contain"' : ''}`;
  }
  function fillAttrs(url) {
    const k = S.c && S.c.crops && S.c.crops[url];
    return needsFill(k) ? ` data-fill style="--fill:${esc(fillUrl(url))}"` : '';
  }
  function setFill(box, url, k) {
    if (!box) return;
    if (needsFill(k)) { box.setAttribute('data-fill', ''); box.style.setProperty('--fill', fillUrl(url)); } else { box.removeAttribute('data-fill'); box.style.removeProperty('--fill'); }
  }
  const pic = (url, alt, cls, eager) => {
    const u = safeUrl(url);
    return `<div class="pic ${cls || ''}" data-alt="${esc(alt)}"${u ? fillAttrs(u) : ''}>${u ? `<img src="${esc(u)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${cropAttrs(u)}>` : ''}</div>`;
  };
  const head = (o, path, extra) => `<header class="head rv">${o.script || PREVIEW ? `<p class="script"${ed(path + '.script')}>${esc(o.script)}</p>` : ''}${o.title || PREVIEW ? `<h2${ed(path + '.title')}>${esc(o.title)}</h2>` : ''}${extra || ''}</header>`;
  const btn = (label, href, cls, path) => `<a class="btn ${cls || ''}" href="${esc(safeUrl(href) || '#')}"><span${path ? ed(path) : ''}>${esc(label)}</span>${ICON.arrow}</a>`;
  const logo = (c) => (safeUrl(c.brand.logo) ? `<img class="logo-img" src="${esc(safeUrl(c.brand.logo))}" alt="">` : `<span class="logo-mono" aria-hidden="true">${esc((c.brand.shortName || c.brand.name || 'P').slice(0, 1))}</span>`);
  const nepalTime = () => new Date(Date.now() + 345 * 60e3).toISOString().slice(11, 16);
  // The "closed today" notice from admin, while it applies.
  function closure(c) {
    const k = c.closure || {};
    if (!k.on) return null;
    if (k.until && /^\d{4}-\d{2}-\d{2}$/.test(k.until) && BS.todayAD() > k.until) return null;
    return k;
  }
  const isOpen = (c) => { const t = nepalTime(); return !closure(c) && t >= c.brand.open && t <= c.brand.close; };
  // Photo border theme, chosen under Colours, fonts and sizes.
  const siteBorder = (c) => c.theme.border || 'none';
  const deco = (html, border, cls) => (border && border !== 'none' ? `<div class="deco deco--${esc(border)} ${cls || ''}">${html}</div>` : html);
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
  const placeOf = (c, id) => { const s = c.sections.find((x) => x.id === id); return (s && s.place) || 'page'; };
  // Where a link to a section goes: its own page, or the section on the home page.
  function hrefFor(c, id) {
    if (id in PAGEABLE && placeOf(c, id) !== 'home') {
      const path = PAGEABLE[id];
      return `/${PAGE}` === path ? `#${id}` : path;
    }
    return PAGE === 'home' ? `#${id}` : `/#${id}`;
  }
  // Button links typed in admin, like #menu or #cake, follow the section to its page.
  const linkFor = (c, link) => { const m = /^#([\w-]+)$/.exec(link || ''); return m && c.sections.some((x) => x.id === m[1]) ? hrefFor(c, m[1]) : link; };
  // The sections drawn on this page.
  function pageSections(c) {
    const on = (s) => s.show !== false && R[s.id];
    if (PAGE === 'home') return c.sections.filter((s) => on(s) && !(s.id in PAGEABLE && placeOf(c, s.id) === 'page'));
    const want = PAGE === 'menu' ? ['menu'] : PAGE === 'cake' ? ['cake'] : ['gallery', 'moments'];
    const list = c.sections.filter((s) => on(s) && want.includes(s.id));
    if (PAGE === 'menu' && c.menu.showEvents !== false && visible(c, 'events')) list.push({ id: 'events' });
    return list;
  }

  /* ---------- menu lookups and cart ---------- */
  function findPrice(itemId, label) {
    const groups = (S.c.menu.categories || []).map((g) => ({ id: g.id, items: g.items, hidden: g.hidden, timeFrom: g.timeFrom, timeTo: g.timeTo }))
      .concat((S.c.events.items || []).filter((e) => e.enabled !== false).map((e) => ({ id: 'event-' + e.id, items: e.menu })));
    for (const g of groups) {
      for (const it of g.items || []) {
        if (it.id !== itemId) continue;
        const p = (it.prices || []).find((x) => (x.label || '') === (label || ''));
        if (!p) return null;
        const off = g.hidden || it.hidden || it.available === false;
        return { item: Object.assign({}, it, { available: off ? false : it.available }), price: p, group: g.id, hours: hoursOf(it, g) };
      }
    }
    return null;
  }
  // Items (or whole groups) served only between two times, like a morning combo.
  function hoursOf(it, g) {
    if (it.timeFrom || it.timeTo) return { from: it.timeFrom || '', to: it.timeTo || '' };
    if (g && (g.timeFrom || g.timeTo)) return { from: g.timeFrom || '', to: g.timeTo || '' };
    return null;
  }
  const servedNow = (hrs) => { if (!hrs) return true; const t = nepalTime(); return !((hrs.from && t < hrs.from) || (hrs.to && t > hrs.to)); };
  const hoursText = (hrs) => (hrs.from && hrs.to ? `${t12(hrs.from)} to ${t12(hrs.to)}` : hrs.from ? `after ${t12(hrs.from)}` : `until ${t12(hrs.to)}`);
  // Choices a customer can add (less sugar, extra shot), from the extras sets that cover the item's menu group.
  function extrasOf(groupId) {
    const x = S.c.extras || {};
    if (x.show === false) return [];
    const out = [];
    for (const g of x.groups || []) {
      if (g.show === false || !(g.categories || []).includes(groupId)) continue;
      for (const o of g.options || []) if (o.show !== false && o.id && o.name && !out.some((y) => y.id === o.id)) out.push(o);
    }
    return out;
  }
  const cakeOpts = () => ((S.c.cake || {}).options || []).filter((o) => o.show !== false && o.id && o.name);
  function pounds(label) {
    const t = String(label || '').toLowerCase().replace(/(\d)\s*(?:½|1\/2|and a half|and half|& half)/, '$1.5').replace(/½/, '0.5').replace(/(^|\D)1\/2/, (m, a) => `${a}0.5`);
    if (/half/.test(t)) return 0.5;
    const m = t.match(/(\d+(?:\.\d+)?)\s*(pound|lb|kg)/);
    if (!m) return 1;
    return m[2] === 'kg' ? Number(m[1]) * 2.2 : Number(m[1]);
  }
  const optCost = (o, label) => Math.round(Math.max(0, Number(o.price) || 0) * (o.perPound ? pounds(label) : 1));
  const lineKey = (l) => `${l.itemId}|${l.label}|${(l.extras || []).slice().sort().join(',')}`;
  function cartLines() {
    return S.cart.map((l) => {
      const f = findPrice(l.itemId, l.label);
      if (!f || f.item.available === false || !(Number(f.price.price) > 0)) return null;
      const whole = Boolean(f.price.whole);
      const allowed = whole ? cakeOpts() : extrasOf(f.group);
      const picked = (l.extras || []).map((id) => allowed.find((o) => o.id === id)).filter(Boolean);
      if (picked.length !== (l.extras || []).length) return null;
      const add = picked.reduce((sum, o) => sum + optCost(o, f.price.label), 0);
      return {
        key: lineKey(l), itemId: l.itemId, label: l.label, qty: l.qty, extras: picked.map((o) => o.id), extraNames: picked.map((o) => o.name),
        notice: whole ? Math.max(0, ...picked.map((o) => Number(o.notice) || 0)) : 0, photo: picked.some((o) => o.id === 'photo'),
        name: f.item.name, group: f.group, price: Number(f.price.price) + add, whole,
      };
    }).filter(Boolean);
  }
  function saveCart() {
    try { localStorage.setItem('pm_cart', JSON.stringify(S.cart)); } catch (e) { /* storage not available */ }
    const lines = cartLines();
    const n = lines.reduce((s, l) => s + l.qty, 0);
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
    $$('.cart-count').forEach((el) => { el.textContent = n; el.hidden = !n; });
    $$('.dk-total').forEach((el) => { el.textContent = n ? rs(total) : ''; });
    $$('.dk-label').forEach((el) => { el.textContent = n ? 'Your order' : 'Order'; });
    $$('.dk--order').forEach((el) => el.classList.toggle('is-full', Boolean(n)));
    const pill = $('.order-pill');
    if (pill) { pill.hidden = !n; $('span', pill).textContent = `View order · ${n} item${n === 1 ? '' : 's'} · ${rs(total)}`; }
  }
  function addToCart(itemId, label, qty, replace, extras) {
    const want = { itemId, label, extras: (extras || []).slice() };
    const line = S.cart.find((l) => lineKey(l) === lineKey(want));
    if (line) line.qty = replace ? qty : Math.min(50, line.qty + qty);
    else S.cart.push(Object.assign(want, { qty }));
    S.cart = S.cart.filter((l) => l.qty > 0);
    saveCart();
  }
  function bump() { $$('.cart-btn, .dk--order').forEach((b) => { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }); }
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
      ${pic(h.image, 'Inside ' + c.brand.name, 'hero-media', true)}
      <div class="hero-text">
        ${h.script || PREVIEW ? `<p class="script hero-in"${ed('hero.script')}>${esc(h.script)}</p>` : ''}
        <h1 class="hero-in"${ed('hero.title')}>${esc(h.title)}</h1>
        ${h.line || PREVIEW ? `<p class="hero-line hero-in"${ed('hero.line')}>${esc(h.line)}</p>` : ''}
        ${h.tagline || PREVIEW ? `<p class="ital hero-in"${ed('hero.tagline')}>${esc(h.tagline)}</p>` : ''}
        <div class="pill hero-in">
          <span>${ICON.clock}<span><small class="${open ? 'dot dot--on' : 'dot'}">${open ? 'Open now' : (closure(c) ? 'Closed today' : 'Closed now')}</small><span${ed('brand.hoursText')}>${esc(c.brand.hoursText)}</span></span></span>
          <a href="${esc(safeUrl(c.visit.mapLink) || '#visit')}"${safeUrl(c.visit.mapLink) ? ' target="_blank" rel="noopener"' : ''}>${ICON.pin}<span><small>Find us</small>${esc(c.brand.address.split(',').slice(0, 2).join(','))}</span></a>
          <a href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener">${ICON.whatsapp}<span><small>Call or WhatsApp</small>${esc(c.brand.phone)}</span></a>
        </div>
        <div class="row hero-in">
          ${h.button && visible(c, 'menu') ? btn(h.button, hrefFor(c, 'menu'), '', 'hero.button') : ''}
          ${h.button2 && visible(c, 'booking') ? btn(h.button2, hrefFor(c, 'booking'), 'btn--ghost', 'hero.button2') : ''}
          ${h.button3 && visible(c, 'cake') ? btn(h.button3, hrefFor(c, 'cake'), 'btn--ghost', 'hero.button3') : ''}
        </div>
      </div>
      ${k.show !== false && k.title && visible(c, 'cake') ? `<a class="hero-card" href="${esc(hrefFor(c, 'cake'))}">${pic(k.image, k.title, 'hero-card-pic')}<span><small${ed('hero.card.label')}>${esc(k.label)}</small><strong${ed('hero.card.title')}>${esc(k.title)}</strong><em${ed('hero.card.text')}>${esc(k.text)}</em></span></a>` : ''}
    </section>
    ${words.length ? `<div class="marquee" aria-hidden="true"><div>${strip}${strip}</div></div>` : ''}`;
  };

  function fromPrice(c, catId) {
    const cat = (c.menu.categories || []).find((x) => x.id === catId);
    const all = cat && !cat.hidden ? (cat.items || []).filter((i) => i.available !== false && !i.hidden).flatMap((i) => (i.prices || []).map((p) => Number(p.price))).filter((n) => n > 0) : [];
    return all.length ? `From ${rs(Math.min(...all))}` : '';
  }
  R.highlights = (c) => {
    const h = c.highlights;
    const border = siteBorder(c);
    return `<section id="highlights" class="sec"><div class="wrap">
      ${head(h, 'highlights')}
      <div class="trio">${(h.cards || []).map((k, i) => `
        <a class="arch rv" style="--d:${i * 90}ms" href="${esc(hrefFor(c, 'menu').startsWith('#') ? '#menu' : `${hrefFor(c, 'menu')}#tab-${k.category}`)}" data-act="cat" data-id="${esc(k.category)}">
          ${deco(pic(k.image, k.title, 'arch-pic'), border, 'deco--arch')}
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
  // An event's photos: the first one is its main photo. Each has its own heading and description,
  // shown on the left of the photo (the event's title and text fill in when they are empty).
  function eventPhotos(e) {
    const list = (e.photos || []).map((p, n) => ({ image: p.image, caption: p.caption || '', text: p.text || '', n })).filter((p) => safeUrl(p.image));
    return list.length ? list : (safeUrl(e.image) ? [{ image: e.image, caption: '', text: '', n: -1 }] : []);
  }
  const hasPage = (e) => Boolean((e.menu || []).some((it) => !it.hidden) || eventPhotos(e).length > 1 || e.message);
  // Every event that is on right now joins one slideshow: two events with 5 photos each make 10 slides.
  function eventSlides(c) {
    return activeEvents(c).flatMap(({ e, i, left }) => {
      const shots = eventPhotos(e);
      return (shots.length ? shots : [null]).map((p) => ({ e, i, left, p }));
    });
  }
  R.events = (c) => {
    const slides = eventSlides(c);
    if (!slides.length) return '';
    if (S.slide >= slides.length) S.slide = 0;
    const many = slides.length > 1;
    const start = Math.max(0, Math.min(70, Number(c.events.photoStart) || 0));
    const withPhoto = slides.filter((s) => s.p);
    S.groups.event = withPhoto.map((s) => ({ src: s.p.image, cap: s.p.caption || s.e.title }));
    const heading = ({ e, i, p }) => (p && p.caption
      ? `<h3${ed(`events.items.${i}.photos.${p.n}.caption`)}>${esc(p.caption)}</h3>`
      : `<h3${ed(`events.items.${i}.title`)}>${esc(e.title)}</h3>`);
    const words = ({ e, i, p }) => (p && p.text
      ? `<p${ed(`events.items.${i}.photos.${p.n}.text`)}>${esc(p.text)}</p>`
      : e.text ? `<p${ed(`events.items.${i}.text`)}>${esc(e.text)}</p>` : '');
    return `<section id="events" class="sec"><div class="wrap">
      ${head(c.events, 'events')}
      <div class="slides rv" data-n="${slides.length}" style="--secs:${Math.max(2, Number(c.events.seconds) || 5)}s;--ev-start:${start}%;--ev-fade:${start ? 18 : 0}%">
        <div class="ev-stage">
        ${slides.map((s, n) => {
          const { e, i, left, p } = s;
          return `<article class="slide${p ? '' : ' slide--text'}${n === S.slide ? ' is-on' : ''}" aria-hidden="${n !== S.slide}">
            ${p ? `<button type="button" class="ev-shot" data-act="zoom" data-group="event" data-i="${withPhoto.indexOf(s)}" aria-label="Open photo${p.caption ? ': ' + esc(p.caption) : ''}" tabindex="${n === S.slide ? 0 : -1}">${pic(p.image, p.caption || e.title, 'slide-pic', n === 0)}</button>` : ''}
            <div class="slide-text">
              <p class="slide-tags">${e.tag ? `<span class="tag"${ed(`events.items.${i}.tag`)}>${esc(e.tag)}</span>` : ''}<span class="tag tag--soft">${left} day${left === 1 ? '' : 's'} left</span></p>
              ${heading(s)}
              ${words(s)}
              ${hasPage(e)
                ? `<button type="button" class="btn" data-act="event" data-id="${esc(e.id)}" tabindex="${n === S.slide ? 0 : -1}"><span${ed(`events.items.${i}.button`)}>${esc(e.button || 'See the specials')}</span>${ICON.arrow}</button>`
                : (e.button ? btn(e.button, linkFor(c, e.link || '#menu'), '', `events.items.${i}.button`) : '')}
            </div></article>`;
        }).join('')}
        </div>
        ${many ? `<div class="slide-bar"><i></i></div>
          <div class="slide-ctl">
            <div class="dots">${slides.map((s, n) => `<button type="button" data-act="slide" data-i="${n}" class="${n === S.slide ? 'is-on' : ''}" aria-label="Show slide ${n + 1}: ${esc((s.p && s.p.caption) || s.e.title)}"></button>`).join('')}</div>
            <div class="row"><button type="button" class="icon-btn" data-act="slide-step" data-d="-1" aria-label="Previous slide">${ICON.left}</button>
              <button type="button" class="icon-btn" data-act="slide-step" data-d="1" aria-label="Next slide">${ICON.right}</button></div>
          </div>` : ''}
      </div></div></section>`;
  };

  // Menu groups shown as tabs: the specials of events showing now come first.
  function menuGroups(c) {
    const out = [];
    for (const { e, i } of activeEvents(c)) {
      if ((e.menu || []).some((it) => !it.hidden)) out.push({ id: 'event-' + e.id, name: e.menuTitle || e.title, note: e.message, items: e.menu, path: `events.items.${i}.menu`, notePath: `events.items.${i}.message`, special: true });
    }
    (c.menu.categories || []).forEach((g, ci) => {
      if (!g.hidden) out.push({ id: g.id, name: g.name, note: g.note, items: g.items || [], path: `menu.categories.${ci}.items`, notePath: `menu.categories.${ci}.note`, timeFrom: g.timeFrom, timeTo: g.timeTo });
    });
    return out;
  }
  function marksHtml(it) {
    const c = S.c;
    if (((c.menu || {}).marks || {}).show === false) return '';
    const tags = (it.tags || []).filter((t) => MARKS[t]);
    if (!tags.length) return '';
    return `<span class="marks">${tags.map((t) => (MARKS[t].icon ? `<span class="mark mark--icon" title="${MARKS[t].label}" role="img" aria-label="${MARKS[t].label}">${MARKS[t].icon}</span>` : `<span class="mark mark--${t}">${MARKS[t].label}</span>`)).join('')}</span>`;
  }
  function itemHtml(it, base, cards, g) {
    const hrs = hoursOf(it, g);
    const later = hrs && !servedNow(hrs);
    const off = it.available === false;
    const prices = off ? `<span class="mi-off">${it.soldOut ? 'Sold out today' : 'Not available today'}</span>` : (it.prices || []).filter((p) => Number(p.price) > 0).map((p) => (later && !p.whole
      ? `<span class="pchip pchip--off">${p.label ? `<span>${esc(p.label)}</span>` : ''}<b>${rs(p.price)}</b></span>`
      : `<button type="button" class="pchip" data-act="${p.whole ? 'cake' : 'add'}" data-item="${esc(it.id)}" data-label="${esc(p.label || '')}"
        aria-label="${p.whole ? 'Pre-order' : 'Add'} ${esc(it.name)} ${esc(p.label || '')}, ${rs(p.price)}">
        ${p.label ? `<span>${esc(p.label)}</span>` : ''}<b>${rs(p.price)}</b>${p.whole ? `<i class="pre" aria-hidden="true">${ICON.cartSmall}Pre-order</i>` : '<i aria-hidden="true">+</i>'}
      </button>`)).join('');
    const when = hrs ? `<p class="mi-time">${later ? 'Served' : 'Today'} ${hoursText(hrs)}</p>` : '';
    const badge = it.badge ? `<span class="badge"${ed(base + '.badge')}>${esc(it.badge)}</span>` : '';
    const text = `<h4><span${ed(base + '.name')}>${esc(it.name)}</span>${marksHtml(it)}${cards ? '' : badge}</h4>${it.desc || PREVIEW ? `<p${ed(base + '.desc')}>${esc(it.desc)}</p>` : ''}${when}`;
    if (cards) return `<article class="mc${off ? ' mi--off' : ''}"><div class="mc-top">${pic(it.image, it.name, 'mc-pic')}${badge}</div><div class="mc-body">${text}<div class="mi-prices">${prices}</div></div></article>`;
    // Rounded card: a round photo whose edge matches the card's rounded end, then the name and prices.
    const photo = safeUrl(it.image) ? `<div class="mi-ring">${pic(it.image, it.name, 'mi-pic')}</div>` : '';
    return `<article class="mi${off ? ' mi--off' : ''}${photo ? '' : ' mi--plain'}">${photo}<div class="mi-main"><div class="mi-body">${text}</div><div class="mi-prices">${prices}</div></div></article>`;
  }
  // The veg / eggless filter.
  function passes(it) {
    const t = it.tags || [];
    if (S.filter === 'veg') return !t.includes('nonveg');
    if (S.filter && MARKS[S.filter]) return t.includes(S.filter);
    return true;
  }
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, ' ');
  function menuPanel(c) {
    const groups = menuGroups(c);
    const cards = c.menu.layout === 'cards';
    const wrapCls = cards ? 'menu-cards' : 'menu-list';
    if (S.q.trim()) {
      const words = norm(S.q).split(/\s+/).filter(Boolean);
      // Items whose own name or description matches come first; if none do, items from a matching group (for example "coffee").
      const find = (withGroup) => {
        const hits = [];
        for (const g of groups) {
          g.items.forEach((it, ii) => {
            if (it.hidden || !passes(it)) return;
            const hay = norm(`${it.name} ${it.desc} ${(it.tags || []).map((t) => (MARKS[t] || {}).label).join(' ')}${withGroup ? ' ' + g.name : ''}`);
            if (words.every((w) => hay.includes(w))) hits.push(itemHtml(it, `${g.path}.${ii}`, cards, g));
          });
        }
        return hits;
      };
      let hits = find(false);
      if (!hits.length) hits = find(true);
      return hits.length
        ? `<p class="menu-count" role="status">${hits.length} found for "${esc(S.q.trim())}"</p><div class="${wrapCls} menu-found">${hits.join('')}</div>`
        : `<p class="menu-count" role="status">Nothing found for "${esc(S.q.trim())}". Try another word, like latte or cheesecake.</p>`;
    }
    const g = groups.find((x) => x.id === S.tab) || groups[0];
    if (!g) return '<p class="muted">The menu is being updated.</p>';
    S.tab = g.id;
    const tabs = groups.map((x) => `<button type="button" role="tab" aria-selected="${x.id === g.id}" class="tab${x.id === g.id ? ' is-on' : ''}${x.special ? ' tab--special' : ''}" data-act="tab" data-id="${esc(x.id)}">${x.special ? '<i aria-hidden="true">✦</i> ' : ''}${esc(x.name)}</button>`).join('');
    const items = g.items.map((it, ii) => (it.hidden || !passes(it) ? '' : itemHtml(it, `${g.path}.${ii}`, cards, g))).join('');
    return `<div class="tabs" role="tablist" aria-label="Menu groups">${tabs}</div>
      ${g.note ? `<p class="menu-note${g.special ? ' menu-note--special' : ''}"${ed(g.notePath)}>${esc(g.note)}</p>` : ''}
      ${g.timeFrom || g.timeTo ? `<p class="menu-note">Served ${hoursText({ from: g.timeFrom, to: g.timeTo })}</p>` : ''}
      <div class="${wrapCls}" role="tabpanel">${items || '<p class="muted">Nothing here matches the filter.</p>'}</div>`;
  }
  function menuTools(c) {
    const m = c.menu || {};
    const all = menuGroups(c).flatMap((g) => g.items.filter((it) => !it.hidden));
    const used = new Set(all.flatMap((it) => it.tags || []));
    const chips = [];
    if (((m.marks || {}).filter !== false) && ((m.marks || {}).show !== false)) {
      if (used.has('nonveg') || used.has('veg')) chips.push(['veg', `${MARKS.veg.icon} Veg only`]);
      for (const t of ['eggless', 'sugarfree']) if (used.has(t)) chips.push([t, MARKS[t].label]);
    }
    const search = m.search !== false;
    if (!search && !chips.length) return '';
    return `<div class="menu-tools">
      ${search ? `<label class="msearch">${ICON.search}<input type="search" id="menu-q" placeholder="Search the menu" autocomplete="off" enterkeyhint="search" value="${esc(S.q)}" aria-label="Search the menu"></label>` : ''}
      ${chips.length ? `<div class="mfilters" role="group" aria-label="Filter the menu">${chips.map(([k, l]) => `<button type="button" class="mfilter${S.filter === k ? ' is-on' : ''}" data-act="filter" data-id="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div>` : ''}
    </div>`;
  }
  const menuBody = (c) => `${menuTools(c)}<div id="menu-panel">${menuPanel(c)}</div>`;
  function redrawMenu() {
    const p = $('#menu-panel');
    if (!p) return;
    const before = $('.tabs', p);
    const left = before ? before.scrollLeft : 0;
    p.innerHTML = menuPanel(S.c);
    if (PREVIEW) setInline();
    centreTab(left);
  }
  // On phones the tabs scroll sideways: the chosen one slides to the middle, so the next group shows beside it.
  function centreTab(from) {
    const bar = $('#menu-panel .tabs');
    const on = bar && $('.tab.is-on', bar);
    if (!on || bar.scrollWidth <= bar.clientWidth + 1) return;
    bar.scrollLeft = from || 0;
    const r = on.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    const target = bar.scrollLeft + (r.left - b.left) - (bar.clientWidth - r.width) / 2;
    const to = Math.max(0, Math.min(bar.scrollWidth - bar.clientWidth, target));
    const smooth = document.documentElement.classList.contains('anim') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => { try { bar.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { bar.scrollLeft = to; } });
  }
  R.menu = (c) => `<section id="menu" class="sec sec--tint"><div class="wrap">
      ${head(c.menu, 'menu', c.menu.note ? `<p class="lede"${ed('menu.note')}>${esc(c.menu.note)}</p>` : '')}
      <div id="menu-body" class="rv">${menuBody(c)}</div>
    </div></section>`;

  // Cakes that can be ordered whole, grouped by flavour with their sizes.
  function wholeCakes(c) {
    const out = [];
    for (const g of menuGroups(c)) {
      for (const it of g.items || []) {
        if (it.available === false || it.hidden) continue;
        const sizes = (it.prices || []).filter((p) => p.whole && Number(p.price) > 0).map((p) => ({ label: p.label || '', price: Number(p.price) }));
        if (sizes.length && !out.some((x) => x.id === it.id)) out.push({ id: it.id, name: it.name, sizes, tags: it.tags || [] });
      }
    }
    return out;
  }
  function serves(label) {
    const k = S.c.cake || {};
    const lb = pounds(label);
    const lo = Math.max(1, Math.round((Number(k.serveMin) || 4) * lb));
    const hi = Math.max(lo, Math.round((Number(k.serveMax) || 6) * lb));
    return lo === hi ? `Serves about ${lo}` : `Serves about ${lo} to ${hi}`;
  }
  function sizeChoices(cake, chosen) {
    if (!cake) return '';
    const pick = cake.sizes.some((z) => z.label === chosen) ? chosen : cake.sizes[0].label;
    return cake.sizes.map((z, n) => `<input type="radio" name="size" id="cake-size-${n}" value="${esc(z.label)}"${z.label === pick ? ' checked' : ''}>
      <label for="cake-size-${n}" class="size-card"><strong>${esc(z.label || 'Whole cake')}</strong><span>${rs(z.price)}</span><small>${serves(z.label)}</small></label>`).join('');
  }
  const optPrice = (o) => (Number(o.price) > 0 ? `+${rs(o.price)}${o.perPound ? ' a pound' : ''}` : 'Free');
  // Recalculate the cake total and the notice needed whenever something changes.
  function cakeTotal() {
    const form = $('form[data-form=cake]');
    if (!form) return;
    const cake = wholeCakes(S.c).find((x) => x.id === form.elements.cakeId.value);
    const sizeEl = $('input[name=size]:checked', form);
    const out = $('#cake-total');
    if (!cake || !sizeEl) { if (out) out.textContent = ''; return; }
    const size = cake.sizes.find((z) => z.label === sizeEl.value) || cake.sizes[0];
    const picked = $$('input[name=opt]:checked', form).map((el) => cakeOpts().find((o) => o.id === el.value)).filter(Boolean);
    const qty = Math.max(1, Math.min(20, Number($('#cake-qty').value) || 1));
    const each = size.price + picked.reduce((sum, o) => sum + optCost(o, size.label), 0);
    out.textContent = rs(each * qty);
    const base = Number(S.c.cake.noticeHours) || 0;
    const extra = picked.filter((o) => Number(o.notice) > base);
    const hint = $('#cake-notice');
    if (hint) hint.textContent = extra.length ? `${extra.map((o) => o.name).join(' and ')} needs at least ${Math.max(...extra.map((o) => Number(o.notice)))} hours notice, so please choose a later date if needed.` : `We need at least ${base} hours to prepare a whole cake.`;
  }
  // Order a Cake: the photo changes to the cake the guest picks, with a soft fade.
  function cakePhotoUrl(id) {
    const own = ((S.c.cake || {}).photos || {})[id];
    if (safeUrl(own)) return own;
    for (const g of S.c.menu.categories || []) for (const it of g.items || []) if (it.id === id && safeUrl(it.image)) return it.image;
    return S.c.cake.image;
  }
  function showCakePhoto(id) {
    const box = $('.cake-photo');
    const u = safeUrl(cakePhotoUrl(id));
    if (!box || !u) return;
    const old = $('img', box);
    if (old && old.getAttribute('src') === u) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = `<img src="${esc(u)}" alt="" decoding="async"${cropAttrs(u)}>`;
    const img = tmp.firstChild;
    img.classList.add('cake-next');
    box.classList.remove('pic--empty');
    setFill(box, u, S.c.crops && S.c.crops[u]);
    box.appendChild(img);
    const swap = () => { requestAnimationFrame(() => img.classList.add('is-in')); setTimeout(() => { $$('img', box).forEach((x) => { if (x !== img) x.remove(); }); img.classList.remove('cake-next', 'is-in'); }, 650); };
    if (img.complete) swap(); else { img.onload = swap; img.onerror = () => img.remove(); }
  }
  R.cake = (c) => {
    const k = c.cake;
    const slot = nextSlot(c, k.noticeHours);
    const cakes = wholeCakes(c);
    const opts = cakeOpts();
    return `<section id="cake" class="sec"><div class="wrap split">
      <div class="split-pic rv">${deco(pic(k.image, 'Celebration cake', 'fade-pic cake-photo'), siteBorder(c), 'deco--tall')}</div>
      <div class="split-body rv">
        ${head(k, 'cake')}
        <p class="lede"${ed('cake.text')}>${esc(k.text)}</p>
        ${cakes.length ? `<form class="form cake-form" data-form="cake" novalidate>
          <label class="f f--wide"><span>Flavour</span><select name="cakeId" id="cake-flavour" required>
            ${cakes.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}
          </select></label>
          <fieldset class="f f--wide sizes" id="cake-sizes"><legend>Size</legend>${sizeChoices(cakes[0])}</fieldset>
          ${opts.length ? `<fieldset class="f f--wide cake-opts"><legend>Make it special</legend>${opts.map((o) => `<label class="copt"><input type="checkbox" name="opt" value="${esc(o.id)}"><span><strong>${esc(o.name)}</strong>${o.note ? `<small>${esc(o.note)}</small>` : ''}</span><b>${optPrice(o)}</b></label>`).join('')}</fieldset>` : ''}
          <label class="f"><span>How many cakes</span><input name="qty" id="cake-qty" type="number" min="1" max="20" value="1" inputmode="numeric" required></label>
          <label class="f"><span>Occasion (optional)</span><input name="occasion" id="cake-occasion" maxlength="80" placeholder="Birthday, anniversary"></label>
          <label class="f f--wide"><span>Name or message on the cake (optional)</span><input name="cakeMessage" id="cake-msg" maxlength="120" placeholder="Happy Birthday Aarav"></label>
          <label class="f f--wide cake-ref"><span>Have a picture of the cake you want? (optional)</span><input type="file" id="cake-ref" accept="image/png,image/jpeg,image/webp"><small class="hint">A photo from the internet, or one made with AI. We will make a cake like it.</small><small id="cake-photo-state" class="hint" aria-live="polite"></small></label>
          <div class="f"><span>Date</span><div data-bsp="date" data-value="${slot.date}"></div></div>
          <label class="f"><span>Time</span><select name="time" id="cake-time" required>${timeOptions(c, slot.time)}</select></label>
          <p class="hint f--wide" id="cake-notice">We need at least ${esc(k.noticeHours)} hours to prepare a whole cake.</p>
          <p class="sum sum--big f--wide"><span>Total</span><b id="cake-total"></b></p>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span${ed('cake.button')}>${esc(k.button || 'Continue')}</span>${ICON.arrow}</button>
        </form>` : '<p class="muted">Whole cakes will be listed here soon. Call or WhatsApp us to order one.</p>'}
      </div></div></section>`;
  };

  R.booking = (c) => {
    const b = c.booking;
    const seats = String(b.seating || '').split(',').map((x) => x.trim()).filter(Boolean);
    const slot = nextSlot(c, 1);
    return `<section id="booking" class="sec sec--tint"><div class="wrap split split--flip">
      <div class="split-pic rv">${deco(pic(b.image, 'A table at ' + c.brand.name, 'fade-pic'), siteBorder(c), 'deco--tall')}</div>
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

  /* Photos in one sliding row: the photo in the middle is full size and sharp, the ones near the edges smaller and softer. */
  function slider(group, photos, label) {
    S.groups[group] = photos;
    return `<div class="slider rv" data-group="${esc(group)}">
      <button type="button" class="sl-arrow sl-prev" data-act="sl-step" data-d="-1" aria-label="Previous photos">${ICON.left}</button>
      <div class="sl-track" tabindex="0" role="region" aria-label="${esc(label)}">${photos.map((ph, i) => `
        <button type="button" class="sl-item" data-act="zoom" data-group="${esc(group)}" data-i="${i}" aria-label="Open photo ${i + 1} of ${photos.length}${ph.cap ? `: ${esc(ph.cap)}` : ''}">
          ${pic(ph.src, ph.cap || label)}
          ${ph.cap || ph.tag ? `<span class="sl-cap">${ph.tag ? `<small>${esc(ph.tag)}</small>` : ''}${esc(ph.cap)}</span>` : ''}
        </button>`).join('')}
      </div>
      <button type="button" class="sl-arrow sl-next" data-act="sl-step" data-d="1" aria-label="More photos">${ICON.right}</button>
    </div>`;
  }
  R.gallery = (c) => {
    const g = c.gallery;
    const photos = (g.images || []).filter((im) => safeUrl(im.image)).map((im) => ({ src: im.image, cap: im.caption, tag: im.tag }));
    if (!photos.length) return '';
    return `<section id="gallery" class="sec"><div class="wrap">
      ${head(g, 'gallery')}
      </div>${slider('gallery', photos, 'Gallery')}</section>`;
  };
  // Guest moments: albums that show for a few days. The newest album comes first.
  function liveAlbums(c) {
    const today = BS.todayAD();
    return ((c.moments || {}).albums || []).filter((a) => {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : today;
      const end = new Date(Date.parse(start) + Math.max(1, Number(a.days) || 1) * 864e5).toISOString().slice(0, 10);
      return start <= today && today < end && (a.photos || []).some((p) => safeUrl(p.image));
    }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }
  R.moments = (c) => {
    const m = c.moments || {};
    const albums = liveAlbums(c);
    if (!albums.length) return '';
    if (!albums[S.album]) S.album = 0;
    const a = albums[S.album];
    const photos = (a.photos || []).filter((p) => safeUrl(p.image)).map((p, i) => ({ src: p.image, full: a.download ? (p.full || p.image) : '', cap: '', name: `Pick-Me-${String(i + 1).padStart(2, '0')}` }));
    return `<section id="moments" class="sec sec--tint"><div class="wrap">
      ${head(m, 'moments')}
      ${m.text ? `<p class="lede center moments-text"${ed('moments.text')}>${esc(m.text)}</p>` : ''}
      ${albums.length > 1 ? `<div class="albums" role="tablist" aria-label="Albums">${albums.map((x, i) => `<button type="button" role="tab" aria-selected="${i === S.album}" class="album${i === S.album ? ' is-on' : ''}" data-act="album" data-i="${i}">
        ${pic(x.photos[0].image, x.title, 'album-pic')}<span><strong>${esc(x.title)}</strong><small>${x.photos.length} photos</small></span></button>`).join('')}</div>` : `<p class="album-name"><strong>${esc(a.title)}</strong> · ${a.photos.length} photo${a.photos.length === 1 ? '' : 's'}</p>`}
      </div>
      ${slider('moments', photos, a.title)}
      <div class="wrap moments-foot">
        ${a.download ? `<a class="btn btn--ghost" href="/api/moments/${encodeURIComponent(a.id)}.zip" download>${ICON.download}<span>Download all ${a.photos.length} photos</span></a>` : ''}
        ${m.privacy ? `<p class="muted moments-privacy">${PREVIEW ? `<span${ed('moments.privacy')}>${esc(m.privacy)}</span>` : `<a href="${esc(waLink(c, 'Hello, please remove a photo of me from the Guest moments album: '))}" target="_blank" rel="noopener">${esc(m.privacy)}</a>`}</p>` : ''}
      </div></section>`;
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
        ${googleReviewUrl() ? `<a class="btn btn--ghost btn--google" href="${esc(googleReviewUrl())}" target="_blank" rel="noopener">${ICON.google}<span${ed('reviews.googleButton')}>${esc(r.googleButton || 'Review us on Google')}</span></a>` : ''}
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
      </div>${appCardHtml(c)}</div></section>`;
  };

  function nav(c) {
    const links = c.sections.filter((s) => s.show !== false && s.nav !== false && R[s.id] && s.id !== 'hero')
      .map((s) => { const href = hrefFor(c, s.id); const here = s.id in PAGEABLE && `/${PAGE}` === PAGEABLE[s.id]; return `<a href="${esc(href)}"${here ? ' aria-current="page"' : ''}>${esc(s.label)}</a>`; }).join('');
    return `<header class="nav" id="top"><div class="nav-in">
      <a class="brand" href="${PAGE === 'home' ? '#hero' : '/'}" aria-label="${esc(c.brand.name)}, home">${logo(c)}<span${ed('brand.name')}>${esc(c.brand.name)}</span></a>
      <nav class="nav-links" id="nav-links" aria-label="Sections">${links}</nav>
      <div class="nav-right">
        <button type="button" class="acct-btn" data-act="account" aria-label="Your orders, points and settings">${ICON.user}</button>
        <button type="button" class="cart-btn" data-act="cart" aria-label="Open cart">${ICON.bag}<span class="cart-count" hidden>0</span></button>
        <button type="button" class="nav-toggle" data-act="nav" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links">${ICON.menu}</button>
      </div></div>
      ${closure(c) ? `<p class="closed-bar"><strong${ed('closure.title')}>${esc(c.closure.title)}</strong> <span${ed('closure.text')}>${esc(c.closure.text)}</span></p>` : ''}
      ${TABLE && !PREVIEW ? `<p class="table-bar">${ICON.bag}<span>Table ${esc(TABLE)}: add what you like from the menu, then tap the bag to send your order. Pay at the counter when you are done.</span>${pageSections(c).some((x) => x.id === 'menu') ? '' : `<a href="${esc(hrefFor(c, 'menu'))}">Open the menu</a>`}</p>${tableHelpHtml(c)}` : ''}</header>`;
  }
  const SOCIAL_NAMES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', maps: 'Google Maps', viber: 'Viber', website: 'Website', link: 'Link' };
  function footer(c) {
    const bar = c.socialBar || {};
    const wa = bar.whatsapp !== false;
    const links = (c.social || []).filter((s) => s.show !== false && /^https?:\/\//i.test(s.url || ''));
    const icon = (s, cls) => `<a class="${cls} ${cls}--${esc(s.type)}" href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(SOCIAL_NAMES[s.type] || s.type)}">${ICON[s.type] || ICON.link}</a>`;
    const waIcon = (cls) => `<a class="${cls} ${cls}--whatsapp" href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICON.whatsapp}</a>`;
    const soc = links.map((s) => icon(s, 'sl')).join('');
    return `<footer class="foot"><div class="wrap foot-in">
      <a class="brand brand--foot" href="${PAGE === 'home' ? '#hero' : '/'}">${logo(c)}<span>${esc(c.brand.name)}</span></a>
      <p>${ICON.pin}<span>${esc(c.brand.address)}</span></p>
      <p>${ICON.clock}<span>${esc(c.brand.hoursText)}</span></p>
      <div class="soc">${soc}${wa ? waIcon('sl') : ''}</div>
      </div>
      <p class="foot-line">${ICON.heart}<span${ed('footer.line')}>${esc(c.footer.line)}</span></p>
      ${c.footer.note ? `<p class="foot-note"${ed('footer.note')}>${esc(c.footer.note)}</p>` : ''}
      <p class="foot-staff"><button type="button" class="lock-btn" data-act="lock" aria-label="Staff login: tap twice">${ICON.lock}</button></p>
    </footer>
    ${bar.show !== false && (links.length || wa) ? `<div class="float-bar">${links.map((s) => icon(s, 'fb')).join('')}${wa ? waIcon('fb') : ''}</div>` : ''}
    ${dock(c)}
    <button type="button" class="order-pill" data-act="cart" hidden>${ICON.bag}<span></span></button>`;
  }
  // Phones: a bar along the bottom with the main actions and the order, always in reach of a thumb.
  function dock(c) {
    const link = (id, icon, label) => (visible(c, id) ? `<a class="dk" href="${esc(hrefFor(c, id))}">${ICON[icon]}<span>${label}</span></a>` : '');
    return `<nav class="dock" aria-label="Quick actions">
      ${link('menu', 'book', 'Menu')}${link('cake', 'cake', 'Cake')}${link('booking', 'calendar', 'Book')}
      <button type="button" class="dk" data-act="chat">${ICON.chat}<span>Chat</span></button>
      <button type="button" class="dk dk--order" data-act="cart" aria-label="Your order">${ICON.bag}<span class="cart-count" hidden>0</span><span class="dk-text"><span class="dk-label">Order</span><b class="dk-total"></b></span></button>
    </nav>`;
  }
  // WhatsApp, a phone call and the social pages, in one sheet.
  function chatHtml() {
    const c = S.c;
    const links = (c.social || []).filter((x) => x.show !== false && /^https?:\/\//i.test(x.url || ''));
    return `<div class="shade" data-act="close"></div>
      <div class="modal modal--sheet" role="dialog" aria-label="Contact us">
        <header><h2>Talk to us</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICON.x}</button></header>
        <div class="chat-list">
          <a class="chat-row chat-row--whatsapp" href="${esc(waLink(c, 'Hello ' + c.brand.name))}" target="_blank" rel="noopener">${ICON.whatsapp}<span><strong>WhatsApp</strong><small>${esc(c.brand.phone)}</small></span></a>
          <a class="chat-row" href="tel:${esc(digits(c.brand.phone))}">${ICON.phone}<span><strong>Call us</strong><small>${esc(c.brand.hoursText)}</small></span></a>
          ${links.map((x) => `<a class="chat-row chat-row--${esc(x.type)}" href="${esc(x.url)}" target="_blank" rel="noopener">${ICON[x.type] || ICON.link}<span><strong>${esc(SOCIAL_NAMES[x.type] || x.type)}</strong></span></a>`).join('')}
        </div>
      </div>`;
  }
  const googleReviewUrl = () => safeUrl((S.c.reviews || {}).googleLink) || safeUrl(S.c.visit.mapLink);
  // After someone orders, ask for a Google review once they have had time to enjoy it (the same ask for everyone).
  function reviewLater() {
    clearTimeout(reviewLater.t);
    let last = null;
    let asked = 0;
    try { last = JSON.parse(localStorage.getItem('pm_last_order') || 'null'); asked = Number(localStorage.getItem('pm_review_asked')) || 0; } catch (e) { return; }
    if (!last || !last.at || PREVIEW || !googleReviewUrl() || asked > last.at) return;
    const age = Date.now() - last.at;
    const wait = 25 * 60e3;
    if (age > 14 * 864e5) return;
    if (age < wait) { reviewLater.t = setTimeout(reviewLater, wait - age + 1000); return; }
    showGoogleAsk();
  }
  // Also shown as soon as the guest's order is marked done (version 11).
  function showGoogleAsk() {
    let asked = 0;
    try { asked = Number(localStorage.getItem('pm_review_asked')) || 0; } catch (e) { return; }
    if (PREVIEW || !googleReviewUrl() || Date.now() - asked < 7 * 864e5 || $('#g-ask')) return;
    const r = S.c.reviews || {};
    const box = document.createElement('aside');
    box.id = 'g-ask';
    box.className = 'g-ask';
    box.setAttribute('aria-label', 'Review us on Google');
    box.innerHTML = `${ICON.google}<p>${esc(r.googleAsk || 'Enjoyed it? A Google review helps us a lot.')}</p>
      <a class="btn" href="${esc(googleReviewUrl())}" target="_blank" rel="noopener" data-act="review-later"><span>${esc(r.googleButton || 'Review us on Google')}</span></a>
      <button type="button" class="icon-btn" data-act="review-later" aria-label="Not now">${ICON.x}</button>`;
    document.body.appendChild(box);
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
    document.documentElement.classList.toggle('is-closed', Boolean(closure(c)));
    const y = window.scrollY;
    document.documentElement.dataset.page = PAGE;
    $('#app').innerHTML = nav(c) + `<main class="page page--${PAGE}">` + pageSections(c).map((s) => R[s.id](c)).join('') + '</main>' + footer(c);
    initSliders();
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
    startSlides();
    if (PREVIEW) window.scrollTo(0, y);
    navHeight();
  }
  // The top bar is taller when the closed notice or the table bar shows; the menu tabs stick just under it.
  function navHeight() {
    const n = $('.nav');
    if (n) document.documentElement.style.setProperty('--nav-h', n.offsetHeight + 'px');
  }
  window.addEventListener('resize', () => { clearTimeout(navHeight.t); navHeight.t = setTimeout(navHeight, 150); });
  function showSlide(i) {
    const slides = $$('.slide');
    if (!slides.length) return;
    S.slide = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      s.classList.toggle('is-on', n === S.slide); s.setAttribute('aria-hidden', n !== S.slide);
      $$('button, a', s).forEach((b) => b.setAttribute('tabindex', n === S.slide ? '0' : '-1'));
    });
    $$('.dots button').forEach((d, n) => d.classList.toggle('is-on', n === S.slide));
    S.slideMs = 0;
    paintBar();
  }
  // The slideshow runs on a timer, so it also moves on phones with "reduce motion" or battery saver on.
  // It keeps going under the mouse. On phones it waits while a finger holds the photo,
  // and while the page is in the background.
  function paintBar() {
    const box = $('#events .slides');
    const bar = box && $('.slide-bar i', box);
    if (bar) bar.style.width = `${Math.min(100, (S.slideMs / slideLength(box)) * 100)}%`;
  }
  const slideLength = (box) => (parseFloat(box.style.getPropertyValue('--secs')) || 5) * 1000;
  function startSlides() {
    clearInterval(S.slideTimer);
    S.slideMs = 0;
    paintBar();
    const box = $('#events .slides');
    if (!box || Number(box.dataset.n) < 2) return;
    const step = 100;
    S.slideTimer = setInterval(() => {
      const b = $('#events .slides');
      if (!b) { clearInterval(S.slideTimer); return; }
      if (b.classList.contains('is-held') || document.hidden) return;
      S.slideMs += step;
      if (S.slideMs >= slideLength(b)) showSlide(S.slide + 1); else paintBar();
    }, step);
  }

  /* ---------- photo viewer: swipe or use the arrows; download when the album allows it ---------- */
  function lightboxHtml() {
    const { list, i } = S.lb;
    const ph = list[i];
    return `<div class="shade shade--dark" data-act="close"></div><figure class="zoom zoom--lb" role="dialog" aria-label="Photo ${i + 1} of ${list.length}">
      <img src="${esc(ph.src)}" alt="${esc(ph.cap || 'Photo')}" id="lb-img">
      <figcaption>${ph.cap ? `<span>${esc(ph.cap)}</span>` : ''}${list.length > 1 ? `<small>${i + 1} / ${list.length}</small>` : ''}
        ${ph.full ? `<a class="btn btn--small" href="${esc(ph.full)}" download="${esc(ph.name || 'Pick-Me-photo')}">${ICON.download}<span>Download</span></a>` : ''}</figcaption>
      ${list.length > 1 ? `<button type="button" class="icon-btn lb-prev" data-act="lb-step" data-d="-1" aria-label="Previous photo">${ICON.left}</button>
      <button type="button" class="icon-btn lb-next" data-act="lb-step" data-d="1" aria-label="Next photo">${ICON.right}</button>` : ''}
      <button type="button" class="icon-btn lb-close" data-act="close" aria-label="Close photo">${ICON.x}</button></figure>`;
  }
  function openLightbox(list, i) { S.lb = { list, i: Math.max(0, Math.min(list.length - 1, i)) }; openLayer(lightboxHtml()); }
  function stepLightbox(d) {
    if (!S.lb || !$('.zoom--lb')) return;
    S.lb.i = (S.lb.i + d + S.lb.list.length) % S.lb.list.length;
    layer().innerHTML = lightboxHtml();
  }
  let swipeX = null;
  document.addEventListener('touchstart', (e) => { swipeX = e.target.closest && e.target.closest('.zoom--lb') ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (swipeX == null) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
  });
  document.addEventListener('keydown', (e) => { if (!$('.zoom--lb')) return; if (e.key === 'ArrowRight') stepLightbox(1); if (e.key === 'ArrowLeft') stepLightbox(-1); });

  /* ---------- sliding photo rows ---------- */
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function paintSlider(track) {
    const mid = track.scrollLeft + track.clientWidth / 2;
    const half = Math.max(1, track.clientWidth / 2);
    const still = calm();
    $$('.sl-item', track).forEach((it) => {
      const d = Math.min(1, Math.abs(it.offsetLeft + it.offsetWidth / 2 - mid) / half);
      const e = d * d * (3 - 2 * d);
      it.style.setProperty('--s', still ? 1 : (1 - 0.14 * e).toFixed(3));
      it.style.setProperty('--o', still ? 1 : (1 - 0.42 * e).toFixed(3));
      it.style.setProperty('--b', still ? '0px' : `${(1.6 * e).toFixed(2)}px`);
      it.classList.toggle('is-mid', d < 0.2);
    });
    const sl = track.closest('.slider');
    sl.classList.toggle('at-start', track.scrollLeft < 4);
    sl.classList.toggle('at-end', track.scrollLeft + track.clientWidth > track.scrollWidth - 4);
  }
  function initSliders() {
    $$('.sl-track').forEach((track) => {
      if (track.dataset.ready) return;
      track.dataset.ready = '1';
      let raf = 0;
      const paint = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => paintSlider(track)); };
      track.addEventListener('scroll', paint, { passive: true });
      window.addEventListener('resize', paint);
      $$('img', track).forEach((im) => im.addEventListener('load', paint, { once: true }));
      paint();
      // Mouse: drag to slide. Wheel: slides sideways until the row ends, then the page scrolls on.
      let drag = null;
      track.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; drag = { x: e.clientX, left: track.scrollLeft, moved: false }; track.classList.add('is-drag'); });
      window.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; track.scrollLeft = drag.left - dx; });
      window.addEventListener('pointerup', () => {
        if (!drag) return;
        const moved = drag.moved;
        drag = null;
        track.classList.remove('is-drag');
        if (moved) { track.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true }); snapNearest(track); }
      });
      track.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || S.layout) return;
        const atStart = track.scrollLeft <= 0 && e.deltaY < 0;
        const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1 && e.deltaY > 0;
        if (atStart || atEnd) return;
        e.preventDefault();
        track.scrollBy({ left: e.deltaY, behavior: 'auto' });
        clearTimeout(track.snapT);
        track.snapT = setTimeout(() => snapNearest(track), 160);
      }, { passive: false });
    });
  }
  function snapNearest(track) {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = null;
    $$('.sl-item', track).forEach((it) => { const d = Math.abs(it.offsetLeft + it.offsetWidth / 2 - mid); if (!best || d < best.d) best = { d, it }; });
    if (best) track.scrollTo({ left: best.it.offsetLeft + best.it.offsetWidth / 2 - track.clientWidth / 2, behavior: calm() ? 'auto' : 'smooth' });
  }

  /* ---------- event page: photos, message and special menu ---------- */
  function openEvent(id) {
    const c = S.c;
    const i = (c.events.items || []).findIndex((e) => e.id === id);
    if (i < 0) return;
    const e = c.events.items[i];
    const items = (e.menu || []).map((it, ii) => (it.hidden ? '' : itemHtml(it, `events.items.${i}.menu.${ii}`, true))).join('');
    const shots = eventPhotos(e);
    const photos = shots.slice(1).map((p) => `<figure class="ev-photo">${deco(pic(p.image, p.caption || e.title, 'ev-pic'), siteBorder(c), 'deco--ev')}${p.caption || p.text ? `<figcaption>${p.caption ? `<b>${esc(p.caption)}</b>` : ''}${p.text ? `<small>${esc(p.text)}</small>` : ''}</figcaption>` : ''}</figure>`).join('');
    openLayer(`<div class="shade" data-act="close"></div>
      <div class="modal modal--event" role="dialog" aria-label="${esc(e.title)}">
        <button type="button" class="icon-btn ev-close" data-act="close" aria-label="Close">${ICON.x}</button>
        <div class="ev-hero">${shots[0] ? pic(shots[0].image, shots[0].caption || e.title, 'ev-hero-pic') : ''}
          <div class="ev-hero-text">${e.tag ? `<span class="tag">${esc(e.tag)}</span>` : ''}<h2>${esc(e.title)}</h2>${e.text ? `<p>${esc(e.text)}</p>` : ''}</div></div>
        ${e.message ? `<p class="ev-message">${esc(e.message)}</p>` : ''}
        ${photos ? `<div class="ev-photos">${photos}</div>` : ''}
        ${items ? `<h3 class="ev-h">${esc(e.menuTitle || 'Specials')}</h3><div class="menu-cards ev-menu">${items}</div>` : ''}
        <div class="row row--center ev-foot">
          ${items ? `<button type="button" class="btn" data-act="cart"><span>See my order</span>${ICON.arrow}</button>` : ''}
          ${PREVIEW ? '' : `<button type="button" class="btn btn--ghost" data-act="share" data-id="${esc(e.id)}">${ICON.share}<span>Share</span></button>`}
          ${safeUrl(e.link) ? `<a class="btn btn--ghost" href="${esc(e.link)}" data-act="close"><span>${esc(e.button || 'More')}</span>${ICON.arrow}</a>` : ''}
          <button type="button" class="btn btn--ghost" data-act="close"><span>Close</span></button>
        </div>
      </div>`);
  }
  // Staff and owner login, opened by tapping the little lock in the footer twice.
  // First a choice (Staff / counter or Admin), then the matching form: Admin asks for the password only.
  function openStaffLogin(kind) {
    const head = `<div class="shade" data-act="close"></div>
      <div class="modal modal--login" role="dialog" aria-label="Staff login">
        <button type="button" class="icon-btn ev-close" data-act="close" aria-label="Close">${ICON.x}</button>
        <span class="login-badge">${ICON.lock}</span>`;
    if (!kind) {
      openLayer(`${head}
        <h2>Who is signing in?</h2>
        <div class="login-pick">
          <button type="button" class="btn btn--ghost" data-act="loginkind" data-id="staff"><span>Staff / counter</span></button>
          <button type="button" class="btn btn--ghost" data-act="loginkind" data-id="admin"><span>Admin</span></button>
        </div>
      </div>`);
      return;
    }
    const staff = kind === 'staff';
    openLayer(`${head}
        <h2>${staff ? 'Staff / counter' : 'Admin'}</h2>
        <form data-form="login" class="login-form">
          ${staff ? '<label class="f"><span>Login ID</span><input name="username" required autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="40" autofocus></label>' : ''}
          <label class="f"><span>Password</span><input name="password" type="password" required autocomplete="current-password"${staff ? '' : ' autofocus'}></label>
          <label class="login-keep"><input type="checkbox" name="remember" checked><span>Keep me signed in on this device</span></label>
          <p class="form-msg" role="status"></p>
          <button type="submit" class="btn">${ICON.lock}<span>Log in</span></button>
          <button type="button" class="link-btn login-back" data-act="loginkind" data-id=""><span>Back</span></button>
        </form>
      </div>`);
  }
  function showClosedNotice() {
    const k = closure(S.c);
    if (!k || PREVIEW) return;
    try { if (sessionStorage.getItem('pm_closed_seen') === (k.title + k.text)) return; sessionStorage.setItem('pm_closed_seen', k.title + k.text); } catch (e) { /* no storage */ }
    openLayer(`<div class="shade" data-act="close"></div>
      <div class="modal modal--done modal--closed" role="dialog" aria-label="${esc(k.title)}">
        ${safeUrl(k.image) ? pic(k.image, k.title, 'closed-pic') : ''}
        <h2>${esc(k.title)}</h2><p>${esc(k.text)}</p>
        ${k.allowLater ? '<p class="hint">You can still order or book for a later day.</p>' : ''}
        <button type="button" class="btn" data-act="close"><span>Okay</span></button>
      </div>`);
  }

  /* ---------- cart drawer and checkout ---------- */
  const layer = () => $('#layer');
  /* The phone's Back button (26 Nov 2026). Every overlay (item options, your order, checkout, account, an event,
     photos, the payment QR, the delivery map) adds a step to the browser history, so Back closes it or goes one
     step back (checkout -> your order -> the page) instead of leaving the page for the home page. */
  const NAV = { stack: [], skip: 0 };
  function navPush(tag, undo) {
    NAV.stack.push({ tag, undo });
    try { history.pushState({ pm: NAV.stack.length }, ''); } catch (e) { /* very old browser */ }
  }
  const navTop = () => NAV.stack[NAV.stack.length - 1];
  // The page closed everything itself (Close, Escape, an order sent): take our steps out of the history again.
  function navDropAll() {
    const n = NAV.stack.length;
    NAV.stack = [];
    if (n) { NAV.skip += 1; history.go(-n); }
  }
  // A Back-like button inside an overlay: use the history step if there is one, so both stay in line.
  function navBack(tag) { const t = navTop(); if (t && (!tag || t.tag === tag)) { history.back(); return true; } return false; }
  window.addEventListener('popstate', (e) => {
    if (NAV.skip) { NAV.skip -= 1; return; }
    const t = NAV.stack.pop();
    if (t) { t.undo(); return; }
    // A step left over from before a reload (for example after the payment app): skip it.
    if (e.state && e.state.pm) history.back();
  });
  function closeLayerRaw() { if ($('form[data-form=checkout]', layer())) saveDraft(false); closeQrRaw(); if (typeof closeMapRaw === 'function') closeMapRaw(); layer().innerHTML = ''; document.body.classList.remove('lock'); }
  function closeLayer() { closeLayerRaw(); navDropAll(); }
  // opts.same: the same view drawn again (no history step). opts.back: how to draw the view Back returns to
  // (default: the view on screen now). opts.reset: a final screen (order sent): Back closes it.
  function openLayer(html, opts) {
    const o = opts || {};
    const t = $('#toast');
    if (t) t.classList.remove('is-on');
    const before = layer().innerHTML;
    const wasOpen = Boolean(before.trim());
    const acct = wasOpen && $('.modal--acct', layer()) ? A.view : null;
    if (wasOpen && $('form[data-form=checkout]', layer())) saveDraft(false);
    layer().innerHTML = html;
    document.body.classList.add('lock');
    if (!wasOpen) navPush('layer', closeLayerRaw);
    else if (o.reset) NAV.stack.forEach((x) => { if (x.tag !== 'layer') { x.tag = 'skip'; x.undo = () => history.back(); } });
    else if (!o.same) navPush('step', o.back || (acct ? () => openAccount(acct, { same: true }) : () => openLayer(before, { same: true })));
    const f = $('[autofocus], button, input', layer());
    if (f) f.focus();
  }
  const extrasLine = (l) => (l.extraNames && l.extraNames.length ? ` · ${l.extraNames.map(esc).join(', ')}` : '');
  // "Goes well with": items from the paired menu groups that are not in the cart yet.
  function upsellHtml(lines) {
    const u = S.c.upsell || {};
    if (u.show === false || !lines.length) return '';
    const have = new Set(lines.map((l) => l.group));
    const inCart = new Set(lines.map((l) => l.itemId));
    const want = [];
    for (const p of u.pairs || []) if (have.has(p.from) && !have.has(p.to) && !want.includes(p.to)) want.push(p.to);
    const picks = [];
    for (const gid of want) {
      const g = (S.c.menu.categories || []).find((x) => x.id === gid);
      if (!g || g.hidden) continue;
      const items = (g.items || []).filter((it) => !it.hidden && it.available !== false && !inCart.has(it.id) && servedNow(hoursOf(it, g)) && (it.prices || []).some((p) => !p.whole && Number(p.price) > 0));
      items.sort((a, b) => Number(Boolean(b.badge)) - Number(Boolean(a.badge)));
      for (const it of items.slice(0, 3)) if (picks.length < 4) picks.push(it);
    }
    if (!picks.length) return '';
    return `<section class="upsell" aria-label="${esc(u.title)}"><h3>${esc(u.title || 'Goes well with your order')}</h3><div class="up-row">${picks.map((it) => {
      const p = it.prices.find((x) => !x.whole && Number(x.price) > 0);
      return `<article class="up">${pic(it.image, it.name, 'up-pic')}<strong>${esc(it.name)}</strong>
        <button type="button" class="pchip" data-act="add" data-item="${esc(it.id)}" data-label="${esc(p.label || '')}" aria-label="Add ${esc(it.name)}, ${rs(p.price)}">${p.label ? `<span>${esc(p.label)}</span>` : ''}<b>${rs(p.price)}</b><i aria-hidden="true">+</i></button></article>`;
    }).join('')}</div></section>`;
  }
  function cartHtml() {
    const lines = cartLines();
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
    return `<div class="shade" data-act="close"></div>
      <aside class="drawer" role="dialog" aria-label="Your order">
        <header><h2>Your order</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICON.x}</button></header>
        ${lines.length ? `<div class="drawer-scroll"><ul class="lines">${lines.map((l) => `<li>
            <div><strong>${esc(l.name)}</strong><small>${l.label ? esc(l.label) + ' · ' : ''}${rs(l.price)}${extrasLine(l)}</small></div>
            <div class="qty"><button type="button" data-act="qty" data-key="${esc(l.key)}" data-d="-1" aria-label="One less ${esc(l.name)}">−</button><span>${l.qty}</span><button type="button" data-act="qty" data-key="${esc(l.key)}" data-d="1" aria-label="One more ${esc(l.name)}">+</button></div>
            <b>${rs(l.price * l.qty)}</b></li>`).join('')}</ul>
          ${upsellHtml(lines)}</div>
          <footer><p class="sum"><span>Subtotal</span><b>${rs(total)}</b></p>
            <p class="hint">For delivery (inside Hetauda) a delivery charge of <b>${rs(S.c.payment.deliveryFee)}</b> is added.</p>
            <button type="button" class="btn" data-act="checkout"><span>Continue to order</span>${ICON.arrow}</button>
            <button type="button" class="btn btn--ghost" data-act="close"><span>Keep browsing</span></button></footer>`
        : `<p class="empty">Your order is empty. Add something from the menu.</p>
          <footer><a class="btn" href="${esc(hrefFor(S.c, 'menu'))}" data-act="close"><span>See the menu</span>${ICON.arrow}</a></footer>`}
      </aside>`;
  }
  // Extras for one item: tick what you like, choose how many, add.
  function openExtras(itemId, label, back) {
    const f = findPrice(itemId, label);
    if (!f) return;
    const opts = extrasOf(f.group);
    const base = Number(f.price.price);
    openLayer(`<div class="shade" data-act="close"></div>
      <div class="modal modal--sheet" role="dialog" aria-label="${esc(f.item.name)}">
        <header><h2>${esc(f.item.name)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICON.x}</button></header>
        <form class="xform" data-form="extras" data-item="${esc(itemId)}" data-label="${esc(label)}" data-back="${back ? 'cart' : ''}" novalidate>
          <p class="muted">${label ? esc(label) + ' · ' : ''}${rs(base)}</p>
          <fieldset class="xopts"><legend>${esc((S.c.extras || {}).title || 'Make it yours')} <small>(optional)</small></legend>
            ${opts.map((o) => `<label class="copt"><input type="checkbox" name="x" value="${esc(o.id)}" data-price="${Number(o.price) || 0}"><span><strong>${esc(o.name)}</strong></span><b>${Number(o.price) > 0 ? '+' + rs(o.price) : ''}</b></label>`).join('')}
          </fieldset>
          <div class="xfoot">
            <div class="qty"><button type="button" data-step="-1" aria-label="One less">−</button><span id="x-qty">1</span><button type="button" data-step="1" aria-label="One more">+</button></div>
            <button class="btn" type="submit"><span>Add</span><b id="x-total" data-base="${base}">${rs(base)}</b></button>
          </div>
          <p class="form-msg" role="alert"></p>
        </form>
      </div>`, back ? { back: () => openLayer(cartHtml(), { same: true }) } : undefined);
  }
  function extrasTotal() {
    const t = $('#x-total');
    if (!t) return;
    const qty = Number($('#x-qty').textContent) || 1;
    const add = $$('input[name=x]:checked', layer()).reduce((sum, el) => sum + Number(el.dataset.price || 0), 0);
    t.textContent = rs((Number(t.dataset.base) + add) * qty);
  }
  function sumHtml(type) {
    const lines = cartLines();
    const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const fee = type === 'delivery' ? Number(S.c.payment.deliveryFee) || 0 : 0;
    return `<ul class="lines lines--mini">${lines.map((l) => `<li><div><strong>${l.qty} × ${esc(l.name)}</strong>${l.label || l.extraNames.length ? `<small>${esc(l.label)}${l.label && l.extraNames.length ? ' · ' : ''}${l.extraNames.map(esc).join(', ')}</small>` : ''}</div><b>${rs(l.price * l.qty)}</b></li>`).join('')}
      ${lines.length > 1 || fee || S.coPts ? `<li class="sub"><div><strong>Subtotal</strong></div><b>${rs(sub)}</b></li>` : ''}
      ${fee ? `<li><div><strong>Delivery charge</strong></div><b>+${rs(fee)}</b></li>` : ''}
      ${S.coPts ? `<li><div><strong>Points</strong></div><b>−${rs(S.coPts)}</b></li>` : ''}</ul>
      <p class="sum sum--big"><span>Total to pay</span><b id="co-total">${rs(Math.max(0, sub + fee - (S.coPts || 0)))}</b></p>`;
  }
  // The QR in checkout. A tap makes it fill the screen, with the steps and the amount under it.
  function qrHtml(method) {
    const p = S.c.payment[method] || {};
    return `${safeUrl(p.qr) ? `<button type="button" class="qr-btn" data-act="qrbig" data-id="${esc(method)}" aria-label="Show the ${esc(p.name)} QR code full screen"><img class="qr" src="${esc(safeUrl(p.qr))}" alt="${esc(p.name)} QR code"><span>Tap the QR to make it big</span></button>` : `<div class="qr qr--empty">The ${esc(p.name)} QR code has not been added yet.</div>`}
      ${p.account ? `<p class="hint">${esc(p.account)}</p>` : ''}`;
  }
  const payTotal = () => { const t = $('#co-total'); return t ? t.textContent.trim() : ''; };
  const paySteps = (name, amount) => `<ol class="pay-steps">
      <li>Take a screenshot of this QR.</li>
      <li>Open ${name ? `${esc(name)}, ` : ''}eSewa, Fonepay or your bank app and scan the QR from your screenshot.</li>
      <li>Pay <b>${esc(amount)}</b>.</li>
      <li>Come back to this page with the payment screenshot and send your order.</li>
    </ol>
    <p class="pay-call">Whether you add the screenshot or not, we will call you on your phone number to confirm the payment.</p>`;
  function openQrFull(method) {
    const p = S.c.payment[method] || {};
    if (!safeUrl(p.qr)) return;
    closeQrRaw();
    const box = document.createElement('div');
    box.id = 'qr-full';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', `${p.name || 'Payment'} QR code`);
    box.innerHTML = `<div class="qrf-in">
        <p class="qrf-name">${esc(p.name || 'Pay')}${p.account ? ` · ${esc(p.account)}` : ''}</p>
        <img src="${esc(safeUrl(p.qr))}" alt="${esc(p.name)} QR code">
        <p class="qrf-amount">Amount to pay <b>${esc(payTotal())}</b></p>
        ${paySteps('', payTotal())}
        <button type="button" class="btn" data-act="qrclose"><span>Back to my order</span></button>
      </div>`;
    document.body.appendChild(box);
    navPush('qr', closeQrRaw);
    $('button', box).focus();
  }
  function closeQrRaw() { const b = $('#qr-full'); if (b) b.remove(); }
  function closeQrFull() { if (!navBack('qr')) closeQrRaw(); }
  // What the guest typed at checkout is kept for this visit, so it survives a trip to the payment app
  // (phones often reload the page on the way back).
  const DRAFT = 'pm_checkout';
  const DRAFT_KEYS = ['type', 'phone', 'name', 'address', 'tableNo', 'notes', 'method', 'txn', 'when', 'change'];
  function saveDraft(open) {
    const f = $('form[data-form=checkout]');
    try {
      if (!f) { if (open === false) sessionStorage.removeItem(DRAFT); return; }
      const d = { open: open !== false };
      for (const k of DRAFT_KEYS) { const el = f.elements[k]; if (el) d[k] = el.value; }
      for (const k of ['type', 'method', 'when']) { const on = $(`input[name=${k}]:checked`, f); if (on) d[k] = on.value; }
      sessionStorage.setItem(DRAFT, JSON.stringify(d));
    } catch (e) { /* no storage */ }
  }
  function readDraft() { try { return JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch (e) { return null; } }
  function dropDraft() { try { sessionStorage.removeItem(DRAFT); } catch (e) { /* no storage */ } }
  function restoreDraft(d) {
    const f = $('form[data-form=checkout]');
    if (!f || !d) return;
    for (const k of ['type', 'when', 'method']) {
      const el = d[k] && $(`input[name=${k}][value="${String(d[k]).replace(/"/g, '')}"]`, f);
      if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    for (const k of ['phone', 'name', 'address', 'tableNo', 'notes', 'txn', 'change']) { const el = f.elements[k]; if (el && d[k] && !(k === 'tableNo' && TABLE)) el.value = d[k]; }
  }
  function checkoutHtml() {
    const c = S.c;
    const lines = cartLines();
    const hasWhole = lines.some((l) => l.whole);
    const pre = S.preset || {};
    // Every order starts as: at the cafe, now, pay later (a cake pre-order keeps its own choices).
    const type = TABLE ? 'dinein' : (pre.type || 'dinein');
    const later = hasWhole || (!TABLE && pre.when === 'later') || !isOpen(c);
    const notice = Math.max(Number(c.cake.noticeHours) || 0, ...lines.map((l) => l.notice || 0));
    const wantsPhoto = lines.some((l) => l.photo);
    const slot = pre.date ? { date: pre.date, time: pre.time } : nextSlot(c, hasWhole ? notice : 0.5);
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
          <label class="f" id="co-table"${type === 'dinein' ? '' : ' hidden'}><span>${TABLE ? 'Table number <small>(from the QR on your table)</small>' : 'Table number (optional)'}</span><input name="tableNo" id="co-tableno" maxlength="20" value="${esc(TABLE)}" inputmode="numeric"${TABLE ? ' class="is-table"' : ''}></label>
          <label class="f"><span id="co-phone-label">${phoneNeeded ? 'Phone' : 'Phone (optional)'}</span><input name="phone" id="co-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="98XXXXXXXX"${phoneNeeded ? ' required' : ''}></label>
          <label class="f"><span>Your name (optional)</span><input name="name" id="co-name" autocomplete="name" maxlength="80"></label>
          <label class="f f--wide" id="co-addr"${type === 'delivery' ? '' : ' hidden'}><span>Delivery address (optional, we will call if it is missing)</span><textarea name="address" id="co-address" rows="2" maxlength="300" placeholder="Tole, landmark, ward"></textarea><small class="hint">${esc(c.payment.deliveryNote)}</small></label>
          <div class="f f--wide" id="co-pin-wrap"${type === 'delivery' ? '' : ' hidden'}><p class="deliv-fee">${ICON.pin}<span><b>Delivery charge ${rs(c.payment.deliveryFee)}</b>, added to your total. ${esc(c.payment.deliveryNote || 'Inside Hetauda only.')}</span></p><div id="co-pin"></div></div>
          <fieldset class="f f--wide seg"><legend>When?</legend>
            ${hasWhole ? '' : `<input type="radio" name="when" id="co-now" value="now"${later ? '' : ' checked'}><label for="co-now">Now</label>`}
            <input type="radio" name="when" id="co-later" value="later"${later ? ' checked' : ''}><label for="co-later">Later</label>
          </fieldset>
          <div class="f--wide grid2" id="co-when"${later ? '' : ' hidden'}>
            <div class="f"><span>Date</span><div data-bsp="date" data-value="${slot.date}"></div></div>
            <label class="f"><span>Time</span><select name="time" id="co-time">${timeOptions(c, slot.time)}</select></label>
            ${hasWhole ? `<p class="hint f--wide">This cake needs at least ${notice} hours notice.</p>` : (!isOpen(c) ? `<p class="hint f--wide">We are closed right now, so please pick a time (${esc(c.brand.hoursText)}).</p>` : '')}
          </div>
          ${hasWhole ? `<label class="f"><span>Name or message on the cake (optional)</span><input name="cakeMessage" id="co-cake" maxlength="120" value="${esc(pre.cakeMessage || '')}"></label>
            <label class="f"><span>Occasion (optional)</span><input name="occasion" id="co-occasion" maxlength="80" value="${esc(pre.occasion || '')}"></label>
            ${(pre.refPhoto || S.cakePhoto) && !wantsPhoto ? '<p class="hint f--wide pin-set" id="co-ref-done">✓ Your cake photo is added. We will make one like it. <button type="button" class="link-btn" data-act="cake-photo-clear">Remove</button></p>' : ''}
            <label class="f f--wide"${(pre.refPhoto || S.cakePhoto) && !wantsPhoto ? ' hidden' : ''}><span>${wantsPhoto ? 'Photo to print on the cake' : 'Photo of a cake you like (downloaded or made with AI), optional: we make one like it'}</span><input type="file" name="ref" id="co-ref" accept="image/png,image/jpeg,image/webp"></label>` : ''}
          <label class="f f--wide"><span>Notes for us (optional)</span><textarea name="notes" id="co-notes" rows="2" maxlength="500" placeholder="Less sugar, extra ice"></textarea></label>
          <div class="f--wide" id="co-points"></div>
          <fieldset class="f f--wide seg"><legend>Payment</legend>
            <input type="radio" name="method" id="co-later-pay" value="later" checked><label for="co-later-pay">Pay later</label>
            <input type="radio" name="method" id="co-cod" value="cod" hidden><label for="co-cod" hidden>Cash on delivery</label>
            ${methods.map((m) => `<input type="radio" name="method" id="co-${m}" value="${m}"><label for="co-${m}">Pay now with ${esc(c.payment[m].name)}</label>`).join('')}
          </fieldset>
          <label class="f" id="co-change" hidden><span>Bring change for (optional)</span><select name="change" id="co-change-sel"><option value="0">No change needed</option><option value="500">A Rs. 500 note</option><option value="1000">A Rs. 1000 note</option></select></label>
          <p class="hint f--wide" id="co-later-note">Pay at the counter, or when your order arrives.</p>
          <div class="f--wide pay" id="co-pay" hidden>
            <div id="co-qr"></div>
            <div><div id="co-steps"></div>
              <label class="f"><span>Payment screenshot</span><input type="file" name="proof" id="co-proof" accept="image/png,image/jpeg,image/webp"></label>
              <label class="f"><span>Or the transaction code (optional)</span><input name="txn" id="co-txn" maxlength="60" placeholder="e.g. 000ABC9"></label></div>
          </div>
          <p class="form-msg f--wide" role="alert"></p>
          <button class="btn f--wide" type="submit"><span>Send order</span>${ICON.arrow}</button>
        </form>
      </div>`;
  }
  function openCheckout() {
    if (!cartLines().length) return toast('Your cart is empty.');
    const fromCart = Boolean($('.drawer', layer()));
    openLayer(checkoutHtml(), fromCart ? { back: () => openLayer(cartHtml(), { same: true }) } : undefined);
    const pre = S.preset || {};
    $$('[data-bsp]', layer()).forEach((el) => BS.mount(el, { name: el.dataset.bsp, value: pre.date || el.dataset.value }));
    restoreDraft(readDraft());
    fillKnown();
    try { S.coLoc = S.coLoc || JSON.parse(sessionStorage.getItem('pm_pin') || 'null'); } catch (e) { /* no storage */ }
    paintPin();
    paintPay($('form[data-form=checkout]'));
    saveDraft(true);
  }
  function doneHtml(title, lines, text) {
    return `<div class="shade" data-act="close"></div>
      <div class="modal modal--done" role="dialog" aria-label="${esc(title)}">
        <p class="script">Thank you</p><h2>${esc(title)}</h2>
        ${lines.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}
        ${myOrders().length && FEATURE('liveStatus') && !PREVIEW ? `<button type="button" class="btn" data-act="account" data-id="orders"><span>Follow my order</span>${ICON.arrow}</button>` : ''}
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
    async login(d) {
      const r = await post('/api/auth/login', { username: (d.username || '').trim(), password: d.password || '', remember: Boolean(d.remember) });
      location.href = r.role === 'driver' ? '/driver' : r.role === 'staff' ? '/counter' : '/admin';
      return 'Signed in. Opening...';
    },
    extras(d, form) {
      const qty = Math.max(1, Math.min(50, Number($('#x-qty').textContent) || 1));
      const ids = $$('input[name=x]:checked', form).map((el) => el.value);
      addToCart(form.dataset.item, form.dataset.label, qty, false, ids);
      const f = findPrice(form.dataset.item, form.dataset.label);
      // Back to where the guest came from (your order, or an event), or close.
      if (!navBack('step')) closeLayer();
      toast(`${f ? f.item.name : 'Item'} added to your order`);
      bump();
    },
    cake(d, form) {
      if (!d.cakeId || d.size === undefined) throw new Error('Please choose a cake and a size.');
      if (!d.date || !d.time) throw new Error('Please choose a date and time.');
      const opts = $$('input[name=opt]:checked', form).map((el) => el.value);
      addToCart(d.cakeId, d.size, Math.max(1, Math.min(20, Number(d.qty) || 1)), true, opts);
      S.preset = { when: 'later', type: 'pickup', date: d.date, time: d.time, cakeMessage: d.cakeMessage, occasion: d.occasion, refPhoto: S.cakePhoto || '' };
      openCheckout();
    },
    async booking(d, form) {
      if (!d.date || !d.time) throw new Error('Please choose a date and time.');
      const res = await post('/api/bookings', { name: d.name, phone: d.phone, people: d.people, date: d.date, dateBs: d.dateBs, time: d.time, seating: d.seating, food: d.food, cakeName: d.cakeName, decoration: d.decoration, remarks: d.remarks });
      form.reset();
      render();
      openLayer(doneHtml('Booking request sent', [`Your booking number is ${res.id}.`, 'We will call or message you to confirm your table.'], res.text), { reset: true });
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
      const payNow = d.method && !['later', 'cod'].includes(d.method);
      const file = payNow ? form.elements.proof.files[0] : null;
      if (d.type !== 'dinein' && !String(d.phone || '').trim()) throw new Error('Please enter your phone number so we can reach you.');
      if (payNow && !String(d.phone || '').trim()) { const ph = $('#co-phone'); if (ph) ph.focus(); throw new Error('Please enter your phone number: we call you to confirm the payment.'); }
      if (d.when === 'later' && (!d.date || !d.time)) throw new Error('Please choose a date and time.');
      const cartSnapshot = cartLines();
      const proof = await sendPicture(file);
      const picked = form.elements.ref && form.elements.ref.files[0];
      const refPhoto = picked ? await sendPicture(picked) : ((S.preset && S.preset.refPhoto) || S.cakePhoto || '');
      const res = await post('/api/orders', {
        name: d.name, phone: d.phone, type: d.type, address: d.address, tableNo: d.tableNo, when: d.when, date: d.date, dateBs: d.dateBs, time: d.time,
        cakeMessage: d.cakeMessage, occasion: d.occasion, refPhoto, notes: d.notes, method: d.method, proof, txn: payNow ? d.txn : '',
        location: d.type === 'delivery' && S.coLoc ? S.coLoc : null, change: d.method === 'cod' ? Number(d.change) || 0 : 0,
        device: DEVICE, usePoints: form.elements.usePoints && form.elements.usePoints.checked ? Number(form.elements.usePoints.value) || 0 : 0,
        lines: cartLines().map((l) => ({ itemId: l.itemId, label: l.label, qty: l.qty, extras: l.extras })),
      });
      S.cart = [];
      S.preset = null;
      saveCart();
      dropDraft();
      try { localStorage.setItem('pm_last_order', JSON.stringify({ id: res.id, at: Date.now(), item: (cartSnapshot[0] || {}).name || '' })); } catch (e) { /* no storage */ }
      rememberOrder(res);
      S.coLoc = null; S.cakePhoto = '';
      try { sessionStorage.removeItem('pm_pin'); } catch (e) { /* no storage */ }
      if (normPhone(d.phone)) store.set('pm_phone', normPhone(d.phone));
      S.coPts = 0;
      startLive();
      if (signedIn()) loadAccount();
      reviewLater();
      const atCafe = d.type === 'dinein';
      const L = LY();
      const earn = pointsOn() && normPhone(d.phone) ? Math.floor((cartSnapshot.reduce((s, l) => s + l.price * l.qty, 0) - ((res.points && res.points.used) || 0)) * (Number(L.percent) || 0) / 100 / (Number(L.rupeesPerPoint) || 1)) : 0;
      openLayer(doneHtml(atCafe ? 'Your order is in' : 'Order received', [
        `Your order number is ${res.id}. Total ${rs(res.total)}.`,
        res.points && res.points.asked && !res.points.used ? `Staff will take your ${res.points.asked} points off at the counter.` : '',
        earn > 0 ? `You get ${earn} points when it is done.` : '',
        payNow ? `We will call you on ${d.phone} to confirm your payment, then ${atCafe ? 'bring your order to you' : 'start your order'}.` : (atCafe ? 'We are preparing it and will bring it to you.' : 'We will call you if anything is unclear. You can pay later.'),
      ], atCafe ? '' : res.text), { reset: true });
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
    if (e.target.id === 'cake-flavour') { $('#cake-sizes').innerHTML = `<legend>Size</legend>${sizeChoices(wholeCakes(S.c).find((x) => x.id === e.target.value))}`; showCakePhoto(e.target.value); }
    if (e.target.closest('form[data-form=cake]')) cakeTotal();
    const form = e.target.closest('form[data-form=checkout]');
    if (!form) return;
    if (e.target.name === 'type') {
      const t = e.target.value;
      $('#co-sum').innerHTML = sumHtml(t);
      $('#co-addr').hidden = t !== 'delivery';
      $('#co-table').hidden = t !== 'dinein';
      paintPay(form);
      phoneRule(form);
      const m = $('input[name=method]:checked', form);
      if (m && !['later', 'cod'].includes(m.value)) $('#co-steps').innerHTML = paySteps('', payTotal());
    }
    if (e.target.name === 'when') $('#co-when').hidden = e.target.value !== 'later';
    if (e.target.name === 'method') {
      const now = !['later', 'cod'].includes(e.target.value);
      paintPay(form);
      $('#co-pay').hidden = !now;
      $('#co-later-note').hidden = now;
      if (now) { $('#co-qr').innerHTML = qrHtml(e.target.value); $('#co-steps').innerHTML = paySteps('', payTotal()); }
      phoneRule(form);
    }
    saveDraft(true);
  });
  // A phone number is needed for pickup and delivery, and whenever the guest pays now (we call to confirm).
  function phoneRule(form) {
    const t = ($('input[name=type]:checked', form) || {}).value;
    const m = ($('input[name=method]:checked', form) || {}).value;
    const payNow = m && !['later', 'cod'].includes(m);
    const need = t !== 'dinein' || payNow;
    $('#co-phone').required = need;
    $('#co-phone-label').textContent = need ? (payNow ? 'Phone (we call to confirm the payment)' : 'Phone') : 'Phone (optional)';
  }
  let searchTimer = null;
  document.addEventListener('input', (e) => {
    if (e.target.id === 'cake-qty') cakeTotal();
    if (e.target.id === 'menu-q') { S.q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(redrawMenu, 120); }
    if (e.target.name === 'x') extrasTotal();
    if (e.target.closest && e.target.closest('form[data-form=checkout]')) saveDraft(true);
    const el = S.inline && e.target.closest && e.target.closest('[data-edit]');
    if (el) window.parent.postMessage({ pm: 'edit', path: el.dataset.edit, value: el.textContent.replace(/\s*\n\s*/g, ' ').trim() }, location.origin);
  });

  /* ---------- clicks ---------- */
  const ACT = {
    // A single tap does nothing; two taps close together open the login.
    lock() {
      const now = Date.now();
      if (now - (S.lockTap || 0) < 450) { S.lockTap = 0; openStaffLogin(); } else S.lockTap = now;
    },
    loginkind(el) { if (!el.dataset.id && navBack('step')) return; openStaffLogin(el.dataset.id || ''); },
    qrbig(el) { openQrFull(el.dataset.id); },
    qrclose() { closeQrFull(); },
    tab(el) {
      S.tab = el.dataset.id;
      const swap = () => redrawMenu();
      if (document.startViewTransition && document.documentElement.classList.contains('anim')) document.startViewTransition(swap);
      else swap();
    },
    cat(el) {
      if (S.c.menu.categories.some((x) => x.id === el.dataset.id)) { S.tab = el.dataset.id; S.q = ''; const q = $('#menu-q'); if (q) q.value = ''; redrawMenu(); }
    },
    add(el) {
      const f = findPrice(el.dataset.item, el.dataset.label);
      if (!f) return;
      const inCart = Boolean(el.closest('.drawer'));
      if (extrasOf(f.group).length) return openExtras(el.dataset.item, el.dataset.label, inCart);
      addToCart(el.dataset.item, el.dataset.label, 1);
      if (inCart) openLayer(cartHtml(), { same: true });
      toast(`${f.item.name} added to your order`);
      bump();
    },
    filter(el) {
      S.filter = S.filter === el.dataset.id ? '' : el.dataset.id;
      $$('.mfilter').forEach((b) => { const on = b.dataset.id === S.filter; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
      redrawMenu();
    },
    chat() { openLayer(chatHtml()); },
    share(el) {
      const e = (S.c.events.items || []).find((x) => x.id === el.dataset.id);
      if (!e) return;
      const url = `${location.origin}/event/${encodeURIComponent(e.id)}`;
      if (navigator.share) navigator.share({ title: e.title, text: e.text || e.message || '', url }).catch(() => {});
      else window.open(`https://wa.me/?text=${encodeURIComponent(`${e.title}\n${url}`)}`, '_blank', 'noopener');
    },
    'review-later'() { try { localStorage.setItem('pm_review_asked', String(Date.now())); } catch (e) { /* no storage */ } const b = $('#g-ask'); if (b) b.remove(); },
    event(el) { openEvent(el.dataset.id); },
    cake(el) {
      const form = $('form[data-form=cake]');
      const sel = form && form.elements.cakeId;
      if (!sel || !Array.from(sel.options).some((o) => o.value === el.dataset.item)) {
        // Order a Cake is on another page: open it with this cake picked.
        if (!$('#cake') && visible(S.c, 'cake')) {
          const u = new URL(hrefFor(S.c, 'cake'), location.href);
          u.searchParams.set('pick', el.dataset.item);
          u.searchParams.set('size', el.dataset.label);
          if (PREVIEW) u.searchParams.set('preview', '1');
          location.href = u.pathname + u.search + (u.hash || '#cake');
          return;
        }
        addToCart(el.dataset.item, el.dataset.label, 1); return openCheckout();
      }
      closeLayer();
      sel.value = el.dataset.item;
      $('#cake-sizes').innerHTML = `<legend>Size</legend>${sizeChoices(wholeCakes(S.c).find((x) => x.id === sel.value), el.dataset.label)}`;
      cakeTotal();
      showCakePhoto(sel.value);
      $('#cake').scrollIntoView({ behavior: 'smooth' });
    },
    cart() { openLayer(cartHtml(), $('.drawer', layer()) ? { same: true } : undefined); },
    qty(el) {
      const line = S.cart.find((l) => lineKey(l) === el.dataset.key);
      if (line) addToCart(line.itemId, line.label, line.qty + Number(el.dataset.d), true, line.extras);
      openLayer(cartHtml(), { same: true });
    },
    checkout() { openCheckout(); },
    close(el) {
      // A link that leaves for another page: just close (its own navigation follows).
      if (el && el.tagName === 'A' && el.getAttribute('href') && !el.getAttribute('href').startsWith('#')) { closeLayerRaw(); NAV.stack = []; return; }
      closeLayer();
    },
    slide(el) { showSlide(Number(el.dataset.i)); },
    'slide-step'(el) { showSlide(S.slide + Number(el.dataset.d)); },
    nav(el) {
      const open = !$('#nav-links').classList.contains('is-open');
      $('#nav-links').classList.toggle('is-open', open);
      el.setAttribute('aria-expanded', open);
    },
    zoom(el) {
      const list = S.groups[el.dataset.group] || [{ src: el.dataset.src, cap: el.dataset.cap }];
      openLightbox(list, Number(el.dataset.i) || 0);
    },
    'lb-step'(el) { stepLightbox(Number(el.dataset.d)); },
    album(el) { S.album = Number(el.dataset.i) || 0; const sec = $('#moments'); if (sec) { sec.outerHTML = R.moments(S.c); initSliders(); $$('#moments .rv').forEach((x) => x.classList.add('in')); } },
    'sl-step'(el) {
      const track = $('.sl-track', el.closest('.slider'));
      const item = $('.sl-item', track);
      if (track && item) track.scrollBy({ left: Number(el.dataset.d) * (item.offsetWidth + 18), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
  };
  document.addEventListener('click', (e) => {
    if (S.inline && e.target.closest('[data-edit]')) { e.preventDefault(); return; }
    // In the admin preview, links to the other pages stay inside the preview.
    const pageLink = PREVIEW && e.target.closest('a[href^="/"]');
    if (pageLink && !/^\/(uploads|api)\//.test(pageLink.getAttribute('href')) && !e.defaultPrevented) {
      const u = new URL(pageLink.getAttribute('href'), location.href);
      if (u.pathname !== location.pathname) { e.preventDefault(); u.searchParams.set('preview', '1'); location.href = u.pathname + u.search + u.hash; return; }
    }
    const step = e.target.closest('[data-step]');
    if (step && $('#x-qty')) { const q = $('#x-qty'); q.textContent = Math.max(1, Math.min(50, (Number(q.textContent) || 1) + Number(step.dataset.step))); extrasTotal(); return; }
    if (S.layout) { if (!e.target.closest('#crop-tools')) e.preventDefault(); return; }
    const el = e.target.closest('[data-act]');
    // After a long hold on an event photo (which only pauses the slideshow), do not open the photo.
    if (el && el.dataset.group === 'event' && Date.now() < (S.noZoomUntil || 0)) { e.preventDefault(); return; }
    if (el && ACT[el.dataset.act]) {
      if (el.tagName === 'BUTTON' || el.classList.contains('shade')) e.preventDefault();
      ACT[el.dataset.act](el);
    }
    if (e.target.closest('.nav-links a')) $('#nav-links').classList.remove('is-open');
  });
  // Phones: holding a finger on an event photo pauses the slideshow until the finger lifts.
  // A quick tap still opens the photo large; a long hold does not.
  let holdAt = 0;
  document.addEventListener('touchstart', (e) => {
    const stage = e.target.closest && e.target.closest('#events .ev-stage');
    if (!stage) return;
    holdAt = Date.now();
    stage.closest('.slides').classList.add('is-held');
  }, { passive: true });
  const letGo = () => {
    const held = $('#events .slides.is-held');
    if (!held) return;
    held.classList.remove('is-held');
    if (Date.now() - holdAt > 450) S.noZoomUntil = Date.now() + 700;
  };
  document.addEventListener('touchend', letGo, { passive: true });
  document.addEventListener('touchcancel', letGo, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#map-pick')) closeMapPicker();
    else if (e.key === 'Escape' && $('#qr-full')) closeQrFull();
    else if (e.key === 'Escape' && layer().innerHTML) closeLayer();
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
    if (media && y < 900 && document.documentElement.classList.contains('anim') && WIDE()) media.style.transform = `translate3d(0, ${y * 0.12}px, 0) scale(calc(1.06 * var(--z, 1)))`;
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
      if (im.parentElement && im.parentElement.classList.contains('pic')) setFill(im.parentElement, url, k);
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
        if (b.dataset.crop === 'out') k.z = Math.max(ZMIN, Math.round((k.z - 0.1) * 10) / 10);
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

  /* ---------- version 11: your orders, points, account and settings ----------
     Nobody needs an account. Orders placed on this phone or computer are kept here (pm_orders, with their
     private keys) and followed live. A phone number shows its orders placed from this device, and its points.
     An account (optional) shows every order on any device. */
  const FEATURE = (k) => ((S.c && S.c.features) || {})[k] !== false;
  const DEVICE = (() => {
    const make = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    try { let d = localStorage.getItem('pm_device'); if (!/^[a-f0-9]{32}$/.test(d || '')) { d = make(); localStorage.setItem('pm_device', d); } return d; } catch (e) { return make(); }
  })();
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } },
  };
  const myOrders = () => (store.get('pm_orders', []) || []).filter((o) => o && o.id && o.key);
  function rememberOrder(res) {
    store.set('pm_orders', [{ id: res.id, key: res.key, at: Date.now() }, ...myOrders().filter((o) => o.id !== res.id)].slice(0, 30));
  }
  const normPhone = (p) => { let d = digits(p); if (d.length === 13 && d.startsWith('977')) d = d.slice(3); return d.length >= 7 ? d : ''; };
  async function call(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  Object.assign(ICON, {
    user: svg('<circle cx="12" cy="8.5" r="3.800"/><path d="M4.500 20.500c.9-4 4-6 7.500-6s6.600 2 7.500 6"/>'),
    gift: svg('<rect x="3.500" y="9" width="17" height="11.500" rx="1.500"/><path d="M3.500 13h17M12 9v11.500"/><path d="M12 9c-1.500-3.500-5.500-3.500-5.500-1.200C6.500 9 9 9 12 9zm0 0c1.500-3.500 5.500-3.500 5.500-1.200C17.500 9 15 9 12 9z"/>'),
    bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    receipt: svg('<path d="M6 3h12v18l-2-1.300-2 1.300-2-1.300-2 1.300-2-1.300L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    drop: svg('<path d="M12 3.500s6 6.500 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z"/>'),
    wifi: svg('<path d="M3 9.500a13 13 0 0 1 18 0M6 13a8.500 8.500 0 0 1 12 0M9 16.500a4 4 0 0 1 6 0"/><circle cx="12" cy="19.500" r=".9" fill="currentColor"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.400 15a1.700 1.700 0 0 0 .3 1.800l.1.1a2 2 0 1 1-2.800 2.800l-.1-.1a1.700 1.700 0 0 0-1.800-.3 1.700 1.700 0 0 0-1 1.500V21a2 2 0 1 1-4 0v-.1a1.700 1.700 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 1 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.700 1.700 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 1 1.500 1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z"/>'),
  });
  const A = { cfg: null, me: null, look: null, live: {}, view: 'orders', su: {}, timer: null };
  const signedIn = () => Boolean(A.me && A.me.me);
  const pointsOn = () => Boolean(A.cfg && A.cfg.points && FEATURE('points'));
  const LY = () => Object.assign({ percent: 5, rupeesPerPoint: 1, minSpend: 50, expiryMonths: 12 }, (S.c && S.c.loyalty) || {});
  const codesOn = () => Boolean(A.cfg && A.cfg.on && (A.cfg.email || A.cfg.sms));
  async function loadAccount() {
    try {
      const [cfg, me] = await Promise.all([call('GET', '/api/account/config'), call('GET', `/api/account/me?device=${DEVICE}`)]);
      A.cfg = cfg;
      A.me = me && me.me ? me : null;
    } catch (e) { /* offline */ }
    paintAccountBtn();
  }
  function paintAccountBtn() {
    $$('.acct-btn').forEach((b) => {
      const n = signedIn() ? (A.me.me.name || A.me.me.username || A.me.me.email || '').trim() : '';
      b.classList.toggle('is-in', signedIn());
      b.innerHTML = n ? `<span class="acct-initial">${esc(n.slice(0, 1).toUpperCase())}</span>` : ICON.user;
      b.setAttribute('aria-label', signedIn() ? 'Your account, orders and points' : 'Your orders, points and settings');
    });
  }

  /* order status, live */
  const STEP_TEXT = { pending: 'Received', acknowledged: 'Seen by our staff', preparing: 'Being made', ready: 'Ready', done: 'Done', cancelled: 'Cancelled' };
  const FLOW = ['pending', 'acknowledged', 'preparing', 'ready', 'done'];
  const finished = (s) => s === 'done' || s === 'cancelled';
  async function refreshLive() {
    const list = myOrders().slice(0, 12);
    await Promise.all(list.map(async (o) => {
      const old = A.live[o.id];
      if (old && finished(old.status) && Date.now() - (old.seen || 0) < 30 * 60e3) return;
      try {
        const s = await call('GET', `/api/orders/${encodeURIComponent(o.id)}/status?key=${encodeURIComponent(o.key)}`);
        s.key = o.key;
        s.seen = Date.now();
        if (old && old.status !== s.status) statusChanged(s);
        A.live[o.id] = s;
      } catch (e) { if (/find/.test(e.message)) store.set('pm_orders', myOrders().filter((x) => x.id !== o.id)); }
    }));
    paintLivePill();
    if ($('.modal--acct') && A.view === 'orders') paintAccount();
  }
  function statusChanged(s) {
    if (s.status === 'ready') toast(`Your order ${s.id} is ready${s.type === 'dinein' ? '' : ' for you'}.`);
    else if (s.status === 'acknowledged' || s.status === 'preparing') toast(`Order ${s.id}: ${STEP_TEXT[s.status].toLowerCase()}.`);
    if (s.status === 'done' && FEATURE('liveStatus')) {
      if (s.pointsEarned) toast(`${s.pointsEarned} points added to your phone number. Thank you!`);
      showGoogleAsk();
    }
  }
  // A small bar under the top bar while an order is on its way: "Order PM-...: Being made".
  function paintLivePill() {
    let pill = $('#os-pill');
    const live = Object.values(A.live).filter((s) => !finished(s.status) && Date.now() - Date.parse(s.createdAt) < 12 * 3600e3)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!FEATURE('liveStatus') || !live.length || PREVIEW) { if (pill) pill.remove(); return; }
    if (!pill) { pill = document.createElement('button'); pill.type = 'button'; pill.id = 'os-pill'; pill.className = 'os-pill'; pill.dataset.act = 'account'; pill.dataset.id = 'orders'; document.body.appendChild(pill); }
    const s = live[0];
    const i = Math.max(0, FLOW.indexOf(s.status));
    const dl = s.delivery && ['picked', 'onway'].includes(s.delivery.status) ? ' · 🛵 on the way' : '';
    pill.innerHTML = `<span class="os-dots" aria-hidden="true">${FLOW.slice(0, 4).map((x, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}</span><span>Order ${esc(s.id)}: <b>${esc(STEP_TEXT[s.status] || s.status)}</b>${dl}${live.length > 1 ? ` · +${live.length - 1} more` : ''}</span>`;
  }
  function startLive() {
    clearInterval(A.timer);
    if (!myOrders().length || PREVIEW) return;
    refreshLive();
    A.timer = setInterval(() => { if (!document.hidden) refreshLive(); }, 10000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && myOrders().length) refreshLive(); });

  /* the account sheet: Orders, Points, Settings (and Sign in / Create account) */
  function openAccount(view, opts) {
    A.view = view || A.view || 'orders';
    if (['signin', 'signup', 'reset'].includes(A.view) && !codesOn() && A.view !== 'signin') A.view = 'orders';
    openLayer(`<div class="shade" data-act="close"></div><div class="modal modal--sheet modal--acct" role="dialog" aria-label="Your orders and account"><div id="acct-body"></div></div>`, opts || ($('.modal--acct', layer()) ? { same: true } : undefined));
    paintAccount();
    refreshAccount();
  }
  async function refreshAccount() {
    const ph = store.get('pm_phone', '');
    try {
      const jobs = [refreshLive()];
      if (!A.cfg) jobs.push(loadAccount());
      else jobs.push(call('GET', `/api/account/me?device=${DEVICE}`).then((me) => { A.me = me && me.me ? me : null; paintAccountBtn(); }));
      await Promise.all(jobs);
      if (!signedIn() && ph) A.look = await call('POST', '/api/lookup', { phone: ph, device: DEVICE });
    } catch (e) { /* keep what we have */ }
    if ($('.modal--acct')) paintAccount();
  }
  function allOrders() {
    const map = new Map();
    for (const o of Object.values(A.live)) map.set(o.id, o);
    const server = signedIn() ? A.me.orders : (A.look && A.look.orders) || [];
    for (const o of server) map.set(o.id, Object.assign({}, map.get(o.id) || {}, o));
    return [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  const dateText = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  const TYPE_TEXT = { dinein: 'At the cafe', pickup: 'Pickup', delivery: 'Delivery' };
  function orderCardHtml(o) {
    const i = FLOW.indexOf(o.status);
    const again = FEATURE('orderAgain') && (o.lines || []).some((l) => l.itemId && !l.whole);
    const pts = o.points && o.points.used ? `<p class="hint">${o.points.used} points used (${rs(o.points.used * (Number(LY().rupeesPerPoint) || 1))} off)</p>` : o.points && o.points.asked && o.points.approved === null ? `<p class="hint">${o.points.asked} points to be taken off at the counter</p>` : '';
    return `<article class="ocard${finished(o.status) ? ' is-old' : ''}">
      <header><strong>${esc(o.id)}</strong><span>${esc(dateText(o.createdAt))}</span><b>${rs(o.total)}</b></header>
      <p class="ocard-type">${esc(TYPE_TEXT[o.type] || '')}${o.tableNo ? ` · table ${esc(o.tableNo)}` : ''}${o.paid ? ' · paid' : ''}</p>
      ${o.status === 'cancelled' ? '<p class="ocard-step is-cancel">Cancelled</p>' : `<ol class="steps" aria-label="Order status: ${esc(STEP_TEXT[o.status] || o.status)}">${FLOW.map((x, n) => `<li class="${n < i ? 'was' : n === i ? 'now' : ''}"><i></i><span>${STEP_TEXT[x]}</span></li>`).join('')}</ol>`}
      ${trackHtml(o)}
      <ul class="ocard-lines">${(o.lines || []).map((l) => `<li>${l.qty} × ${esc(l.name)}${l.label ? ` <small>(${esc(l.label)})</small>` : ''}${l.extras && l.extras.length ? ` <small>+ ${esc(l.extras.join(', '))}</small>` : ''}</li>`).join('')}</ul>
      ${pts}${o.pointsEarned ? `<p class="hint ocard-earned">${ICON.gift}<span>${o.pointsEarned} points earned</span></p>` : ''}
      <div class="row">
        ${again ? `<button type="button" class="btn btn--small" data-act="again" data-id="${esc(o.id)}"><span>Order again</span></button>` : ''}
        ${o.status === 'done' && googleReviewUrl() ? `<a class="btn btn--small btn--ghost" href="${esc(googleReviewUrl())}" target="_blank" rel="noopener">${ICON.google}<span>Review us</span></a>` : ''}
      </div>
    </article>`;
  }
  function pointsCardHtml(p, canSpend) {
    if (!pointsOn()) return '';
    const L = LY();
    const head = `<div class="pts-card"><span class="pts-ic">${ICON.gift}</span><div><p class="pts-t">${esc(L.title || 'Pick Me points')}</p>`;
    if (!p) return `${head}<p class="hint">${esc(L.text || '')}</p></div></div>`;
    const value = p.balance * (Number(L.rupeesPerPoint) || 1);
    return `${head}<p class="pts-n"><b>${p.balance}</b> points <small>= ${rs(value)} off</small></p>
      ${p.next && p.balance ? `<p class="hint">${p.next.amount} of them run out on ${esc(new Date(p.next.exp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}.</p>` : ''}
      <p class="hint">${p.balance >= (Number(L.minSpend) || 0) ? (canSpend ? 'Use them at checkout.' : 'Use them at checkout: staff take them off at the counter.') : `You can use them from ${Number(L.minSpend) || 0} points.`}</p>
      </div></div>`;
  }
  function tabsHtml() {
    const t = (id, label) => `<button type="button" class="${A.view === id ? 'is-on' : ''}" data-act="account" data-id="${id}" aria-pressed="${A.view === id}">${label}</button>`;
    return `<nav class="acct-tabs" aria-label="Your account">${t('orders', 'Orders')}${pointsOn() ? t('points', 'Points') : ''}${t('settings', 'Settings')}</nav>`;
  }
  function paintAccount() {
    const box = $('#acct-body');
    if (!box) return;
    const me = signedIn() ? A.me.me : null;
    const title = me ? `Hi${me.name ? ' ' + esc(me.name.split(' ')[0]) : ''}` : 'Your orders';
    const top = `<header><h2>${['signin', 'signup', 'reset'].includes(A.view) ? ({ signin: 'Sign in', signup: 'Create an account', reset: 'Forgot password' })[A.view] : title}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICON.x}</button></header>`;
    let body = '';
    if (A.view === 'signin') body = signinHtml();
    else if (A.view === 'signup') body = signupHtml();
    else if (A.view === 'reset') body = resetHtml();
    else if (A.view === 'points') body = tabsHtml() + pointsViewHtml();
    else if (A.view === 'settings') body = tabsHtml() + settingsHtml();
    else body = tabsHtml() + ordersViewHtml();
    box.innerHTML = top + body;
    if (A.view === 'signin' || A.view === 'signup') paintGoogle();
    if (A.view === 'orders') paintTracks();
  }
  function ordersViewHtml() {
    const list = allOrders();
    const ph = store.get('pm_phone', '');
    const look = signedIn() ? '' : `<form class="form form--solo acct-look" data-form="lookup" novalidate>
        <label class="f"><span>Your phone number</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="98XXXXXXXX" value="${esc(ph)}" required></label>
        <button class="btn" type="submit"><span>Show my orders</span></button>
        <p class="hint">Shows the orders made with this number on this phone or computer. ${codesOn() ? 'Sign in to see them on any device.' : ''}</p>
        <p class="form-msg" role="alert"></p></form>`;
    const pts = signedIn() ? pointsCardHtml(A.me.points, A.me.canSpend) : (A.look ? pointsCardHtml(A.look.points, false) : '');
    return `${look}${pts}${list.length ? `<div class="ocards">${list.map(orderCardHtml).join('')}</div>` : '<p class="empty">No orders yet on this phone. Orders you send appear here and update by themselves.</p>'}${accountCta()}`;
  }
  function accountCta() {
    if (signedIn() || !A.cfg || !A.cfg.on) return '';
    if (!codesOn()) return `<p class="hint acct-soon">${esc((S.c.accounts || {}).text || '')} Accounts open soon.</p>`;
    return `<div class="acct-cta"><p><b>${esc((S.c.accounts || {}).title || 'Your account')}</b><br><span class="hint">${esc((S.c.accounts || {}).text || '')}</span></p>
      <div class="row"><button type="button" class="btn" data-act="account" data-id="signup"><span>Create an account</span></button><button type="button" class="btn btn--ghost" data-act="account" data-id="signin"><span>Sign in</span></button></div></div>`;
  }
  function pointsViewHtml() {
    const L = LY();
    const p = signedIn() ? A.me.points : A.look && A.look.points;
    const how = `<ul class="pts-how"><li>Every finished order gives you ${Number(L.percent) || 0}% back as points.</li><li>1 point = ${rs(Number(L.rupeesPerPoint) || 1)} off a later order${Number(L.minSpend) ? `, from ${Number(L.minSpend)} points` : ''}.</li><li>Points last ${Number(L.expiryMonths) || 12} months.</li>${Number(L.birthdayPoints) ? `<li>${Number(L.birthdayPoints)} birthday points in your birthday week (with an account and your birthday in Settings).</li>` : ''}<li>Points belong to your phone number: give it when you order, even at your table.</li></ul>`;
    const note = signedIn() && A.me.me.phone && !A.me.canSpend ? `<p class="hint acct-warn">Show this screen at the counter once so staff can confirm your phone number ${esc(A.me.me.phone)}. After that you can use your points straight from checkout.</p>` : signedIn() && !A.me.me.phone ? '<p class="hint acct-warn">Add your phone number in Settings: points are kept by phone number.</p>' : '';
    return `${pointsCardHtml(p, signedIn() && A.me.canSpend)}${note}${!signedIn() && !p ? '<p class="hint">Type your phone number under Orders to see its points.</p>' : ''}${how}${accountCta()}`;
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function settingsHtml() {
    const me = signedIn() ? A.me.me : null;
    const general = `<section class="set-group"><h3>Help and information</h3>
        <button type="button" class="set-row" data-act="chat">${ICON.chat}<span>Contact us</span></button>
        <a class="set-row" href="/privacy">${ICON.lock}<span>Privacy policy</span></a>
        ${S.c.appCard && S.c.appCard.show !== false ? `<a class="set-row" href="/#get-app" data-act="close">${ICON.download}<span>Get the app</span></a>` : ''}
        <p class="hint set-about">${esc(S.c.brand.name)} website · version 11</p></section>`;
    if (!me) {
      const ph = store.get('pm_phone', '');
      return `${accountCta()}<section class="set-group"><h3>This device</h3>
          <p class="hint">${ph ? `Phone number kept on this device: <b>${esc(ph)}</b>` : 'No phone number kept on this device.'}</p>
          <div class="row">${ph ? '<button type="button" class="btn btn--small btn--ghost" data-act="forgetphone"><span>Forget my phone number</span></button>' : ''}${myOrders().length ? '<button type="button" class="btn btn--small btn--ghost" data-act="forgetorders"><span>Clear my orders from this device</span></button>' : ''}</div>
        </section>${general}`;
    }
    const [bm, bd] = (me.birthday || '').split('-').map(Number);
    return `<form class="form set-group" data-form="profile" novalidate><h3>Your details</h3>
        <label class="f"><span>Name</span><input name="name" maxlength="80" autocomplete="name" value="${esc(me.name)}"></label>
        <label class="f"><span>Phone number ${me.phone ? (me.phoneVerified ? '<small class="ok">confirmed</small>' : '<small>not confirmed yet</small>') : ''}</span><input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" value="${esc(me.phone)}" placeholder="98XXXXXXXX"></label>
        <label class="f f--wide"><span>Delivery address</span><textarea name="address" rows="2" maxlength="300" placeholder="Tole, landmark, ward">${esc(me.address)}</textarea></label>
        <div class="f"><span>Birthday ${me.birthday ? '<small>(ask us to change it)</small>' : '<small>(for birthday points; can be set once)</small>'}</span>
          <div class="row row--tight"><select name="bmonth" aria-label="Birthday month"${me.birthday ? ' disabled' : ''}><option value="">Month</option>${MONTHS.map((m, i) => `<option value="${i + 1}"${bm === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select>
          <select name="bday" aria-label="Birthday day"${me.birthday ? ' disabled' : ''}><option value="">Day</option>${Array.from({ length: 31 }, (x, i) => `<option${bd === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></div></div>
        <label class="f"><span>Login ID (optional; you can also sign in with your email or phone)</span><input name="username" maxlength="60" autocapitalize="off" autocomplete="username" value="${esc(me.username)}"></label>
        <label class="set-check"><input type="checkbox" name="offers"${me.prefs.offers ? ' checked' : ''}><span>Tell me about offers and new specials</span></label>
        <p class="form-msg" role="alert"></p><button class="btn" type="submit"><span>Save my details</span></button></form>
      <form class="form set-group" data-form="password" novalidate><h3>Password</h3>
        ${me.hasPassword ? '<label class="f"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required></label>' : ''}
        <label class="f"><span>New password</span><input name="password" type="password" autocomplete="new-password" required minlength="4" placeholder="At least 4 characters"></label>
        <p class="form-msg" role="alert"></p><button class="btn btn--ghost" type="submit"><span>Change password</span></button></form>
      <form class="form set-group" data-form="newemail" novalidate><h3>Email</h3>
        <p class="hint">${me.email ? `Now: <b>${esc(me.email)}</b>` : 'No email yet.'}</p>
        ${A.su.change ? `<label class="f"><span>Code we sent to ${esc(A.su.change)}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>` : '<label class="f"><span>New email</span><input name="to" type="email" autocomplete="email" maxlength="120" required></label>'}
        <p class="form-msg" role="alert"></p><button class="btn btn--ghost" type="submit"><span>${A.su.change ? 'Confirm the new email' : 'Send me a code'}</span></button></form>
      <section class="set-group"><h3>Account</h3>
        <button type="button" class="set-row" data-act="signout">${ICON.lock}<span>Sign out</span></button>
        <button type="button" class="set-row set-row--bad" data-act="deleteacct">${ICON.x}<span>Delete my account</span></button>
        <p class="hint">Deleting your account removes your login, details and points. Your past orders stay in the cafe's records without your account.</p>
      </section>${general}`;
  }
  function signinHtml() {
    return `<form class="form" data-form="signin" novalidate>${googleHtml()}
        <label class="f f--wide"><span>Login ID, email or phone</span><input name="id" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username" maxlength="120" required autofocus></label>
        <label class="f f--wide"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <p class="form-msg f--wide" role="alert"></p>
        <button class="btn f--wide" type="submit"><span>Sign in</span></button>
        ${codesOn() ? `<div class="row f--wide"><button type="button" class="link-btn" data-act="account" data-id="reset"><span>Forgot password</span></button><button type="button" class="link-btn" data-act="account" data-id="signup"><span>Create an account</span></button></div>` : ''}
        <button type="button" class="link-btn f--wide" data-act="account" data-id="orders"><span>Back</span></button>
      </form>`;
  }
  const toLabel = () => (A.cfg && A.cfg.sms ? 'Email or phone number' : 'Email');
  function codeSteps(kind) {
    const st = A.su[kind] || {};
    if (!st.to) return `<label class="f f--wide"><span>${toLabel()}</span><input name="to" ${A.cfg && A.cfg.sms ? 'inputmode="email"' : 'type="email"'} autocomplete="email" autocapitalize="off" maxlength="120" required autofocus></label>
      <p class="hint f--wide">We send you a 6-digit code.</p>`;
    if (!st.ticket) return `<label class="f f--wide"><span>The code we sent to ${esc(st.to)}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required autofocus></label>
      <p class="hint f--wide">Not there? Check your spam folder, or <button type="button" class="link-btn" data-act="restart" data-id="${kind}"><span>use another address</span></button>.</p>`;
    return '';
  }
  function signupHtml() {
    const st = A.su.signup || {};
    const ph = store.get('pm_phone', '');
    const more = st.ticket ? `<p class="hint f--wide">${esc(st.to)} is confirmed. Now choose how you sign in.</p>
        <label class="f"><span>Your name</span><input name="name" maxlength="80" autocomplete="name"></label>
        ${st.kind === 'phone' ? '' : `<label class="f"><span>Phone number (for points)</span><input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" value="${esc(ph)}" placeholder="98XXXXXXXX"></label>`}
        <label class="f"><span>Login ID (optional, any name you like)</span><input name="username" maxlength="60" autocapitalize="off" autocomplete="username"></label>
        <label class="f"><span>Password</span><input name="password" type="password" autocomplete="new-password" required minlength="4" placeholder="At least 4 characters"></label>
        <label class="set-check f--wide"><input type="checkbox" name="offers"><span>Tell me about offers and new specials</span></label>` : '';
    return `<form class="form" data-form="signup" novalidate>${!st.to ? googleHtml() : ''}${codeSteps('signup')}${more}
        <p class="form-msg f--wide" role="alert"></p>
        <button class="btn f--wide" type="submit"><span>${!st.to ? 'Send me a code' : !st.ticket ? 'Check the code' : 'Create my account'}</span></button>
        <button type="button" class="link-btn f--wide" data-act="account" data-id="signin"><span>I already have an account</span></button>
      </form>`;
  }
  function resetHtml() {
    const st = A.su.reset || {};
    return `<form class="form" data-form="reset" novalidate>${codeSteps('reset')}
        ${st.ticket ? '<label class="f f--wide"><span>New password</span><input name="password" type="password" autocomplete="new-password" required minlength="4" placeholder="At least 4 characters" autofocus></label>' : ''}
        <p class="form-msg f--wide" role="alert"></p>
        <button class="btn f--wide" type="submit"><span>${!st.to ? 'Send me a code' : !st.ticket ? 'Check the code' : 'Save the new password'}</span></button>
        <button type="button" class="link-btn f--wide" data-act="account" data-id="signin"><span>Back</span></button>
      </form>`;
  }
  async function codeStep(kind, d, purpose) {
    const st = A.su[kind] = A.su[kind] || {};
    if (!st.to) {
      const r = await call('POST', '/api/account/code', { to: d.to, purpose });
      st.to = r.to; st.kind = r.by === 'sms' ? 'phone' : 'email';
      paintAccount();
      return false;
    }
    if (!st.ticket) {
      const r = await call('POST', '/api/account/verify', { to: st.to, code: d.code, purpose });
      st.ticket = r.ticket;
      paintAccount();
      return false;
    }
    return true;
  }
  async function signedInNow(r) {
    A.me = await call('GET', `/api/account/me?device=${DEVICE}`);
    if (!A.me.me) A.me = null;
    A.su = {};
    paintAccountBtn();
    A.view = 'orders';
    paintAccount();
    toast(r && r.created ? 'Your account is ready.' : 'You are signed in.');
  }
  Object.assign(FORMS, {
    async lookup(d) {
      const p = normPhone(d.phone);
      if (!p) throw new Error('Please type your phone number.');
      store.set('pm_phone', p);
      A.look = await call('POST', '/api/lookup', { phone: p, device: DEVICE });
      paintAccount();
      if (!A.look.orders.length) toast(A.look.account ? 'No orders from this device yet. Sign in to see them all.' : 'No orders with this number from this device yet.');
    },
    async signin(d) {
      const r = await call('POST', '/api/account/login', { id: d.id, password: d.password });
      await signedInNow(r);
    },
    async signup(d, form) {
      if (!(await codeStep('signup', d, 'signup'))) return;
      const st = A.su.signup;
      const r = await call('POST', '/api/account/register', { ticket: st.ticket, name: d.name, phone: d.phone, username: d.username, password: d.password, offers: Boolean(form.elements.offers && form.elements.offers.checked) });
      if (d.phone) store.set('pm_phone', normPhone(d.phone));
      r.created = true;
      await signedInNow(r);
    },
    async reset(d) {
      if (!(await codeStep('reset', d, 'reset'))) return;
      const r = await call('POST', '/api/account/reset', { ticket: A.su.reset.ticket, password: d.password });
      await signedInNow(r);
    },
    async profile(d, form) {
      const body = { name: d.name, phone: d.phone, address: d.address, username: d.username, prefs: { orderUpdates: true, offers: Boolean(form.elements.offers.checked) }, device: DEVICE };
      if (!A.me.me.birthday && d.bmonth && d.bday) body.birthday = `${String(d.bmonth).padStart(2, '0')}-${String(d.bday).padStart(2, '0')}`;
      A.me = await call('PATCH', '/api/account/me', body);
      if (d.phone) store.set('pm_phone', normPhone(d.phone));
      paintAccount();
      toast('Saved.');
    },
    async password(d, form) {
      await call('PATCH', '/api/account/me', { current: d.current, password: d.password, device: DEVICE });
      form.reset();
      return 'Your password is changed.';
    },
    async newemail(d) {
      if (!A.su.change) {
        const r = await call('POST', '/api/account/code', { to: d.to, purpose: 'change' });
        A.su.change = r.to;
        paintAccount();
        return;
      }
      const v = await call('POST', '/api/account/verify', { to: A.su.change, code: d.code, purpose: 'change' });
      A.me = await call('POST', '/api/account/email', { ticket: v.ticket, device: DEVICE });
      A.su.change = '';
      paintAccount();
      toast('Your email is changed.');
    },
  });
  Object.assign(ACT, {
    account(el) {
      const v = el.dataset.id || (signedIn() ? 'orders' : 'orders');
      if ($('.modal--acct')) {
        const was = A.view;
        const form = (x) => ['signin', 'signup', 'reset'].includes(x);
        if (v === was) return;
        // Back from Sign in / Create account / Forgot password returns to the view before it.
        if (form(v)) navPush('step', () => { A.view = was; paintAccount(); });
        else if (form(was) && navTop() && navTop().tag === 'step') NAV.stack[NAV.stack.length - 1] = { tag: 'skip', undo: () => history.back() };
        A.view = v; paintAccount(); const m = $('.modal--acct'); if (m) m.scrollTop = 0;
      } else openAccount(v);
    },
    restart(el) { A.su[el.dataset.id] = {}; paintAccount(); },
    async signout() { await call('POST', '/api/account/logout').catch(() => {}); A.me = null; paintAccountBtn(); A.view = 'orders'; paintAccount(); toast('Signed out.'); },
    async deleteacct() {
      if (!window.confirm('Delete your account? Your login, details and points are removed. This cannot be undone.')) return;
      try { await call('DELETE', '/api/account/me'); A.me = null; paintAccountBtn(); A.view = 'orders'; paintAccount(); toast('Your account is deleted.'); } catch (e) { toast(e.message); }
    },
    forgetphone() { store.set('pm_phone', null); A.look = null; paintAccount(); },
    forgetorders() { if (!window.confirm('Clear your orders from this device?')) return; store.set('pm_orders', null); A.live = {}; A.look = null; paintLivePill(); paintAccount(); },
    again(el) {
      const o = allOrders().find((x) => x.id === el.dataset.id);
      if (!o) return;
      let added = 0;
      let missing = 0;
      for (const l of o.lines || []) {
        if (!l.itemId || l.whole) continue;
        const f = findPrice(l.itemId, l.label);
        if (!f || f.item.available === false || !(Number(f.price.price) > 0)) { missing += 1; continue; }
        addToCart(l.itemId, l.label || '', l.qty, false, l.extraIds || []);
        added += 1;
      }
      if (!added) return toast('These items are not on the menu right now.');
      bump();
      openLayer(cartHtml());
      toast(missing ? `Added. ${missing} item${missing === 1 ? ' is' : 's are'} not on the menu right now.` : 'Added to your order.');
    },
    async tcall(el) {
      if (!TABLE) return;
      try {
        const r = await call('POST', '/api/table-call', { table: TABLE, kind: el.dataset.id });
        toast(r.again ? 'We already got that. Someone is coming.' : ({ staff: 'Someone is coming to your table.', bill: 'We are bringing your bill.', water: 'Water is on its way.' })[el.dataset.id] || 'Sent.');
      } catch (e) { toast(e.message); }
    },
    copywifi(el) {
      const t = el.dataset.id || '';
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Wi-Fi password copied.')).catch(() => toast(t));
      else toast(t);
    },
  });

  /* checkout: points, and the details we already know */
  const ptsCache = {};
  async function checkoutPoints(force) {
    const box = $('#co-points');
    const form = $('form[data-form=checkout]');
    if (!box || !form) return;
    if (!pointsOn()) { box.innerHTML = ''; return; }
    const phone = normPhone(form.elements.phone.value);
    const L = LY();
    const value = Number(L.rupeesPerPoint) || 1;
    const lines = cartLines();
    const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const earn = Math.floor(sub * (Number(L.percent) || 0) / 100 / value);
    let bal = 0;
    let sure = false;
    if (phone && signedIn() && A.me.me.phone === phone && A.me.points) { bal = A.me.points.balance; sure = A.me.canSpend; }
    else if (phone) {
      if (!(phone in ptsCache) || force) {
        ptsCache[phone] = null;
        try { const r = await call('POST', '/api/lookup', { phone, device: DEVICE }); ptsCache[phone] = r.points ? r.points.balance : 0; } catch (e) { ptsCache[phone] = 0; }
      }
      bal = ptsCache[phone] || 0;
    }
    const method = ($('input[name=method]:checked', form) || {}).value || 'later';
    const use = Math.min(bal, Math.floor(sub / value));
    const was = $('input[name=usePoints]', box);
    const ticked = was ? was.checked : false;
    const canUse = use >= (Number(L.minSpend) || 0) && use > 0 && (sure || method === 'later' || method === 'cod');
    box.innerHTML = `${canUse ? `<label class="pts-use"><input type="checkbox" name="usePoints" value="${use}"${ticked ? ' checked' : ''}><span>${ICON.gift}<span>Use ${use} of my ${bal} points <b>${rs(use * value)} off</b>${sure ? '' : '<small>Staff take them off at the counter.</small>'}</span></span></label>`
      : bal > 0 ? `<p class="hint">${ICON.gift} This number has ${bal} points.${use < (Number(L.minSpend) || 0) ? ` You can use them from ${Number(L.minSpend) || 0} points.` : ' To use them with Pay now, sign in first, or choose Pay later.'}</p>` : ''}
      ${earn > 0 ? `<p class="hint pts-earn">${phone ? `This order gives ${earn} points to ${esc(phone)} when it is done.` : `Add your phone number to get ${earn} points for this order.`}</p>` : ''}`;
    S.coPts = canUse && sure && ticked ? use * value : 0;
    const type = ($('input[name=type]:checked', form) || {}).value;
    $('#co-sum').innerHTML = sumHtml(type);
  }
  function fillKnown() {
    const form = $('form[data-form=checkout]');
    if (!form) return;
    const me = signedIn() ? A.me.me : null;
    const set = (k, v) => { const el = form.elements[k]; if (el && v && !el.value) el.value = v; };
    set('phone', (me && me.phone) || store.get('pm_phone', ''));
    set('name', me && me.name);
    set('address', me && me.address);
    S.coPts = 0;
    checkoutPoints();
  }
  document.addEventListener('input', (e) => {
    if (e.target.id === 'co-phone') { clearTimeout(checkoutPoints.t); checkoutPoints.t = setTimeout(() => checkoutPoints(), 600); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.name === 'usePoints' || (e.target.closest && e.target.closest('form[data-form=checkout]') && e.target.name === 'method')) checkoutPoints();
  });

  /* "get the app" card under the map */
  function appCardHtml(c) {
    const a = c.appCard || {};
    const ok = (u) => (/^https:\/\//.test(u || '') ? u : '');
    const ios = ok(a.appStore);
    const play = ok(a.googlePlay);
    const apk = ok(a.apk);
    if (a.show === false || !(ios || play || apk)) return '';
    const badge = (url, img, label, icon) => (url ? `<a class="store-badge" href="${esc(url)}" target="_blank" rel="noopener">${safeUrl(img) ? `<img src="${esc(safeUrl(img))}" alt="${esc(label)}">` : `${icon}<span>${esc(label)}</span>`}</a>` : '');
    return `<div class="get-app rv" id="get-app">
        <h3${ed('appCard.title')}>${esc(a.title || 'Get the app')}</h3>
        ${a.text ? `<p class="hint"${ed('appCard.text')}>${esc(a.text)}</p>` : ''}
        <div class="get-app-card"><img class="get-app-qr" src="/api/app-qr.svg" alt="QR code for the ${esc(c.brand.name)} app" width="120" height="120" loading="lazy"><p${ed('appCard.qrText')}>${esc(a.qrText || '')}</p></div>
        <div class="store-badges">${badge(ios, a.appStoreBadge, 'App Store', '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16.400 12.600c0-2.300 1.900-3.400 2-3.500-1.100-1.600-2.800-1.800-3.400-1.800-1.400-.1-2.800.9-3.500.9s-1.800-.9-3-.8c-1.500 0-3 .9-3.800 2.300-1.600 2.800-.4 7 1.200 9.200.8 1.100 1.700 2.400 2.900 2.300 1.200 0 1.600-.7 3-.7s1.800.7 3 .7c1.300 0 2.100-1.100 2.800-2.200.9-1.300 1.300-2.500 1.300-2.600 0 0-2.500-1-2.500-3.800zM14.200 5.800c.6-.8 1.100-1.900 1-3-1 0-2.100.7-2.800 1.500-.6.700-1.200 1.800-1 2.900 1 .1 2.100-.6 2.800-1.400z"/></svg>')}
          ${badge(play, a.googlePlayBadge, 'Google Play', '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 2.800v18.400c0 .4.400.6.700.4L20.500 12.600c.3-.2.3-.7 0-.9L4.700 2.400C4.400 2.200 4 2.400 4 2.800z"/></svg>')}
          ${!play && apk ? badge(apk, '', 'Android app (download)', ICON.download) : ''}</div>
      </div>`;
  }

  /* table guests: Call staff, Bring the bill, Water please, and the Wi-Fi */
  function tableHelpHtml(c) {
    if (!TABLE || PREVIEW) return '';
    const t = c.tableHelp || {};
    const btns = FEATURE('tableButtons') && t.show !== false ? `<div class="tbl-btns">
        <button type="button" data-act="tcall" data-id="staff">${ICON.bell}<span>Call staff</span></button>
        <button type="button" data-act="tcall" data-id="bill">${ICON.receipt}<span>Bring the bill</span></button>
        <button type="button" data-act="tcall" data-id="water">${ICON.drop}<span>Water please</span></button></div>` : '';
    const wifi = t.wifiName ? `<p class="tbl-wifi">${ICON.wifi}<span>Wi-Fi <b>${esc(t.wifiName)}</b>${t.wifiPassword ? ` · password <b>${esc(t.wifiPassword)}</b>` : ''}</span>${t.wifiPassword ? `<button type="button" data-act="copywifi" data-id="${esc(t.wifiPassword)}">Copy</button>` : ''}</p>` : '';
    return btns || wifi ? `<div class="tbl-help">${btns}${wifi}</div>` : '';
  }

  /* menu items sold out today (staff tap it on the counter screen; back the next morning) */
  function markSoldOut(c) {
    const out = new Set(c.soldOut || []);
    if (!out.size) return;
    for (const g of c.menu.categories || []) for (const it of g.items || []) if (out.has(it.id)) { it.available = false; it.soldOut = true; }
  }


  /* ---------- version 12: Google sign-in, map pin, cash on delivery, live driver map ---------- */
  // Leaflet (free map library, copied into /vendor) with OpenStreetMap tiles. Loaded only when a map is needed.
  let leafletReady = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletReady) return leafletReady;
    const v = window.PM_V || '';
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `/vendor/leaflet/leaflet.css?v=${v}`;
    document.head.appendChild(css);
    leafletReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `/vendor/leaflet/leaflet.js?v=${v}`;
      s.onload = () => res(window.L);
      s.onerror = () => { leafletReady = null; rej(new Error('The map could not load. Please check your internet.')); };
      document.head.appendChild(s);
    });
    return leafletReady;
  }
  const tiles = (L) => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
  const AREA = () => Object.assign({ lat: 27.4287, lng: 85.0322, radiusKm: 9 }, (S.c && S.c.delivery) || {});
  function kmBetween(a, b) {
    const r = (d) => (d * Math.PI) / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  const pinIcon = (L, cls, label) => L.divIcon({ className: `pin pin--${cls}`, html: `<span>${label || ''}</span>`, iconSize: [34, 34], iconAnchor: [17, 34] });

  // Choose the delivery spot: a full-screen map with a pin that can be dragged, and "Use my location".
  async function openMapPicker() {
    let L;
    try { L = await loadLeaflet(); } catch (e) { return toast(e.message); }
    closeMapRaw();
    const area = AREA();
    const start = S.coLoc || { lat: area.lat, lng: area.lng };
    const box = document.createElement('div');
    box.id = 'map-pick';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Choose the delivery spot');
    box.innerHTML = `<div class="mp-top"><strong>Where should we deliver?</strong><span>Drag the map so the pin sits on your door, or use your location.</span></div>
      <div id="mp-map"></div>
      <div class="mp-foot"><p class="hint" id="mp-info"></p>
        <div class="row"><button type="button" class="btn btn--ghost" data-act="mp-gps">${ICON.pin}<span>Use my location</span></button>
        <button type="button" class="btn" data-act="mp-ok"><span>Deliver here</span></button>
        <button type="button" class="btn btn--ghost" data-act="mp-close"><span>Cancel</span></button></div></div>`;
    document.body.appendChild(box);
    navPush('map', closeMapRaw);
    const map = L.map('mp-map', { zoomControl: true }).setView([start.lat, start.lng], S.coLoc ? 17 : 14);
    tiles(L).addTo(map);
    L.circle([area.lat, area.lng], { radius: (Number(area.radiusKm) || 7) * 1000, color: '#A8843A', weight: 1.5, fillOpacity: 0.04 }).addTo(map);
    L.marker([area.lat, area.lng], { icon: pinIcon(L, 'cafe', '☕'), interactive: false }).addTo(map);
    const pin = L.marker([start.lat, start.lng], { icon: pinIcon(L, 'home', ''), draggable: true, autoPan: true }).addTo(map);
    const info = () => {
      const p = pin.getLatLng();
      const km = kmBetween({ lat: p.lat, lng: p.lng }, area);
      const out = Number(area.radiusKm) > 0 && km > Number(area.radiusKm);
      $('#mp-info').innerHTML = out ? `<b class="bad">${km.toFixed(1)} km away: outside our delivery area (Hetauda, up to ${area.radiusKm} km).</b>` : `${km.toFixed(1)} km from the cafe.`;
      $('[data-act=mp-ok]', box).disabled = out;
    };
    // Tapping the map moves the pin there; moving the map keeps the pin in the middle.
    map.on('click', (e) => { pin.setLatLng(e.latlng); info(); });
    map.on('move', () => { if (!S.mpDrag) pin.setLatLng(map.getCenter()); });
    map.on('moveend', info);
    pin.on('dragstart', () => { S.mpDrag = true; });
    pin.on('dragend', () => { S.mpDrag = false; map.panTo(pin.getLatLng()); info(); });
    S.mp = { map, pin, acc: 0 };
    info();
    setTimeout(() => map.invalidateSize(), 50);
    if (!S.coLoc) ACT['mp-gps'](true);
  }
  function closeMapRaw() {
    const b = $('#map-pick');
    if (S.mp && S.mp.map) S.mp.map.remove();
    S.mp = null;
    if (b) b.remove();
  }
  function closeMapPicker() { if (!navBack('map')) closeMapRaw(); }
  function paintPin() {
    const box = $('#co-pin');
    if (!box) return;
    const on = FEATURE('mapPin');
    box.hidden = !on;
    if (!on) return;
    const area = AREA();
    box.innerHTML = S.coLoc
      ? `<p class="pin-set">${ICON.pin}<span>Delivery spot set on the map · ${kmBetween(S.coLoc, area).toFixed(1)} km from the cafe</span></p><button type="button" class="btn btn--ghost btn--small" data-act="mp-open"><span>Change the spot</span></button>`
      : `<button type="button" class="btn btn--ghost" data-act="mp-open">${ICON.pin}<span>Choose the delivery spot on the map</span></button><p class="hint">Helps our driver find you. You can also just write the address.</p>`;
  }
  // Cash on delivery for deliveries (with change for one note); "Pay later" for the cafe and pickup.
  function paintPay(form) {
    const t = ($('input[name=type]:checked', form) || {}).value;
    const deliver = t === 'delivery' && FEATURE('cod');
    const later = $('#co-later-pay', form);
    const cod = $('#co-cod', form);
    if (!later || !cod) return;
    later.hidden = deliver; $('label[for=co-later-pay]', form).hidden = deliver;
    cod.hidden = !deliver; $('label[for=co-cod]', form).hidden = !deliver;
    if (deliver && later.checked) { cod.checked = true; }
    if (!deliver && cod.checked) { later.checked = true; }
    const m = ($('input[name=method]:checked', form) || {}).value;
    $('#co-change').hidden = m !== 'cod';
    $('#co-later-note').textContent = m === 'cod' ? 'Pay the driver in cash when your order arrives.' : 'Pay at the counter, or when your order arrives.';
    $('#co-pin-wrap').hidden = t !== 'delivery';
  }
  Object.assign(ACT, {
    'mp-open'() { openMapPicker(); },
    'mp-close'() { closeMapPicker(); },
    'mp-ok'() {
      if (!S.mp) return;
      const p = S.mp.pin.getLatLng();
      S.coLoc = { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6, acc: Math.round(S.mp.acc || 0) };
      try { sessionStorage.setItem('pm_pin', JSON.stringify(S.coLoc)); } catch (e) { /* no storage */ }
      closeMapPicker();
      paintPin();
    },
    'mp-gps'(quiet) {
      if (!navigator.geolocation || !S.mp) { if (quiet !== true) toast('This browser cannot find your location. Move the map instead.'); return; }
      navigator.geolocation.getCurrentPosition((pos) => {
        if (!S.mp) return;
        S.mp.acc = pos.coords.accuracy;
        S.mp.map.setView([pos.coords.latitude, pos.coords.longitude], 17);
        S.mp.pin.setLatLng([pos.coords.latitude, pos.coords.longitude]);
      }, (err) => { if (quiet !== true) toast(err.code === 1 ? 'Location is blocked for this site. Move the map to your door instead.' : 'We could not find your location. Move the map instead.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    },
    async 'cake-photo-clear'() { if (S.preset) S.preset.refPhoto = ''; S.cakePhoto = ''; const b = $('#cake-photo-state'); if (b) b.innerHTML = ''; const i = $('#cake-ref'); if (i) i.value = ''; const c = $('#co-ref-done'); if (c) c.remove(); const f = $('#co-ref'); if (f) f.closest('label').hidden = false; },
  });

  // The cake picture (downloaded or made with AI) is sent as soon as it is chosen on the cake form.
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'cake-ref' || !e.target.files[0]) return;
    const state = $('#cake-photo-state');
    try {
      if (state) state.textContent = 'Adding your photo...';
      S.cakePhoto = await sendPicture(e.target.files[0]);
      if (state) state.innerHTML = `<span class="ok">Photo added. We will make a cake like it.</span> <button type="button" class="link-btn" data-act="cake-photo-clear">Remove</button>`;
    } catch (err) { if (state) state.textContent = err.message; S.cakePhoto = ''; }
  });

  /* live delivery on the customer's order: driver on a map */
  const liveMaps = new Map();
  async function paintTracks() {
    const boxes = $$('.track-map');
    if (!boxes.length) { liveMaps.forEach((m) => m.map.remove()); liveMaps.clear(); return; }
    let L;
    try { L = await loadLeaflet(); } catch (e) { return; }
    for (const el of boxes) {
      const o = allOrders().find((x) => x.id === el.dataset.id);
      if (!o || !o.delivery) continue;
      const d = o.delivery;
      let m = liveMaps.get(o.id);
      if (m && m.el !== el) { m.map.remove(); liveMaps.delete(o.id); m = null; }
      if (!m) {
        const map = L.map(el, { zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false });
        tiles(L).addTo(map);
        m = { el, map, driver: null, dest: null };
        if (d.destination) m.dest = L.marker([d.destination.lat, d.destination.lng], { icon: pinIcon(L, 'home', '') }).addTo(map);
        liveMaps.set(o.id, m);
      }
      if (d.where) {
        if (!m.driver) m.driver = L.marker([d.where.lat, d.where.lng], { icon: pinIcon(L, 'bike', '🛵') }).addTo(m.map);
        else m.driver.setLatLng([d.where.lat, d.where.lng]);
      }
      const pts = [d.where, d.destination].filter(Boolean).map((p) => [p.lat, p.lng]);
      if (pts.length > 1) m.map.fitBounds(pts, { padding: [36, 36], maxZoom: 17 });
      else if (pts.length) m.map.setView(pts[0], 16);
      else if (d.cafe && d.cafe.lat) m.map.setView([d.cafe.lat, d.cafe.lng], 14);
      setTimeout(() => m.map.invalidateSize(), 30);
    }
    for (const [id, m] of liveMaps) if (!document.body.contains(m.el)) { m.map.remove(); liveMaps.delete(id); }
  }
  const DSTEP = { waiting: 'Waiting for a driver', assigned: 'A driver has your order', picked: 'Picked up from the cafe', onway: 'On the way to you', delivered: 'Delivered' };
  function trackHtml(o) {
    const d = o.delivery;
    if (!d || o.type !== 'delivery' || ['done', 'cancelled'].includes(o.status)) return '';
    const moving = ['picked', 'onway'].includes(d.status);
    return `<div class="track"><p class="track-line">🛵 <b>${esc(DSTEP[d.status] || '')}</b>${d.driver ? ` · ${esc(d.driver.name)}` : ''}${d.driver && d.driver.phone ? ` · <a href="tel:${esc(d.driver.phone)}">Call the driver</a>` : ''}</p>
      ${moving && FEATURE('driverTracking') ? `<div class="track-map" data-id="${esc(o.id)}" aria-label="Map showing your delivery"></div>${d.where ? `<p class="hint">Updated ${Math.max(0, Math.round((Date.now() - Date.parse(d.where.at)) / 1000))} seconds ago</p>` : '<p class="hint">The driver\'s location shows here once his phone shares it.</p>'}` : ''}</div>`;
  }

  /* Sign in with Google (Google Identity Services: Google's own button and sign-in window) */
  let gisReady = null;
  function loadGis() {
    if (window.google && window.google.accounts) return Promise.resolve();
    if (gisReady) return gisReady;
    gisReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = res;
      s.onerror = () => { gisReady = null; rej(new Error('Google sign-in could not load.')); };
      document.head.appendChild(s);
    });
    return gisReady;
  }
  async function paintGoogle() {
    const box = $('#g-signin');
    if (!box || !A.cfg || !A.cfg.google) return;
    try {
      await loadGis();
      window.google.accounts.id.initialize({
        client_id: A.cfg.google,
        ux_mode: 'popup',
        callback: async (r) => {
          try { const res = await call('POST', '/api/account/google', { credential: r.credential }); await signedInNow(res); } catch (e) { toast(e.message); }
        },
      });
      box.innerHTML = '';
      window.google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(320, box.clientWidth || 320) });
    } catch (e) { box.innerHTML = ''; }
  }
  const googleHtml = () => (A.cfg && A.cfg.google ? '<div class="g-signin-wrap f--wide"><div id="g-signin"></div><p class="or"><span>or</span></p></div>' : '');

  /* ---------- start ---------- */
  async function start() {
    if (ADMIN) {
      document.documentElement.classList.add('is-admin');
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/css/admin.css?v=' + (window.PM_V || Date.now());
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = '/js/admin.js?v=' + (window.PM_V || Date.now());
      document.body.appendChild(js);
      return;
    }
    try { S.cart = JSON.parse(localStorage.getItem('pm_cart') || '[]').filter((l) => l && l.itemId && l.qty > 0); } catch (e) { S.cart = []; }
    try {
      const [c, r] = await Promise.all([fetch('/api/content').then((x) => x.json()), fetch('/api/reviews').then((x) => x.json()).catch(() => [])]);
      S.c = c;
      markSoldOut(S.c);
      S.reviews = Array.isArray(r) ? r : [];
      render();
      if (!PREVIEW) { loadAccount().then(() => { if (location.hash === '#account') openAccount('orders'); }); startLive(); }
      const q = new URLSearchParams(location.search);
      if (/^#tab-/.test(location.hash)) {
        const id = location.hash.slice(5);
        if (S.c.menu.categories.some((x) => x.id === id)) { S.tab = id; redrawMenu(); }
        const m = $('#menu'); if (m) m.scrollIntoView();
      } else if (q.get('pick') && $('#cake')) {
        ACT.cake({ dataset: { item: q.get('pick'), label: q.get('size') || '' } });
      } else if (location.hash && location.hash.length > 1) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
      else if (TABLE && !PREVIEW && $('#menu')) $('#menu').scrollIntoView();
      const evPath = location.pathname.match(/^\/event\/([^/]+)/);
      if (evPath && !PREVIEW) openEvent(decodeURIComponent(evPath[1]));
      else if (/^#event-/.test(location.hash) && !PREVIEW) openEvent(location.hash.slice(7));
      else if (!PREVIEW && (readDraft() || {}).open && cartLines().length) openCheckout(); // back from the payment app
      else showClosedNotice();
      reviewLater();
    } catch (err) {
      $('#app').innerHTML = '<p class="boot">The website could not load. Please refresh the page.</p>';
    }
    if (PREVIEW && window.parent !== window) {
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || !e.data) return;
        if (e.data.pm === 'content') { S.c = e.data.content; render(); }
        if (e.data.pm === 'inline') { S.inline = Boolean(e.data.on); setInline(); }
        if (e.data.pm === 'layout') { S.layout = Boolean(e.data.on); markLayout(); }
        if (e.data.pm === 'scroll') {
          const t = document.getElementById(e.data.id);
          if (t) { t.scrollIntoView({ behavior: 'smooth' }); return; }
          // The section is on another page: show that page in the preview.
          const id = e.data.id;
          const path = id in PAGEABLE && placeOf(S.c, id) !== 'home' ? PAGEABLE[id] : '/';
          if (path !== location.pathname) location.href = `${path}?preview=1#${id}`;
        }
      });
      window.parent.postMessage({ pm: 'ready' }, location.origin);
    }
  }
  window.addEventListener('hashchange', () => { if (!PREVIEW && !/^\/admin/.test(location.pathname) && (location.hash === '#admin') !== ADMIN) location.reload(); });
  start();
})();
