/*
 * Print menu editor (/admin/print-menu), owner only.
 * The paper menu is one A4 page. Items and prices are the website menu's own (content.menu): changing
 * them here changes the website too. Its layout and looks are kept in content.printMenu.
 * Sizes: fonts in points (pt), spaces in millimetres (mm).
 */
(() => {
  'use strict';
  const MM = 96 / 25.4; // CSS px in a millimetre
  const A4 = { w: 210, h: 297 };
  const PICTURE_WIDTH = 2480; // A4 at 300 dpi
  const INK = '#231F20';
  const NONE = '__none'; // a line's price column that is left empty on purpose

  const FONTS = ['Rokkitt', 'Jost', 'Arvo', 'Roboto Slab', 'Zilla Slab', 'Bitter', 'Josefin Slab', 'Josefin Sans', 'Montserrat',
    'Playfair Display', 'Cormorant Garamond', 'Marcellus', 'Alfa Slab One', 'Oswald', 'DM Serif Display', 'Cinzel', 'Lato', 'Allura'];
  const SERIF = ['Rokkitt', 'Arvo', 'Roboto Slab', 'Zilla Slab', 'Bitter', 'Josefin Slab', 'Playfair Display', 'Cormorant Garamond', 'Marcellus', 'Alfa Slab One', 'DM Serif Display', 'Cinzel'];
  const WEIGHTS = [[100, 'Hairline'], [200, 'Extra light'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semi bold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']];
  const ROLES = [
    ['big', 'Big headings', 'MOCK, NON, ICE CREAM'],
    ['bigSub', 'Small word with a big heading', 'TAIL, COFFEE'],
    ['tagline', 'Line under a heading', 'like MOMENTS OF BLISS'],
    ['small', 'Section headings', 'HOT COFFEE, TEA, RAMEN'],
    ['label', 'Price column names', 'REGULAR / SINGLE'],
    ['item', 'Item names', 'ESPRESSO, CAPPUCCINO'],
    ['price', 'Prices', '140, 200'],
    ['note', 'Note at the bottom', ''],
  ];
  const SUB_PLACES = [['none', 'Not shown'], ['below', 'Under the heading, thin and spaced (like MOMENTS OF BLISS)'], ['dash', 'Under the heading after a dash (like —COFFEE)'], ['side', 'Standing up beside the heading (like MOCK TAIL)']];

  const S = {
    c: null, saved: '', undo: [], redo: [], lastKey: null, lastAt: 0,
    tab: 'menu', open: null, openText: null, zoom: 'fit', fit: 1, overflow: 0, shots: [], paneClosed: false, defaults: null,
  };
  let previewQueued = false;

  /* ---------- small helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = Boolean(v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const fmt = (n) => String(round(n, 2));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fontStack = (f) => `'${String(f || 'Jost').replace(/'/g, '')}', ${SERIF.includes(f) ? 'Georgia, serif' : 'Arial, sans-serif'}`;
  const okColor = (c, fb) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : fb);

  function flash(msg, bad) {
    const el = $('#pm-flash');
    el.textContent = msg;
    el.classList.toggle('is-bad', Boolean(bad));
    el.classList.add('is-on');
    clearTimeout(flash.t);
    flash.t = setTimeout(() => el.classList.remove('is-on'), bad ? 6000 : 3200);
  }
  function busy(text) {
    let el = $('.pm-busy');
    if (!text) { if (el) el.remove(); return; }
    if (!el) { el = h('div', { class: 'pm-busy' }, h('div')); document.body.append(el); }
    el.firstChild.textContent = text;
  }
  async function api(method, url, body, type) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      if (type) { opt.headers['Content-Type'] = type; opt.body = body; } else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    }
    const r = await fetch(url, opt);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || `Something went wrong (${r.status}).`); e.status = r.status; e.data = data; throw e; }
    return data;
  }

  /* ---------- data ---------- */
  const pm = () => S.c.printMenu;
  const cats = () => S.c.menu.categories || [];
  let itemIndex = new Map();
  function indexItems() {
    itemIndex = new Map();
    for (const g of cats()) for (const it of g.items || []) itemIndex.set(it.id, { it, g });
  }
  const itemOf = (row) => (row && row.item ? (itemIndex.get(row.item) || {}).it || null : null);
  const snapshot = () => JSON.stringify({ menu: S.c.menu, printMenu: S.c.printMenu });
  const dirty = () => snapshot() !== S.saved;

  // Keep every section's lines in step with the website: new items in a linked group get a line,
  // lines for items that were deleted (or whose group was unlinked) go.
  function syncAll() {
    indexItems();
    for (const s of pm().sections) {
      if (!Array.isArray(s.rows)) s.rows = [];
      if (!Array.isArray(s.cols) || !s.cols.length) s.cols = [{ label: '', from: ['Regular', 'Single', ''] }];
      if (!Array.isArray(s.groups)) s.groups = [];
      const inGroups = new Set();
      for (const gid of s.groups) for (const it of (cats().find((g) => g.id === gid) || {}).items || []) inGroups.add(it.id);
      s.rows = s.rows.filter((r) => !r.item || inGroups.has(r.item));
      const have = new Set(s.rows.filter((r) => r.item && !r.extra).map((r) => r.item));
      for (const gid of s.groups) {
        for (const it of (cats().find((g) => g.id === gid) || {}).items || []) {
          if (have.has(it.id)) continue;
          const lastLinked = s.rows.reduce((at, r, i) => (r.item && !r.extra ? i : at), -1);
          s.rows.splice(lastLinked + 1, 0, { id: uid('pr'), item: it.id, name: '', prices: [], from: [], hide: false });
          have.add(it.id);
        }
      }
      for (const r of s.rows) { if (!Array.isArray(r.prices)) r.prices = []; if (!Array.isArray(r.from)) r.from = []; }
    }
  }
  // Which website price goes in price column j of a line.
  function priceEntry(row, sec, j) {
    const it = itemOf(row);
    if (!it) return null;
    const prices = it.prices || [];
    const pick = row.from[j];
    if (pick === NONE) return null;
    if (pick !== undefined && pick !== null && pick !== '') return prices.find((p) => lc(p.label) === lc(pick)) || null;
    if (row.extra) return null;
    const col = sec.cols[j] || {};
    const want = (col.from || []).map(lc);
    let p = prices.find((x) => want.includes(lc(x.label)));
    if (!p && j === 0) {
      const taken = new Set();
      sec.cols.forEach((c, i) => { if (i) (c.from || []).forEach((x) => taken.add(lc(x))); });
      p = prices.find((x) => !taken.has(lc(x.label)) && !x.whole) || null;
    }
    return p || null;
  }
  function priceText(row, sec, j) {
    if (!row.item) return String(row.prices[j] == null ? '' : row.prices[j]);
    const p = priceEntry(row, sec, j);
    return p && Number(p.price) ? String(p.price) : '';
  }
  function setPrice(row, sec, j, text) {
    if (!row.item) { row.prices[j] = text; return; }
    const it = itemOf(row);
    if (!it) return;
    const digits = String(text).replace(/[^\d.]/g, '');
    const n = digits === '' ? 0 : Number(digits);
    const p = priceEntry(row, sec, j);
    if (p) { p.price = n; return; }
    if (!n) return;
    const pick = row.from[j];
    const label = pick && pick !== NONE ? pick : ((sec.cols[j] || {}).from || [])[0] || (sec.cols[j] || {}).label || '';
    if (!Array.isArray(it.prices)) it.prices = [];
    if (it.prices.length === 1 && !it.prices[0].label && !Number(it.prices[0].price)) it.prices[0] = { label, price: n };
    else it.prices.push({ label, price: n });
    if (pick === NONE) row.from[j] = null;
  }
  const rowName = (row) => (row.name ? row.name : (itemOf(row) || {}).name || '');
  const findSecOfRow = (rid) => pm().sections.find((s) => s.rows.some((r) => r.id === rid));

  /* ---------- styles of one text ---------- */
  const K = () => (Number(pm().page.scale) || 100) / 100;
  function look(role, key) {
    const base = pm().styles[role] || {};
    const o = (key && pm().over[key]) || {};
    return {
      font: o.font || base.font, weight: o.weight || base.weight, color: o.color || base.color,
      italic: o.italic !== undefined ? o.italic : base.italic, upper: o.upper !== undefined ? o.upper : base.upper,
      spacing: o.spacing !== undefined ? o.spacing : base.spacing, line: base.line,
      size: Math.max(2, (Number(base.size) || 8) + (Number(o.size) || 0)),
    };
  }
  function css(role, key) {
    const l = look(role, key);
    return `font-family:${fontStack(l.font)};font-weight:${Number(l.weight) || 400};font-size:${round(l.size * K(), 3)}pt;color:${okColor(l.color, INK)};`
      + `font-style:${l.italic ? 'italic' : 'normal'};text-transform:${l.upper ? 'uppercase' : 'none'};letter-spacing:${(Number(l.spacing) || 0) / 100}em;line-height:${Number(l.line) || 1.2};`;
  }
  const textSpan = (tag, role, key, text, extra) => h(tag, { 'data-k': key, style: css(role, key) + (extra || '') }, text);

  /* ---------- the paper ---------- */
  function dotsSvg(d) {
    const size = Math.max(10, Number(d.size) || 58);
    const step = Math.max(0.8, Number(d.step) || 1.9);
    const max = Math.max(0.1, Number(d.dot) || 0.75);
    let out = '';
    for (let x = step / 2; x < size; x += step) {
      for (let y = step / 2; y < size; y += step) {
        const t = Math.hypot(x, y) / size;
        if (t >= 1) continue;
        // A soft quarter ring that fades out towards the page, like the printed halftone.
        const ring = Math.max(0, 1 - Math.abs(t - 0.38) / 0.62);
        const r = max * ring ** 1.6;
        if (r < 0.06) continue;
        out += `<circle cx="${round(x, 2)}" cy="${round(y, 2)}" r="${round(r, 3)}"/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}" fill="${okColor(d.color, '#BDBDBD')}">${out}</svg>`;
  }
  const tinted = new Map();
  function logoSrc() {
    const l = pm().logo;
    const src = l.src || '/img/print-logo.png';
    const color = okColor(l.color, INK).toLowerCase();
    if (color === INK.toLowerCase() || /\.svg(\?|$)/i.test(src)) return src;
    const key = `${src}|${color}`;
    if (tinted.has(key)) return tinted.get(key) || src;
    tinted.set(key, '');
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, cv.width, cv.height);
      try { tinted.set(key, cv.toDataURL('image/png')); } catch { tinted.delete(key); }
      queuePreview();
    };
    img.src = src;
    return src;
  }

  function sectionEl(s, first) {
    const p = pm().page;
    const k = K();
    const t = `s:${s.id}:title`;
    const sk = `s:${s.id}:sub`;
    const role = s.look === 'big' ? 'big' : 'small';
    const sub = String(s.sub || '').trim();
    const place = sub ? (s.subStyle || 'none') : 'none';
    const head = [];
    const titleEl = textSpan('span', role, t, s.title);
    if (place === 'side') {
      const side = textSpan('span', 'bigSub', sk, sub);
      side.classList.add('pm-side');
      head.push(h('div', { class: 'pm-big' }, titleEl, side));
    } else head.push(h('div', { class: 'pm-big' }, titleEl));
    if (place === 'dash') head.push(h('div', { class: 'pm-dashline', style: css('bigSub', sk) }, h('i', { class: 'pm-dash' }), textSpan('span', 'bigSub', sk, sub)));
    if (place === 'below') head.push(textSpan('div', 'tagline', sk, sub));
    const hl = p.headingLine || {};
    const headBox = h('div', {
      class: 'pm-head',
      style: `margin-bottom:${round((Number(p.afterHeading) || 0) * k, 3)}mm;`
        + (hl.show ? `border-bottom:${Number(hl.width) || 0.5}pt solid ${okColor(hl.color, INK)};padding-bottom:${Number(hl.gap) || 0}mm;` : ''),
    }, head);

    const n = s.cols.length;
    const pw = (Number(s.priceWidth) || Number(p.priceWidth) || 17) * k;
    // "Line up prices": a section with fewer price columns still keeps the same columns as the
    // widest section in its paper column, so single prices sit under the first price column.
    const side = s.column === 'right' ? 'right' : 'left';
    const slots = p.lineUp === false ? n : Math.max(n, ...pm().sections.filter((x) => x.show !== false && (x.column === 'right' ? 'right' : 'left') === side).map((x) => x.cols.length));
    const grid = `grid-template-columns:minmax(0,1fr) repeat(${n}, ${round(pw, 3)}mm)${slots > n ? ` repeat(${slots - n}, ${round(pw, 3)}mm)` : ''};column-gap:1.5mm;`;
    const align = p.priceAlign === 'right' ? 'right' : p.priceAlign === 'center' ? 'center' : 'left';
    const rl = p.rowLine || {};
    const rowLine = rl.show ? `border-bottom:${Number(rl.width) || 0.3}pt ${['solid', 'dashed', 'dotted'].includes(rl.style) ? rl.style : 'dotted'} ${okColor(rl.color, '#D9D4CC')};padding-bottom:.6mm;` : '';
    const rows = [];
    if (s.cols.some((c) => String(c.label || '').trim())) {
      rows.push(h('div', { class: 'pm-row pm-labels', style: grid + `margin-bottom:${round((Number(p.labelGap) || 0) * k, 3)}mm;` },
        h('span'), s.cols.map((c, j) => textSpan('span', 'label', `s:${s.id}:c${j}`, c.label || '', `text-align:${align};`))));
    }
    for (const r of s.rows) {
      if (r.hide) continue;
      if (r.item && !itemOf(r)) continue;
      rows.push(h('div', { class: 'pm-row', style: grid + rowLine },
        textSpan('span', 'item', `r:${r.id}:n`, rowName(r)),
        s.cols.map((c, j) => textSpan('span', 'price', `r:${r.id}:p${j}`, priceText(r, s, j), `text-align:${align};`))));
    }
    return h('section', { class: 'pm-sec', 'data-sec': s.id, style: `margin-top:${round(((first ? 0 : Number(p.section) || 0) + (Number(s.gap) || 0)) * k, 3)}mm;` },
      headBox, h('div', { class: 'pm-rows', style: `gap:${round((Number(p.row) || 0) * k, 3)}mm;` }, rows));
  }

  function sheetEl() {
    const P = pm();
    const p = P.page;
    const k = K();
    const sheet = h('div', { id: 'pm-sheet', class: 'pm-sheet', style: `background:${okColor(p.paper, '#FFFFFF')};` });
    const d = p.dots || {};
    if (d.show) {
      if (d.tl !== false) sheet.append(h('div', { class: 'pm-dots pm-dots--tl', html: dotsSvg(d) }));
      if (d.br !== false) sheet.append(h('div', { class: 'pm-dots pm-dots--br', html: dotsSvg(d) }));
    }
    const b = p.border || {};
    if (b.show) {
      const inset = Number(b.inset) || 0;
      sheet.append(h('div', { class: 'pm-border', style: `inset:${inset}mm;border:${Number(b.width) || 0.8}pt ${['solid', 'dashed', 'dotted', 'double'].includes(b.style) ? b.style : 'solid'} ${okColor(b.color, INK)};border-radius:${Number(b.radius) || 0}mm;` }));
    }
    const inner = h('div', { class: 'pm-inner', style: `top:${Number(p.top) || 0}mm;bottom:${Number(p.bottom) || 0}mm;left:${Number(p.left) || 0}mm;right:${Number(p.right) || 0}mm;` });
    const fit = h('div', { class: 'pm-fit' });
    const L = P.logo || {};
    if (L.show) {
      fit.append(h('div', { class: 'pm-logo', style: `margin-bottom:${round((Number(L.gap) || 0) * k, 3)}mm;` },
        h('img', { src: logoSrc(), alt: 'Pick Me', 'data-k': 'logo', style: `width:${round((Number(L.width) || 40) * k, 3)}mm;` })));
    }
    const split = Math.min(80, Math.max(20, Number(p.split) || 50));
    const cols = h('div', { class: 'pm-cols', style: `grid-template-columns:${split}fr ${100 - split}fr;column-gap:${Number(p.gap) || 0}mm;` });
    for (const side of ['left', 'right']) {
      const col = h('div', { class: 'pm-col' });
      let first = true;
      for (const s of P.sections) {
        if (s.show === false || (s.column === 'right' ? 'right' : 'left') !== side) continue;
        col.append(sectionEl(s, first));
        first = false;
      }
      cols.append(col);
    }
    fit.append(cols);
    if (P.note && P.note.show && String(P.note.text || '').trim()) {
      fit.append(h('div', { class: 'pm-note', style: `margin-top:${round((Number(p.section) || 4) * k, 3)}mm;` }, textSpan('div', 'note', 'note', P.note.text)));
    }
    inner.append(fit);
    sheet.append(inner);
    return sheet;
  }

  // Never more than one A4: if the menu is too long, everything on it is shrunk evenly to fit.
  function fitSheet(sheet) {
    const inner = $('.pm-inner', sheet);
    const fit = $('.pm-fit', sheet);
    fit.style.transform = '';
    fit.style.width = '';
    const room = inner.clientHeight;
    const need = fit.scrollHeight;
    const f = need > room && need > 0 ? Math.max(0.3, (room - 1) / need) : 1;
    if (f < 1) {
      fit.style.transform = `scale(${f})`;
      fit.style.width = `${100 / f}%`;
    }
    S.fit = f;
    S.overflow = need > room ? (need - room) / MM : 0;
    S.spare = need < room ? (room - need) / MM : 0;
  }

  function renderPreview() {
    previewQueued = false;
    const zoom = $('.pm-zoom');
    if (!zoom) return;
    const picked = $$('.pm-sheet .is-pick').map((el) => el.dataset.k);
    const sheet = sheetEl();
    zoom.replaceChildren(sheet);
    fitSheet(sheet);
    for (const k of picked) markPick(k, true);
    applyZoom();
    const badge = $('.pm-fitbadge');
    if (badge) {
      badge.classList.toggle('is-shrunk', S.fit < 1);
      badge.textContent = S.fit < 1 ? `Shrunk to ${Math.floor(S.fit * 100)}% to fit one A4` : `Fits one A4 (${Math.floor(S.spare)} mm spare)`;
      badge.title = S.fit < 1 ? `The menu is ${Math.ceil(S.overflow)} mm too long, so everything is printed a little smaller. Make text or spaces smaller to print at full size.` : 'The whole menu fits on one A4 page.';
    }
  }
  function queuePreview() {
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(renderPreview);
  }
  function applyZoom() {
    const scroll = $('.pm-scroll');
    const zoom = $('.pm-zoom');
    const wrap = $('.pm-zoomwrap');
    if (!scroll || !zoom || !wrap) return;
    const w = A4.w * MM;
    const hgt = A4.h * MM;
    const room = scroll.clientWidth - 28;
    const z = S.zoom === 'fit' ? Math.max(0.2, room / w) : S.zoom;
    zoom.style.transform = `scale(${z})`;
    wrap.style.width = `${w * z}px`;
    wrap.style.height = `${hgt * z}px`;
    const out = $('.pm-zoomval');
    if (out) out.textContent = `${Math.round(z * 100)}%`;
  }
  function markPick(key, on) {
    for (const el of $$('.pm-sheet [data-k]')) if (el.dataset.k === key) el.classList.toggle('is-pick', on);
  }

  /* ---------- changing things, undo and redo ---------- */
  function before(key) {
    const now = Date.now();
    if (key && key === S.lastKey && now - S.lastAt < 1500) { S.lastAt = now; return; }
    S.undo.push(snapshot());
    if (S.undo.length > 300) S.undo.shift();
    S.redo = [];
    S.lastKey = key || null;
    S.lastAt = now;
  }
  function edit(fn, opts) {
    const o = opts || {};
    before(o.key);
    fn();
    afterChange(o.rebuild);
  }
  function afterChange(rebuild) {
    syncAll();
    queuePreview();
    status();
    if (rebuild) renderPanel();
  }
  function undo() {
    if (!S.undo.length) return;
    S.redo.push(snapshot());
    restore(S.undo.pop());
  }
  function redo() {
    if (!S.redo.length) return;
    S.undo.push(snapshot());
    restore(S.redo.pop());
  }
  function restore(snap) {
    const o = JSON.parse(snap);
    S.c.menu = o.menu;
    S.c.printMenu = o.printMenu;
    S.lastKey = null;
    afterChange(true);
  }
  function status() {
    const el = $('.pm-status');
    if (el) {
      const d = dirty();
      el.textContent = d ? 'Not saved yet' : 'All changes saved';
      el.classList.toggle('is-dirty', d);
    }
    const u = $('#pm-undo');
    const r = $('#pm-redo');
    if (u) u.disabled = !S.undo.length;
    if (r) r.disabled = !S.redo.length;
  }

  /* ---------- editor building blocks ---------- */
  // A number with small up / down arrows.
  function stepper(get, set, o) {
    const opt = Object.assign({ step: 0.5, min: -999, max: 999, unit: '', digits: 2, tiny: false, key: '', changed: null }, o || {});
    const out = h('output', {}, '');
    const box = h('span', { class: `pm-step${opt.tiny ? ' pm-step--tiny' : ''}` });
    const show = () => {
      out.textContent = `${fmt(get())}${opt.unit}`;
      if (opt.changed) box.classList.toggle('is-changed', Boolean(opt.changed()));
    };
    const bump = (dir) => {
      const v = Math.min(opt.max, Math.max(opt.min, round((Number(get()) || 0) + dir * opt.step, opt.digits)));
      edit(() => set(v), { key: `step:${opt.key}` });
      show();
    };
    box.append(
      h('button', { type: 'button', title: 'Smaller', 'aria-label': 'Smaller', onclick: () => bump(-1) }, '▼'),
      out,
      h('button', { type: 'button', title: 'Bigger', 'aria-label': 'Bigger', onclick: () => bump(1) }, '▲'));
    show();
    return box;
  }
  // Size arrows for one single text on the paper (each text has its own size).
  function textSize(key, role) {
    return stepper(() => look(role, key).size, (v) => {
      const base = Number(pm().styles[role].size) || 8;
      const o = pm().over[key] || {};
      o.size = round(v - base, 2);
      if (!o.size) delete o.size;
      if (Object.keys(o).length) pm().over[key] = o; else delete pm().over[key];
    }, { step: 0.5, min: 2, max: 120, unit: 'pt', tiny: true, key, changed: () => (pm().over[key] || {}).size });
  }
  function aaButton(key, role) {
    const changed = Object.keys(pm().over[key] || {}).some((k) => k !== 'size');
    return h('button', {
      type: 'button', class: `pm-aa${changed ? ' is-changed' : ''}${S.openText === key ? ' is-on' : ''}`, title: 'Font, colour and style of this text', 'aria-label': 'Font, colour and style of this text',
      onclick: () => { S.openText = S.openText === key ? null : key; S.openRole = role; renderPanel(); },
    }, 'Aa');
  }
  function textBox(key, role) {
    const o = () => pm().over[key] || (pm().over[key] = {});
    const tidy = () => { const x = pm().over[key]; if (x && !Object.keys(x).length) delete pm().over[key]; };
    const setO = (prop, v) => { if (v === '' || v === undefined) delete o()[prop]; else o()[prop] = v; tidy(); };
    const base = pm().styles[role];
    const cur = pm().over[key] || {};
    return h('div', { class: 'pm-textbox' },
      h('div', { class: 'pm-fields' },
        field('Font', selectEl([['', `Same as all ${roleName(role).toLowerCase()} (${base.font})`]].concat(FONTS.map((f) => [f, f])), cur.font || '', (v) => edit(() => setO('font', v)))),
        field('Thickness', selectEl([['', 'Same as the others']].concat(WEIGHTS.map(([w, n]) => [String(w), `${n} (${w})`])), cur.weight ? String(cur.weight) : '', (v) => edit(() => setO('weight', v ? Number(v) : '')))),
        field('Colour', colorEl(() => cur.color || base.color, (v) => edit(() => setO('color', v), { key: `c:${key}` }))),
        field('Slanted (italic)', selectEl([['', 'Same as the others'], ['1', 'Yes'], ['0', 'No']], cur.italic === undefined ? '' : cur.italic ? '1' : '0', (v) => edit(() => setO('italic', v === '' ? '' : v === '1')))),
        field('Capital letters', selectEl([['', 'Same as the others'], ['1', 'ALL CAPITALS'], ['0', 'As typed']], cur.upper === undefined ? '' : cur.upper ? '1' : '0', (v) => edit(() => setO('upper', v === '' ? '' : v === '1')))),
        field('Letter spacing', stepper(() => (cur.spacing !== undefined ? cur.spacing : base.spacing) || 0, (v) => { setO('spacing', v); }, { step: 1, min: -20, max: 80, key: `ls:${key}` }))),
      h('div', { class: 'pm-row-btns' },
        h('button', { type: 'button', class: 'pm-btn pm-btn--small', onclick: () => edit(() => { delete pm().over[key]; }, { rebuild: true }) }, 'Reset this text to normal'),
        h('button', { type: 'button', class: 'pm-btn pm-btn--small', onclick: () => { S.openText = null; renderPanel(); } }, 'Close')));
  }
  const roleName = (role) => (ROLES.find((r) => r[0] === role) || [role, role])[1];
  function field(label, control, wide) {
    return h('label', { class: 'pm-field', style: wide ? 'grid-column:1/-1' : '' }, h('span', { class: 'pm-label' }, label), control);
  }
  function inputEl(value, onInput, o) {
    const opt = o || {};
    return h('input', { class: 'pm-input', value: value == null ? '' : value, placeholder: opt.placeholder || '', inputmode: opt.numeric ? 'numeric' : null, 'aria-label': opt.label || null,
      oninput: (e) => onInput(e.target.value), onfocus: opt.onfocus || null, onblur: opt.onblur || null });
  }
  function selectEl(options, value, onChange) {
    const sel = h('select', { class: 'pm-select', onchange: (e) => onChange(e.target.value) },
      options.map(([v, t]) => h('option', { value: v }, t)));
    sel.value = value == null ? '' : String(value);
    return sel;
  }
  function colorEl(get, set) {
    const txt = h('input', { class: 'pm-input', value: get() || '', maxlength: 9, oninput: (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { pick.value = e.target.value; set(e.target.value); } } });
    const pick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(get() || '') ? get() : '#231f20', oninput: (e) => { txt.value = e.target.value; set(e.target.value); } });
    return h('span', { class: 'pm-color' }, pick, txt);
  }
  function checkEl(label, value, onChange) {
    return h('label', { class: 'pm-check' }, h('input', { type: 'checkbox', checked: value, onchange: (e) => onChange(e.target.checked) }), label);
  }
  // A text on the paper: its words, its own size arrows and its Aa button. Focusing it lights it up on the paper.
  function textLine(key, role, value, onInput, o) {
    const opt = o || {};
    const line = h('div', { class: 'pm-tline', 'data-for': key },
      opt.before || null,
      inputEl(value, onInput, { placeholder: opt.placeholder, numeric: opt.numeric, label: opt.label,
        onfocus: () => markPick(key, true), onblur: () => markPick(key, false) }),
      textSize(key, role), aaButton(key, role), opt.after || null);
    return S.openText === key ? [line, textBox(key, role)] : line;
  }

  /* ---------- tab: menu (sections and items) ---------- */
  function moveIn(list, i, d) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  }
  function sectionCard(s, i) {
    const P = pm();
    const open = S.open === s.id;
    const shown = s.rows.filter((r) => !r.hide).length;
    const card = h('details', { class: `pm-card${s.show === false ? ' is-off' : ''}`, 'data-card': s.id, open },
      h('summary', { onclick: (e) => { e.preventDefault(); S.open = open ? null : s.id; S.openText = null; renderPanel(); } },
        h('span', { class: 'pm-sum-title' }, `${s.title}${s.sub && s.subStyle !== 'none' ? ' ' + s.sub : ''}`.toUpperCase()),
        h('span', { class: 'pm-sum-meta' }, `${s.column === 'right' ? 'right' : 'left'} column · ${shown} item${shown === 1 ? '' : 's'}${s.groups.length ? '' : ' · paper only'}`),
        h('span', { class: 'pm-sum-tools', onclick: (e) => e.stopPropagation() },
          h('button', { type: 'button', class: 'pm-icon', title: 'Move up', 'aria-label': 'Move section up', onclick: (e) => { e.preventDefault(); edit(() => moveIn(P.sections, i, -1), { rebuild: true }); } }, '↑'),
          h('button', { type: 'button', class: 'pm-icon', title: 'Move down', 'aria-label': 'Move section down', onclick: (e) => { e.preventDefault(); edit(() => moveIn(P.sections, i, 1), { rebuild: true }); } }, '↓'),
          h('label', { class: 'pm-check', title: 'Show on the paper' }, h('input', { type: 'checkbox', checked: s.show !== false, onchange: (e) => edit(() => { s.show = e.target.checked; }, { rebuild: true }) }), 'Show'))));
    if (!open) return card;
    const body = h('div', { class: 'pm-card-body' });
    body.append(
      h('div', { class: 'pm-sub' }, 'Heading'),
      h('div', { class: 'pm-fields' },
        field('Heading', textLine(`s:${s.id}:title`, s.look === 'big' ? 'big' : 'small', s.title, (v) => edit(() => { s.title = v; }, { key: `t:${s.id}` })), true),
        field('Heading style', selectEl([['small', 'Small heading (like HOT, TEA)'], ['big', 'Big heading (like NON, MOCK, ICECREAM)']], s.look === 'big' ? 'big' : 'small', (v) => edit(() => { s.look = v; }, { rebuild: true }))),
        field('Second word or line (optional)', textLine(`s:${s.id}:sub`, s.subStyle === 'below' ? 'tagline' : 'bigSub', s.sub || '', (v) => edit(() => { s.sub = v; }, { key: `u:${s.id}` }), { placeholder: 'for example TAIL or COFFEE' }), true),
        field('Where the second word goes', selectEl(SUB_PLACES, s.subStyle || 'none', (v) => edit(() => { s.subStyle = v; }, { rebuild: true }))),
        field('Column', selectEl([['left', 'Left column'], ['right', 'Right column']], s.column === 'right' ? 'right' : 'left', (v) => edit(() => { s.column = v; }, { rebuild: true }))),
        field('Extra space above (mm)', stepper(() => Number(s.gap) || 0, (v) => { s.gap = v; }, { step: 0.5, min: -20, max: 60, unit: ' mm', key: `gap:${s.id}` })),
        field('Price column width (mm)', stepper(() => Number(s.priceWidth) || Number(P.page.priceWidth) || 17, (v) => { s.priceWidth = v; }, { step: 0.5, min: 5, max: 60, unit: ' mm', key: `pw:${s.id}`, changed: () => s.priceWidth })),
      ),
      h('div', { class: 'pm-sub' }, 'Linked website menu groups'),
      h('p', { class: 'pm-intro', style: 'margin:0' }, s.groups.length ? 'Items of these groups show here, with their website prices. Tick or untick to change.' : 'Nothing linked: the lines below are on the paper only (they are not on the website).'),
      h('div', { class: 'pm-row-btns' }, cats().map((g) => checkEl(g.name, s.groups.includes(g.id), (on) => edit(() => {
        s.groups = on ? s.groups.concat(g.id) : s.groups.filter((x) => x !== g.id);
      }, { rebuild: true })))),
      h('div', { class: 'pm-sub' }, 'Price columns'),
      h('div', { class: 'pm-lines' }, s.cols.map((c, j) => h('div', { class: 'pm-fields', style: 'grid-template-columns: minmax(200px,1.4fr) minmax(160px,1fr) auto; align-items:end' },
        field(`Column ${j + 1} name on paper (empty = no name)`, textLine(`s:${s.id}:c${j}`, 'label', c.label || '', (v) => edit(() => { c.label = v; }, { key: `cl:${s.id}:${j}` }))),
        field('Takes website sizes named', inputEl((c.from || []).map((x) => (x === '' ? '(no size name)' : x)).join(', '), (v) => edit(() => {
          c.from = v.split(',').map((x) => x.trim()).filter((x, n, a) => x || a.length === 1).map((x) => (x === '(no size name)' ? '' : x));
        }, { key: `cf:${s.id}:${j}` }), { placeholder: 'Regular, Single' })),
        h('button', { type: 'button', class: 'pm-btn pm-btn--small pm-btn--danger', disabled: s.cols.length < 2, onclick: () => edit(() => { s.cols.splice(j, 1); for (const r of s.rows) { r.prices.splice(j, 1); r.from.splice(j, 1); } }, { rebuild: true }) }, 'Remove')))),
      h('div', { class: 'pm-row-btns' }, h('button', { type: 'button', class: 'pm-btn pm-btn--small', disabled: s.cols.length >= 4, onclick: () => edit(() => { s.cols.push({ label: 'Large', from: ['Large'] }); }, { rebuild: true }) }, '+ Add a price column')),
      h('div', { class: 'pm-sub' }, 'Items'),
      linesTable(s),
      h('div', { class: 'pm-row-btns' },
        s.groups.length ? h('button', { type: 'button', class: 'pm-btn pm-btn--small pm-btn--gold', onclick: () => addWebItem(s) }, '+ Add an item (website and paper)') : null,
        h('button', { type: 'button', class: 'pm-btn pm-btn--small', onclick: () => edit(() => { s.rows.push({ id: uid('pr'), item: null, name: 'New item', prices: s.cols.map(() => ''), from: [], hide: false }); }, { rebuild: true }) }, '+ Add a paper-only line'),
        h('span', { style: 'flex:1' }),
        h('button', { type: 'button', class: 'pm-btn pm-btn--small pm-btn--danger', onclick: () => {
          if (!window.confirm(`Remove the section "${s.title}" from the paper menu? The website menu is not changed.`)) return;
          edit(() => { P.sections.splice(i, 1); S.open = null; }, { rebuild: true });
        } }, 'Remove this section')),
    );
    card.append(body);
    return card;
  }
  function linesTable(s) {
    const n = s.cols.length;
    const tmpl = `grid-template-columns: minmax(170px, 2.2fr) repeat(${n}, minmax(118px, 1fr)) 92px 92px`;
    const wrap = h('div', { class: 'pm-lines' },
      h('div', { class: 'pm-lhead', style: tmpl }, h('span', {}, 'Name'), s.cols.map((c, j) => h('span', {}, c.label || `Price ${j + 1}`)), h('span', { style: 'text-align:center' }, 'Shows on'), h('span')));
    s.rows.forEach((r, i) => {
      const it = itemOf(r);
      const nk = `r:${r.id}:n`;
      const linkBtn = r.item ? h('button', {
        type: 'button', class: `pm-link${r.name ? ' is-off' : ''}`,
        title: r.name ? 'This name is for the paper only. Click to use the website name again.' : 'Same name as the website: changing it here changes the website too. Click to use a different name on paper.',
        onclick: () => edit(() => { r.name = r.name ? '' : rowName(r); }, { rebuild: true }),
      }, r.name ? '✂' : '🔗') : null;
      const nameCell = h('div', {},
        textLine(nk, 'item', rowName(r), (v) => edit(() => { if (!r.item || r.name) r.name = v; else if (it) it.name = v; }, { key: `n:${r.id}` }), { after: linkBtn, label: 'Item name' }),
        r.item && r.name && it && lc(r.name) !== lc(it.name) ? h('div', { class: 'pm-web' }, `Website name: ${it.name}`) : null,
        r.extra && it ? h('div', { class: 'pm-web' }, `Extra line for ${it.name}`) : null);
      const cells = s.cols.map((c, j) => {
        const pk = `r:${r.id}:p${j}`;
        const sizes = it ? (it.prices || []) : [];
        const choose = it && (sizes.length > 1 || r.extra) ? h('select', {
          class: 'pm-select', style: 'min-height:26px;padding:1px 4px;font-size:.74rem;margin-top:2px', title: 'Which website size goes in this column',
          onchange: (e) => edit(() => { r.from[j] = e.target.value === 'auto' ? null : e.target.value; }, { rebuild: true }),
        }, h('option', { value: 'auto' }, 'Size: automatic'), sizes.map((p) => h('option', { value: p.label }, `Size: ${p.label || '(no name)'}`)), h('option', { value: NONE }, 'Leave empty')) : null;
        if (choose) choose.value = r.from[j] === undefined || r.from[j] === null ? 'auto' : r.from[j];
        return h('div', {}, textLine(pk, 'price', priceText(r, s, j), (v) => edit(() => setPrice(r, s, j, v), { key: `p:${r.id}:${j}` }), { numeric: Boolean(r.item), label: `${c.label || 'Price'} price` }), choose);
      });
      const flags = h('div', { class: 'pm-flags' },
        checkEl('Paper', !r.hide, (on) => edit(() => { r.hide = !on; }, { rebuild: true })),
        it ? checkEl('Website', !it.hidden, (on) => edit(() => { it.hidden = !on; })) : h('span', { class: 'pm-web', title: 'Lines that are not linked to the website menu' }, 'paper only'));
      const tools = h('div', { class: 'pm-tools' },
        h('button', { type: 'button', class: 'pm-icon', title: 'Move up', 'aria-label': 'Move up', onclick: () => edit(() => moveIn(s.rows, i, -1), { rebuild: true }) }, '↑'),
        h('button', { type: 'button', class: 'pm-icon', title: 'Move down', 'aria-label': 'Move down', onclick: () => edit(() => moveIn(s.rows, i, 1), { rebuild: true }) }, '↓'),
        h('button', { type: 'button', class: 'pm-icon pm-icon--x', title: 'Delete', 'aria-label': 'Delete', onclick: () => deleteRow(s, r) }, '✕'));
      wrap.append(h('div', { class: `pm-line${r.hide ? ' is-hidden' : ''}`, style: tmpl, 'data-row': r.id }, nameCell, cells, flags, tools));
    });
    return wrap;
  }
  function addWebItem(s) {
    let gid = s.groups[0];
    if (s.groups.length > 1) {
      const names = s.groups.map((g, n) => `${n + 1}. ${(cats().find((c) => c.id === g) || {}).name}`).join('\n');
      const pick = window.prompt(`Which website group should the new item go in?\n${names}\nType the number:`, '1');
      if (pick === null) return;
      gid = s.groups[Math.max(0, Math.min(s.groups.length - 1, (parseInt(pick, 10) || 1) - 1))];
    }
    const g = cats().find((c) => c.id === gid);
    if (!g) return;
    const prices = s.cols.length > 1
      ? s.cols.map((c) => ({ label: (c.from || []).find((x) => x) || c.label || '', price: 0 }))
      : [{ label: '', price: 0 }];
    const it = { id: uid('item'), name: 'New item', desc: '', badge: '', image: '', available: true, hidden: false, tags: [], prices };
    edit(() => { g.items = (g.items || []).concat(it); }, { rebuild: true });
    const row = s.rows.find((r) => r.item === it.id);
    if (row) focusKey(`r:${row.id}:n`, true);
  }
  function deleteRow(s, r) {
    const it = itemOf(r);
    if (r.item && !r.extra && it) {
      if (!window.confirm(`Delete "${it.name}" from the website menu and the paper menu?\n\nTo keep it on the website, untick "Paper" instead.`)) return;
      edit(() => {
        const g = (itemIndex.get(it.id) || {}).g;
        if (g) g.items = g.items.filter((x) => x.id !== it.id);
      }, { rebuild: true });
      return;
    }
    edit(() => { s.rows = s.rows.filter((x) => x !== r); }, { rebuild: true });
  }
  function menuTab() {
    const P = pm();
    const used = new Set(P.sections.flatMap((s) => s.groups));
    const loose = cats().filter((g) => !used.has(g.id));
    return [
      h('p', { class: 'pm-intro' }, 'Items and prices are the same as the website menu: change them here and the website changes too when you Save. Lines that are not linked (like Hookah) are on the paper only. Click any text on the paper to jump to it. Each text has its own ▲▼ size and an Aa button for its font, colour and style.'),
      loose.length ? h('div', { class: 'pm-warn' }, h('span', {}, `Website groups not on the paper: ${loose.map((g) => g.name).join(', ')}.`),
        loose.map((g) => h('button', { type: 'button', class: 'pm-btn pm-btn--small', onclick: () => edit(() => {
          P.sections.push({ id: uid('p'), title: g.name, sub: '', look: 'small', subStyle: 'none', column: 'right', show: true, groups: [g.id], cols: [{ label: '', from: ['Regular', 'Single', ''] }], rows: [], gap: 0 });
          S.open = P.sections[P.sections.length - 1].id;
        }, { rebuild: true }) }, `Add ${g.name}`))) : null,
      P.sections.map((s, i) => sectionCard(s, i)),
      h('div', { class: 'pm-row-btns', style: 'margin-top:10px' },
        h('button', { type: 'button', class: 'pm-btn', onclick: () => edit(() => {
          P.sections.push({ id: uid('p'), title: 'New section', sub: '', look: 'small', subStyle: 'none', column: 'right', show: true, groups: [], cols: [{ label: '', from: ['Regular', 'Single', ''] }], rows: [{ id: uid('pr'), item: null, name: 'New item', prices: [''], from: [], hide: false }], gap: 0 });
          S.open = P.sections[P.sections.length - 1].id;
        }, { rebuild: true }) }, '+ Add a section')),
    ];
  }

  /* ---------- tab: text styles ---------- */
  function stylesTab() {
    const P = pm();
    const card = (role, name, eg) => {
      const st = P.styles[role];
      return h('div', { class: 'pm-card' },
        h('div', { class: 'pm-card-body' },
          h('div', { class: 'pm-sum-title' }, name, eg ? h('span', { class: 'pm-sum-meta', style: 'font-weight:400;margin-left:8px' }, eg) : null),
          h('div', { class: 'pm-fields' },
            field('Font', selectEl(FONTS.map((f) => [f, f]), st.font, (v) => edit(() => { st.font = v; }))),
            field('Thickness', selectEl(WEIGHTS.map(([w, n]) => [String(w), `${n} (${w})`]), String(st.weight), (v) => edit(() => { st.weight = Number(v); }))),
            field('Size', stepper(() => st.size, (v) => { st.size = v; }, { step: 0.5, min: 3, max: 120, unit: ' pt', key: `rs:${role}` })),
            field('Colour', colorEl(() => st.color, (v) => edit(() => { st.color = v; }, { key: `rc:${role}` }))),
            field('Slanted (italic)', selectEl([['0', 'No'], ['1', 'Yes']], st.italic ? '1' : '0', (v) => edit(() => { st.italic = v === '1'; }))),
            field('Capital letters', selectEl([['1', 'ALL CAPITALS'], ['0', 'As typed']], st.upper ? '1' : '0', (v) => edit(() => { st.upper = v === '1'; }))),
            field('Letter spacing', stepper(() => st.spacing || 0, (v) => { st.spacing = v; }, { step: 1, min: -20, max: 80, key: `rl:${role}` })),
            field('Line height', stepper(() => st.line || 1.2, (v) => { st.line = v; }, { step: 0.05, min: 0.6, max: 3, key: `rh:${role}` })))));
    };
    const singles = Object.keys(P.over).length;
    return [
      h('p', { class: 'pm-intro' }, 'These set every text of a kind at once. A text you changed on its own (with its own ▲▼ or Aa) keeps its difference.'),
      h('div', { class: 'pm-card' }, h('div', { class: 'pm-card-body' },
        h('div', { class: 'pm-fields' },
          field('Everything bigger or smaller', stepper(() => Number(P.page.scale) || 100, (v) => { P.page.scale = v; }, { step: 1, min: 40, max: 200, unit: ' %', key: 'scale', digits: 0 })),
          field('Texts changed on their own', h('div', { class: 'pm-row-btns' }, h('span', { class: 'pm-sum-meta', style: 'align-self:center' }, `${singles} text${singles === 1 ? '' : 's'}`),
            h('button', { type: 'button', class: 'pm-btn pm-btn--small', disabled: !singles, onclick: () => { if (window.confirm('Put every text back to the sizes and styles set on this tab?')) edit(() => { P.over = {}; }, { rebuild: true }); } }, 'Reset them all')))))),
      ROLES.map(([role, name, eg]) => card(role, name, eg)),
    ];
  }

  /* ---------- tab: page, spacing, logo, borders ---------- */
  function pageTab() {
    const P = pm();
    const p = P.page;
    const mm = (obj, prop, o) => stepper(() => Number(obj[prop]) || 0, (v) => { obj[prop] = v; }, Object.assign({ step: 0.5, min: 0, max: 100, unit: ' mm', key: `pg:${prop}:${Math.random()}` }, o || {}));
    const card = (title, ...kids) => h('div', { class: 'pm-card' }, h('div', { class: 'pm-card-body' }, h('div', { class: 'pm-sum-title' }, title), kids));
    p.border = p.border || {}; p.dots = p.dots || {}; p.headingLine = p.headingLine || {}; p.rowLine = p.rowLine || {};
    P.note = P.note || { text: '', show: false };
    return [
      h('p', { class: 'pm-intro' }, 'The paper is always one A4 page (210 × 297 mm). If the menu gets too long it is shrunk evenly to fit; the badge at the top tells you.'),
      card('Paper and margins',
        h('div', { class: 'pm-fields' },
          field('Paper colour', colorEl(() => p.paper, (v) => edit(() => { p.paper = v; }, { key: 'paper' }))),
          field('Top margin', mm(p, 'top')), field('Bottom margin', mm(p, 'bottom')),
          field('Left margin', mm(p, 'left')), field('Right margin', mm(p, 'right')),
          field('Space between the two columns', mm(p, 'gap')),
          field('Left column width', stepper(() => Number(p.split) || 50, (v) => { p.split = v; }, { step: 1, min: 20, max: 80, unit: ' %', key: 'split', digits: 0 })))),
      card('Spacing',
        h('div', { class: 'pm-fields' },
          field('Space between sections', mm(p, 'section', { step: 0.25 })),
          field('Space under headings', mm(p, 'afterHeading', { step: 0.25, min: -10 })),
          field('Space between item lines', mm(p, 'row', { step: 0.1, min: -3 })),
          field('Space under price column names', mm(p, 'labelGap', { step: 0.1, min: -3 })),
          field('Price column width', mm(p, 'priceWidth', { min: 5, max: 60 })),
          field('Single prices', selectEl([['1', 'Line up under the first price column'], ['0', 'At the far right of the section']], p.lineUp === false ? '0' : '1', (v) => edit(() => { p.lineUp = v === '1'; }))),
          field('Prices line up', selectEl([['left', 'On the left'], ['center', 'In the middle'], ['right', 'On the right']], p.priceAlign || 'left', (v) => edit(() => { p.priceAlign = v; }))))),
      card('Logo',
        h('div', { class: 'pm-fields' },
          field('Show the logo', checkEl('Show', P.logo.show, (v) => edit(() => { P.logo.show = v; }))),
          field('Logo width', mm(P.logo, 'width', { min: 5, max: 180 })),
          field('Space under the logo', mm(P.logo, 'gap', { min: -20 })),
          field('Logo colour', colorEl(() => P.logo.color, (v) => edit(() => { P.logo.color = v; }, { key: 'logoc' }))),
          field('Another logo picture', h('div', { class: 'pm-row-btns' },
            h('label', { class: 'pm-btn pm-btn--small' }, 'Upload…', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true, onchange: (e) => uploadLogo(e.target.files[0]) })),
            h('button', { type: 'button', class: 'pm-btn pm-btn--small', disabled: !P.logo.src || P.logo.src === '/img/print-logo.png', onclick: () => edit(() => { P.logo.src = '/img/print-logo.png'; }, { rebuild: true }) }, 'Use the Pick Me logo'))))),
      card('Dots in the corners',
        h('div', { class: 'pm-fields' },
          field('Show the dots', checkEl('Show', p.dots.show, (v) => edit(() => { p.dots.show = v; }))),
          field('Top left corner', checkEl('Top left', p.dots.tl !== false, (v) => edit(() => { p.dots.tl = v; }))),
          field('Bottom right corner', checkEl('Bottom right', p.dots.br !== false, (v) => edit(() => { p.dots.br = v; }))),
          field('Dots colour', colorEl(() => p.dots.color, (v) => edit(() => { p.dots.color = v; }, { key: 'dotc' }))),
          field('How far they reach', mm(p.dots, 'size', { step: 2, min: 10, max: 150 })),
          field('Dot size', mm(p.dots, 'dot', { step: 0.05, min: 0.1, max: 3 })),
          field('Space between dots', mm(p.dots, 'step', { step: 0.1, min: 0.8, max: 8 })))),
      card('Border round the page',
        h('div', { class: 'pm-fields' },
          field('Show a border', checkEl('Show', p.border.show, (v) => edit(() => { p.border.show = v; }))),
          field('Line', selectEl([['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']], p.border.style || 'solid', (v) => edit(() => { p.border.style = v; }))),
          field('Thickness (pt)', stepper(() => Number(p.border.width) || 0.8, (v) => { p.border.width = v; }, { step: 0.1, min: 0.1, max: 12, unit: ' pt', key: 'bw' })),
          field('Colour', colorEl(() => p.border.color, (v) => edit(() => { p.border.color = v; }, { key: 'bc' }))),
          field('Distance from the paper edge', mm(p.border, 'inset', { max: 40 })),
          field('Rounded corners', mm(p.border, 'radius', { max: 40 })))),
      card('Line under headings',
        h('div', { class: 'pm-fields' },
          field('Show a line', checkEl('Show', p.headingLine.show, (v) => edit(() => { p.headingLine.show = v; }))),
          field('Thickness (pt)', stepper(() => Number(p.headingLine.width) || 0.5, (v) => { p.headingLine.width = v; }, { step: 0.1, min: 0.1, max: 6, unit: ' pt', key: 'hlw' })),
          field('Colour', colorEl(() => p.headingLine.color, (v) => edit(() => { p.headingLine.color = v; }, { key: 'hlc' }))),
          field('Space above the line', mm(p.headingLine, 'gap', { step: 0.25, max: 20 })))),
      card('Lines between items',
        h('div', { class: 'pm-fields' },
          field('Show lines', checkEl('Show', p.rowLine.show, (v) => edit(() => { p.rowLine.show = v; }))),
          field('Line', selectEl([['dotted', 'Dotted'], ['dashed', 'Dashed'], ['solid', 'Solid']], p.rowLine.style || 'dotted', (v) => edit(() => { p.rowLine.style = v; }))),
          field('Thickness (pt)', stepper(() => Number(p.rowLine.width) || 0.3, (v) => { p.rowLine.width = v; }, { step: 0.1, min: 0.1, max: 4, unit: ' pt', key: 'rlw' })),
          field('Colour', colorEl(() => p.rowLine.color, (v) => edit(() => { p.rowLine.color = v; }, { key: 'rlc' }))))),
      card('Note at the bottom (optional)',
        h('div', { class: 'pm-fields' },
          field('Show the note', checkEl('Show', P.note.show, (v) => edit(() => { P.note.show = v; }))),
          field('Note', textLine('note', 'note', P.note.text || '', (v) => edit(() => { P.note.text = v; }, { key: 'note' }), { placeholder: 'for example: All prices in NPR, VAT included' }), true))),
      card('Start again',
        h('p', { class: 'pm-intro', style: 'margin:0' }, 'Puts the look (fonts, sizes, spacing, logo, dots, borders) back to the original Pick Me paper menu. Items, prices and sections stay as they are.'),
        h('div', { class: 'pm-row-btns' }, h('button', { type: 'button', class: 'pm-btn pm-btn--small pm-btn--danger', onclick: resetLook }, 'Reset the look'))),
    ];
  }
  async function resetLook() {
    if (!window.confirm('Put the fonts, sizes, spacing, logo, dots and borders back to the original look? Items and prices stay. (You can Undo this.)')) return;
    try {
      if (!S.defaults) S.defaults = await api('GET', '/api/admin/print-defaults');
      const d = clone(S.defaults);
      edit(() => { const P = pm(); P.page = d.page; P.logo = d.logo; P.styles = d.styles; P.over = {}; P.note = d.note; }, { rebuild: true });
      flash('The original look is back. Save to keep it.');
    } catch (e) { flash(e.message, true); }
  }
  async function uploadLogo(file) {
    if (!file) return;
    try {
      busy('Uploading the logo…');
      const r = await api('POST', '/api/admin/upload', file, file.type || 'application/octet-stream');
      edit(() => { pm().logo.src = r.url; }, { rebuild: true });
    } catch (e) { flash(e.message, true); } finally { busy(''); }
  }

  /* ---------- tab: saved pictures ---------- */
  function savedTab() {
    const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    return [
      h('p', { class: 'pm-intro' }, 'Every time you press Save, a picture of the menu (A4 at 300 dpi, the same quality as the print) is kept here and downloaded to this phone or computer. The 60 newest are kept.'),
      S.shots.length ? h('div', { class: 'pm-gallery' }, S.shots.map((x) => h('div', { class: 'pm-shot' },
        h('a', { href: `/api/admin/print-menus/${x.id}.png`, target: '_blank', rel: 'noopener', title: 'Open full size' },
          h('img', { src: `/api/admin/print-menus/${x.id}-thumb.jpg`, alt: `Menu saved ${when(x.at)}`, loading: 'lazy', onerror: (e) => { e.target.onerror = null; e.target.src = `/api/admin/print-menus/${x.id}.png`; } })),
        h('time', { datetime: x.at }, when(x.at)),
        h('small', {}, `${x.w} × ${x.h} px · ${(x.bytes / 1048576).toFixed(1)} MB`),
        h('div', { class: 'pm-row-btns' },
          h('a', { class: 'pm-btn pm-btn--small', href: `/api/admin/print-menus/${x.id}.png?download=1` }, 'Download'),
          h('button', { type: 'button', class: 'pm-btn pm-btn--small', onclick: () => printPicture(x) }, 'Print'),
          h('button', { type: 'button', class: 'pm-btn pm-btn--small pm-btn--danger', onclick: () => deleteShot(x) }, 'Delete'))))) : h('div', { class: 'pm-empty' }, 'No saved menus yet. Press Save to keep the first one.'),
    ];
  }
  async function loadShots() {
    try { S.shots = await api('GET', '/api/admin/print-menus'); } catch { S.shots = []; }
    if (S.tab === 'saved') renderPanel();
  }
  async function deleteShot(x) {
    if (!window.confirm('Delete this saved menu picture?')) return;
    try { await api('DELETE', `/api/admin/print-menus/${x.id}`); await loadShots(); } catch (e) { flash(e.message, true); }
  }
  function printPicture(x) {
    const win = window.open('', '_blank');
    if (!win) return flash('Please allow pop-ups to print a saved menu.', true);
    win.document.write(`<!DOCTYPE html><title>Pick Me menu</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0}img{display:block;width:210mm;height:297mm;object-fit:contain}</style><img src="/api/admin/print-menus/${esc(x.id)}.png" onload="setTimeout(function(){print()},300)">`);
    win.document.close();
  }

  /* ---------- the page ---------- */
  function renderPanel() {
    const panel = $('.pm-panel');
    if (!panel) return;
    const top = panel.scrollTop;
    const tab = { menu: menuTab, styles: stylesTab, page: pageTab, saved: savedTab }[S.tab] || menuTab;
    panel.replaceChildren(...[tab()].flat(Infinity).filter(Boolean));
    panel.scrollTop = top;
    $$('.pm-tabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === S.tab));
    status();
  }
  function setTab(tab) {
    S.tab = tab;
    S.openText = null;
    renderPanel();
    $('.pm-panel').scrollTop = 0;
    if (tab === 'saved') loadShots();
  }
  // Clicking a text on the paper opens its settings.
  function focusKey(key, select) {
    const m = /^([sr]):([^:]+):(.+)$/.exec(key);
    if (key === 'logo') { setTab('page'); return; }
    if (key === 'note') { setTab('page'); }
    else if (m) {
      const sec = m[1] === 's' ? pm().sections.find((s) => s.id === m[2]) : findSecOfRow(m[2]);
      if (!sec) return;
      S.tab = 'menu';
      S.open = sec.id;
      renderPanel();
    }
    if (S.paneClosed === false && window.matchMedia('(max-width: 899px)').matches) { /* keep the paper open on phones */ }
    const el = $(`.pm-panel [data-for="${CSS.escape(key)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const target = el.closest('.pm-line') || el;
    target.classList.remove('pm-flash-row');
    void target.offsetWidth;
    target.classList.add('pm-flash-row');
    const input = $('input', el);
    if (input) { input.focus({ preventScroll: true }); if (select) input.select(); }
  }

  function shell() {
    const tabBtn = (id, label) => h('button', { type: 'button', 'data-tab': id, onclick: () => setTab(id) }, label);
    const app = $('#pm-app');
    app.replaceChildren(
      h('header', { class: 'pm-top' },
        h('a', { class: 'pm-back', href: '/admin', onclick: (e) => { if (dirty() && !window.confirm('The paper menu has changes that are not saved. Leave anyway?')) e.preventDefault(); } }, '← Admin'),
        h('h1', { class: 'pm-title' }, 'Print menu'),
        h('span', { class: 'pm-status' }, ''),
        h('span', { class: 'pm-fitbadge' }, ''),
        h('div', { class: 'pm-actions' },
          h('button', { type: 'button', id: 'pm-undo', class: 'pm-btn', title: 'Undo (Ctrl or ⌘ + Z)', onclick: undo }, '↶ Undo'),
          h('button', { type: 'button', id: 'pm-redo', class: 'pm-btn', title: 'Redo (Ctrl or ⌘ + Shift + Z)', onclick: redo }, '↷ Redo'),
          h('button', { type: 'button', class: 'pm-btn pm-btn--gold', onclick: printNow }, '🖨 Print'),
          h('button', { type: 'button', id: 'pm-save', class: 'pm-btn pm-btn--main', onclick: save }, 'Save'))),
      h('div', { class: 'pm-split' },
        h('section', { class: `pm-pane${S.paneClosed ? ' is-closed' : ''}`, 'aria-label': 'The paper menu' },
          h('div', { class: 'pm-pane-bar' },
            h('strong', {}, 'A4 paper'),
            h('span', { class: 'pm-spacer' }),
            h('button', { type: 'button', class: 'pm-zoombtn', title: 'Smaller', onclick: () => zoomBy(-0.1) }, '−'),
            h('span', { class: 'pm-zoomval' }, ''),
            h('button', { type: 'button', class: 'pm-zoombtn', title: 'Bigger', onclick: () => zoomBy(0.1) }, '+'),
            h('button', { type: 'button', class: 'pm-zoombtn', title: 'Fit the width', onclick: () => { S.zoom = 'fit'; applyZoom(); } }, 'Fit'),
            h('button', { type: 'button', class: 'pm-zoombtn pm-toggle', onclick: () => { S.paneClosed = !S.paneClosed; $('.pm-pane').classList.toggle('is-closed', S.paneClosed); applyZoom(); } }, 'Hide / show')),
          h('div', { class: 'pm-scroll' },
            h('div', { class: 'pm-zoomwrap' }, h('div', { class: 'pm-zoom' })),
            h('p', { class: 'pm-hint' }, 'Click any text on the paper to change it.'))),
        h('section', { class: 'pm-editor', 'aria-label': 'Settings' },
          h('nav', { class: 'pm-tabs' }, tabBtn('menu', 'Menu and prices'), tabBtn('styles', 'Text styles'), tabBtn('page', 'Page, spacing and borders'), tabBtn('saved', 'Saved menus')),
          h('div', { class: 'pm-panel' }))));
    $('.pm-zoom').addEventListener('click', (e) => {
      const t = e.target.closest('[data-k]');
      if (t) focusKey(t.dataset.k, false);
    });
  }
  function zoomBy(d) {
    const cur = S.zoom === 'fit' ? (parseInt(($('.pm-zoomval') || {}).textContent, 10) || 50) / 100 : S.zoom;
    S.zoom = Math.max(0.2, Math.min(2.5, round(cur + d, 2)));
    applyZoom();
  }

  /* ---------- print, save, picture ---------- */
  async function fontsReady() {
    const P = pm();
    const want = new Set();
    for (const role of Object.keys(P.styles)) want.add(`${P.styles[role].weight} 12px ${fontStack(P.styles[role].font)}`);
    for (const o of Object.values(P.over)) if (o.font || o.weight) want.add(`${o.weight || 400} 12px ${fontStack(o.font || 'Jost')}`);
    await Promise.all([...want].map((f) => document.fonts.load(f).catch(() => {})));
    await document.fonts.ready;
  }
  async function printNow() {
    await fontsReady();
    renderPreview();
    $$('.pm-sheet .is-pick').forEach((el) => el.classList.remove('is-pick'));
    window.print();
  }
  async function makePicture() {
    await fontsReady();
    renderPreview();
    const sheet = $('#pm-sheet');
    $$('.is-pick', sheet).forEach((el) => el.classList.remove('is-pick'));
    const w = sheet.offsetWidth;
    const hgt = sheet.offsetHeight;
    const blob = await window.modernScreenshot.domToBlob(sheet, {
      width: w, height: hgt, scale: PICTURE_WIDTH / w, type: 'image/png',
      backgroundColor: okColor(pm().page.paper, '#FFFFFF'),
      style: { boxShadow: 'none', transform: 'none', margin: '0' },
    });
    if (!blob || blob.size < 1000) throw new Error('The menu picture could not be made.');
    return blob;
  }
  async function thumbOf(blob) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
    const cv = document.createElement('canvas');
    cv.width = 420;
    cv.height = Math.round(420 * img.naturalHeight / img.naturalWidth);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(img.src);
    return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.82));
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function saveContent(force) {
    const r = await fetch(`/api/admin/content?note=${encodeURIComponent('Paper menu')}${force ? '&force=1' : ''}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(S.c),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { login(); throw new Error('Please log in again.'); }
    if (r.status === 409) {
      if (!window.confirm(`${data.error || 'The website was saved from another device.'}\n\nSave the paper menu anyway? This keeps what you see on this page.`)) throw new Error('Not saved.');
      return saveContent(true);
    }
    if (!r.ok) throw new Error(data.error || 'Could not save.');
    S.c._rev = data.rev;
  }
  async function save() {
    const btn = $('#pm-save');
    btn.disabled = true;
    try {
      if (dirty()) {
        busy('Saving the menu…');
        await saveContent(false);
        S.saved = snapshot();
        status();
      }
      busy('Making the A4 picture (300 dpi)…');
      const png = await makePicture();
      busy('Keeping the picture in Saved menus…');
      const up = await api('POST', '/api/admin/print-menus', png, 'image/png');
      try { await api('POST', `/api/admin/print-menus/${up.id}/thumb`, await thumbOf(png), 'image/jpeg'); } catch { /* the full picture is kept even without a small one */ }
      const day = new Date().toISOString().slice(0, 10);
      download(png, `pick-me-menu-${day}.png`);
      flash('Saved. The picture is in Saved menus and was downloaded to this device.');
      loadShots();
    } catch (e) {
      flash(e.message || 'Could not save.', true);
    } finally {
      busy('');
      btn.disabled = false;
    }
  }

  /* ---------- start ---------- */
  function login(msg) {
    const app = $('#pm-app');
    const pw = h('input', { class: 'pm-input', type: 'password', autocomplete: 'current-password', required: true });
    const err = h('p', { class: 'pm-intro', style: 'color:#9B2C1F;margin:0' }, msg || '');
    app.replaceChildren(h('form', { class: 'pm-login', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', '/api/auth/login', { password: pw.value, remember: true }); start(); } catch (x) { err.textContent = x.message; }
    } }, h('h1', {}, 'Print menu'), h('p', { class: 'pm-intro', style: 'margin:0' }, 'Owner password'), pw, err, h('button', { class: 'pm-btn pm-btn--main', type: 'submit' }, 'Log in')));
    pw.focus();
  }
  async function start() {
    let me;
    try { me = await api('GET', '/api/auth/me'); } catch { me = {}; }
    if (me.role !== 'admin') return login(me.role === 'staff' ? 'Only the owner can change the paper menu. Please log in with the owner password.' : '');
    const c = await api('GET', `/api/content?t=${Date.now()}`);
    if (!c.printMenu || !Array.isArray(c.printMenu.sections)) throw new Error('The paper menu is not set up yet. Please refresh the page.');
    S.c = c;
    syncAll();
    S.saved = snapshot();
    shell();
    renderPanel();
    renderPreview();
    if (document.fonts) {
      document.fonts.ready.then(() => renderPreview());
      document.fonts.addEventListener('loadingdone', queuePreview);
    }
    loadShots();
  }
  window.addEventListener('resize', () => { clearTimeout(window.__pmR); window.__pmR = setTimeout(applyZoom, 80); });
  window.addEventListener('beforeunload', (e) => { if (S.c && dirty()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', (e) => {
    if (!S.c || !(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { if (!/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); redo(); } }
    else if (k === 's') { e.preventDefault(); save(); }
    else if (k === 'p') { e.preventDefault(); printNow(); }
  });
  start().catch((e) => { $('#pm-app').replaceChildren(h('p', { class: 'pm-boot' }, e.message || 'Could not open the print menu.')); });
})();
