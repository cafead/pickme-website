'use strict';
/*
 * Version 11: customer accounts (optional), loyalty points, table calls, "sold out today",
 * sales summary, birthday points and automatic daily backups.
 *
 * Nobody needs an account to order. A phone number alone shows the orders placed with it from the same
 * phone or browser (each browser keeps a random device id). An account (email or phone, verified with a
 * code, plus a password) shows every order on any device. Spending points needs a signed-in account whose
 * phone is confirmed, otherwise staff approve it at the counter.
 *
 * Points are a ledger (points.json): every add, spend, refund, birthday gift and correction is one line
 * with the order, amount, who did it and when. The balance is worked out from the ledger: older points are
 * spent first, and each earned lot expires after loyalty.expiryMonths.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function customers(x) {
  const { app, Store, json, str, bad, limit, content, orders, bookings, reviews, messages, audit, desk, admin, who, sign, makeHash, checkHash, NP_OFFSET, DATA_DIR, notify, AdmZip } = x;

  const people = new Store('customers.json', []);
  const points = new Store('points.json', []);
  const calls = new Store('calls.json', []);
  const soldout = new Store('soldout.json', { date: '', ids: [] });
  const AUTO = path.join(DATA_DIR, 'auto-backups');
  fs.mkdirSync(AUTO, { recursive: true });

  const nepalDate = () => new Date(Date.now() + NP_OFFSET).toISOString().slice(0, 10);
  const feature = (k) => ((content.get().features || {})[k]) !== false;
  const L = () => Object.assign({ percent: 5, rupeesPerPoint: 1, minSpend: 50, expiryMonths: 12, birthdayPoints: 100, birthdayDays: 7 }, content.get().loyalty || {});
  const pointsOn = () => feature('points') && Number(L().percent) > 0;
  const rid = (p) => `${p}${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

  // Phone numbers are compared as the 10 digits of a Nepali mobile (98XXXXXXXX); +977 and spaces are ignored.
  function normPhone(p) {
    let d = String(p || '').replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('977')) d = d.slice(3);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d.length >= 7 && d.length <= 15 ? d : '';
  }
  const normEmail = (e) => { const t = String(e || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 120 ? t : ''; };
  const DEVICE = /^[a-f0-9]{16,64}$/;
  const deviceOf = (v) => (typeof v === 'string' && DEVICE.test(v) ? v : '');

  /* ---------- points ledger ---------- */
  const monthsFrom = (ts, m) => { const d = new Date(ts); d.setMonth(d.getMonth() + Number(m || 12)); return d.toISOString(); };
  // Works out a phone's points from its ledger lines: oldest points are spent first, and lots expire.
  function pointsOf(phone, at) {
    const p = normPhone(phone);
    const now = at || Date.now();
    if (!p) return { balance: 0, lots: [], expired: 0, earned: 0, spent: 0, next: null };
    const lines = points.get().filter((l) => l.phone === p).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    let lots = [];
    let expired = 0;
    let earned = 0;
    let spent = 0;
    const dropOld = (t) => { lots = lots.filter((l) => { if (Date.parse(l.exp) <= t) { expired += l.left; return false; } return true; }); };
    for (const l of lines) {
      const t = Date.parse(l.at);
      dropOld(t);
      const n = Math.round(Number(l.amount) || 0);
      if (n > 0) { lots.push({ left: n, exp: l.exp || monthsFrom(t, L().expiryMonths) }); if (l.kind === 'earn' || l.kind === 'birthday') earned += n; } else if (n < 0) {
        let need = -n;
        if (l.kind === 'spend') spent += need;
        for (const lot of lots) { const take = Math.min(lot.left, need); lot.left -= take; need -= take; if (!need) break; }
        lots = lots.filter((lot) => lot.left > 0);
      }
    }
    dropOld(now);
    lots.sort((a, b) => String(a.exp).localeCompare(String(b.exp)));
    const balance = lots.reduce((s, l) => s + l.left, 0);
    return { balance, lots, expired, earned, spent, next: lots[0] ? { amount: lots[0].left, exp: lots[0].exp } : null };
  }
  async function addPoints(phone, amount, kind, extra) {
    const p = normPhone(phone);
    const n = Math.round(Number(amount) || 0);
    if (!p || !n) return null;
    const line = Object.assign({ id: rid('pt'), at: new Date().toISOString(), phone: p, amount: n, kind }, extra || {});
    if (n > 0 && !line.exp) line.exp = monthsFrom(Date.now(), L().expiryMonths);
    await points.set([...points.get(), line]);
    audit(line.by || '-', `points-${kind} ${n > 0 ? '+' : ''}${n}`, `${p}${line.order ? ' ' + line.order : ''}`);
    return line;
  }
  // How many points an order earns: a share of what was paid in money (points used do not earn points; delivery does not count).
  const earnFor = (o) => Math.floor(Math.max(0, Number(o.subtotal || 0) - Number((o.points && o.points.used) || 0)) * Number(L().percent) / 100 / (Number(L().rupeesPerPoint) || 1));

  /* ---------- customer sessions ---------- */
  // New passwords need at least 4 characters (26 Nov 2026: points are worth money). Older shorter ones still work.
  const MIN_PW = 4;
  const SHORT_PW = 'Please choose a password of at least 4 characters.';
  const custPublic = (c) => ({
    id: c.id, username: c.username || '', email: c.email || '', phone: c.phone || '', name: c.name || '', address: c.address || '',
    birthday: c.birthday || '', emailVerified: Boolean(c.emailVerified), phoneVerified: Boolean(c.phoneVerified),
    hasPassword: Boolean(c.hash), google: Boolean(c.google), apple: Boolean(c.apple), prefs: Object.assign({ orderUpdates: true, offers: false }, c.prefs || {}), createdAt: c.createdAt,
  });
  function issueCust(c) {
    const body = Buffer.from(JSON.stringify({ c: c.id, v: c.v || 0, exp: Date.now() + 180 * 864e5 })).toString('base64url');
    return `${body}.${sign('cust:' + body)}`;
  }
  function readCust(req) {
    const m = /(?:^|;\s*)pm_cust=([^;]+)/.exec(req.headers.cookie || '');
    const bearer = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    const token = m ? m[1] : bearer ? bearer[1] : '';
    if (!token) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const good = Buffer.from(sign('cust:' + body));
    const given = Buffer.from(sig);
    if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (!(p.exp > Date.now())) return null;
      const c = people.get().find((y) => y.id === p.c);
      return c && (c.v || 0) === (p.v || 0) ? c : null;
    } catch { return null; }
  }
  function custCookie(req, res, token) {
    const secure = req.secure ? '; Secure' : '';
    res.append('Set-Cookie', `pm_cust=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 180 * 86400 : 0}${secure}`);
  }
  const findLogin = (id) => {
    const t = String(id || '').trim().toLowerCase();
    if (!t) return null;
    const ph = /^[+\d][\d\s-]{6,}$/.test(t) ? normPhone(t) : '';
    return people.get().find((c) => (c.username && c.username === t) || (c.email && c.email === t) || (ph && c.phone === ph)) || null;
  };

  /* ---------- one-time codes (email now; SMS once a gateway token is added) ---------- */
  const codes = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of codes) if (v.exp < now) codes.delete(k); }, 10 * 60e3).unref();
  const smsOn = () => Boolean(process.env.SPARROW_SMS_TOKEN && process.env.SPARROW_SMS_FROM) || process.env.TEST_SMS === '1';
  // TEST_CODES=1 (local tests only, never on Railway) prints codes in the log instead of sending them.
  const TEST = process.env.TEST_CODES === '1';
  const emailOn = () => TEST || Boolean(process.env.RESEND_API_KEY);
  async function sendEmail(to, subject, text) {
    if (TEST) { console.log('TEST CODE', to, subject); return; }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Pick Me Cafe <onboarding@resend.dev>', to: [to], subject, text }),
    });
    if (!r.ok) { console.error('Code email failed:', r.status, await r.text().catch(() => '')); throw new Error('We could not send the email. Please check the address and try again.'); }
  }
  // Sparrow SMS (Nepal). Needs SPARROW_SMS_TOKEN and SPARROW_SMS_FROM (the sender name Sparrow gives you).
  async function sendSms(to, text) {
    if (TEST) { console.log('TEST CODE', to, text); return; }
    const body = new URLSearchParams({ token: process.env.SPARROW_SMS_TOKEN, from: process.env.SPARROW_SMS_FROM, to, text });
    const r = await fetch('https://api.sparrowsms.com/v2/sms/', { method: 'POST', body });
    if (!r.ok) { console.error('Code SMS failed:', r.status, await r.text().catch(() => '')); throw new Error('We could not send the SMS. Please try again or use your email.'); }
  }
  const sendLimit = new Map();
  function tooMany(key, max, ms) {
    const now = Date.now();
    const list = (sendLimit.get(key) || []).filter((t) => now - t < ms);
    if (list.length >= max) return true;
    list.push(now);
    sendLimit.set(key, list);
    return false;
  }
  function ticket(data) {
    const body = Buffer.from(JSON.stringify(Object.assign({ exp: Date.now() + 30 * 60e3 }, data))).toString('base64url');
    return `${body}.${sign('ticket:' + body)}`;
  }
  function readTicket(t, purpose) {
    const [body, sig] = String(t || '').split('.');
    if (!body || !sig) return null;
    const good = Buffer.from(sign('ticket:' + body));
    const given = Buffer.from(sig);
    if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() && p.purpose === purpose ? p : null; } catch { return null; }
  }

  // GOOGLE_CLIENT_ID = the website's client (more may follow, comma-separated); the phone app's own clients are
  // GOOGLE_IOS_CLIENT_ID and GOOGLE_ANDROID_CLIENT_ID. Sign-in tokens from any of them are accepted.
  const googleWeb = () => String(process.env.GOOGLE_CLIENT_ID || '').split(',').map((v) => v.trim()).filter(Boolean);
  const googleApp = () => ({ ios: String(process.env.GOOGLE_IOS_CLIENT_ID || '').trim(), android: String(process.env.GOOGLE_ANDROID_CLIENT_ID || '').trim() });
  const googleIds = () => [...googleWeb(), googleApp().ios, googleApp().android].filter(Boolean);
  app.get('/api/account/config', (req, res) => {
    res.json({ on: feature('accounts'), email: emailOn(), sms: smsOn(), points: pointsOn(), loyalty: L(), google: feature('accounts') && feature('googleSignIn') && googleWeb().length ? googleWeb()[0] : '', googleApp: feature('accounts') && feature('googleSignIn') && googleWeb().length ? { web: googleWeb()[0], ...googleApp() } : null, apple: feature('accounts') });
  });

  /* ---------- Sign in with Google (website now, app later) and Sign in with Apple (app) ----------
   * The browser or app gets a signed ID token from Google or Apple; the server checks its signature with their
   * public keys, the audience (our client id / app id) and the issuer, then signs the person in. A first sign-in
   * makes an account with the verified email (no password: one can be set later in Settings). */
  const jwksCache = new Map();
  async function jwks(url) {
    const hit = jwksCache.get(url);
    if (hit && hit.until > Date.now()) return hit.keys;
    const r = await fetch(url);
    if (!r.ok) throw new Error('keys');
    const keys = (await r.json()).keys || [];
    jwksCache.set(url, { keys, until: Date.now() + 6 * 3600e3 });
    return keys;
  }
  const b64json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  async function verifyIdToken(token, url, issuers, audiences) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('bad token');
    const head = b64json(parts[0]);
    const body = b64json(parts[1]);
    if (head.alg !== 'RS256') throw new Error('bad alg');
    let key = (await jwks(url)).find((k) => k.kid === head.kid);
    if (!key) { jwksCache.delete(url); key = (await jwks(url)).find((k) => k.kid === head.kid); }
    if (!key) throw new Error('unknown key');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    if (!ok) throw new Error('bad signature');
    const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
    if (!issuers.includes(body.iss) || !aud.some((a) => audiences.includes(a)) || !(body.exp * 1000 > Date.now() - 60e3)) throw new Error('not for us');
    return body;
  }
  async function signInWith(provider, sub, email, name, req, res) {
    const list = people.get();
    let c = list.find((y) => y[provider] === sub) || (email ? list.find((y) => y.email === email) : null);
    if (!c) {
      c = { id: 'c_' + crypto.randomBytes(8).toString('hex'), username: '', email: email || '', phone: '', name: name || '', address: '', birthday: '', emailVerified: Boolean(email), phoneVerified: false, v: 1, createdAt: new Date().toISOString(), prefs: { orderUpdates: true, offers: false } };
      list.push(c);
      audit('customer:' + c.id, `account-created-${provider}`, email || '');
    }
    c[provider] = sub;
    if (email && !c.email) c.email = email;
    if (email && c.email === email) c.emailVerified = true;
    if (name && !c.name) c.name = name;
    c.lastLoginAt = new Date().toISOString();
    await people.set(list);
    const token = issueCust(c);
    custCookie(req, res, token);
    res.json({ ok: true, token, me: custPublic(c) });
  }
  app.post('/api/account/google', limit('google', 40, 15 * 60e3), json, async (req, res) => {
    if (!feature('accounts') || !feature('googleSignIn') || !googleIds().length) return bad(res, 'Google sign-in is not on at the moment.');
    try {
      const t = await verifyIdToken(req.body.credential, 'https://www.googleapis.com/oauth2/v3/certs', ['accounts.google.com', 'https://accounts.google.com'], googleIds());
      if (!t.email || t.email_verified === false) return bad(res, 'Your Google account has no confirmed email.');
      await signInWith('google', String(t.sub), normEmail(t.email), str(t.name, 80), req, res);
    } catch (e) { console.error('Google sign-in:', e.message); bad(res, 'Google sign-in did not work. Please try again.'); }
  });
  // Sign in with Apple (phone app). The audience is the app's bundle id.
  app.post('/api/account/apple', limit('apple', 40, 15 * 60e3), json, async (req, res) => {
    if (!feature('accounts')) return bad(res, 'Accounts are switched off at the moment.');
    try {
      const t = await verifyIdToken(req.body.identityToken, 'https://appleid.apple.com/auth/keys', ['https://appleid.apple.com'], [process.env.APPLE_BUNDLE_ID || 'np.com.pickmecafe.app']);
      const name = str([req.body.givenName, req.body.familyName].filter(Boolean).join(' '), 80);
      await signInWith('apple', String(t.sub), normEmail(t.email), name, req, res);
    } catch (e) { console.error('Apple sign-in:', e.message); bad(res, 'Sign in with Apple did not work. Please try again.'); }
  });
  // Step 1: send a 6-digit code to an email (or phone, when SMS is on).
  app.post('/api/account/code', limit('code', 12, 60 * 60e3), json, async (req, res) => {
    if (!feature('accounts')) return bad(res, 'Accounts are switched off at the moment.');
    const purpose = ['signup', 'reset', 'change'].includes(req.body.purpose) ? req.body.purpose : 'signup';
    const email = normEmail(req.body.to);
    const phone = email ? '' : normPhone(req.body.to);
    if (!email && !phone) return bad(res, 'Please type your email address (or phone number).');
    if (phone && !smsOn()) return bad(res, 'Codes by SMS are not on yet. Please use your email address.');
    if (email && !emailOn()) return bad(res, 'Codes by email are not set up yet. Please ask at the counter.');
    const to = email || phone;
    const exists = people.get().find((c) => (email ? c.email === email : c.phone === phone));
    if (purpose === 'signup' && exists && exists.hash) return bad(res, 'There is already an account with this. Sign in, or choose "Forgot password".');
    if (purpose === 'reset' && !exists) return bad(res, 'We could not find an account with this. Check it, or create a new account.');
    if (purpose === 'change' && exists) return bad(res, 'Another account already uses this.');
    if (tooMany('to:' + to, 5, 60 * 60e3)) return res.status(429).json({ error: 'Too many codes for this address. Please wait an hour.' });
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    codes.set(`${purpose}:${to}`, { code, exp: Date.now() + 10 * 60e3, tries: 0 });
    const cafe = content.get().brand.name;
    try {
      if (email) await sendEmail(email, `${code} is your ${cafe} code`, `Your ${cafe} code is ${code}.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.`);
      else await sendSms(phone, `${code} is your ${cafe} code. It works for 10 minutes.`);
    } catch (e) { codes.delete(`${purpose}:${to}`); return bad(res, e.message); }
    res.json({ ok: true, to, by: email ? 'email' : 'sms' });
  });
  // Step 2: check the code. Gives a short-lived ticket for the next step.
  app.post('/api/account/verify', limit('verify', 40, 30 * 60e3), json, (req, res) => {
    const purpose = ['signup', 'reset', 'change'].includes(req.body.purpose) ? req.body.purpose : 'signup';
    const email = normEmail(req.body.to);
    const to = email || normPhone(req.body.to);
    const k = `${purpose}:${to}`;
    const c = codes.get(k);
    if (!c || c.exp < Date.now()) return bad(res, 'That code has run out. Please ask for a new one.');
    c.tries += 1;
    if (c.tries > 6) { codes.delete(k); return bad(res, 'Too many wrong codes. Please ask for a new one.'); }
    if (String(req.body.code || '').replace(/\D/g, '') !== c.code) return bad(res, 'That code is not right. Please check it.');
    codes.delete(k);
    res.json({ ok: true, ticket: ticket({ purpose, to, kind: email ? 'email' : 'phone' }) });
  });
  // Step 3: make the account. Any login ID and any password (the owner chose no limits); only the ID must be free.
  app.post('/api/account/register', limit('register', 20, 60 * 60e3), json, async (req, res) => {
    if (!feature('accounts')) return bad(res, 'Accounts are switched off at the moment.');
    const t = readTicket(req.body.ticket, 'signup');
    if (!t) return bad(res, 'Please verify your email or phone again (the code was more than 30 minutes ago).');
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!password) return bad(res, 'Please choose a password.');
    if (password.length < MIN_PW) return bad(res, SHORT_PW);
    if (password.length > 200) return bad(res, 'That password is too long.');
    const username = str(req.body.username, 60).toLowerCase();
    const list = people.get();
    if (username && list.some((c) => c.username === username || c.email === username)) return bad(res, 'That login ID is taken. Please choose another.');
    const phone = t.kind === 'phone' ? t.to : normPhone(req.body.phone);
    if (req.body.phone && !phone) return bad(res, 'That phone number does not look right.');
    if (phone && list.some((c) => c.phone === phone && c.hash)) return bad(res, 'Another account already uses this phone number. Sign in to it, or ask us at the counter.');
    const email = t.kind === 'email' ? t.to : '';
    if (email && list.some((c) => c.email === email && c.hash)) return bad(res, 'There is already an account with this email. Sign in, or choose "Forgot password".');
    // An account restored from a backup has no password: signing up again with its email takes it over.
    const old = email ? list.find((y) => y.email === email && !y.hash) : null;
    if (old) {
      Object.assign(old, makeHash(password), { username: username || old.username || '', phone: phone || old.phone || '', name: str(req.body.name, 80) || old.name || '', emailVerified: true, v: (old.v || 0) + 1, lastLoginAt: new Date().toISOString() });
      if (phone && phone !== old.phone) old.phoneVerified = t.kind === 'phone';
      await people.set(list);
      const token = issueCust(old);
      custCookie(req, res, token);
      return res.json({ ok: true, token, me: custPublic(old) });
    }
    const c = {
      id: 'c_' + crypto.randomBytes(8).toString('hex'), username, email, phone,
      name: str(req.body.name, 80), address: '', birthday: '',
      emailVerified: Boolean(email), phoneVerified: t.kind === 'phone',
      ...makeHash(password), v: 1, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), prefs: { orderUpdates: true, offers: Boolean(req.body.offers) },
    };
    await people.set([...list, c]);
    audit('customer:' + c.id, 'account-created', email || phone);
    const token = issueCust(c);
    custCookie(req, res, token);
    res.json({ ok: true, token, me: custPublic(c) });
  });
  const custFails = new Map();
  app.post('/api/account/login', limit('clogin', 40, 15 * 60e3), json, async (req, res) => {
    const f = custFails.get(req.ip);
    if (f && f.reset > Date.now() && f.n >= 12) return res.status(429).json({ error: 'Too many wrong passwords. Please wait 15 minutes, or choose "Forgot password".' });
    const c = findLogin(req.body.id);
    if (!c || !checkHash(c, req.body.password)) {
      const g = f && f.reset > Date.now() ? f : { n: 0, reset: Date.now() + 15 * 60e3 };
      g.n += 1;
      custFails.set(req.ip, g);
      return res.status(401).json({ error: 'Wrong login ID or password.' });
    }
    c.lastLoginAt = new Date().toISOString();
    await people.set(people.get());
    const token = issueCust(c);
    custCookie(req, res, token);
    res.json({ ok: true, token, me: custPublic(c) });
  });
  app.post('/api/account/logout', (req, res) => { custCookie(req, res, ''); res.json({ ok: true }); });
  app.post('/api/account/reset', limit('reset', 20, 60 * 60e3), json, async (req, res) => {
    const t = readTicket(req.body.ticket, 'reset');
    if (!t) return bad(res, 'Please verify your email or phone again (the code was more than 30 minutes ago).');
    const c = people.get().find((y) => (t.kind === 'email' ? y.email === t.to : y.phone === t.to));
    if (!c) return bad(res, 'We could not find that account.');
    if (typeof req.body.password !== 'string' || !req.body.password) return bad(res, 'Please choose a new password.');
    if (req.body.password.length < MIN_PW) return bad(res, SHORT_PW);
    Object.assign(c, makeHash(req.body.password));
    c.v = (c.v || 0) + 1;
    if (t.kind === 'email') c.emailVerified = true; else c.phoneVerified = true;
    await people.set(people.get());
    audit('customer:' + c.id, 'password-reset');
    const token = issueCust(c);
    custCookie(req, res, token);
    res.json({ ok: true, token, me: custPublic(c) });
  });

  const needCust = (req, res, next) => {
    const c = readCust(req);
    if (!c) return res.status(401).json({ error: 'Please sign in.' });
    req.cust = c;
    next();
  };
  // Orders a person may see: placed while signed in, placed with their confirmed phone, or placed with their
  // phone from this same browser or phone.
  const orderView = (o) => ({
    id: o.id, key: o.key, status: o.status, paid: Boolean(o.paid), type: o.type, tableNo: o.tableNo || '', total: o.total, subtotal: o.subtotal,
    deliveryFee: o.deliveryFee || 0, createdAt: o.createdAt, schedule: o.schedule, hasWhole: Boolean(o.hasWhole),
    points: o.points ? { used: o.points.used || 0, asked: o.points.asked || 0, approved: o.points.approved } : null, pointsEarned: o.pointsEarned || 0,
    lines: (o.lines || []).map((l) => ({ itemId: l.itemId, name: l.name, label: l.label, qty: l.qty, price: l.price, extras: l.extras || [], extraIds: l.extraIds || [], whole: Boolean(l.whole) })),
  });
  function visibleOrders(c, phone, device) {
    const p = normPhone(phone || (c && c.phone));
    const dev = deviceOf(device);
    return orders.get().filter((o) => {
      if (c && o.customerId === c.id) return true;
      const same = p && normPhone(o.phone) === p;
      if (same && c && c.phoneVerified && c.phone === p) return true;
      return same && dev && o.device === dev;
    }).slice(0, 100);
  }
  const pointsView = (phone) => { const r = pointsOf(phone); return { balance: r.balance, next: r.next, earned: r.earned, spent: r.spent, expired: r.expired }; };
  function meView(c, device) {
    const list = visibleOrders(c, c.phone, device);
    const fromHere = Boolean(c.phone && list.some((o) => normPhone(o.phone) === c.phone && o.device === deviceOf(device)));
    return {
      me: custPublic(c), orders: list.map(orderView),
      points: pointsOn() && c.phone && (c.phoneVerified || fromHere) ? pointsView(c.phone) : null,
      canSpend: Boolean(c.phone && c.phoneVerified),
    };
  }
  app.get('/api/account/me', (req, res) => {
    const c = readCust(req);
    if (!c) return res.json({ me: null });
    res.json(meView(c, req.query.device));
  });
  app.patch('/api/account/me', needCust, json, async (req, res) => {
    const c = req.cust;
    const b = req.body || {};
    if (b.name !== undefined) c.name = str(b.name, 80);
    if (b.address !== undefined) c.address = str(b.address, 300);
    if (b.username !== undefined) {
      const u = str(b.username, 60).toLowerCase();
      if (u && people.get().some((y) => y.id !== c.id && (y.username === u || y.email === u))) return bad(res, 'That login ID is taken. Please choose another.');
      c.username = u;
    }
    if (b.phone !== undefined) {
      const p = b.phone ? normPhone(b.phone) : '';
      if (b.phone && !p) return bad(res, 'That phone number does not look right.');
      if (p && people.get().some((y) => y.id !== c.id && y.phone === p && y.hash)) return bad(res, 'Another account already uses this phone number. Ask us at the counter if it is yours.');
      if (p !== c.phone) { c.phone = p; c.phoneVerified = false; }
    }
    // The birthday can be set once by the customer (the owner can change it in admin), so birthday points stay fair.
    if (b.birthday !== undefined && !c.birthday) {
      const m = /^(\d{2})-(\d{2})$/.exec(String(b.birthday || ''));
      if (b.birthday && !(m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31)) return bad(res, 'Please choose the month and day of your birthday.');
      c.birthday = b.birthday || '';
    }
    if (b.prefs && typeof b.prefs === 'object') c.prefs = { orderUpdates: b.prefs.orderUpdates !== false, offers: Boolean(b.prefs.offers) };
    if (typeof b.password === 'string' && b.password) {
      if (b.password.length < MIN_PW) return bad(res, SHORT_PW);
      if (c.hash && !checkHash(c, b.current)) return res.status(401).json({ error: 'Your current password is not right.' });
      Object.assign(c, makeHash(b.password));
      c.v = (c.v || 0) + 1;
      custCookie(req, res, issueCust(c));
    }
    await people.set(people.get());
    res.json(meView(c, b.device));
  });
  // Change the account's email (with a code sent to the new address).
  app.post('/api/account/email', needCust, json, async (req, res) => {
    const t = readTicket(req.body.ticket, 'change');
    if (!t) return bad(res, 'Please verify the new address again.');
    const c = req.cust;
    if (t.kind === 'email') { c.email = t.to; c.emailVerified = true; } else { c.phone = t.to; c.phoneVerified = true; }
    await people.set(people.get());
    res.json(meView(c, req.body.device));
  });
  // Delete my account (Apple asks that this works inside the app). Orders stay in the cafe's records without the
  // account; the points on the account's phone are closed.
  app.delete('/api/account/me', needCust, async (req, res) => {
    const c = req.cust;
    const bal = c.phone ? pointsOf(c.phone).balance : 0;
    if (bal > 0) await addPoints(c.phone, -bal, 'closed', { by: 'customer', note: 'Account deleted' });
    const list = orders.get();
    let touched = false;
    for (const o of list) if (o.customerId === c.id) { delete o.customerId; touched = true; }
    if (touched) await orders.set(list);
    await people.set(people.get().filter((y) => y.id !== c.id));
    audit('customer:' + c.id, 'account-deleted');
    custCookie(req, res, '');
    res.json({ ok: true });
  });
  // Without an account: a phone number shows the orders placed with it from this browser or phone, and its points.
  app.post('/api/lookup', limit('lookup', 60, 15 * 60e3), json, (req, res) => {
    const p = normPhone(req.body.phone);
    const dev = deviceOf(req.body.device);
    if (!p) return bad(res, 'Please type your phone number.');
    const list = visibleOrders(null, p, dev);
    res.json({ phone: p, orders: list.map(orderView), points: pointsOn() && list.length ? pointsView(p) : null, account: people.get().some((c) => c.phone === p && c.hash) });
  });

  /* ---------- hooks used by the order routes in server.js ---------- */
  // Called while an order is being placed. Returns an error text, or fills order.customerId and order.points.
  async function onPlace(order, body, req) {
    const c = readCust(req);
    order.device = deviceOf(body.device);
    if (c) {
      order.customerId = c.id;
      if (!order.phone && c.phone) order.phone = c.phone;
      if (!order.name && c.name) order.name = c.name;
    }
    const want = Math.max(0, Math.floor(Number(body.usePoints) || 0));
    if (!want) return null;
    if (!pointsOn()) return 'Points are switched off at the moment.';
    const p = normPhone(order.phone);
    if (!p) return 'Please enter your phone number to use your points.';
    const bal = pointsOf(p).balance;
    const min = Number(L().minSpend) || 0;
    const value = Number(L().rupeesPerPoint) || 1;
    const use = Math.min(want, bal, Math.floor(order.subtotal / value));
    if (!use) return 'There are no points on this phone number yet.';
    if (use < min) return `You need at least ${min} points to use them.`;
    const sure = Boolean(c && c.phoneVerified && c.phone === p);
    if (sure) {
      order.points = { used: use, value: use * value, approved: true, by: 'customer (signed in)' };
      order.total = Math.max(0, order.total - use * value);
    } else {
      if (order.payment && order.payment.method !== 'later') return 'To pay now with points, please sign in. Or choose Pay later, and staff will take your points off at the counter.';
      order.points = { asked: use, approved: null };
    }
    return null;
  }
  // After the order is saved: write the spend line for signed-in customers.
  async function afterPlace(order) {
    if (order.points && order.points.used && order.points.approved) await addPoints(order.phone, -order.points.used, 'spend', { order: order.id, by: 'customer' });
  }
  // Status changes from the counter or admin: points are earned when an order is done, and given back if it is cancelled.
  async function onStatus(o, before, by) {
    if (!o.lines) return;
    if (o.status === 'done' && before !== 'done' && !o.pointsEarned && pointsOn() && normPhone(o.phone)) {
      const n = earnFor(o);
      if (n > 0) { await addPoints(o.phone, n, 'earn', { order: o.id, by }); o.pointsEarned = n; o.log.push({ at: new Date().toISOString(), by, what: `${n} points added` }); }
    }
    if (o.status === 'cancelled' && before !== 'cancelled') {
      if (o.pointsEarned) { await addPoints(o.phone, -o.pointsEarned, 'reverse', { order: o.id, by, note: 'Order cancelled' }); o.log.push({ at: new Date().toISOString(), by, what: `${o.pointsEarned} points taken back` }); o.pointsEarned = 0; }
      if (o.points && o.points.used && o.points.approved && !o.points.refunded) {
        await addPoints(o.phone, o.points.used, 'refund', { order: o.id, by, note: 'Order cancelled' });
        o.points.refunded = true;
        o.log.push({ at: new Date().toISOString(), by, what: `${o.points.used} points given back` });
      }
    }
  }

  /* ---------- counter and admin: points ---------- */
  // Staff approve (or refuse) points a guest asked to use at checkout.
  app.post('/api/desk/orders/:id/points', desk, json, async (req, res) => {
    const list = orders.get();
    const o = list.find((y) => y.id === req.params.id);
    if (!o || !o.points || !o.points.asked || o.points.approved !== null) return res.sendStatus(404);
    const by = who(req);
    if (req.body.approve) {
      const bal = pointsOf(o.phone).balance;
      const value = Number(L().rupeesPerPoint) || 1;
      const use = Math.min(o.points.asked, bal, Math.floor(o.subtotal / value));
      if (!use) return bad(res, 'This phone number has no points left.');
      await addPoints(o.phone, -use, 'spend', { order: o.id, by });
      o.points = { used: use, value: use * value, approved: true, by, asked: o.points.asked };
      o.total = Math.max(0, o.total - use * value);
      o.log.push({ at: new Date().toISOString(), by, what: `${use} points used (Rs. ${use * value} off)` });
    } else {
      o.points = { asked: o.points.asked, approved: false, by };
      o.log.push({ at: new Date().toISOString(), by, what: 'Points not used' });
    }
    await orders.set(list);
    res.json(o);
  });
  // The points of one phone number, for the counter.
  app.get('/api/desk/points/:phone', desk, (req, res) => {
    const p = normPhone(req.params.phone);
    if (!p) return bad(res, 'Please type a phone number.');
    const acc = people.get().find((c) => c.phone === p);
    res.json({ phone: p, ...pointsView(p), account: acc ? { name: acc.name, phoneVerified: Boolean(acc.phoneVerified), id: acc.id } : null, lines: points.get().filter((l) => l.phone === p).slice(-50).reverse() });
  });
  // Staff confirm that an account's phone number is really the guest's (after calling it or seeing the phone).
  app.post('/api/desk/customers/:id/confirm-phone', desk, async (req, res) => {
    const c = people.get().find((y) => y.id === req.params.id);
    if (!c || !c.phone) return res.sendStatus(404);
    c.phoneVerified = true;
    await people.set(people.get());
    audit(who(req), 'customer-phone-confirmed', c.phone);
    res.json({ ok: true });
  });
  app.get('/api/admin/customers', admin, (req, res) => {
    const list = people.get().map((c) => Object.assign(custPublic(c), { lastLoginAt: c.lastLoginAt || '', points: c.phone ? pointsOf(c.phone).balance : 0 }));
    // Phones with points but no account (guests who gave a number) are listed too.
    const phones = new Set(points.get().map((l) => l.phone));
    for (const c of people.get()) phones.delete(c.phone);
    const guests = [...phones].map((p) => ({ phone: p, points: pointsOf(p).balance })).filter((g) => g.points > 0);
    res.json({ customers: list, guests });
  });
  app.patch('/api/admin/customers/:id', admin, json, async (req, res) => {
    const c = people.get().find((y) => y.id === req.params.id);
    if (!c) return res.sendStatus(404);
    if (req.body.birthday !== undefined) c.birthday = /^\d{2}-\d{2}$/.test(req.body.birthday) ? req.body.birthday : '';
    if (typeof req.body.phoneVerified === 'boolean') c.phoneVerified = req.body.phoneVerified;
    if (req.body.signOut) c.v = (c.v || 0) + 1;
    await people.set(people.get());
    audit('owner', 'customer-changed', c.id);
    res.json(custPublic(c));
  });
  app.delete('/api/admin/customers/:id', admin, async (req, res) => {
    await people.set(people.get().filter((y) => y.id !== req.params.id));
    audit('owner', 'customer-deleted', req.params.id);
    res.json({ ok: true });
  });
  // The owner can add or take away points by hand, always with a reason (it shows in the ledger).
  app.post('/api/admin/points', admin, json, async (req, res) => {
    const p = normPhone(req.body.phone);
    const n = Math.round(Number(req.body.amount) || 0);
    const note = str(req.body.note, 160);
    if (!p || !n) return bad(res, 'Type the phone number and how many points (use a minus for taking away).');
    if (!note) return bad(res, 'Please write a reason. It is kept with the points.');
    if (n < 0 && pointsOf(p).balance + n < 0) return bad(res, 'That would take away more points than the phone has.');
    const line = await addPoints(p, n, 'adjust', { by: 'owner', note });
    res.json({ ok: true, line, ...pointsView(p) });
  });
  app.get('/api/admin/points', admin, (req, res) => res.json(points.get().slice(-500).reverse()));

  /* ---------- table calls: Call staff, Bring the bill, Water please ---------- */
  const CALLS = { staff: 'Call staff', bill: 'Bring the bill', water: 'Water please' };
  app.post('/api/table-call', limit('tablecall', 40, 15 * 60e3), json, async (req, res) => {
    if (!feature('tableButtons')) return bad(res, 'Please ask at the counter.');
    const table = str(req.body.table, 20).replace(/[^\w -]/g, '');
    const kind = CALLS[req.body.kind] ? req.body.kind : '';
    if (!table || !kind) return bad(res, 'Please scan the QR on your table again.');
    const list = calls.get();
    // The same request from the same table within 2 minutes is one call.
    const open = list.find((c) => c.table === table && c.kind === kind && !c.doneAt && Date.now() - Date.parse(c.at) < 120e3);
    if (open) return res.json({ ok: true, id: open.id, again: true });
    const call = { id: rid('call'), at: new Date().toISOString(), table, kind, label: CALLS[kind], doneAt: '', by: '' };
    await calls.set([call, ...list].slice(0, 300));
    if (x.onTableCall) x.onTableCall(call);
    res.json({ ok: true, id: call.id });
  });
  app.get('/api/table-call/:id', limit('callstatus', 300, 15 * 60e3), (req, res) => {
    const c = calls.get().find((y) => y.id === req.params.id);
    if (!c) return res.sendStatus(404);
    res.json({ id: c.id, done: Boolean(c.doneAt), label: c.label });
  });
  app.get('/api/desk/calls', desk, (req, res) => res.json(calls.get().filter((c) => !c.doneAt && Date.now() - Date.parse(c.at) < 6 * 3600e3)));
  app.post('/api/desk/calls/:id/done', desk, async (req, res) => {
    const list = calls.get();
    const c = list.find((y) => y.id === req.params.id);
    if (!c) return res.sendStatus(404);
    c.doneAt = new Date().toISOString();
    c.by = who(req);
    await calls.set(list);
    res.json({ ok: true });
  });

  /* ---------- sold out today ---------- */
  const soldOutIds = () => { const s = soldout.get(); return feature('soldOut') && s.date === nepalDate() ? s.ids : []; };
  app.get('/api/desk/menu', desk, (req, res) => {
    const out = new Set(soldOutIds());
    res.json((content.get().menu.categories || []).filter((g) => !g.hidden).map((g) => ({ id: g.id, name: g.name, items: (g.items || []).filter((it) => !it.hidden).map((it) => ({ id: it.id, name: it.name, out: out.has(it.id), off: it.available === false })) })));
  });
  // Sold out comes back by itself the next morning (it only counts for today's Nepal date).
  app.post('/api/desk/soldout', desk, json, async (req, res) => {
    const id = str(req.body.itemId, 120);
    const s = soldout.get();
    const ids = s.date === nepalDate() ? s.ids.slice() : [];
    const at = ids.indexOf(id);
    if (req.body.out && at < 0) ids.push(id);
    if (!req.body.out && at >= 0) ids.splice(at, 1);
    await soldout.set({ date: nepalDate(), ids });
    audit(who(req), req.body.out ? 'sold-out' : 'back-in', id);
    res.json({ ok: true, ids });
  });

  /* ---------- sales summary (owner) ---------- */
  app.get('/api/admin/summary', admin, (req, res) => {
    const day = (iso) => new Date(Date.parse(iso) + NP_OFFSET).toISOString().slice(0, 10);
    const today = nepalDate();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : today;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : today;
    const list = orders.get().filter((o) => { const d = day(o.createdAt); return d >= from && d <= to; });
    const live = list.filter((o) => o.status !== 'cancelled');
    const sum = (arr, f) => arr.reduce((s, o) => s + Number(f(o) || 0), 0);
    const items = new Map();
    for (const o of live) for (const l of o.lines || []) {
      const k = `${l.name}${l.label ? ` (${l.label})` : ''}`;
      const it = items.get(k) || { name: k, qty: 0, total: 0 };
      it.qty += l.qty; it.total += l.qty * l.price;
      items.set(k, it);
    }
    const hours = Array.from({ length: 24 }, () => 0);
    for (const o of live) hours[Number(new Date(Date.parse(o.createdAt) + NP_OFFSET).toISOString().slice(11, 13))] += 1;
    const days = {};
    for (const o of live) { const d = day(o.createdAt); days[d] = days[d] || { orders: 0, total: 0 }; days[d].orders += 1; days[d].total += Number(o.total || 0); }
    const pts = points.get().filter((l) => { const d = day(l.at); return d >= from && d <= to; });
    const phones = new Set(points.get().map((l) => l.phone));
    let owed = 0;
    for (const p of phones) owed += pointsOf(p).balance;
    res.json({
      from, to, orders: live.length, cancelled: list.length - live.length,
      total: sum(live, (o) => o.total), paid: sum(live.filter((o) => o.paid), (o) => o.total), average: live.length ? Math.round(sum(live, (o) => o.total) / live.length) : 0,
      byType: ['dinein', 'pickup', 'delivery'].map((t) => ({ type: t, orders: live.filter((o) => o.type === t).length, total: sum(live.filter((o) => o.type === t), (o) => o.total) })),
      bySource: ['web', 'app'].map((s) => ({ source: s, orders: live.filter((o) => (o.source || 'web') === s).length })),
      best: [...items.values()].sort((a, b) => b.qty - a.qty || b.total - a.total).slice(0, 12),
      hours, days,
      points: { earned: sum(pts.filter((l) => l.kind === 'earn' || l.kind === 'birthday'), (l) => l.amount), spent: -sum(pts.filter((l) => l.kind === 'spend'), (l) => l.amount), owed, value: owed * (Number(L().rupeesPerPoint) || 1) },
      customers: people.get().length,
      bookings: bookings.get().filter((b) => { const d = day(b.createdAt); return d >= from && d <= to; }).length,
    });
  });

  /* ---------- birthday points (once a year, on the birthday, for accounts with a confirmed phone) ---------- */
  async function birthdays() {
    const n = Number(L().birthdayPoints) || 0;
    if (!pointsOn() || n <= 0) return;
    const today = nepalDate();
    const md = today.slice(5);
    const year = today.slice(0, 4);
    const list = people.get();
    let touched = false;
    for (const c of list) {
      if (c.birthday !== md || !c.phone || !c.phoneVerified || c.birthdayGiven === year) continue;
      await addPoints(c.phone, n, 'birthday', { by: 'birthday', note: `Happy birthday ${year}`, exp: new Date(Date.now() + Math.max(1, Number(L().birthdayDays) || 7) * 864e5).toISOString() });
      c.birthdayGiven = year;
      touched = true;
    }
    if (touched) await people.set(list);
  }

  /* ---------- automatic daily backup ----------
   * Every night: a backup of the website text and every record (orders, bookings, reviews, messages, accounts
   * without passwords, points) is kept on the server (14 newest) and, when BACKUP_EMAIL (or NOTIFY_EMAIL) and
   * RESEND_API_KEY are set, emailed so a copy lives outside Railway. Photos are not in it (too large for email);
   * the manual full backup in admin has them. */
  const safePeople = () => people.get().map((c) => { const o = Object.assign({}, c); delete o.salt; delete o.hash; return o; });
  function dataBackup() {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ kind: 'pick-me-backup', format: 1, createdAt: new Date().toISOString(), full: true, auto: true, noPhotos: true, cafe: content.get().brand.name }, null, 1)));
    zip.addFile('content.json', Buffer.from(JSON.stringify(content.get(), null, 1)));
    for (const [name, store] of Object.entries({ orders, bookings, reviews, messages })) zip.addFile(`${name}.json`, Buffer.from(JSON.stringify(store.get(), null, 1)));
    zip.addFile('customers.json', Buffer.from(JSON.stringify(safePeople(), null, 1)));
    zip.addFile('points.json', Buffer.from(JSON.stringify(points.get(), null, 1)));
    return zip.toBuffer();
  }
  const autoList = () => fs.readdirSync(AUTO).filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.zip$/.test(f)).sort().reverse();
  async function nightly(force) {
    const day = nepalDate();
    const file = `auto-${day}.zip`;
    if (!force && fs.existsSync(path.join(AUTO, file))) return null;
    const buf = dataBackup();
    await fs.promises.writeFile(path.join(AUTO, file), buf, { mode: 0o600 });
    for (const old of autoList().slice(14)) fs.unlink(path.join(AUTO, old), () => {});
    const to = process.env.BACKUP_EMAIL || process.env.NOTIFY_EMAIL;
    let emailed = false;
    if (process.env.RESEND_API_KEY && to) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'Pick Me Cafe <onboarding@resend.dev>', to: to.split(',').map((s) => s.trim()),
            subject: `Pick Me Cafe backup ${day}`,
            text: `The nightly backup of the website, orders, bookings, accounts and points is attached (photos are not included).\nKeep this email. To use it: Admin > History and backup > Restore a backup.`,
            attachments: [{ filename: `pick-me-backup-${day}.zip`, content: buf.toString('base64') }],
          }),
        });
        emailed = r.ok;
        if (!r.ok) console.error('Backup email failed:', r.status, await r.text().catch(() => ''));
      } catch (e) { console.error('Backup email failed:', e.message); }
    }
    const m = x.meta.get();
    m.lastAutoBackup = { at: new Date().toISOString(), file, bytes: buf.length, emailed };
    await x.meta.set(m);
    audit('server', emailed ? 'auto-backup-emailed' : 'auto-backup-saved', file);
    return m.lastAutoBackup;
  }
  app.get('/api/admin/auto-backups', admin, (req, res) => res.json({ last: x.meta.get().lastAutoBackup || null, files: autoList().map((f) => ({ file: f, bytes: fs.statSync(path.join(AUTO, f)).size })), email: Boolean(process.env.RESEND_API_KEY && (process.env.BACKUP_EMAIL || process.env.NOTIFY_EMAIL)) }));
  app.get('/api/admin/auto-backups/:file', admin, (req, res) => {
    if (!/^auto-\d{4}-\d{2}-\d{2}\.zip$/.test(req.params.file)) return res.sendStatus(404);
    res.download(path.join(AUTO, req.params.file), `pick-me-${req.params.file}`, (e) => { if (e && !res.headersSent) res.sendStatus(404); });
  });
  app.post('/api/admin/auto-backups/now', admin, async (req, res) => { try { res.json(await nightly(true)); } catch (e) { bad(res, e.message); } });

  // Runs every 10 minutes: birthday points, and the nightly backup after 11 PM Nepal time.
  async function tick() {
    try {
      await birthdays();
      const hh = new Date(Date.now() + NP_OFFSET).getUTCHours();
      if (hh >= 23) await nightly(false);
    } catch (e) { console.error('Scheduled job failed:', e.message); }
  }
  setTimeout(tick, 20e3).unref();
  setInterval(tick, 10 * 60e3).unref();

  /* ---------- "get the app": one link for the QR that sends iPhones to the App Store and Android to Google Play ---------- */
  app.get(['/app', '/app/'], (req, res) => {
    const a = content.get().appCard || {};
    const ua = String(req.get('user-agent') || '');
    const ok = (u) => (/^https:\/\//.test(u || '') ? u : '');
    const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
    const target = ios ? ok(a.appStore) : /Android/i.test(ua) ? ok(a.googlePlay) || ok(a.apk) : '';
    res.set('Cache-Control', 'no-store');
    res.redirect(302, target || '/#get-app');
  });
  app.get('/api/app-qr.svg', async (req, res) => {
    const QRCode = require('qrcode');
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(await QRCode.toString(`${req.protocol}://${req.get('host')}/app`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2B2118', light: '#ffffff' } }));
  });

  /* ---------- backups: accounts and points go into full backups too ---------- */
  function addToBackup(zip) {
    zip.addFile('customers.json', Buffer.from(JSON.stringify(safePeople(), null, 1)));
    zip.addFile('points.json', Buffer.from(JSON.stringify(points.get(), null, 1)));
  }
  // Restoring adds what is missing; nothing that exists is changed. Restored accounts have no password
  // (backups never hold passwords), so their owners choose "Forgot password" once.
  async function restoreFromBackup(read) {
    const out = { customers: 0, points: 0 };
    const cs = read('customers.json');
    if (Array.isArray(cs)) {
      const have = new Set(people.get().map((c) => c.id));
      const add = cs.filter((c) => c && c.id && !have.has(c.id)).map((c) => { const o = Object.assign({}, c); delete o.salt; delete o.hash; return o; });
      if (add.length) { await people.set(people.get().concat(add)); out.customers = add.length; }
    }
    const ps = read('points.json');
    if (Array.isArray(ps)) {
      const have = new Set(points.get().map((l) => l.id));
      const add = ps.filter((l) => l && l.id && l.phone && !have.has(l.id));
      if (add.length) { await points.set(points.get().concat(add).sort((a, b) => String(a.at).localeCompare(String(b.at)))); out.points = add.length; }
    }
    return out;
  }

  return { onPlace, afterPlace, onStatus, soldOutIds, readCust, addToBackup, restoreFromBackup, normPhone, pointsOf, addPoints, pointsOn, loyaltyRules: L };
};
