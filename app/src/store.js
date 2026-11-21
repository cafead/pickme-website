// App state: the website content, the cart, the guest's details and their orders, kept on the phone.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getContent, orderStatus, bookingStatus } from './api';
import { notify } from './notify';
import { STATUS, BOOKING_STATUS, finished } from './logic';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const KEYS = { content: 'pm.content', cart: 'pm.cart', profile: 'pm.profile', orders: 'pm.orders' };
const load = async (k, fallback) => {
  try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
};
const save = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {});

export function AppProvider({ children }) {
  const [content, setContent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [cart, setCart] = useState([]);
  const [profile, setProfile] = useState({ name: '', phone: '', address: '' });
  const [orders, setOrders] = useState([]);
  const [ready, setReady] = useState(false);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const refresh = useCallback(async () => {
    try {
      const c = await getContent();
      setContent(c);
      setLoadError('');
      save(KEYS.content, c);
      return true;
    } catch (e) {
      setLoadError(e.message);
      return false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [c, ct, p, o] = await Promise.all([load(KEYS.content, null), load(KEYS.cart, []), load(KEYS.profile, null), load(KEYS.orders, [])]);
      if (c) setContent(c);
      setCart(ct);
      if (p) setProfile(p);
      setOrders(o);
      setReady(true);
      refresh();
    })();
  }, [refresh]);

  useEffect(() => { if (ready) save(KEYS.cart, cart); }, [cart, ready]);
  useEffect(() => { if (ready) save(KEYS.profile, profile); }, [profile, ready]);
  useEffect(() => { if (ready) save(KEYS.orders, orders); }, [orders, ready]);

  // Follow open orders and bookings. When one changes, update it and show a notification.
  const check = useCallback(async () => {
    const open = ordersRef.current.filter((o) => !finished(o));
    if (!open.length) return;
    const updates = {};
    await Promise.all(open.map(async (o) => {
      try {
        const s = o.kind === 'booking' ? await bookingStatus(o.id, o.key) : await orderStatus(o.id, o.key);
        if (s.status && s.status !== o.status) updates[o.id] = s;
        else if (s.status) updates[o.id] = { ...s, quiet: true };
      } catch (e) { /* offline or not found: try again later */ }
    }));
    if (!Object.keys(updates).length) return;
    setOrders((list) => list.map((o) => {
      const s = updates[o.id];
      if (!s) return o;
      if (!s.quiet && s.status !== o.status) {
        const info = (o.kind === 'booking' ? BOOKING_STATUS : STATUS)[s.status];
        if (info) notify(`${o.kind === 'booking' ? 'Table booking' : 'Order'} ${o.id}: ${info.label}`, info.text);
      }
      const { quiet, ...rest } = s;
      return { ...o, ...rest, kind: o.kind, key: o.key, checkedAt: Date.now() };
    }));
  }, []);

  useEffect(() => {
    // Keeps checking while the app is open, and for as long as the phone lets it run in the background.
    check();
    const timer = setInterval(check, 15000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [check]);

  const addToCart = useCallback((line) => {
    setCart((list) => {
      const same = list.find((l) => l.itemId === line.itemId && l.label === line.label && JSON.stringify(l.extras || []) === JSON.stringify(line.extras || []));
      if (same) return list.map((l) => (l === same ? { ...l, qty: Math.min(50, l.qty + (line.qty || 1)) } : l));
      return [...list, { ...line, qty: line.qty || 1, uid: Math.random().toString(36).slice(2) }];
    });
  }, []);
  const setQty = useCallback((uid, qty) => setCart((list) => (qty <= 0 ? list.filter((l) => l.uid !== uid) : list.map((l) => (l.uid === uid ? { ...l, qty: Math.min(50, qty) } : l)))), []);
  const clearCart = useCallback(() => setCart([]), []);
  const addOrder = useCallback((o) => setOrders((list) => [o, ...list].slice(0, 40)), []);
  const removeOrder = useCallback((id) => setOrders((list) => list.filter((o) => o.id !== id)), []);

  const value = useMemo(() => ({
    content, loadError, refresh, ready,
    cart, addToCart, setQty, clearCart,
    profile, setProfile,
    orders, addOrder, removeOrder, checkOrders: check,
  }), [content, loadError, refresh, ready, cart, addToCart, setQty, clearCart, profile, orders, addOrder, removeOrder, check]);

  return React.createElement(Ctx.Provider, { value }, children);
}
