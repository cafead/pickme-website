/* Pick Me Cafe admin (#admin): edit the website with a live preview, and manage orders, bookings, reviews, messages and security. */
(function () {
  'use strict';
  const { FONTS, esc, rs, shrink, SIZES } = window.PM;
  const root = document.getElementById('admin');
  const A = { view: 'edit', content: null, saved: '', me: {}, orders: [], bookings: [], reviews: [], messages: [], staff: [], log: [], history: [], bin: [], tables: 10, day: '', dayBy: 'placed', dayOrders: [], orderFilter: 'all', seed: null, open: new WeakSet(), timer: null, poll: null, inline: false, layout: false, mobile: 'edit' };

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
  const frame = () => document.getElementById('pk-frame');
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
    const el = document.getElementById('pk-flash');
    if (!el) return;
    el.textContent = text;
    el.className = 'pk-flash is-on' + (bad ? ' is-bad' : '');
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { el.className = 'pk-flash'; }, 3200);
  }

  /* ---------- what can be edited ---------- */
  const f = (k, l, type, extra) => Object.assign({ k, l, type: type || 'text' }, extra || {});
  const svgEl = (markup) => { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; };
  const TRASH = () => svgEl('<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>');
  // Sections that can live on their own page, on the home page, or both.
  const PAGEABLE = { menu: '/menu', cake: '/cake', gallery: '/gallery', moments: '/gallery' };
  const fontOptions = (kind) => Object.keys(FONTS[kind]).map((n) => [n, n]);
  const catOptions = () => A.content.menu.categories.map((c) => [c.id, c.name]);
  const catName = (id) => ((A.content.menu.categories || []).find((c) => c.id === id) || {}).name || 'choose a group';
  const BORDERS = [
    ['none', 'Plain, no border'], ['gold', 'Gold line (everyday)'],
    ['snow', 'Christmas: snow'], ['holly', 'Christmas: holly'], ['lights', 'Christmas: fairy lights'], ['candy', 'Christmas: candy canes'],
    ['web', 'Halloween: spider web'], ['pumpkin', 'Halloween: pumpkins'], ['bats', 'Halloween: bats'],
    ['hearts', "Valentine's: hearts"], ['petals', "Valentine's, Mother's Day, Teej: rose petals"],
    ['confetti', 'New Year, Holi: confetti'], ['stars', "New Year, Father's Day: stars"], ['fireworks', 'New Year: fireworks'],
    ['marigold', 'Dashain, Tihar, Nepali New Year: marigold garland'], ['diyo', 'Tihar: diyo lamps'], ['flags', 'Losar, Buddha Jayanti: prayer flags'],
    ['balloons', "Birthdays, Children's Day: balloons"], ['sprinkles', 'Celebrations: sprinkles'], ['bunting', "Teachers' Day, parties: bunting"],
  ];
  const MARK_OPTIONS = [['veg', 'Veg'], ['nonveg', 'Non-veg'], ['eggless', 'Eggless'], ['sugarfree', 'Sugar-free'], ['nuts', 'Contains nuts'], ['spicy', 'Spicy']];
  const itemFields = () => [
    f('name', 'Name'), f('desc', 'Short description (optional)'), f('badge', 'Small badge, for example Bestseller (optional)'),
    f('available', 'Available (untick to show "Not available today")', 'toggle'), f('hidden', 'Hide from the website', 'toggle', { def: false }),
    f('tags', 'Food marks', 'checks', { options: () => MARK_OPTIONS }),
    f('timeFrom', 'Served from (optional, for example a morning combo)', 'time'), f('timeTo', 'Served until (optional)', 'time'),
    f('image', 'Photo (optional)', 'image', { max: 900 }),
    f('prices', 'Prices', 'list', { title: (p) => `${p.label || 'Price'}: Rs. ${p.price}${p.whole ? ' (whole cake)' : ''}`, add: 'Add size or price', blank: () => ({ label: '', price: 0 }), fields: [
      f('label', 'Size name (leave empty if there is one price)'), f('price', 'Price in NPR', 'number'), f('whole', 'Whole cake: pre-order only', 'toggle', { def: false }),
    ] }),
  ];
  const itemTitle = (i) => `${i.name}${i.hidden ? ' (hidden)' : i.available === false ? ' (not available)' : ''}: ${priceLine(i)}`;
  const newItem = () => ({ id: uid('item'), name: 'New item', desc: '', badge: '', image: '', available: true, hidden: false, tags: [], prices: [{ label: '', price: 0 }] });
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
      f('theme.sectionGap', 'Space between sections in px (0 to 200, normal is 56)', 'number'),
      f('theme.border', 'Photo border (for example a Christmas border while Christmas is on)', 'border'),
      f('theme.blend', 'Blend photos into the background', 'toggle'), f('theme.animations', 'Animations on', 'toggle'),
    ] },
    { title: 'Section order and visibility', scroll: 'hero', note: 'Use the arrows to move a section up or down the page. Menu, Order a Cake, Gallery and Guest moments can each have their own page (yourwebsite/menu, /cake, /gallery), sit on the home page, or both: open one and choose "Where it shows".', fields: [
      f('sections', '', 'list', { fixed: true, title: (s) => `${s.label}${s.show === false ? ' (hidden)' : ''}`, fields: [
        f('label', 'Name in the top menu'), f('show', 'Show this section', 'toggle'), f('nav', 'Show in the top menu', 'toggle'),
        f('place', 'Where it shows', 'select', { when: (s) => s.id in PAGEABLE, options: () => [['page', 'Its own page'], ['home', 'On the home page'], ['both', 'Both: home page and its own page']] }),
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
    { title: 'Events and specials', scroll: 'events', note: 'Tick the events you want: each shows from its start date for the number of days you set, then hides itself. The section is one slideshow: every photo of an event is a slide with its own heading and description on the left. Events that are on at the same time join the same slideshow (two events with 5 photos each make 10 slides). If an event has more photos, a message or special items, its button opens its own page where customers can order. Special items also appear first in the menu while the event shows. The photo border is chosen under "Colours, fonts and sizes".', fields: [
      f('', 'Show the events section', 'section', { id: 'events' }),
      f('', 'Which events show (each only between its dates)', 'eventticks'),
      f('events.script', 'Handwritten line'), f('events.title', 'Title'), f('events.seconds', 'Seconds per slide', 'number'),
      f('events.photoStart', 'Where the photo starts, from the left edge of the box (on computers). 0% = the photo fills the whole box.', 'range', { min: 0, max: 70, step: 1, unit: '%' }),
      f('events.items', 'Edit each event', 'list', { title: (e) => `${e.title} (${e.enabled === false ? 'not ticked' : eventStatus(e).toLowerCase()})`, add: 'Add an empty event', blank: () => ({ id: uid('event'), template: '', enabled: true, tag: '', title: 'New event', text: '', image: '', button: 'See the specials', link: '', start: BS.todayAD(), days: 7, message: '', menuTitle: '', photos: [], menu: [] }), fields: [
        f('tag', 'Small label (for example Christmas Week)'), f('title', 'Title'), f('text', 'Short description', 'area'),
        f('photos', 'Slides: one photo each, with its own heading and description (the first photo is the main photo)', 'eventphotos'),
        f('start', 'Start showing on', 'date'), f('days', 'Show for how many days', 'number'),
        f('message', 'Message on the event page (for example: Choose your cake and grab it)', 'area'),
        f('button', 'Button text'), f('link', 'Button goes to, if the event has no page of its own (#menu, #cake, #booking or a web link)'),
        f('menuTitle', 'Name of the special menu (for example Christmas specials)'),
        f('menu', 'Special menu items (customers can order these)', 'list', { title: itemTitle, add: 'Add special item', blank: newItem, fields: itemFields() }),
      ] }),
    ] },
    { title: 'Event calendar and reminders', scroll: 'events', custom: calendarPanel, note: 'Days that sell themed cakes. You get a reminder at the top of admin before each one (2 weeks by default). Press "Make the event" to start one with the right text and dates; then add photos and special items. Pick a matching photo border under "Colours, fonts and sizes". Days that move every year need this year\'s date typed in.' },
    { title: 'Menu, prices and food photos', scroll: 'menu', note: 'Each group is a tab on the site. Open a group to edit its items.', fields: [
      f('menu.script', 'Handwritten line'), f('menu.title', 'Title'), f('menu.note', 'Note under the title'),
      f('menu.layout', 'How items are shown', 'select', { options: () => [['list', 'Rounded cards with a round photo'], ['cards', 'Tall cards with large photos']] }),
      f('menu.search', 'Show the search box above the menu', 'toggle'),
      f('menu.showEvents', 'On the menu page, show "Happening at Pick Me" (events that are showing) under the menu', 'toggle'),
      f('menu.marks.show', 'Show food marks (veg, non-veg, eggless...) on items', 'toggle'),
      f('menu.marks.filter', 'Show the "Veg only" and "Eggless" filter buttons', 'toggle'),
      f('menu.categories', 'Groups', 'list', { title: (c) => `${c.name} (${(c.items || []).length})${c.hidden ? ' (hidden)' : ''}`, add: 'Add group', blank: () => ({ id: uid('group'), name: 'New group', note: '', hidden: false, items: [] }), fields: [
        f('name', 'Group name'), f('note', 'Note shown above the items'), f('hidden', 'Hide this whole group', 'toggle', { def: false }),
        f('timeFrom', 'Whole group served from (optional, for example breakfast)', 'time'), f('timeTo', 'Whole group served until (optional)', 'time'),
        f('items', 'Items', 'list', { title: itemTitle, add: 'Add item', blank: newItem, fields: itemFields() }),
      ] }),
    ] },
    { title: "Today's availability", scroll: 'menu', custom: availabilityPanel, note: 'A quick list of everything on the menu. Untick "Available" to show "Not available today" on an item, or untick "Show" to hide it. Remember to press Save.' },
    { title: 'Drink extras (less sugar, extra shot...)', scroll: 'menu', note: 'When a customer adds an item from a group listed in a set, they can tick these extras. Extras with a price add to the item price. Untick "Show" to hide one. Check the prices before you switch priced extras on.', fields: [
      f('extras.show', 'Offer extras', 'toggle'), f('extras.title', 'Heading above the extras'),
      f('extras.groups', 'Sets of extras', 'list', { title: (g) => `${g.name}${g.show === false ? ' (off)' : ''}: ${(g.options || []).filter((o) => o.show !== false).map((o) => o.name).join(', ') || 'none shown'}`, add: 'Add a set', blank: () => ({ id: uid('set'), name: 'New set', categories: [], show: true, options: [] }), fields: [
        f('name', 'Name of this set (only you see it)'), f('show', 'Switched on', 'toggle'),
        f('categories', 'Menu groups that get these extras', 'checks', { options: catOptions }),
        f('options', 'Extras', 'list', { title: (o) => `${o.name}: ${Number(o.price) ? 'Rs. ' + o.price : 'free'}${o.show === false ? ' (hidden)' : ''}`, add: 'Add extra', blank: () => ({ id: uid('x'), name: 'New extra', price: 0, show: true }), fields: [
          f('name', 'Name'), f('price', 'Extra price in NPR (0 for free)', 'number'), f('show', 'Show', 'toggle'),
        ] }),
      ] }),
    ] },
    { title: 'Goes well with (suggestions in the cart)', scroll: 'menu', note: 'When the cart has something from the first group, the cart suggests up to three items from the second group. Items with a badge are suggested first.', fields: [
      f('upsell.show', 'Show suggestions in the cart', 'toggle'), f('upsell.title', 'Heading'),
      f('upsell.pairs', 'Pairs', 'list', { title: (p) => `${catName(p.from)} → ${catName(p.to)}`, add: 'Add pair', blank: () => ({ from: '', to: '' }), fields: [
        f('from', 'When the cart has something from', 'select', { options: catOptions }), f('to', 'Suggest items from', 'select', { options: catOptions }),
      ] }),
    ] },
    { title: 'Closed notice', scroll: 'hero', note: 'For a holiday or an emergency. While it is on, a bar shows at the top of every page and visitors see the message once. Orders and bookings for the closed days are refused.', fields: [
      f('closure.on', 'Show the closed notice', 'toggle', { def: false }), f('closure.title', 'Heading'), f('closure.text', 'Message', 'area'), f('closure.image', 'Photo (optional)', 'image'),
      f('closure.until', 'Closed until and including (leave empty for today only; the notice turns off by itself after this day)', 'date'),
      f('closure.allowLater', 'Still take orders and bookings for later days', 'toggle'),
    ] },
    { title: 'Cake pre-order', scroll: 'cake', fields: [
      f('cake.script', 'Handwritten line'), f('cake.title', 'Title'), f('cake.text', 'Text', 'area'), f('cake.image', 'Photo shown before a cake is picked', 'image'),
      f('cake.noticeHours', 'Hours of notice needed', 'number'), f('cake.button', 'Button text'),
      f('', 'Photo for each cake (changes when a guest picks that cake)', 'cakephotos'),
      f('cake.serveMin', 'One pound of cake serves at least (people)', 'number'), f('cake.serveMax', 'One pound of cake serves at most (people)', 'number'),
      f('cake.options', 'Cake choices (eggless, photo print...)', 'list', { title: (o) => `${o.name}: ${Number(o.price) ? `Rs. ${o.price}${o.perPound ? ' a pound' : ''}` : 'free'}${o.show === false ? ' (hidden)' : ''}`, add: 'Add a choice', blank: () => ({ id: uid('opt'), name: 'New choice', note: '', price: 0, perPound: false, notice: 0, show: true }), fields: [
        f('name', 'Name'), f('note', 'Small note under the name (optional)'), f('price', 'Extra price in NPR (0 for free)', 'number'),
        f('perPound', 'Price is per pound of cake', 'toggle', { def: false }), f('notice', 'Hours of notice this choice needs (0 = the normal notice)', 'number'), f('show', 'Show', 'toggle'),
      ] }),
    ] },
    { title: 'Table booking', scroll: 'booking', fields: [
      f('booking.script', 'Handwritten line'), f('booking.title', 'Title'), f('booking.text', 'Text', 'area'), f('booking.image', 'Photo', 'image'),
      f('booking.maxPeople', 'Largest group you accept', 'number'), f('booking.seating', 'Seating choices, separated by commas (leave empty to hide)'), f('booking.button', 'Button text'),
    ] },
    { title: 'Our story', scroll: 'story', fields: [
      f('story.script', 'Handwritten line'), f('story.title', 'Title'), f('story.text', 'Text', 'area'), f('story.side', 'Handwritten side note'), f('story.image', 'Photo', 'image'),
    ] },
    { title: 'Gallery photos', scroll: 'gallery', note: 'All photos sit in one row that guests slide through, however many you add.', fields: [
      f('gallery.script', 'Handwritten line'), f('gallery.title', 'Title (optional)'),
      f('gallery.images', 'Photos', 'list', { title: (g) => g.caption || 'Photo', add: 'Add photo', blank: () => ({ image: '', caption: '', tag: '' }), fields: [f('image', 'Photo', 'image'), f('caption', 'Caption'), f('tag', 'Small label above the caption (optional)')] }),
    ] },
    { title: 'Guest moments (photo albums)', scroll: 'moments', custom: momentsPanel, note: 'Photos of guests: daily photos, or a photographer\'s photos from an event. Each album shows for the number of days you choose, then hides itself. Up to 30 photos per album. Tick "Let guests download" to offer the full-quality photos.' },
    { title: 'Reviews section', scroll: 'reviews', note: 'Choose which reviews show in the Reviews tab above. Fill in your real Google rating and review count to show them; leave them empty to hide.', fields: [
      f('reviews.script', 'Handwritten line'), f('reviews.title', 'Title'), f('reviews.rating', 'Your Google rating, for example 4.8'), f('reviews.count', 'Number of Google reviews, for example 120'),
      f('reviews.formTitle', 'Button text'), f('reviews.thanks', 'Thank-you message', 'area'),
      f('reviews.googleLink', 'Google review link (in your Google Business Profile, choose "Ask for reviews" and copy the link)'),
      f('reviews.googleButton', 'Google review button text'), f('reviews.googleAsk', 'Message asking for a Google review (shown to customers a while after they order)', 'area'),
    ] },
    { title: 'Map and messages', scroll: 'visit', note: 'For the map on the page: in Google Maps choose Share, then Embed a map, and paste the link that starts with https://www.google.com/maps', fields: [
      f('visit.script', 'Handwritten line'), f('visit.title', 'Title'), f('visit.mapLink', 'Google Maps link (for the buttons)'), f('visit.mapEmbed', 'Google Maps embed link (for the map on the page)', 'area'),
      f('sizes.map.h', 'Map height in px (normal 240)', 'number'), f('sizes.map.w', 'Map width in px (0 = half the page)', 'number'),
      f('visit.messageTitle', 'Message box title'), f('visit.messageText', 'Message box text', 'area'),
    ] },
    { title: 'Social media buttons', scroll: 'visit', note: 'These show as round buttons next to WhatsApp in the bottom corner of every page, and in the footer. A button only shows when it has a link and "Show" is ticked.', fields: [
      f('socialBar.show', 'Show the round buttons in the bottom corner', 'toggle'), f('socialBar.whatsapp', 'Include the WhatsApp button', 'toggle'),
      f('social', '', 'list', { title: (s) => `${s.type}${!s.url ? ' (no link yet)' : s.show === false ? ' (hidden)' : ''}`, add: 'Add social media', blank: () => ({ type: 'instagram', url: '', show: true }), fields: [
        f('type', 'Which one', 'select', { options: () => [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['viber', 'Viber'], ['maps', 'Google Maps'], ['website', 'Website'], ['link', 'Other link']] }),
        f('url', 'Link (https://...)'), f('show', 'Show', 'toggle'),
      ] }),
    ] },
    { title: 'Sizes and photo positions', scroll: 'hero', custom: sizesPanel, note: 'To change a size, press "Edit layout" above the preview, then drag the edge of a photo or box. To move a photo inside its frame, drag the photo; the small bar on it zooms in and out. Sizes you set here are for computers; phones keep their own layout.' },
    { title: 'Payment QR codes and delivery', scroll: 'menu', note: 'Upload your eSewa and Fonepay QR pictures here. Customers see them at checkout.', fields: [
      f('payment.deliveryFee', 'Delivery charge in NPR', 'number'), f('payment.deliveryNote', 'Delivery note'), f('payment.instructions', 'Payment instructions', 'area'),
      f('payment.esewa.enabled', 'Accept eSewa', 'toggle'), f('payment.esewa.qr', 'eSewa QR picture', 'image'), f('payment.esewa.account', 'eSewa name or number shown under the QR'),
      f('payment.fonepay.enabled', 'Accept Fonepay', 'toggle'), f('payment.fonepay.qr', 'Fonepay QR picture', 'image'), f('payment.fonepay.account', 'Fonepay name shown under the QR'),
    ] },
    { title: 'New features: on or off', scroll: 'menu', note: 'Switch off any of these at once if something does not work as it should. Nothing is lost: switch it back on later.', fields: [
      f('features.accounts', 'Customer accounts (sign up with email code, password, settings)', 'toggle'),
      f('features.points', 'Loyalty points', 'toggle'),
      f('features.liveStatus', 'Live order status for customers', 'toggle'),
      f('features.orderAgain', '"Order again" button on past orders', 'toggle'),
      f('features.tableButtons', 'Table buttons: Call staff, Bring the bill, Water please', 'toggle'),
      f('features.soldOut', '"Sold out today" from the counter screen', 'toggle'),
      f('features.googleSignIn', 'Sign in with Google (needs the Google client id on Railway)', 'toggle'),
      f('features.cod', 'Cash on delivery (with change for one note)', 'toggle'),
      f('features.mapPin', 'Customers choose the delivery spot on a map', 'toggle'),
      f('features.driverTracking', 'Customers see the driver on a map while he is on the way', 'toggle'),
    ] },
    { title: 'Delivery area and drivers', scroll: 'visit', note: 'Map pins outside this circle are refused (Hetauda only). The centre is the cafe. Find the numbers in Google Maps: press and hold on the cafe, the first line is latitude, longitude. Add driver logins in Security (role: Delivery driver). Drivers use yourwebsite/driver on their phone, or the app once it is updated.', fields: [
      f('delivery.lat', 'Cafe latitude', 'number', { step: 0.000001 }), f('delivery.lng', 'Cafe longitude', 'number', { step: 0.000001 }),
      f('delivery.radiusKm', 'Delivers up to how many km', 'number', { step: 0.5 }), f('payment.deliveryFee', 'Delivery charge in NPR', 'number'),
    ] },
    { title: 'Loyalty points and accounts', scroll: 'menu', note: 'Points are added when an order is marked Done, and given back if a used order is cancelled. Every change is kept in Customers and points. Guests who are not signed in use points with staff approval at the counter.', fields: [
      f('loyalty.percent', 'Points back, in % of each order (5 = 5%)', 'number', { step: 0.5 }),
      f('loyalty.rupeesPerPoint', 'Rupees one point is worth', 'number'),
      f('loyalty.minSpend', 'Points needed before they can be used', 'number'),
      f('loyalty.expiryMonths', 'Points run out after how many months', 'number'),
      f('loyalty.birthdayPoints', 'Birthday points (0 = none)', 'number'),
      f('loyalty.birthdayDays', 'Birthday points last how many days', 'number'),
      f('loyalty.title', 'Name of the points'), f('loyalty.text', 'Short explanation for customers', 'area'),
      f('accounts.title', 'Account box title'), f('accounts.text', 'Account box text', 'area'),
    ] },
    { title: 'Table buttons and Wi-Fi', scroll: 'menu', note: 'Guests who scan the QR on their table see these at the top. Calls appear in red on the counter screen with a sound.', fields: [
      f('tableHelp.show', 'Show Call staff, Bring the bill and Water please', 'toggle'),
      f('tableHelp.wifiName', 'Wi-Fi name (leave empty to hide)'), f('tableHelp.wifiPassword', 'Wi-Fi password'),
    ] },
    { title: 'Get the app card (under the map)', scroll: 'visit', note: 'The QR always points to yourwebsite/app, which sends iPhones to the App Store and Android phones to Google Play (or the Android download while Google Play is not ready). For the official badges, download them from Apple and Google and upload them here.', fields: [
      f('appCard.show', 'Show the card', 'toggle'), f('appCard.title', 'Title'), f('appCard.text', 'Text', 'area'), f('appCard.qrText', 'Text next to the QR'),
      f('appCard.appStore', 'App Store link'), f('appCard.googlePlay', 'Google Play link (empty until the app is on Google Play)'), f('appCard.apk', 'Android download link while not on Google Play (optional)'),
      f('appCard.appStoreBadge', 'Official App Store badge picture (optional)', 'image'), f('appCard.googlePlayBadge', 'Official Google Play badge picture (optional)', 'image'),
    ] },
    { title: 'Footer', scroll: 'visit', fields: [f('footer.line', 'Closing line'), f('footer.note', 'Small note (optional)')] },
    { title: 'Google and link previews', scroll: 'hero', note: 'What Google shows for your website, and what a shared link shows on WhatsApp, Facebook and Viber. Your hours, address, phone and menu prices are sent to Google from the rest of the website by themselves. Changes can take a few days to appear on Google.', fields: [
      f('seo.title', 'Title in Google results (about 60 letters)'), f('seo.description', 'Description in Google results (about 150 letters)', 'area'),
      f('seo.image', 'Photo for shared links (leave empty to use the top photo)', 'image'),
      f('seo.city', 'Town'), f('seo.region', 'Province'), f('seo.lat', 'Map position: latitude', 'number', { step: 0.000001 }), f('seo.lng', 'Map position: longitude', 'number', { step: 0.000001 }),
    ] },
  ];

  /* ---------- form builder ---------- */
  function changed() {
    status();
    clearTimeout(A.timer);
    A.timer = setTimeout(pushPreview, 140);
  }
  function pushPreview() { tell({ pm: 'content', content: A.content }); if (A.drawEventTicks && document.body.contains(document.querySelector('.pk-evticks'))) A.drawEventTicks(); }
  function status() {
    const dirty = JSON.stringify(A.content) !== A.saved;
    const el = document.getElementById('pk-status');
    if (el) { el.textContent = dirty ? 'You have unsaved changes' : 'All changes saved'; el.classList.toggle('is-dirty', dirty); }
    const save = document.getElementById('pk-save');
    if (save) save.disabled = !dirty;
    return dirty;
  }

  function imageField(field, obj, done) {
    const thumb = h('div', { class: 'pk-thumb' });
    const url = h('input', { type: 'text', placeholder: 'Photo link, or upload', value: get(obj, field.k) || '', 'aria-label': field.l + ' link' });
    const show = () => { const v = get(obj, field.k); thumb.replaceChildren(v ? h('img', { src: v, alt: '' }) : h('span', {}, 'No photo')); };
    const apply = (v) => { set(obj, field.k, v); url.value = v; show(); done(); };
    url.addEventListener('change', () => apply(url.value.trim()));
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const picked = file.files[0];
      if (!picked) return;
      try {
        flash('Uploading photo...');
        const small = await shrink(picked, field.max || 1800, true);
        const res = await api('POST', '/api/admin/upload', small, small.type || 'image/jpeg');
        apply(res.url);
        flash('Photo uploaded. Remember to save.');
      } catch (e) { flash(e.message, true); }
      file.value = '';
    } });
    show();
    return h('div', { class: 'pk-image' }, thumb, h('div', { class: 'pk-image-tools' }, url,
      h('div', { class: 'pk-row' }, h('button', { type: 'button', class: 'pk-btn', onclick: () => file.click() }, 'Upload photo'),
        h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => apply('') }, 'Remove')), file,
      cropControls(() => get(obj, field.k))));
  }
  // Move the photo inside its frame, zoom in, or show the whole photo.
  function cropControls(currentUrl) {
    const box = h('div', { class: 'pk-crop' });
    const d = h('details', { class: 'pk-crop-wrap' }, h('summary', {}, 'Adjust position and zoom'), box);
    const draw = () => {
      const u = currentUrl();
      box.replaceChildren();
      if (!u) { box.append(h('p', { class: 'pk-note' }, 'Add a photo first.')); return; }
      A.content.crops = A.content.crops || {};
      const k = Object.assign({ x: 50, y: 50, z: 1, fit: 'cover' }, A.content.crops[u] || {});
      const commit = () => { A.content.crops[u] = Object.assign({}, k); changed(); };
      const slider = (label, key, min, max, step, fmt) => {
        const out = h('span', { class: 'pk-crop-val' }, fmt(k[key]));
        const id = `adf-${++fieldSeq}`;
        const input = h('input', { type: 'range', id, min, max, step, value: k[key], oninput: (e) => { k[key] = Number(e.target.value); out.textContent = fmt(k[key]); commit(); } });
        return h('div', { class: 'pk-crop-row' }, h('label', { for: id }, label), input, out);
      };
      // The sliders move the photo the way you pull: left moves it left, up moves it up.
      // (Stored x / y are the photo's object-position, which runs the other way, so they are flipped here.)
      const flip = (label, key, cls, fmt) => {
        const out = h('span', { class: 'pk-crop-val' }, fmt(k[key]));
        const id = `adf-${++fieldSeq}`;
        const input = h('input', { type: 'range', id, class: cls, min: 0, max: 100, step: 1, value: key === 'y' ? k[key] : 100 - k[key], oninput: (e) => { const v = Number(e.target.value); k[key] = key === 'y' ? v : 100 - v; out.textContent = fmt(k[key]); commit(); } });
        return h('div', { class: `pk-crop-row ${cls}-row` }, h('label', { for: id }, label), input, out);
      };
      const side = (v) => (v === 50 ? 'middle' : v < 50 ? `${50 - v} right` : `${v - 50} left`);
      const updown = (v) => (v === 50 ? 'middle' : v < 50 ? `${50 - v} down` : `${v - 50} up`);
      box.append(
        flip('Left / right', 'x', 'pk-slide-x', side),
        flip('Up / down', 'y', 'pk-slide-y', updown),
        slider('Zoom', 'z', 0.3, 4, 0.05, (v) => `${Math.round(v * 100)}%`),
        h('p', { class: 'pk-note' }, 'Zoom below 100% to see more of the photo; the empty part of the frame is filled with a soft blend of the same photo.'),
        h('label', { class: 'pk-check' }, h('input', { type: 'checkbox', checked: k.fit === 'contain', onchange: (e) => { k.fit = e.target.checked ? 'contain' : 'cover'; commit(); } }), h('span', {}, 'Show the whole photo (no cropping)')),
        h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => { delete A.content.crops[u]; changed(); draw(); } }, 'Reset position'));
    };
    d.addEventListener('toggle', () => { if (d.open) draw(); });
    return d;
  }
  function sizesPanel(body) {
    const draw = () => {
      body.replaceChildren();
      const sizes = A.content.sizes || {};
      const used = Object.keys(sizes).filter((k) => SIZES[k] && (sizes[k].w || sizes[k].h));
      body.append(h('div', { class: 'pk-row' },
        h('button', { type: 'button', class: 'pk-btn', onclick: () => setLayout(true) }, 'Start editing layout'),
        used.length && h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => { if (!window.confirm('Put every size back to normal?')) return; A.content.sizes = {}; changed(); draw(); } }, 'Reset all sizes'),
        Object.keys(A.content.crops || {}).length && h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => { if (!window.confirm('Put every photo back in the middle of its frame?')) return; A.content.crops = {}; changed(); draw(); } }, 'Reset all photo positions')));
      if (!used.length) { body.append(h('p', { class: 'pk-note' }, 'Every size is normal at the moment.')); return; }
      body.append(h('ul', { class: 'pk-sizes' }, used.map((k) => h('li', {},
        h('span', {}, `${SIZES[k].label}: ${[sizes[k].w && `${sizes[k].w} wide`, sizes[k].h && `${sizes[k].h} tall`].filter(Boolean).join(', ')}`),
        h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => { delete A.content.sizes[k]; changed(); draw(); } }, 'Reset')))));
    };
    A.drawSizes = draw;
    draw();
  }

  /* ---------- event calendar ---------- */
  const DAY = 864e5;
  const addDays = (ad, n) => new Date(Date.parse(ad) + n * DAY).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const niceDate = (ad) => { const d = new Date(ad + 'T00:00:00Z'); return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}, ${WEEKDAYS[d.getUTCDay()]}`; };
  // The coming dates of a template, from today.
  function occurrences(t, from) {
    const y0 = Number(from.slice(0, 4));
    const out = [];
    const pad = (n) => String(n).padStart(2, '0');
    if (t.rule === 'fixed' && /^\d{2}-\d{2}$/.test(t.md || '')) for (const y of [y0, y0 + 1]) out.push(`${y}-${t.md}`);
    if (t.rule === 'nth') {
      for (const y of [y0, y0 + 1]) {
        const m = Number(t.month), wd = Number(t.weekday), n = Number(t.n);
        if (!(m >= 1 && m <= 12 && wd >= 0 && wd <= 6 && n >= 1 && n <= 5)) break;
        const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
        const d = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
        if (d <= new Date(Date.UTC(y, m, 0)).getUTCDate()) out.push(`${y}-${pad(m)}-${pad(d)}`);
      }
    }
    if (t.rule === 'bs' && /^\d{2}-\d{2}$/.test(t.md || '')) {
      const b = BS.toBS(from);
      const [mm, dd] = t.md.split('-').map(Number);
      if (b) for (const y of [b.y, b.y + 1]) { try { if (y <= 2090) out.push(BS.toAD(y, mm, dd)); } catch (e) { /* outside the calendar */ } }
    }
    if (t.rule === 'dates') String(t.dates || '').split(',').map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).forEach((x) => out.push(x));
    return out.filter((d) => d >= from).sort();
  }
  const coveredBy = (t, date) => (A.content.events.items || []).find((e) => e.template === t.key && e.start && e.start <= date && addDays(e.start, Number(e.days) || 1) > date);
  function dismissed(key) { try { return JSON.parse(localStorage.getItem('pm_dismissed') || '[]').includes(key); } catch (e) { return false; } }
  function dismiss(key) { try { const l = JSON.parse(localStorage.getItem('pm_dismissed') || '[]'); l.push(key); localStorage.setItem('pm_dismissed', JSON.stringify(l.slice(-100))); } catch (e) { /* no storage */ } }
  function reminders() {
    const today = BS.todayAD();
    const out = [];
    for (const t of A.content.eventTemplates || []) {
      const d = occurrences(t, today)[0];
      if (!d) continue;
      const left = daysBetween(today, d);
      if (left <= (Number(t.remind) || 14) && !coveredBy(t, d) && !dismissed(`${t.key}:${d}`)) out.push({ t, d, left });
    }
    return out;
  }
  function makeEvent(t, date) {
    const before = Math.max(0, Number(t.before) || 7);
    const today = BS.todayAD();
    const start = addDays(date, -before) < today ? today : addDays(date, -before);
    const ev = {
      id: uid('event'), template: t.key, enabled: true, tag: t.tag || t.name, title: t.title || t.name, text: t.text || '', image: '',
      button: 'See the specials', link: '', start, days: daysBetween(start, date) + 1,
      message: t.message || '', menuTitle: `${t.name} specials`, photos: [], menu: [],
    };
    A.content.events.items.push(ev);
    const sec = A.content.sections.find((x) => x.id === 'events');
    if (sec) sec.show = true;
    A.open.add(ev);
    changed();
    drawReminders();
    show('edit', true);
    const panel = Array.from(document.querySelectorAll('.pk-group')).find((d) => /Events and specials/.test(d.querySelector('summary').textContent));
    if (panel) { panel.open = true; panel.scrollIntoView({ block: 'start' }); }
    flash(`${t.name} event made. Add photos and special items, then press Save.`);
  }
  function drawReminders() {
    const box = document.getElementById('pk-remind');
    if (!box || !A.content) return;
    box.replaceChildren();
    if (A.seed) {
      box.append(h('div', { class: 'pk-remind pk-remind--seed' },
        h('span', {}, `This version of the website came with a backup made on ${niceDate(String(A.seed.createdAt).slice(0, 10))}. Use it to bring back your photos, menu and texts?`),
        h('button', { type: 'button', class: 'pk-btn pk-btn--main', onclick: () => useSeed(true) }, 'Use the backup'),
        h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => useSeed(false) }, 'No, keep the website as it is')));
    }
    const waiting = [...((A.content.extras || {}).groups || []).flatMap((g) => g.options || []), ...((A.content.cake || {}).options || [])].filter((o) => o.show === false && Number(o.price) > 0);
    if (waiting.length && !dismissed('v5-prices')) {
      box.append(h('div', { class: 'pk-remind' },
        h('span', {}, `New: customers can add extras to drinks and choose cake options. ${waiting.map((o) => o.name).join(', ')} are switched off until you check their prices.`),
        h('button', { type: 'button', class: 'pk-btn pk-btn--main', onclick: () => { show('edit'); setTimeout(() => { const d = Array.from(document.querySelectorAll('.pk-group > summary')).find((x) => /Drink extras/.test(x.textContent)); if (d) { d.parentElement.open = true; d.scrollIntoView({ block: 'start' }); } }, 50); } }, 'Check the prices'),
        h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => { dismiss('v5-prices'); drawReminders(); } }, 'Later')));
    }
    for (const r of reminders()) {
      box.append(h('div', { class: 'pk-remind' },
        h('span', {}, `${r.t.name} is on ${niceDate(r.d)}, ${r.left === 0 ? 'today' : r.left === 1 ? 'tomorrow' : `in ${r.left} days`}. Themed cakes sell well; publish them about ${Number(r.t.before) || 7} days before.`),
        h('button', { type: 'button', class: 'pk-btn pk-btn--main', onclick: () => makeEvent(r.t, r.d) }, 'Make the event'),
        h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => { dismiss(`${r.t.key}:${r.d}`); drawReminders(); } }, 'Not this time')));
    }
  }
  async function useSeed(use) {
    if (use && !window.confirm('Replace the website with the backup? The current website stays in History, so you can go back.')) return;
    try {
      const res = await api('POST', '/api/admin/seed', { file: A.seed.file, use });
      A.seed = null;
      if (use) await afterRestore(res);
      drawReminders();
    } catch (e) { flash(e.message, true); }
  }
  async function afterRestore(res) {
    A.content = await fetch('/api/content').then((x) => x.json());
    A.saved = JSON.stringify(A.content);
    document.getElementById('pk-body').replaceChildren();
    show('edit', true);
    status();
    drawReminders();
    flash(`Backup restored: ${res.website ? 'website, ' : ''}${res.photos} new photos, ${res.orders} orders, ${res.bookings} bookings.`);
  }
  function calendarPanel(body) {
    const today = BS.todayAD();
    const rows = (A.content.eventTemplates || []).map((t) => ({ t, d: occurrences(t, today)[0] }))
      .sort((a, b) => (a.d || '9999').localeCompare(b.d || '9999'));
    body.append(h('ul', { class: 'pk-cal' }, rows.map(({ t, d }) => {
      const ev = d && coveredBy(t, d);
      const bs = d ? BS.toBS(d) : null;
      return h('li', {},
        h('div', {}, h('b', {}, t.name), h('span', {}, d ? `${niceDate(d)}${bs ? ` · ${bs.d} ${BS.MONTHS[bs.m - 1]} ${bs.y}` : ''} · ${daysBetween(today, d) === 0 ? 'today' : `in ${daysBetween(today, d)} days`}` : `Date not set yet (usually ${t.usual || 'changes every year'}). Type it under "Edit the calendar".`)),
        ev ? h('span', { class: 'pk-tag' }, 'Event made') : d && h('button', { type: 'button', class: 'pk-btn', onclick: () => makeEvent(t, d) }, 'Make the event'));
    })));
    const edit = h('details', { class: 'pk-crop-wrap' }, h('summary', {}, 'Edit the calendar (dates, reminders, default text)'));
    edit.append(buildFields([f('eventTemplates', '', 'list', {
      title: (t) => t.name, add: 'Add a day', blank: () => ({ key: uid('day'), name: 'New day', rule: 'fixed', md: '01-01', dates: '', usual: '', remind: 14, before: 7, tag: '', title: '', text: '', message: '' }),
      fields: [
        f('name', 'Name'),
        f('rule', 'Date', 'select', { options: () => [['fixed', 'Same English date every year'], ['bs', 'Same Nepali date every year'], ['nth', 'A weekday in a month (for example 2nd Sunday of May)'], ['dates', 'Changes every year: type the dates']] }),
        f('md', 'Month and day, MM-DD (for the first two choices; Nepali months 01 = Baisakh)'),
        f('month', 'Month 1 to 12 (weekday choice)', 'number'), f('weekday', 'Weekday 0 = Sunday ... 6 = Saturday', 'number'), f('n', 'Which one: 1 = first, 2 = second...', 'number'),
        f('dates', 'Dates, YYYY-MM-DD, separated by commas (changes every year)'), f('usual', 'Usually in (shown when no date is set)'),
        f('remind', 'Remind me how many days before', 'number'), f('before', 'Start showing the event how many days before', 'number'),
        f('tag', 'Small label'), f('title', 'Event title'), f('text', 'Short description', 'area'), f('message', 'Message on the event page', 'area'),
      ],
    })], A.content, () => drawReminders()));
    body.append(edit);
  }
  function availabilityPanel(body) {
    const groups = A.content.menu.categories || [];
    body.append(h('div', { class: 'pk-avail' }, groups.map((g) => h('div', { class: 'pk-avail-group' },
      h('div', { class: 'pk-avail-head' }, h('b', {}, g.name),
        h('label', { class: 'pk-check' }, h('input', { type: 'checkbox', checked: !g.hidden, onchange: (e) => { g.hidden = !e.target.checked; changed(); } }), h('span', {}, 'Show group'))),
      (g.items || []).map((it) => h('div', { class: 'pk-avail-row' }, h('span', {}, it.name),
        h('label', { class: 'pk-check' }, h('input', { type: 'checkbox', checked: it.available !== false, onchange: (e) => { it.available = e.target.checked; changed(); } }), h('span', {}, 'Available')),
        h('label', { class: 'pk-check' }, h('input', { type: 'checkbox', checked: !it.hidden, onchange: (e) => { it.hidden = !e.target.checked; changed(); } }), h('span', {}, 'Show'))))))));
  }

  // Opening one section closes the one that was open, so only one stays expanded.
  function closeOthers(d, sel) {
    const parent = d.parentElement;
    if (!parent) return;
    let shifted = false;
    for (const x of parent.children) if (x !== d && x.matches(sel) && x.open) { x.open = false; shifted = true; }
    if (shifted) requestAnimationFrame(() => { const r = d.getBoundingClientRect(); if (r.top < 60 || r.top > window.innerHeight - 80) d.scrollIntoView({ block: 'start' }); });
  }
  function listField(field, obj) {
    const wrap = h('div', { class: 'pk-list' });
    const draw = () => {
      if (!Array.isArray(get(obj, field.k))) set(obj, field.k, []);
      const arr = get(obj, field.k);
      wrap.replaceChildren();
      arr.forEach((item, i) => {
        const title = h('span', { class: 'pk-item-title' }, field.title(item) || '(empty)');
        const move = (to) => (e) => { e.preventDefault(); if (to < 0 || to >= arr.length) return; arr.splice(to, 0, arr.splice(i, 1)[0]); changed(); draw(); };
        const tools = h('span', { class: 'pk-item-tools' },
          h('button', { type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: move(i - 1) }, '↑'),
          h('button', { type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === arr.length - 1, onclick: move(i + 1) }, '↓'),
          !field.fixed && h('button', { type: 'button', title: 'Delete', 'aria-label': 'Delete', class: 'is-del', onclick: (e) => {
            e.preventDefault();
            const inside = Array.isArray(item.items) && item.items.length ? ` and the ${item.items.length} items in it` : '';
            if (!window.confirm(`Delete "${field.title(item)}"${inside}? You can bring it back from History if you change your mind after saving.`)) return;
            arr.splice(i, 1); changed(); draw();
          } }, TRASH()));
        const body = h('div', { class: 'pk-item-body' });
        let built = false;
        const build = () => { if (!built) { body.append(buildFields(field.fields, item, () => { title.textContent = field.title(item) || '(empty)'; })); built = true; } };
        const d = h('details', { class: 'pk-item' }, h('summary', {}, title, tools), body);
        if (A.open.has(item)) { d.open = true; build(); }
        d.addEventListener('toggle', () => { if (d.open) { closeOthers(d, '.pk-item'); A.open.add(item); build(); } else A.open.delete(item); });
        wrap.append(d);
      });
      if (!field.fixed) {
        wrap.append(h('button', { type: 'button', class: 'pk-btn pk-add', onclick: () => { const it = field.blank(); arr.push(it); A.open.add(it); changed(); draw(); } }, '+ ' + (field.add || 'Add')));
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
      if (field.when && !field.when(obj)) continue;
      if (field.type === 'border') {
        frag.append(h('div', { class: 'pk-field' }, h('span', { class: 'pk-label' }, field.l), borderPicker(obj, field.k, done)));
        continue;
      }
      if (field.type === 'eventticks') {
        frag.append(h('div', { class: 'pk-field' }, h('span', { class: 'pk-label' }, field.l), eventTicks(done)));
        continue;
      }
      if (field.type === 'eventphotos') {
        frag.append(h('div', { class: 'pk-field' }, h('span', { class: 'pk-label' }, field.l), eventPhotos(obj, done)));
        continue;
      }
      if (field.type === 'cakephotos') {
        frag.append(h('div', { class: 'pk-field' }, h('span', { class: 'pk-label' }, field.l), cakePhotos(done)));
        continue;
      }
      if (field.type === 'list') {
        frag.append(h('div', { class: 'pk-field' }, field.l && h('span', { class: 'pk-label' }, field.l), listField(field, obj)));
        continue;
      }
      if (field.type === 'image') {
        frag.append(h('div', { class: 'pk-field' }, h('span', { class: 'pk-label' }, field.l), imageField(field, obj, done)));
        continue;
      }
      if (field.type === 'section') {
        const sec = (A.content.sections || []).find((x) => x.id === field.id);
        if (!sec) continue;
        control = h('input', { type: 'checkbox', id, checked: sec.show !== false, onchange: (e) => { sec.show = e.target.checked; done(); } });
        frag.append(h('label', { class: 'pk-field pk-check', for: id }, control, h('span', {}, field.l)));
        continue;
      }
      if (field.type === 'checks') {
        const now = () => (Array.isArray(get(obj, field.k)) ? get(obj, field.k) : []);
        const box = h('div', { class: 'pk-checks', role: 'group', 'aria-label': field.l }, field.options().map(([v, label]) => h('label', { class: 'pk-check' },
          h('input', { type: 'checkbox', checked: now().includes(v), onchange: (e) => { const next = now().filter((x) => x !== v); if (e.target.checked) next.push(v); set(obj, field.k, next); done(); } }), h('span', {}, label))));
        frag.append(h('div', { class: 'pk-field' }, h('span', { class: 'pk-label' }, field.l), box));
        continue;
      }
      if (field.type === 'range') {
        const shown = h('span', { class: 'pk-crop-val' }, `${Number(val) || 0}${field.unit || ''}`);
        control = h('input', { type: 'range', id, min: field.min, max: field.max, step: field.step || 1, value: Number(val) || 0, oninput: (e) => { set(obj, field.k, Number(e.target.value)); shown.textContent = `${e.target.value}${field.unit || ''}`; done(); } });
        frag.append(h('div', { class: 'pk-field' }, h('label', { class: 'pk-label', for: id }, field.l), h('div', { class: 'pk-crop-row pk-range' }, control, shown)));
        continue;
      }
      if (field.type === 'toggle') {
        control = h('input', { type: 'checkbox', id, checked: val === undefined ? field.def !== false : Boolean(val), onchange: (e) => { set(obj, field.k, e.target.checked); done(); } });
        frag.append(h('label', { class: 'pk-field pk-check', for: id }, control, h('span', {}, field.l)));
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
        control = h('div', { class: 'pk-color' }, picker, text);
      } else {
        control = h('input', { type: field.type, id, step: field.step, value: val == null ? '' : val, oninput: (e) => {
          set(obj, field.k, field.type === 'number' ? Number(e.target.value) || 0 : e.target.value); done();
        } });
      }
      frag.append(h('div', { class: 'pk-field' }, h('label', { class: 'pk-label', for: id }, field.l), control));
    }
    return frag;
  }

  /* Border themes as small pictures: your own photo with each border around it. */
  function borderPicker(obj, key, done) {
    const sample = A.content.cake.image || A.content.hero.image || '';
    const grid = h('div', { class: 'pk-borders', role: 'radiogroup', 'aria-label': 'Photo border theme' });
    const draw = () => {
      const cur = get(obj, key) || 'none';
      grid.replaceChildren(...BORDERS.map(([v, label]) => {
        const [main, rest] = label.split(': ');
        return h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === cur), class: 'pk-border' + (v === cur ? ' is-on' : ''), title: label,
          onclick: () => { set(obj, key, v); done(); draw(); } },
        h('span', { class: 'pk-border-zoom' }, h('span', { class: v === 'none' ? 'pk-border-frame' : `pk-border-frame deco deco--${v}` }, h('span', { class: 'pk-border-pic', style: sample ? `background-image:url("${sample.replace(/"/g, '')}")` : '' }))),
        h('small', {}, rest ? rest : main), rest ? h('em', {}, main) : null);
      }));
    };
    draw();
    return grid;
  }
  // Every event on one line: tick it to let it show. It still only shows between its dates.
  function eventStatus(e) {
    const today = BS.todayAD();
    const days = Math.max(1, Number(e.days) || 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start || '')) return 'No start date';
    const end = addDays(e.start, days);
    const left = daysBetween(today, end);
    if (today < e.start) { const n = daysBetween(today, e.start); return `Starts ${n === 1 ? 'tomorrow' : `in ${n} days`}`; }
    if (today >= end) return 'Ended';
    return `Showing now, ${left === 1 ? 'last day today' : `${left} days left`}`;
  }
  const shortDay = (d, year) => { const t = new Date(d + 'T00:00:00'); return Number.isNaN(t.getTime()) ? '?' : t.toLocaleDateString('en-GB', year ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }); };
  const shortRange = (a, b) => (!a ? 'No start date' : !b || b === a ? shortDay(a, true) : `${shortDay(a, a.slice(0, 4) !== b.slice(0, 4))} to ${shortDay(b, true)}`);
  function eventTicks(done) {
    const box = h('div', { class: 'pk-evticks' });
    const draw = () => {
      const items = A.content.events.items || [];
      if (!items.length) { box.replaceChildren(h('p', { class: 'pk-empty' }, 'No events yet. Use "Add an empty event" below, or "Make the event" from the calendar.')); return; }
      box.replaceChildren(...items.map((e) => {
        const st = eventStatus(e);
        const last = /^\d{4}-\d{2}-\d{2}$/.test(e.start || '') ? addDays(e.start, Math.max(1, Number(e.days) || 1) - 1) : '';
        return h('label', { class: 'pk-evtick' + (e.enabled === false ? ' is-off' : '') },
          h('input', { type: 'checkbox', checked: e.enabled !== false, onchange: (x) => { e.enabled = x.target.checked; done(); draw(); } }),
          h('span', {}, h('b', {}, e.title || 'Untitled event'), h('small', {}, shortRange(e.start, last))),
          h('span', { class: 'pk-tag' + (/Showing/.test(st) && e.enabled !== false ? ' pk-tag--live' : '') }, e.enabled === false ? 'Not shown' : st));
      }));
    };
    draw();
    A.drawEventTicks = draw;
    return box;
  }
  /* An event's photos: the first is the main photo, and the slideshow shows them all with their titles. */
  function eventPhotos(e, done) {
    if (!Array.isArray(e.photos)) e.photos = [];
    if (e.image && !e.photos.some((p) => p.image === e.image)) e.photos.unshift({ image: e.image, caption: '' });
    const sync = () => { e.image = (e.photos[0] && e.photos[0].image) || ''; };
    sync();
    const box = h('div', { class: 'pk-evphotos' });
    const note = h('p', { class: 'pk-note pk-progress', role: 'status' });
    const pick = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
      const files = Array.from(pick.files).filter((x) => /^image\//.test(x.type));
      let n = 0;
      try {
        for (const file of files) {
          n += 1;
          note.textContent = `Uploading photo ${n} of ${files.length}... keep this page open.`;
          const small = await shrink(file, 1800, true);
          const res = await api('POST', '/api/admin/upload', small, small.type || 'image/jpeg');
          e.photos.push({ image: res.url, caption: '', text: '' });
        }
        if (n) flash(`${n} photo${n === 1 ? '' : 's'} added. Type a title on each, then press Save.`);
      } catch (err) { flash(err.message, true); }
      note.textContent = '';
      pick.value = '';
      sync(); done(); draw();
    } });
    const draw = () => {
      const last = e.photos.length - 1;
      const move = (i, to) => () => { if (to < 0 || to > last) return; e.photos.splice(to, 0, e.photos.splice(i, 1)[0]); sync(); done(); draw(); };
      box.replaceChildren(...e.photos.map((p, i) => h('div', { class: 'pk-evphoto' + (i === 0 ? ' is-main' : '') },
        h('img', { src: p.image, alt: '', loading: 'lazy' }),
        h('div', { class: 'pk-evphoto-body' },
          h('div', { class: 'pk-evphoto-top' },
            i === 0 ? h('span', { class: 'pk-tag pk-tag--live' }, 'Main photo')
              : h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: move(i, 0) }, 'Make main photo'),
            h('span', { class: 'pk-item-tools' },
              h('button', { type: 'button', title: 'Move earlier', 'aria-label': 'Move earlier', disabled: i === 0, onclick: move(i, i - 1) }, '↑'),
              h('button', { type: 'button', title: 'Move later', 'aria-label': 'Move later', disabled: i === last, onclick: move(i, i + 1) }, '↓'),
              h('button', { type: 'button', title: 'Remove photo', 'aria-label': 'Remove photo', class: 'is-del', onclick: () => {
                if (!window.confirm(`Remove ${p.caption ? `"${p.caption}"` : 'this photo'} from the event?`)) return;
                e.photos.splice(i, 1); sync(); done(); draw();
              } }, TRASH()))),
          h('label', { class: 'pk-evphoto-title' }, h('span', {}, 'Heading'),
            h('input', { value: p.caption || '', maxlength: 60, placeholder: `Empty = the event title (${e.title || 'Title'})`, oninput: (x) => { p.caption = x.target.value; done(); } })),
          h('label', { class: 'pk-evphoto-title' }, h('span', {}, 'Description'),
            h('textarea', { rows: 2, maxlength: 300, value: p.text || '', placeholder: 'Empty = the event description', oninput: (x) => { p.text = x.target.value; done(); } })),
          cropControls(() => p.image)))));
      if (!e.photos.length) box.append(h('p', { class: 'pk-empty' }, 'No photos yet. Add a few: the first one becomes the main photo.'));
      if (e.photos.length === 1) box.append(h('p', { class: 'pk-note' }, 'Only one photo, so this event is one slide. Add more photos to give it more slides.'));
    };
    draw();
    return h('div', {}, box, h('div', { class: 'pk-row' }, h('button', { type: 'button', class: 'pk-btn pk-btn--main', onclick: () => pick.click() }, '+ Add photos')), pick, note);
  }
  // A photo for each cake that can be pre-ordered whole. Order a Cake shows it when a guest picks that cake.
  function cakePhotos(done) {
    const k = A.content.cake;
    if (!k.photos || typeof k.photos !== 'object' || Array.isArray(k.photos)) k.photos = {};
    const cakes = [];
    for (const g of A.content.menu.categories || []) for (const it of g.items || []) if ((it.prices || []).some((p) => p.whole)) cakes.push(it);
    if (!cakes.length) return h('p', { class: 'pk-empty' }, 'No cakes yet. In the menu, tick "Whole cake: pre-order only" on a price to add one.');
    return h('div', { class: 'pk-cakephotos' }, cakes.map((it) => h('div', { class: 'pk-cakephoto' },
      h('b', {}, it.name), imageField(f(it.id, it.name, 'image', { hint: 'If empty, its menu photo is used.' }), k.photos, done))));
  }

  /* Guest moments: albums of guest photos that show for a set number of days. */
  const MAX_ALBUM = 30;
  function albumState(a) {
    const today = BS.todayAD();
    const end = addDays(a.date || today, Math.max(1, Number(a.days) || 1));
    if (today < (a.date || today)) return `starts ${niceDate(a.date)}`;
    if (today >= end) return 'ended, hidden';
    const left = daysBetween(today, end);
    return left === 1 ? 'showing, last day today' : `showing, ${left} days left`;
  }
  async function uploadAlbumPhotos(album, files, note) {
    const room = MAX_ALBUM - album.photos.length;
    const list = Array.from(files).filter((x) => /^image\//.test(x.type)).slice(0, Math.max(0, room));
    if (!list.length) { flash(room <= 0 ? `An album holds up to ${MAX_ALBUM} photos.` : 'Choose photos (JPG, PNG or WEBP).', true); return 0; }
    let n = 0;
    for (const file of list) {
      n += 1;
      note.textContent = `Uploading photo ${n} of ${list.length}... keep this page open.`;
      const small = await shrink(file, 1800, false);
      const shown = await api('POST', '/api/admin/upload?moment=1', small, small.type || 'image/jpeg');
      const photo = { image: shown.url, full: '' };
      if (album.download && file !== small && file.size <= 40e6) {
        try { photo.full = (await api('POST', '/api/admin/upload-full', file, file.type || 'image/jpeg')).url; } catch (e) { photo.full = ''; }
      }
      album.photos.push(photo);
    }
    note.textContent = '';
    changed();
    flash(`${list.length} photo${list.length === 1 ? '' : 's'} added. Press Save to put them on the website.${Array.from(files).length > list.length ? ` Only ${list.length} fitted: an album holds up to ${MAX_ALBUM}.` : ''}`);
    return list.length;
  }
  function momentsPanel(body) {
    const m = A.content.moments;
    body.append(buildFields([
      f('', 'Show the Guest moments section', 'section', { id: 'moments' }),
      f('script', 'Handwritten line'), f('title', 'Title'), f('text', 'Text under the title', 'area'), f('privacy', 'Small line about removing photos', 'area'),
    ], m));
    // new album
    const note = h('p', { class: 'pk-note pk-progress', role: 'status' });
    const nf = { title: 'At Pick Me today', date: BS.todayAD(), days: 2, download: false };
    const pick = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
      const album = { id: uid('album'), title: nf.title.trim() || 'Guest moments', date: nf.date || BS.todayAD(), days: Math.max(1, Number(nf.days) || 1), download: nf.download, photos: [] };
      try {
        const added = await uploadAlbumPhotos(album, pick.files, note);
        if (added) { m.albums.unshift(album); A.open.add(album); drawAlbums(); }
      } catch (e) { note.textContent = ''; flash(e.message, true); }
      pick.value = '';
    } });
    const newBox = h('div', { class: 'pk-card pk-newalbum' },
      h('strong', {}, 'New album'),
      h('div', { class: 'pk-grid' },
        h('label', {}, 'Album name', h('input', { value: nf.title, oninput: (e) => { nf.title = e.target.value; } })),
        h('label', {}, 'First day shown', h('input', { type: 'date', value: nf.date, oninput: (e) => { nf.date = e.target.value; } })),
        h('label', {}, 'Show for how many days', h('input', { type: 'number', min: 1, max: 365, value: nf.days, oninput: (e) => { nf.days = e.target.value; } }))),
      h('label', { class: 'pk-check' }, h('input', { type: 'checkbox', onchange: (e) => { nf.download = e.target.checked; } }), h('span', {}, 'Let guests download the full-quality photos (for a photographer\'s event photos)')),
      h('div', { class: 'pk-row' }, h('button', { type: 'button', class: 'pk-btn pk-btn--main', onclick: () => pick.click() }, `Choose photos (up to ${MAX_ALBUM})`)), pick, note);
    body.append(newBox);
    const list = h('div', { class: 'pk-albums' });
    const ended = h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: () => {
      const gone = m.albums.filter((a) => albumState(a).startsWith('ended'));
      if (!gone.length) return flash('No albums have ended.');
      if (!window.confirm(`Delete ${gone.length} album${gone.length === 1 ? '' : 's'} that ended (${gone.reduce((n, a) => n + a.photos.length, 0)} photos)? When you press Save, their photos are deleted from the website for good, to free space.`)) return;
      m.albums = m.albums.filter((a) => !gone.includes(a));
      changed(); drawAlbums();
    } }, 'Delete albums that have ended');
    function drawAlbums() {
      list.replaceChildren();
      if (!m.albums.length) { list.append(h('p', { class: 'pk-empty' }, 'No albums yet.')); return; }
      m.albums.forEach((a) => {
        const prog = h('p', { class: 'pk-note pk-progress', role: 'status' });
        const more = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
          try { if (await uploadAlbumPhotos(a, more.files, prog)) drawAlbums(); } catch (e) { prog.textContent = ''; flash(e.message, true); }
          more.value = '';
        } });
        const grid = h('div', { class: 'pk-album-grid' }, a.photos.map((ph, i) => h('figure', {},
          h('img', { src: ph.image, alt: '', loading: 'lazy' }),
          h('button', { type: 'button', class: 'pk-album-x', 'aria-label': 'Remove this photo', title: 'Remove this photo', onclick: () => { a.photos.splice(i, 1); changed(); drawAlbums(); } }, '×'))));
        const title = h('span', { class: 'pk-item-title' }, `${a.title} · ${a.photos.length} photos · ${albumState(a)}`);
        const d = h('details', { class: 'pk-item' }, h('summary', {}, title, h('span', { class: 'pk-item-tools' },
          h('button', { type: 'button', class: 'is-del', title: 'Delete album', 'aria-label': 'Delete album', onclick: (e) => {
            e.preventDefault();
            if (!window.confirm(`Delete the album "${a.title}" and its ${a.photos.length} photos? When you press Save, the photos are deleted for good.`)) return;
            m.albums.splice(m.albums.indexOf(a), 1); changed(); drawAlbums();
          } }, TRASH()))),
        h('div', { class: 'pk-item-body' },
          buildFields([f('title', 'Album name'), f('date', 'First day shown', 'date'), f('days', 'Show for how many days', 'number'),
            f('download', 'Let guests download the full-quality photos', 'toggle', { def: false })], a, () => { title.textContent = `${a.title} · ${a.photos.length} photos · ${albumState(a)}`; }),
          a.download && a.photos.some((ph) => !ph.full) ? h('p', { class: 'pk-note' }, 'Photos added before downloads were switched on download at website size.') : null,
          grid,
          h('div', { class: 'pk-row' }, h('button', { type: 'button', class: 'pk-btn', disabled: a.photos.length >= MAX_ALBUM, onclick: () => more.click() }, a.photos.length >= MAX_ALBUM ? 'Album is full (30 photos)' : 'Add more photos')),
          more, prog));
        if (A.open.has(a)) d.open = true;
        d.addEventListener('toggle', () => { if (d.open) { closeOthers(d, '.pk-item'); A.open.add(a); } else A.open.delete(a); });
        list.append(d);
      });
    }
    drawAlbums();
    body.append(h('div', { class: 'pk-field' }, h('span', { class: 'pk-label' }, 'Albums (newest first)'), list), h('div', { class: 'pk-row' }, ended));
  }

  /* ---------- edit view ---------- */
  function buildPanel() {
    const panel = h('aside', { class: 'pk-panel' }, h('p', { class: 'pk-intro' }, 'Open a part of the website, change it, and watch the preview. Above the preview, "Edit text" lets you type straight onto the page, and "Edit layout" lets you drag edges to resize photos and boxes, or drag a photo to move it in its frame. Nothing goes live until you press Save, and every save can be undone from History.'));
    PANELS.forEach((p) => {
      const body = h('div', { class: 'pk-group-body' });
      let built = false;
      const d = h('details', { class: 'pk-group' }, h('summary', {}, p.title), body);
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        closeOthers(d, '.pk-group');
        if (p.custom) { body.replaceChildren(); if (p.note) body.append(h('p', { class: 'pk-note' }, p.note)); const inner = h('div', { class: 'pk-group-body' }); body.append(inner); p.custom(inner); return; }
        if (!built) { if (p.note) body.append(h('p', { class: 'pk-note' }, p.note)); body.append(buildFields(p.fields, A.content)); built = true; }
        tell({ pm: 'scroll', id: p.scroll });
      });
      panel.append(d);
    });
    return panel;
  }
  function setInline(on) {
    A.inline = on;
    if (on && A.layout) setLayout(false);
    const b = document.getElementById('pk-inline');
    if (b) { b.textContent = on ? 'Editing text: on' : 'Edit text'; b.classList.toggle('pk-btn--main', on); b.setAttribute('aria-pressed', on); }
    tell({ pm: 'inline', on });
    if (on) { flash('Click any dashed text in the preview and type.'); showMobile('prev'); } else refreshPanel();
  }
  function setLayout(on) {
    A.layout = on;
    if (on && A.inline) setInline(false);
    const b = document.getElementById('pk-layout');
    if (b) { b.textContent = on ? 'Editing layout: on' : 'Edit layout'; b.classList.toggle('pk-btn--main', on); b.setAttribute('aria-pressed', on); }
    tell({ pm: 'layout', on });
    if (on) { flash('Drag the edge of a photo or box to resize it. Drag a photo to move it in its frame.'); showMobile('prev'); } else if (A.drawSizes) A.drawSizes();
  }
  function refreshPanel() {
    const old = document.querySelector('.pk-panel');
    if (old) old.replaceWith(buildPanel());
    pushPreview();
  }
  function showMobile(which) {
    A.mobile = which;
    const split = document.querySelector('.pk-split');
    if (split) split.dataset.show = which;
    document.querySelectorAll('[data-mobile]').forEach((b) => b.classList.toggle('is-on', b.dataset.mobile === which));
  }
  function editView() {
    const frameEl = h('iframe', { id: 'pk-frame', src: '/?preview=1', title: 'Live preview of the website' });
    const wrap = h('div', { class: 'pk-frame-wrap is-computer' }, frameEl);
    // "Computer" shows the page at a real computer width (1280 px), shrunk to fit beside the editor.
    const fit = () => {
      if (!wrap.classList.contains('is-computer')) { frameEl.style.cssText = ''; return; }
      const w = wrap.clientWidth;
      const hgt = wrap.clientHeight;
      if (!w || !hgt) return;
      const sc = Math.min(1, w / 1280);
      frameEl.style.cssText = `width:1280px;height:${Math.round(hgt / sc)}px;transform:scale(${sc});transform-origin:0 0;`;
    };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
    const size = (cls, label) => h('button', { type: 'button', class: 'pk-btn pk-btn--quiet pk-wide-only', 'data-size': cls, onclick: () => {
      wrap.className = 'pk-frame-wrap ' + cls;
      document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('is-on', b.dataset.size === cls));
      fit();
    } }, label);
    A.inline = false;
    A.layout = false;
    const split = h('div', { class: 'pk-split', 'data-show': A.mobile },
      h('div', { class: 'pk-switch' },
        h('button', { type: 'button', 'data-mobile': 'edit', class: A.mobile === 'edit' ? 'is-on' : '', onclick: () => showMobile('edit') }, 'Editor'),
        h('button', { type: 'button', 'data-mobile': 'prev', class: A.mobile === 'prev' ? 'is-on' : '', onclick: () => showMobile('prev') }, 'Preview')),
      buildPanel(),
      h('section', { class: 'pk-preview' },
        h('div', { class: 'pk-prev-bar' }, h('strong', { class: 'pk-wide-only' }, 'Live preview'), h('span', { class: 'pk-row' },
          h('button', { type: 'button', id: 'pk-inline', class: 'pk-btn', 'aria-pressed': 'false', onclick: () => setInline(!A.inline) }, 'Edit text'),
          h('button', { type: 'button', id: 'pk-layout', class: 'pk-btn', 'aria-pressed': 'false', onclick: () => setLayout(!A.layout) }, 'Edit layout'),
          size('is-computer', 'Computer'), size('is-phone', 'Phone'))), wrap));
    return split;
  }

  /* ---------- list views ---------- */
  const TYPE = { dinein: 'Dine-in', pickup: 'Pickup', delivery: 'Delivery' };
  const options = (list, cur) => list.map((s) => `<option value="${s}"${s === cur ? ' selected' : ''}>${s}</option>`).join('');
  const waNum = (p) => String(p || '').replace(/\D/g, '').replace(/^(?=9\d{9}$)/, '977');
  const contact = (x) => `<a href="tel:${esc(x.phone)}">${esc(x.phone)}</a> · <a href="https://wa.me/${esc(waNum(x.phone))}" target="_blank" rel="noopener">WhatsApp</a>`;
  const line = (label, v) => (v ? `<p><b>${label}:</b> ${esc(v)}</p>` : '');
  const alerts = () => `<p class="pk-note">Email alerts: <b>${A.me.email ? 'on' : 'off'}</b> · WhatsApp alerts: <b>${A.me.whatsapp ? 'on' : 'off'}</b>. The README explains how to switch them on. This list refreshes every 30 seconds. Staff can use the <a href="/counter" target="_blank" rel="noopener">counter screen</a>.</p>`;

  const STEP_NAMES = { pending: 'Pending', acknowledged: 'Acknowledged', preparing: 'Preparing', ready: 'Ready', done: 'Done', cancelled: 'Cancelled', confirmed: 'Confirmed', seated: 'Seated', declined: 'Declined' };
  const ORDER_STEPS = ['pending', 'acknowledged', 'preparing', 'ready', 'done', 'cancelled'];
  const BOOKING_STEPS = ['pending', 'confirmed', 'seated', 'done', 'declined'];
  const stepOptions = (list, cur) => list.map((x) => `<option value="${x}"${x === cur ? ' selected' : ''}>${STEP_NAMES[x]}</option>`).join('');
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kathmandu', hour: 'numeric', minute: '2-digit', hour12: true });
  const logList = (x) => (Array.isArray(x.log) && x.log.length ? `<details class="pk-log-mini"><summary>History of this ${x.lines ? 'order' : 'booking'}</summary><ul>${x.log.map((l) => `<li>${clock(l.at)} · ${esc(l.what)} <span>${esc(l.by)}</span></li>`).join('')}</ul></details>` : '');
  const time12 = (t) => { const [hh, mm] = String(t || '').split(':').map(Number); return Number.isFinite(hh) ? `${hh % 12 || 12}:${String(mm || 0).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}` : String(t || ''); };
  function orderCard(o) {
    const quick = (step, label) => (o.status !== step && o.status !== 'cancelled' ? `<button type="button" class="pk-btn" data-quick="orders" data-id="${esc(o.id)}" data-step="${step}">${label}</button>` : '');
    return `<article class="pk-card is-${esc(o.status)}">
      <header><strong>${esc(o.id)}</strong><span>${when(o.createdAt)}</span><span class="pk-tag">${TYPE[o.type]}${o.tableNo ? ` · table ${esc(o.tableNo)}` : ''}</span><span class="pk-step pk-step--${esc(o.status)}">${STEP_NAMES[o.status] || esc(o.status)}</span><span class="pk-step ${o.paid ? 'pk-step--paid' : 'pk-step--unpaid'}">${o.paid ? 'Paid' : 'Not paid'}</span>${!o.paid && o.payment && o.payment.method !== 'later' && !['done', 'cancelled'].includes(o.status) ? '<span class="pk-step pk-step--pending">Payment to check: call the guest</span>' : ''}<b>${rs(o.total)}</b></header>
      <p>${esc(o.name || 'Guest')}${o.phone ? ` · ${contact(o)}` : ''}</p>
      <p><b>For:</b> ${o.schedule ? `${esc(o.schedule.bs || (/^\d{4}-\d{2}-\d{2}$/.test(o.schedule.date || '') ? BS.label(o.schedule.date) : o.schedule.date))} at ${esc(time12(o.schedule.time))}` : 'as soon as possible'}</p>
      ${line('Address', o.address)}
      <ul>${o.lines.map((l) => `<li>${l.qty} × ${esc(l.name)}${l.label ? ` (${esc(l.label)})` : ''}${l.extras && l.extras.length ? ` <em>+ ${esc(l.extras.join(', '))}</em>` : ''} <span>${rs(l.qty * l.price)}</span></li>`).join('')}${o.deliveryFee ? `<li>Delivery <span>${rs(o.deliveryFee)}</span></li>` : ''}</ul>
      <p><b>Payment:</b> ${o.payment.method === 'later' ? 'pay later' : o.payment.method === 'cod' ? `cash on delivery${o.payment.change ? `, bring change for Rs. ${o.payment.change}` : ''}` : esc(o.payment.method)}${o.payment.txn ? `, code ${esc(o.payment.txn)}` : ''}</p>
      ${o.location ? `<p><a href="https://www.google.com/maps?q=${o.location.lat},${o.location.lng}" target="_blank" rel="noopener">Delivery pin on the map</a></p>` : ''}${o.driver ? `<p><b>Driver:</b> ${esc(o.driver.name)}${o.delivery && o.delivery.status ? ` · ${esc(o.delivery.status)}` : ''}</p>` : ''}
      ${line('On the cake', o.cakeMessage)}${line('Occasion', o.occasion)}${line('Notes', o.notes)}
      <footer>
        ${quick('acknowledged', 'Acknowledge')}${quick('done', 'Mark done')}
        ${o.paid ? `<button type="button" class="pk-btn pk-btn--quiet" data-quickpaid="false" data-id="${esc(o.id)}">Mark not paid</button>` : `<button type="button" class="pk-btn pk-btn--main" data-quickpaid="true" data-id="${esc(o.id)}">Mark paid</button>`}
        <label>Status <select data-patch="desk/orders" data-id="${esc(o.id)}" data-key="status">${stepOptions(ORDER_STEPS, o.status)}</select></label>
        ${o.payment.proof ? `<a class="pk-btn pk-btn--quiet" href="/api/desk/proof/${esc(o.payment.proof)}" target="_blank" rel="noopener">Payment screenshot</a>` : ''}
        ${o.refPhoto ? `<a class="pk-btn pk-btn--quiet" href="/api/desk/proof/${esc(o.refPhoto)}" target="_blank" rel="noopener">Cake design photo</a>` : ''}
        <button type="button" class="pk-btn pk-btn--quiet" data-del="orders" data-id="${esc(o.id)}">Delete</button>
      </footer>${logList(o)}</article>`;
  }
  function daySummary(list) {
    const live = list.filter((o) => o.status !== 'cancelled');
    const sum = (arr) => arr.reduce((t, o) => t + Number(o.total || 0), 0);
    const count = (k) => live.filter((o) => o.type === k).length;
    const tile = (label, value, cls) => `<div class="pk-tile ${cls || ''}"><span>${label}</span><b>${value}</b></div>`;
    return `<div class="pk-tiles">
      ${tile('Orders', `${live.length}${list.length > live.length ? ` <small>(${list.length - live.length} cancelled)</small>` : ''}`)}
      ${tile('Total', rs(sum(live)))}${tile('Paid', rs(sum(live.filter((o) => o.paid))), 'is-paid')}${tile('Not paid yet', rs(sum(live.filter((o) => !o.paid))), 'is-unpaid')}
      ${tile('Still to do', live.filter((o) => o.status !== 'done').length)}
      ${tile('At the cafe / pickup / delivery', `${count('dinein')} / ${count('pickup')} / ${count('delivery')}`)}
    </div>`;
  }
  // The Orders badge counts pending orders on every day; say so when some are not on the day shown.
  function waitingNote(day) {
    if (A.dayBy === 'todo') return '';
    const shown = new Set(A.dayOrders.map((o) => o.id));
    const other = (A.orders || []).filter((o) => o.status === 'pending' && !shown.has(o.id));
    if (!other.length) return '';
    return `<p class="pk-waiting">${other.length} pending order${other.length === 1 ? ' is' : 's are'} on other days. <button type="button" class="pk-btn pk-btn--main" data-showtodo="1">Show every order still to do</button></p>`;
  }
  function listView(kind) {
    const box = h('div', { class: 'pk-page' });
    if (kind === 'orders') {
      const day = A.day || BS.todayAD();
      const bs = BS.toBS(day);
      const list = A.dayOrders.filter((o) => A.orderFilter === 'all' || (A.orderFilter === 'unpaid' ? !o.paid && o.status !== 'cancelled' : o.status === A.orderFilter));
      const chip = (k, label) => `<button type="button" class="pk-chip${A.orderFilter === k ? ' is-on' : ''}" data-ofilter="${k}">${label}</button>`;
      box.innerHTML = `<h2>Orders</h2>${alerts()}
        <form class="pk-card pk-dayform" id="pk-day-form">
          <div class="pk-row">
            <button type="button" class="pk-btn pk-btn--quiet" data-day="-1" aria-label="Previous day">‹ Previous day</button>
            <label class="pk-inline">Day <input type="date" name="day" value="${day}"></label>
            <button type="button" class="pk-btn pk-btn--quiet" data-day="1" aria-label="Next day">Next day ›</button>
            <button type="button" class="pk-btn pk-btn--quiet" data-day="0">Today</button>
          </div>
          <p class="pk-bsday">${bs ? `${bs.d} ${BS.MONTHS[bs.m - 1]} ${bs.y}` : ''} · ${niceDate(day)}</p>
          <div class="pk-row">
            <label class="pk-inline">Show <select name="by"><option value="placed"${A.dayBy === 'placed' ? ' selected' : ''}>orders placed this day</option><option value="due"${A.dayBy === 'due' ? ' selected' : ''}>orders due this day</option><option value="todo"${A.dayBy === 'todo' ? ' selected' : ''}>every order still to do (any day)</option></select></label>
            ${A.dayBy === 'todo' ? '' : `<a class="pk-btn" href="/api/desk/day.csv?date=${day}&by=${A.dayBy}">Download this day (opens in Excel)</a>`}
          </div>
        </form>
        ${waitingNote(day)}
        ${daySummary(A.dayOrders)}
        <div class="pk-chips">${chip('all', 'All')}${ORDER_STEPS.map((k) => chip(k, STEP_NAMES[k])).join('')}${chip('unpaid', 'Not paid')}</div>`
        + (list.length ? list.map(orderCard).join('') : '<p class="pk-empty">No orders here.</p>');
    } else if (kind === 'bookings') {
      box.innerHTML = `<h2>Table bookings</h2>${alerts()}` + (A.bookings.length ? A.bookings.map((b) => `
        <article class="pk-card is-${esc(b.status)}">
          <header><strong>${esc(b.id)}</strong><span>asked ${when(b.createdAt)}</span><span class="pk-step pk-step--${esc(b.status)}">${STEP_NAMES[b.status] || esc(b.status)}</span><b>${esc(b.people)} people</b></header>
          <p><b>${esc(b.bs || b.date)} at ${esc(b.time)}</b>${b.seating ? ` · ${esc(b.seating)}` : ''}</p>
          <p>${esc(b.name || 'Guest')} · ${contact(b)}</p>
          ${line('Food ready on arrival', b.food)}${line('Name on cake', b.cakeName)}${line('Decoration', b.decoration)}${line('Remarks', b.remarks)}
          <footer>
            ${b.status === 'pending' ? `<button type="button" class="pk-btn pk-btn--main" data-quick="bookings" data-id="${esc(b.id)}" data-step="confirmed">Confirm</button>` : ''}
            <label>Status <select data-patch="desk/bookings" data-id="${esc(b.id)}" data-key="status">${stepOptions(BOOKING_STEPS, b.status)}</select></label>
            <button type="button" class="pk-btn pk-btn--quiet" data-del="bookings" data-id="${esc(b.id)}">Delete</button>
          </footer>${logList(b)}
        </article>`).join('') : '<p class="pk-empty">No bookings yet.</p>');
    } else if (kind === 'reviews') {
      box.innerHTML = `<h2>Reviews</h2>
        <p class="pk-note">Tick "Show on website" for the reviews you want visitors to see. To show a Google review, copy it from Google Maps and add it below.</p>
        <form class="pk-card pk-form" id="pk-newrev">
          <header><strong>Add a review yourself</strong></header>
          <div class="pk-grid">
            <label>Name<input name="name" required maxlength="60"></label>
            <label>Stars<select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></label>
            <label>From<select name="source"><option value="google">Google review</option><option value="site">Guest in the cafe</option></select></label>
          </div>
          <label>What they tried (optional)<input name="favorite" maxlength="100"></label>
          <label>Review<textarea name="text" rows="2" required maxlength="800"></textarea></label>
          <footer><button class="pk-btn" type="submit">Add and show on website</button></footer>
        </form>`
        + (A.reviews.length ? A.reviews.map((r) => `
        <article class="pk-card${r.approved ? '' : ' is-new'}">
          <header><strong>${esc(r.name)}</strong><span>${'★'.repeat(r.rating)}</span><span class="pk-tag">${r.source === 'google' ? 'Google' : 'Website'}</span><span>${when(r.createdAt)}</span></header>
          <p>${esc(r.text)}</p>${line('Tried', r.favorite)}
          <footer>
            <label class="pk-check"><input type="checkbox" data-patch="admin/reviews" data-id="${esc(r.id)}" data-key="approved"${r.approved ? ' checked' : ''}><span>Show on website</span></label>
            <button type="button" class="pk-btn pk-btn--quiet" data-del="reviews" data-id="${esc(r.id)}">Delete</button>
          </footer>
        </article>`).join('') : '<p class="pk-empty">No reviews yet.</p>');
    } else if (kind === 'messages') {
      box.innerHTML = `<h2>Messages</h2><p class="pk-note">Messages sent from the "Send us a message" box. The customer also sends the same text to your WhatsApp.</p>`
        + (A.messages.length ? A.messages.map((m) => `
        <article class="pk-card${m.read ? '' : ' is-new'}">
          <header><strong>${esc(m.name || 'Guest')}</strong><span>${when(m.createdAt)}</span></header>
          <p>${esc(m.text)}</p>
          ${m.phone ? `<p>${contact(m)}</p>` : ''}
          <footer>
            <label class="pk-check"><input type="checkbox" data-patch="admin/messages" data-id="${esc(m.id)}" data-key="read"${m.read ? ' checked' : ''}><span>Read</span></label>
            <button type="button" class="pk-btn pk-btn--quiet" data-del="messages" data-id="${esc(m.id)}">Delete</button>
          </footer>
        </article>`).join('') : '<p class="pk-empty">No messages yet.</p>');
    } else if (kind === 'history') {
      box.innerHTML = `<h2>History and backup</h2>
        <div class="pk-card">
          <header><strong>Backups</strong></header>
          <p class="pk-note">Download a website backup before you put a new version of the website on GitHub. If the new version starts empty, come here and restore the file: your photos, menu, prices, texts, sizes and photo positions come back. To have Claude build the next version on top of your current website, upload the website backup file in the chat.</p>
          <footer>
            <a class="pk-btn pk-btn--main" href="/api/admin/backup">Download website backup</a>
            <a class="pk-btn" href="/api/admin/backup?full=1">Download full backup (also orders, bookings, reviews, messages)</a>
          </footer>
          <form class="pk-form" id="pk-restore-form">
            <label>Restore from a backup file (.zip)<input type="file" name="file" accept=".zip,application/zip" required></label>
            <footer><button class="pk-btn" type="submit">Restore</button><span class="pk-note">Nothing is deleted: the current website is kept in the list below, and orders are only added.</span></footer>
          </form>
          <p class="pk-note">Passwords and staff logins are never put in a backup. Customer accounts go in without their passwords (customers choose "Forgot password" once after a restore).</p>
        </div>
        <div class="pk-card"><header><strong>Automatic backups (every night)</strong><button type="button" class="pk-btn pk-btn--quiet" data-do="backup-now">Make one now</button></header>
          <p class="pk-note">Every night after 11 PM the website, orders, bookings, accounts and points are saved here (14 newest)${A.auto && A.auto.email ? ' and emailed to you, so a copy is kept outside the server' : '. To also get them by email (a copy outside the server), set RESEND_API_KEY and BACKUP_EMAIL on Railway'}. Photos are only in the manual website backup above.</p>
          ${A.auto && A.auto.last ? `<p class="pk-note">Last: ${when(A.auto.last.at)}${A.auto.last.emailed ? ', emailed' : ''}.</p>` : ''}
          ${A.auto && A.auto.files.length ? `<ul class="pk-staff">${A.auto.files.map((x) => `<li><span>${esc(x.file)} · ${Math.max(1, Math.round(x.bytes / 1024))} KB</span><a class="pk-btn pk-btn--quiet" href="/api/admin/auto-backups/${esc(x.file)}">Download</a></li>`).join('')}</ul>` : '<p class="pk-empty">None yet. The first one is made tonight.</p>'}
        </div>
        <p class="pk-note">Every time you press Save, the website is kept here. Open an older version to look at it in the editor; press Save if you want to use it again. Nothing changes until you save.</p>
        <div class="pk-card"><header><strong>Website versions</strong></header>
          ${A.history.length ? A.history.map((v, n) => `<div class="pk-version">
            <div><b>${when(v.at)}</b>${n === 0 ? ' <span class="pk-tag">live now</span>' : ''}${v.note ? ` · ${esc(v.note)}` : ''}
              ${v.changes && v.changes.length ? `<ul>${v.changes.slice(0, 8).map((c) => `<li>${esc(c)}</li>`).join('')}${v.changes.length > 8 ? `<li>and ${v.changes.length - 8} more changes</li>` : ''}</ul>` : `<p class="pk-note">${v.note ? '' : 'No changes listed.'}</p>`}</div>
            ${n === 0 ? '' : `<button type="button" class="pk-btn" data-version="${esc(v.id)}">Open this version</button>`}
          </div>`).join('') : '<p class="pk-empty">No saved versions yet. They appear after your first save.</p>'}
        </div>
        <div class="pk-card"><header><strong>Deleted orders, bookings, reviews and messages</strong></header>
          ${A.bin.length ? A.bin.map((t) => `<div class="pk-version"><div><b>${esc(t.item.id)}</b> · ${esc(t.kind)} · ${esc(t.item.name || 'Guest')} · deleted ${when(t.at)}</div>
            <button type="button" class="pk-btn" data-unbin="${esc(t.key)}">Bring back</button></div>`).join('') : '<p class="pk-empty">Nothing deleted.</p>'}
        </div>
        <div class="pk-card">
          <header><strong>Recent activity</strong></header>
          ${A.log.length ? `<div class="pk-log"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Number</th></tr></thead><tbody>${A.log.map((l) => `<tr><td>${when(l.at)}</td><td>${esc(l.by)}</td><td>${esc(l.action)}</td><td>${esc(l.ref)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="pk-empty">Nothing yet.</p>'}
        </div>`;
    } else if (kind === 'customers') {
      const C = A.cust || { customers: [], guests: [] };
      const q = (A.custQ || '').toLowerCase();
      const list = C.customers.filter((c) => !q || [c.name, c.email, c.phone, c.username].some((v) => String(v || '').toLowerCase().includes(q)));
      const KIND = { earn: 'Earned', spend: 'Used', refund: 'Given back', reverse: 'Taken back', adjust: 'Changed by owner', birthday: 'Birthday', closed: 'Account closed' };
      const L = A.content.loyalty || {};
      box.innerHTML = `<h2>Customers and points</h2>
        <p class="pk-note">${C.customers.length} account${C.customers.length === 1 ? '' : 's'}. Points: ${L.percent || 0}% back on finished orders, 1 point = Rs. ${L.rupeesPerPoint || 1}, usable from ${L.minSpend || 0} points, last ${L.expiryMonths || 12} months. Change these in Edit website, "Loyalty points and accounts".</p>
        <form class="pk-card pk-form" id="pk-points-form"><header><strong>Add or take away points</strong></header>
          <div class="pk-grid"><label>Phone number<input name="phone" type="tel" required></label><label>Points (minus to take away)<input name="amount" type="number" required></label><label>Reason (kept with the points)<input name="note" required maxlength="160"></label></div>
          <footer><button class="pk-btn" type="submit">Save</button></footer></form>
        <div class="pk-card"><header><strong>Accounts</strong><input type="search" id="pk-cust-q" placeholder="Search name, email or phone" value="${esc(A.custQ || '')}"></header>
          ${list.length ? `<div class="pk-log"><table><thead><tr><th>Name</th><th>Sign in with</th><th>Phone</th><th>Points</th><th>Birthday</th><th>Since</th><th></th></tr></thead><tbody>${list.map((c) => `<tr>
            <td>${esc(c.name || '—')}${c.prefs && c.prefs.offers ? ' <span class="pk-tag">offers ok</span>' : ''}</td><td>${esc([c.username, c.email].filter(Boolean).join(' · '))}${c.hasPassword ? '' : ' <span class="pk-tag">no password yet</span>'}</td>
            <td>${esc(c.phone || '—')}${c.phone ? (c.phoneVerified ? ' ✓' : ` <button type="button" class="pk-btn pk-btn--quiet" data-cust="confirm" data-id="${esc(c.id)}">Confirm</button>`) : ''}</td>
            <td>${c.points}</td><td>${esc(c.birthday || '—')} <button type="button" class="pk-btn pk-btn--quiet" data-cust="birthday" data-id="${esc(c.id)}">Change</button></td><td>${when(c.createdAt)}</td>
            <td><button type="button" class="pk-btn pk-btn--quiet" data-cust="signout" data-id="${esc(c.id)}">Sign out</button><button type="button" class="pk-btn pk-btn--quiet" data-cust="delete" data-id="${esc(c.id)}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="pk-empty">No accounts yet.</p>'}
        </div>
        ${C.guests.length ? `<div class="pk-card"><header><strong>Phone numbers with points but no account</strong></header><ul class="pk-staff">${C.guests.map((g) => `<li><span>${esc(g.phone)}</span><b>${g.points} points</b></li>`).join('')}</ul></div>` : ''}
        <div class="pk-card"><header><strong>Every points change (newest first)</strong></header>
          ${(A.ledger || []).length ? `<div class="pk-log"><table><thead><tr><th>When</th><th>Phone</th><th>What</th><th>Points</th><th>By</th></tr></thead><tbody>${A.ledger.slice(0, 200).map((l) => `<tr><td>${when(l.at)}</td><td>${esc(l.phone)}</td><td>${esc(KIND[l.kind] || l.kind)}${l.order ? ` · ${esc(l.order)}` : ''}${l.note ? ` · ${esc(l.note)}` : ''}</td><td>${l.amount > 0 ? '+' : ''}${l.amount}</td><td>${esc(l.by || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="pk-empty">No points yet. They are added when orders with a phone number are marked Done.</p>'}
        </div>`;
    } else if (kind === 'sales') {
      const d = (A.sales && A.sales.data) || null;
      const t = BS.todayAD();
      const range = (label, from, to) => `<button type="button" class="pk-chip${A.sales && A.sales.from === from && A.sales.to === to ? ' is-on' : ''}" data-range="${from}|${to}">${label}</button>`;
      const tile = (label, value, cls) => `<div class="pk-tile ${cls || ''}"><span>${label}</span><b>${value}</b></div>`;
      const TYPEN = { dinein: 'At the cafe', pickup: 'Pickup', delivery: 'Delivery' };
      const maxH = d ? Math.max(1, ...d.hours) : 1;
      const firstHour = d ? Math.max(0, d.hours.findIndex((n) => n > 0) - 1) : 7;
      box.innerHTML = `<h2>Sales</h2>
        <div class="pk-chips">${range('Today', t, t)}${range('Yesterday', addDays(t, -1), addDays(t, -1))}${range('Last 7 days', addDays(t, -6), t)}${range('Last 30 days', addDays(t, -29), t)}${range('Last 365 days', addDays(t, -364), t)}</div>
        <form class="pk-card pk-dayform" id="pk-sales-form"><div class="pk-row"><label class="pk-inline">From <input type="date" name="from" value="${esc((A.sales || {}).from || t)}"></label><label class="pk-inline">To <input type="date" name="to" value="${esc((A.sales || {}).to || t)}"></label><button class="pk-btn" type="submit">Show</button></div></form>
        ${d ? `<div class="pk-tiles">${tile('Orders', `${d.orders}${d.cancelled ? ` <small>(${d.cancelled} cancelled)</small>` : ''}`)}${tile('Total', rs(d.total))}${tile('Paid', rs(d.paid), 'is-paid')}${tile('Average order', rs(d.average))}${tile('Table bookings', d.bookings)}
            ${d.byType.map((x) => tile(TYPEN[x.type], `${x.orders} · ${rs(x.total)}`)).join('')}${tile('From the app', d.bySource.find((x) => x.source === 'app').orders)}
            ${tile('Points given', d.points.earned)}${tile('Points used', d.points.spent)}${tile('Points customers hold now', `${d.points.owed} <small>(${rs(d.points.value)})</small>`)}${tile('Customer accounts', d.customers)}</div>
          <div class="pk-card"><header><strong>Best sellers</strong></header>${d.best.length ? `<div class="pk-log"><table><thead><tr><th>Item</th><th>Sold</th><th>Total</th></tr></thead><tbody>${d.best.map((b) => `<tr><td>${esc(b.name)}</td><td>${b.qty}</td><td>${rs(b.total)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="pk-empty">No orders in these days.</p>'}</div>
          <div class="pk-card"><header><strong>Busiest hours (orders placed)</strong></header><div class="pk-hours">${d.hours.slice(firstHour, Math.max(firstHour + 6, 24 - [...d.hours].reverse().findIndex((n) => n > 0) + 1)).map((n, i) => `<div><i style="height:${Math.round((n / maxH) * 100)}%"></i><b>${n || ''}</b><span>${((firstHour + i) % 12) || 12}${firstHour + i < 12 ? 'a' : 'p'}</span></div>`).join('')}</div></div>
          ${Object.keys(d.days).length > 1 ? `<div class="pk-card"><header><strong>Day by day</strong></header><div class="pk-log"><table><thead><tr><th>Day</th><th>Orders</th><th>Total</th></tr></thead><tbody>${Object.entries(d.days).sort((a, b) => b[0].localeCompare(a[0])).map(([day, v]) => `<tr><td>${esc(niceDate(day))}</td><td>${v.orders}</td><td>${rs(v.total)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}` : ''}`;
    } else if (kind === 'tables') {
      const base = location.origin;
      const n = Math.max(1, Math.min(60, Number(A.tables) || 10));
      box.innerHTML = `<h2>Table QR codes</h2>
        <p class="pk-note">Put one on each table. Guests scan it, see the menu, and order without paying first. The order arrives in Orders and on the counter screen with the table number.</p>
        <form class="pk-card pk-form pk-noprint" id="pk-tables-form">
          <div class="pk-grid pk-grid--2">
            <label>How many tables<input type="number" name="n" min="1" max="60" value="${n}"></label>
            <label>Website address<input name="base" value="${esc(A.tableBase || base)}"></label>
          </div>
          <footer><button class="pk-btn" type="submit">Make QR codes</button><button class="pk-btn pk-btn--main" type="button" data-do="print">Print</button></footer>
        </form>
        <div class="pk-qr-sheet">${Array.from({ length: n }, (x, i) => {
          const link = `${(A.tableBase || base).replace(/\/+$/, '')}/?table=${i + 1}`;
          return `<figure class="pk-qr"><img src="/api/admin/qr?text=${encodeURIComponent(link)}" alt="QR code for table ${i + 1}"><figcaption><b>Table ${i + 1}</b><span>Scan to see the menu and order</span></figcaption></figure>`;
        }).join('')}
        ${A.content.reviews.googleLink ? `<figure class="pk-qr pk-qr--google"><img src="/api/admin/qr?text=${encodeURIComponent(A.content.reviews.googleLink)}" alt="QR code for Google reviews"><figcaption><b>Enjoyed your visit?</b><span>Scan to review us on Google</span></figcaption></figure>` : ''}</div>
        ${A.content.reviews.googleLink ? '' : '<p class="pk-note pk-noprint">To print a "Review us on Google" card with these, add your Google review link in Edit website, Reviews section.</p>'}`;
    } else {
      box.innerHTML = `<h2>Security and staff</h2>
        <form class="pk-card pk-form" id="pk-pass-form">
          <header><strong>Change the owner password</strong></header>
          <div class="pk-grid pk-grid--2">
            <label>Current password<input type="password" name="current" autocomplete="current-password" required></label>
            <label>New password (8 or more characters)<input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
          </div>
          <footer><button class="pk-btn" type="submit">Change password</button>
            <button class="pk-btn pk-btn--quiet" type="button" data-do="signout-all">Sign out on every device</button></footer>
        </form>
        <div class="pk-card">
          <header><strong>Staff logins for the counter screen</strong><a class="pk-btn pk-btn--quiet" href="/counter" target="_blank" rel="noopener">Open counter screen</a></header>
          <p class="pk-note">Counter staff see and update orders and bookings at /counter. Delivery drivers see only the deliveries given to them, at /driver (or in the app once it is updated). Nobody but you can edit the website.</p>
          ${A.staff.length ? `<ul class="pk-staff">${A.staff.map((s) => `<li><span><b>${esc(s.name)}</b> · ${s.role === 'driver' ? '<span class="pk-tag">Delivery driver</span>' : 'Counter staff'} · login ID ${esc(s.username)}${s.phone ? ` · ${esc(s.phone)}` : ''}${s.active ? '' : ' · switched off'}${s.lastLoginAt ? ` · last login ${when(s.lastLoginAt)}` : ''}</span>
            <span class="pk-row"><button type="button" class="pk-btn pk-btn--quiet" data-staff="reset" data-id="${esc(s.id)}">New password</button>
            <button type="button" class="pk-btn pk-btn--quiet" data-staff="toggle" data-id="${esc(s.id)}" data-on="${s.active}">${s.active ? 'Switch off' : 'Switch on'}</button>
            <button type="button" class="pk-btn pk-btn--quiet" data-staff="remove" data-id="${esc(s.id)}">Remove</button></span></li>`).join('')}</ul>` : '<p class="pk-empty">No staff logins yet.</p>'}
          <form class="pk-form" id="pk-staff-form">
            <div class="pk-grid">
              <label>Name<input name="name" required maxlength="80"></label>
              <label>Login ID<input name="username" required maxlength="30" autocapitalize="none" placeholder="e.g. sita"></label>
              <label>Password (6 or more)<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
              <label>Role<select name="role"><option value="staff">Counter staff (orders, bookings)</option><option value="driver">Delivery driver (only his deliveries)</option></select></label>
              <label>Phone (drivers: customers can call it)<input name="phone" type="tel" maxlength="20"></label>
            </div>
            <footer><button class="pk-btn" type="submit">Add staff login</button></footer>
          </form>
        </div>
        <p class="pk-note">Backups and the activity log are under History and backup.</p>`;
    }
    return box;
  }

  async function loadLists() {
    const [o, b, r, m] = await Promise.all([api('GET', '/api/desk/orders'), api('GET', '/api/desk/bookings'), api('GET', '/api/admin/reviews'), api('GET', '/api/admin/messages')]);
    A.orders = o; A.bookings = b; A.reviews = r; A.messages = m;
    const count = { orders: o.filter((x) => x.status === 'pending').length, bookings: b.filter((x) => x.status === 'pending').length, reviews: r.filter((x) => !x.approved).length, messages: m.filter((x) => !x.read).length };
    for (const [k, n] of Object.entries(count)) {
      const el = document.querySelector(`[data-count="${k}"]`);
      if (el) { el.textContent = n; el.hidden = !n; }
    }
  }
  async function loadDay() {
    if (A.dayBy === 'todo') { A.dayOrders = (await api('GET', '/api/desk/orders')).filter((o) => !['done', 'cancelled'].includes(o.status)); return; }
    A.dayOrders = await api('GET', `/api/desk/orders?date=${A.day || BS.todayAD()}&by=${A.dayBy}`);
  }
  async function loadCustomers() {
    [A.cust, A.ledger] = await Promise.all([api('GET', '/api/admin/customers'), api('GET', '/api/admin/points')]);
  }
  async function loadSales() {
    const t = BS.todayAD();
    A.sales = A.sales || { from: t, to: t };
    A.sales.data = await api('GET', `/api/admin/summary?from=${A.sales.from}&to=${A.sales.to}`);
  }
  async function loadSecurity() {
    A.staff = await api('GET', '/api/admin/staff');
  }
  async function loadHistory() {
    [A.history, A.bin, A.log, A.auto] = await Promise.all([api('GET', '/api/admin/history'), api('GET', '/api/admin/bin'), api('GET', '/api/admin/audit'), api('GET', '/api/admin/auto-backups').catch(() => null)]);
  }
  function show(view, force) {
    A.view = view;
    document.querySelectorAll('.pk-tabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.view === view));
    const body = document.getElementById('pk-body');
    if (view === 'edit') { if (!body.querySelector('.pk-split')) body.replaceChildren(editView()); return; }
    const busy = !force && body.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!busy || !body.querySelector('.pk-page')) body.replaceChildren(listView(view));
  }
  async function reload(view) {
    if (view === 'security') await loadSecurity();
    else if (view === 'history') await loadHistory();
    else if (view === 'orders') await Promise.all([loadLists(), loadDay()]);
    else if (view === 'customers') await loadCustomers();
    else if (view === 'sales') await loadSales();
    else if (view !== 'tables') await loadLists();
    show(view, true);
  }

  function shell() {
    const tab = (view, label) => h('button', { type: 'button', 'data-view': view, onclick: async () => {
      if (view !== 'edit' && A.view === 'edit' && status() && !window.confirm('You have unsaved changes to the website. Leave the editor anyway? They are lost if you leave.')) return;
      if (view === 'edit') return show('edit', true);
      try { await reload(view); } catch (e) { flash(e.message, true); }
    } }, label, !/edit|security|history|tables|customers|sales/.test(view) && h('span', { class: 'pk-count', 'data-count': view, hidden: true }, '0'));
    root.replaceChildren(
      h('header', { class: 'pk-top' },
        h('strong', { class: 'pk-name' }, 'Pick Me Cafe admin'),
        h('nav', { class: 'pk-tabs', 'aria-label': 'Admin sections' }, tab('edit', 'Edit website'), tab('orders', 'Orders'), tab('bookings', 'Bookings'), tab('reviews', 'Reviews'), tab('messages', 'Messages'), tab('customers', 'Customers and points'), tab('sales', 'Sales'), tab('tables', 'Table QR'), tab('history', 'History and backup'), tab('security', 'Security'),
          h('a', { class: 'pk-tablink', href: '/admin/print-menu', onclick: (e) => { if (A.view === 'edit' && status() && !window.confirm('You have unsaved changes to the website. Leave the editor anyway? They are lost if you leave.')) e.preventDefault(); } }, 'Print menu')),
        h('span', { class: 'pk-right' },
          h('span', { id: 'pk-status', class: 'pk-status' }, 'All changes saved'),
          h('button', { type: 'button', id: 'pk-save', class: 'pk-btn pk-btn--main', disabled: true, onclick: save }, 'Save'),
          h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: discard }, 'Undo changes'),
          h('a', { class: 'pk-btn pk-btn--quiet', href: '/', target: '_blank', rel: 'noopener' }, 'Open site'),
          h('button', { type: 'button', class: 'pk-btn pk-btn--quiet', onclick: async () => { await api('POST', '/api/auth/logout'); login(); } }, 'Log out'))),
      h('div', { id: 'pk-remind', class: 'pk-reminders' }),
      h('div', { id: 'pk-body', class: 'pk-body' }),
      h('div', { id: 'pk-flash', class: 'pk-flash', role: 'status' }));
  }
  async function save(force) {
    const r = await fetch('/api/admin/content' + (force === true ? '?force=1' : '') + (A.note ? `${force === true ? '&' : '?'}note=${encodeURIComponent(A.note)}` : ''), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(A.content),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) return login();
    if (r.status === 409) {
      const mine = window.confirm('The website was saved from another device after you opened this editor.\n\nPress OK to save your version anyway (the other version stays in History).\nPress Cancel to load the newest version instead (your unsaved changes here are lost).');
      if (mine) return save(true);
      A.content = await fetch('/api/content').then((x) => x.json());
      A.saved = JSON.stringify(A.content);
      document.getElementById('pk-body').replaceChildren();
      show('edit', true);
      status();
      return flash('Loaded the newest version.');
    }
    if (!r.ok) return flash(data.error || 'Could not save. Please try again.', true);
    A.content._rev = data.rev;
    A.saved = JSON.stringify(A.content);
    A.note = '';
    status();
    flash('Saved. The website is updated. Older versions are in History.');
  }
  function discard() {
    if (status() && !window.confirm('Undo every change since your last save?')) return;
    A.content = JSON.parse(A.saved);
    A.note = '';
    document.getElementById('pk-body').replaceChildren();
    show('edit', true);
    status();
  }

  const formData = (form) => Object.fromEntries(new FormData(form).entries());
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'pk-cust-q') return;
    A.custQ = e.target.value;
    clearTimeout(A.custT);
    A.custT = setTimeout(() => { const pos = e.target.selectionStart; show('customers', true); const q = document.getElementById('pk-cust-q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250);
  });
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.closest && t.closest('#pk-day-form')) {
      if (t.name === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) A.day = t.value;
      if (t.name === 'by') A.dayBy = t.value;
      try { await reload('orders'); } catch (err) { flash(err.message, true); }
      return;
    }
    if (!t.dataset.patch) return;
    try {
      await api('PATCH', `/api/${t.dataset.patch}/${t.dataset.id}`, { [t.dataset.key]: t.type === 'checkbox' ? t.checked : t.value });
      await reload(A.view);
      flash('Updated.');
    } catch (err) { flash(err.message, true); }
  });
  root.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    const staff = e.target.closest('[data-staff]');
    const doIt = e.target.closest('[data-do]');
    const version = e.target.closest('[data-version]');
    const unbin = e.target.closest('[data-unbin]');
    const quick = e.target.closest('[data-quick]');
    const quickPaid = e.target.closest('[data-quickpaid]');
    const dayBtn = e.target.closest('[data-day]');
    const ofilter = e.target.closest('[data-ofilter]');
    try {
      if (quick) { await api('PATCH', `/api/desk/${quick.dataset.quick}/${quick.dataset.id}`, { status: quick.dataset.step }); await reload(A.view); flash('Updated.'); return; }
      if (quickPaid) { await api('PATCH', `/api/desk/orders/${quickPaid.dataset.id}`, { paid: quickPaid.dataset.quickpaid === 'true' }); await reload(A.view); flash('Updated.'); return; }
      if (dayBtn) { e.preventDefault(); const n = Number(dayBtn.dataset.day); A.day = n === 0 ? BS.todayAD() : addDays(A.day || BS.todayAD(), n); await reload('orders'); return; }
      if (ofilter) { A.orderFilter = ofilter.dataset.ofilter; show('orders', true); return; }
      if (e.target.closest('[data-showtodo]')) { A.dayBy = 'todo'; await reload('orders'); return; }
      if (version) {
        if (status() && !window.confirm('You have unsaved changes. Open this older version anyway? Your unsaved changes are lost.')) return;
        const old = await api('GET', `/api/admin/history/${version.dataset.version}`);
        const v = A.history.find((x) => x.id === version.dataset.version);
        old._rev = JSON.parse(A.saved)._rev;
        A.content = old;
        A.note = v ? `restored the version from ${when(v.at)}` : 'restored an older version';
        document.getElementById('pk-body').replaceChildren();
        show('edit', true);
        status();
        flash('This is the older version. Look at the preview, then press Save to make it live, or Undo changes to go back.');
        return;
      }
      if (unbin) {
        await api('POST', '/api/admin/bin/restore', { key: unbin.dataset.unbin });
        flash('Brought back.');
        await reload('history');
        loadLists().catch(() => {});
        return;
      }
      if (doIt && doIt.dataset.do === 'print') { window.print(); return; }
      if (doIt && doIt.dataset.do === 'backup-now') { await api('POST', '/api/admin/auto-backups/now'); await reload('history'); flash('Backup made.'); return; }
      const rangeBtn = e.target.closest('[data-range]');
      if (rangeBtn) { const [from, to] = rangeBtn.dataset.range.split('|'); A.sales = { from, to }; await reload('sales'); return; }
      const cust = e.target.closest('[data-cust]');
      if (cust) {
        const id = cust.dataset.id;
        const act = cust.dataset.cust;
        if (act === 'confirm') await api('PATCH', `/api/admin/customers/${id}`, { phoneVerified: true });
        else if (act === 'signout') { await api('PATCH', `/api/admin/customers/${id}`, { signOut: true }); flash('Signed out on every device.'); }
        else if (act === 'birthday') { const b = window.prompt('Birthday as month-day, for example 03-14 for 14 March (empty to clear):'); if (b === null) return; await api('PATCH', `/api/admin/customers/${id}`, { birthday: b.trim() }); }
        else if (act === 'delete') { if (!window.confirm('Delete this account? Their orders stay; their login is removed.')) return; await api('DELETE', `/api/admin/customers/${id}`); }
        await reload('customers');
        return;
      }
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
    if (!/^pk-(newrev|pass-form|staff-form|tables-form|restore-form|day-form|points-form|sales-form)$/.test(id)) return;
    e.preventDefault();
    if (id === 'pk-day-form') return;
    try {
      if (id === 'pk-restore-form') {
        const file = e.target.elements.file.files[0];
        if (!file) return;
        if (!window.confirm('Restore this backup? The current website stays in History, so you can go back.')) return;
        flash('Restoring the backup...');
        const r = await fetch('/api/admin/restore', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(res.error || 'Could not restore that file.');
        await afterRestore(res);
        return;
      }
      if (id === 'pk-points-form') { await api('POST', '/api/admin/points', formData(e.target)); await reload('customers'); flash('Points saved.'); return; }
      if (id === 'pk-sales-form') { const d = formData(e.target); if (d.from && d.to) { A.sales = { from: d.from <= d.to ? d.from : d.to, to: d.from <= d.to ? d.to : d.from }; await reload('sales'); } return; }
      if (id === 'pk-tables-form') { const d = formData(e.target); A.tables = d.n; A.tableBase = String(d.base || '').trim() || location.origin; show('tables', true); return; }
      if (id === 'pk-newrev') { await api('POST', '/api/admin/reviews', formData(e.target)); await reload('reviews'); flash('Review added.'); }
      if (id === 'pk-pass-form') { await api('POST', '/api/admin/password', formData(e.target)); await reload('security'); flash('Password changed. Other devices are signed out.'); }
      if (id === 'pk-staff-form') { await api('POST', '/api/admin/staff', formData(e.target)); await reload('security'); flash('Staff login added.'); }
    } catch (err) { flash(err.message, true); }
  });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !A.content) return;
    if (e.data.pm === 'ready') { pushPreview(); if (A.inline) tell({ pm: 'inline', on: true }); if (A.layout) tell({ pm: 'layout', on: true }); }
    if (e.data.pm === 'size' && SIZES[e.data.key] && e.data.size) {
      A.content.sizes = A.content.sizes || {};
      const cur = Object.assign({}, A.content.sizes[e.data.key]);
      for (const ax of ['w', 'h']) { const n = Number(e.data.size[ax]); if (n >= 16 && n <= 3000) cur[ax] = Math.round(n); }
      A.content.sizes[e.data.key] = cur;
      status();
      if (A.drawSizes) A.drawSizes();
    }
    if (e.data.pm === 'crop' && typeof e.data.url === 'string' && e.data.crop) {
      const k = e.data.crop;
      A.content.crops = A.content.crops || {};
      A.content.crops[e.data.url] = { x: Number(k.x) || 0, y: Number(k.y) || 0, z: Math.max(0.3, Number(k.z) || 1), fit: k.fit === 'contain' ? 'contain' : 'cover' };
      status();
    }
    if (e.data.pm === 'edit' && typeof e.data.path === 'string' && /^[\w.]+$/.test(e.data.path) && !/__proto__|constructor|prototype/.test(e.data.path)) { set(A.content, e.data.path, String(e.data.value)); status(); }
  });
  window.addEventListener('beforeunload', (e) => { if (A.content && JSON.stringify(A.content) !== A.saved) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- login and start ---------- */
  function login() {
    clearInterval(A.poll);
    A.content = null;
    const msg = h('p', { class: 'pk-login-msg', role: 'alert' });
    const pass = h('input', { type: 'password', id: 'pk-pass', autocomplete: 'current-password', required: true });
    const keep = h('input', { type: 'checkbox', id: 'pk-keep', checked: true });
    root.replaceChildren(h('form', { class: 'pk-login', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', '/api/auth/login', { password: pass.value, remember: keep.checked }); boot(); } catch (err) { msg.textContent = err.message; }
    } }, h('h1', {}, 'Pick Me Cafe admin'), h('label', { for: 'pk-pass' }, 'Owner password'), pass,
    h('label', { class: 'pk-check', for: 'pk-keep' }, keep, h('span', {}, 'Keep me signed in on this device')), msg,
    h('button', { class: 'pk-btn pk-btn--main', type: 'submit' }, 'Log in'),
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
    drawReminders();
    loadLists().catch(() => {});
    api('GET', '/api/admin/seed').then((r) => { if (r.file) { A.seed = r; drawReminders(); } }).catch(() => {});
    clearInterval(A.poll);
    A.poll = setInterval(async () => {
      try { await loadLists(); if (A.view === 'orders') await loadDay(); if (!/edit|security|history|tables/.test(A.view)) show(A.view); } catch (e) { /* shown at next action */ }
    }, 30000);
  }
  boot();
})();
