// Talks to the Pick Me Cafe website server. Menu, prices, events and cakes all come from the
// website admin, so the app never needs an update when the owner changes them.
// The web preview (/app-preview) is served by the website itself, so it uses whatever address it was opened from.
// The cafe's own domain (Cloudflare DNS -> Railway). If hosting moves, point the domain at the new service: no app update needed.
const SERVER = 'https://pickmecafe.com.np';
export const BASE = typeof window !== 'undefined' && window.location && /^https?:$/.test(window.location.protocol)
  ? window.location.origin
  : SERVER;

export const imageUrl = (u) => {
  if (!u || typeof u !== 'string') return null;
  if (/^https?:\/\//.test(u)) return u;
  return BASE + (u.startsWith('/') ? '' : '/') + u;
};

// Version 1.0.2: a customer account token (Authorization: Bearer) and a staff or driver token (X-PM-Auth).
const T = { cust: '', staff: '' };
export function setTokens(t) {
  if (t.cust !== undefined) T.cust = t.cust || '';
  if (t.staff !== undefined) T.staff = t.staff || '';
}
const authHeaders = () => ({ ...(T.cust ? { Authorization: `Bearer ${T.cust}` } : {}), ...(T.staff ? { 'X-PM-Auth': T.staff } : {}) });

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(), ...(options.headers || {}) },
    });
  } catch (e) {
    throw new Error('No internet connection. Please check it and try again.');
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || `Something went wrong (${res.status}). Please try again.`);
    err.status = res.status;
    throw err;
  }
  return data;
}
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) });

export const getContent = () => request('/api/content');
export const placeOrder = (body) => post('/api/orders', { ...body, source: 'app' });
export const placeBooking = (body) => post('/api/bookings', { ...body, source: 'app' });
export const orderStatus = (id, key) => request(`/api/orders/${encodeURIComponent(id)}/status?key=${encodeURIComponent(key)}`);
export const bookingStatus = (id, key) => request(`/api/bookings/${encodeURIComponent(id)}/status?key=${encodeURIComponent(key)}`);

// Customer accounts (optional), orders by phone number, points.
export const accountConfig = () => request('/api/account/config');
export const getMe = (device) => request(`/api/account/me?device=${encodeURIComponent(device || '')}`);
export const lookup = (phone, device) => post('/api/lookup', { phone, device });
export const sendCode = (to, purpose) => post('/api/account/code', { to, purpose });
export const verifyCode = (to, code, purpose) => post('/api/account/verify', { to, code, purpose });
export const register = (body) => post('/api/account/register', body);
export const signIn = (id, password) => post('/api/account/login', { id, password });
export const resetPassword = (ticket, password) => post('/api/account/reset', { ticket, password });
export const updateMe = (body) => request('/api/account/me', { method: 'PATCH', body: JSON.stringify(body) });
export const changeEmail = (ticket, device) => post('/api/account/email', { ticket, device });
export const deleteMe = () => request('/api/account/me', { method: 'DELETE' });
export const signOutCustomer = () => post('/api/account/logout');
export const googleSignIn = (credential) => post('/api/account/google', { credential });
export const appleSignIn = (body) => post('/api/account/apple', body);
export const tableCall = (table, kind) => post('/api/table-call', { table, kind });

// Cafe staff and delivery drivers (the same logins as the website's counter screen).
export const staffLogin = (username, password) => post('/api/auth/login', { username, password, remember: true, app: true });
export const staffMe = () => request('/api/auth/me');
export const staffLogout = () => post('/api/auth/logout');
export const deskOrders = () => request('/api/desk/orders');
export const deskCalls = () => request('/api/desk/calls');
export const deskBookings = () => request('/api/desk/bookings');
export const patchBooking = (id, body) => request(`/api/desk/bookings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deskDrivers = () => request('/api/desk/drivers');
export const patchOrder = (id, body) => request(`/api/desk/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const callDone = (id) => post(`/api/desk/calls/${encodeURIComponent(id)}/done`);
export const approvePoints = (id, approve) => post(`/api/desk/orders/${encodeURIComponent(id)}/points`, { approve });
export const giveToDriver = (id, driverId) => post(`/api/desk/orders/${encodeURIComponent(id)}/driver`, { driverId });
export const driverOrders = () => request('/api/driver/orders');
export const driverStep = (id, step, cash) => post(`/api/driver/orders/${encodeURIComponent(id)}/step`, { step, cash });
export const driverStop = () => post('/api/driver/stop');
// Called from the background location task too, so it takes the token directly.
export async function sendDriverLocation(token, p) {
  await fetch(`${BASE}/api/driver/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PM-Auth': token },
    body: JSON.stringify({ lat: p.latitude, lng: p.longitude, acc: p.accuracy, heading: p.heading, speed: p.speed }),
  });
}

export const registerPush = (token, device, platform, off) => post('/api/push/register', { token, device, platform, off: Boolean(off) });
// "Working at the cafe" switch: off = this phone gets no order alerts.
export const pushWorking = (token, on) => post('/api/push/working', { token, on: Boolean(on) });

// A photo from the phone (a cake picture to copy, or a payment screenshot). Returns the stored file name.
export async function uploadPhoto(uri, mime) {
  let blob;
  try { blob = await (await fetch(uri)).blob(); } catch (e) { throw new Error('That photo could not be read. Please choose another.'); }
  if (blob.size > 8 * 1024 * 1024) throw new Error('That photo is too large. Please choose one under 8 MB.');
  let res;
  try { res = await fetch(`${BASE}/api/proof`, { method: 'POST', headers: { 'Content-Type': mime || blob.type || 'image/jpeg' }, body: blob }); } catch (e) { throw new Error('No internet connection. Please check it and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The photo could not be sent. Please try again.');
  return data.file;
}
