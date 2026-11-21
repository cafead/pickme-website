// Talks to the Pick Me Cafe website server. Menu, prices, events and cakes all come from the
// website admin, so the app never needs an update when the owner changes them.
// The web preview (/app-preview) is served by the website itself, so it uses whatever address it was opened from.
const SERVER = 'https://pickmeclaude-production.up.railway.app';
export const BASE = typeof window !== 'undefined' && window.location && /^https?:$/.test(window.location.protocol)
  ? window.location.origin
  : SERVER;

export const imageUrl = (u) => {
  if (!u || typeof u !== 'string') return null;
  if (/^https?:\/\//.test(u)) return u;
  return BASE + (u.startsWith('/') ? '' : '/') + u;
};

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
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

export const getContent = () => request('/api/content');
export const placeOrder = (body) => request('/api/orders', { method: 'POST', body: JSON.stringify({ ...body, source: 'app' }) });
export const placeBooking = (body) => request('/api/bookings', { method: 'POST', body: JSON.stringify({ ...body, source: 'app' }) });
export const orderStatus = (id, key) => request(`/api/orders/${encodeURIComponent(id)}/status?key=${encodeURIComponent(key)}`);
export const bookingStatus = (id, key) => request(`/api/bookings/${encodeURIComponent(id)}/status?key=${encodeURIComponent(key)}`);
