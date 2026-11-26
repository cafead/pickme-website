// App state: the website content, the cart, the guest's details and their orders, kept on the phone.
// Version 1.0.2 adds the optional customer account, points, and the staff or driver login.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from './api';
import { notify, registerForPush } from './notify';
import { STATUS, BOOKING_STATUS, finished } from './logic';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const KEYS = { content: 'pm.content', cart: 'pm.cart', profile: 'pm.profile', orders: 'pm.orders', device: 'pm.device', cust: 'pm.cust', staff: 'pm.staff' };
export const STAFF_KEY = KEYS.staff;
const load = async (k, fallback) => {
  try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
};
const save = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {});
const newDevice = () => Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

export function AppProvider({ children }) {
  const [content, setContent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [cart, setCart] = useState([]);
  const [profile, setProfile] = useState({ name: '', phone: '', address: '' });
  const [orders, setOrders] = useState([]);
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState('');
  const [cfg, setCfg] = useState(null);
  const [account, setAccount] = useState(null); // { me, points, canSpend }
  const [custToken, setCustToken] = useState('');
  const [staff, setStaffState] = useState(null); // { token, role: 'staff' | 'driver' | 'admin', name }
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const refresh = useCallback(async () => {
    try {
      const c = await api.getContent();
      setContent(c);
      setLoadError('');
      save(KEYS.content, c);
      return true;
    } catch (e) {
      setLoadError(e.message);
      return false;
    }
  }, []);

  // Orders of the account (placed on another phone or on the website) join the list on this phone.
  const mergeOrders = useCallback((list) => {
    if (!Array.isArray(list) || !list.length) return;
    setOrders((mine) => {
      const have = new Set(mine.map((o) => o.id));
      const add = list.filter((o) => o.key && !have.has(o.id)).map((o) => ({ ...o, kind: 'order' }));
      return add.length ? [...mine, ...add].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 60) : mine;
    });
  }, []);

  const refreshAccount = useCallback(async (dev) => {
    try {
      const [c, me] = await Promise.all([api.accountConfig(), api.getMe(dev || device)]);
      setCfg(c);
      if (me && me.me) { setAccount(me); mergeOrders(me.orders); } else setAccount(null);
    } catch (e) { /* offline: keep what we have */ }
  }, [device, mergeOrders]);

  useEffect(() => {
    (async () => {
      const [c, ct, p, o, d, cu, sf] = await Promise.all([load(KEYS.content, null), load(KEYS.cart, []), load(KEYS.profile, null), load(KEYS.orders, []), load(KEYS.device, ''), load(KEYS.cust, ''), load(KEYS.staff, null)]);
      const dev = /^[a-f0-9]{32}$/.test(d || '') ? d : newDevice();
      if (dev !== d) save(KEYS.device, dev);
      setDevice(dev);
      if (c) setContent(c);
      setCart(ct);
      if (p) setProfile(p);
      setOrders(o);
      api.setTokens({ cust: cu, staff: sf && sf.token });
      setCustToken(cu || '');
      if (sf && sf.token) setStaffState(sf);
      setReady(true);
      refresh();
      try {
        const [conf, me] = await Promise.all([api.accountConfig(), api.getMe(dev)]);
        setCfg(conf);
        if (me && me.me) { setAccount(me); mergeOrders(me.orders); }
      } catch (e) { /* offline */ }
      registerForPush(dev);
    })();
  }, [refresh, mergeOrders]);

  useEffect(() => { if (ready) save(KEYS.cart, cart); }, [cart, ready]);
  useEffect(() => { if (ready) save(KEYS.profile, profile); }, [profile, ready]);
  useEffect(() => { if (ready) save(KEYS.orders, orders); }, [orders, ready]);

  // Signing in or out of a customer account.
  const signedIn = useCallback(async (res) => {
    const t = res && res.token ? res.token : '';
    api.setTokens({ cust: t });
    setCustToken(t);
    save(KEYS.cust, t);
    if (t) {
      const me = await api.getMe(device).catch(() => null);
      if (me && me.me) {
        setAccount(me);
        mergeOrders(me.orders);
        if (me.me.phone) setProfile((p) => ({ ...p, phone: p.phone || me.me.phone, name: p.name || me.me.name, address: p.address || me.me.address }));
      }
      registerForPush(device);
    } else setAccount(null);
  }, [device, mergeOrders]);
  const signOut = useCallback(async () => { await api.signOutCustomer().catch(() => {}); signedIn(null); }, [signedIn]);

  // Staff or driver login (kept on this phone until they log out).
  const setStaff = useCallback((s) => {
    api.setTokens({ staff: s ? s.token : '' });
    setStaffState(s);
    if (s) save(KEYS.staff, s); else AsyncStorage.removeItem(KEYS.staff).catch(() => {});
    if (s) registerForPush(device);
  }, [device]);

  // Follow open orders and bookings. When one changes, update it and show a notification.
  const check = useCallback(async () => {
    const open = ordersRef.current.filter((o) => !finished(o));
    if (!open.length) return;
    const updates = {};
    await Promise.all(open.map(async (o) => {
      try {
        const s = o.kind === 'booking' ? await api.bookingStatus(o.id, o.key) : await api.orderStatus(o.id, o.key);
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
    const timer = setInterval(check, 10000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { check(); if (custToken) refreshAccount(); } });
    return () => { clearInterval(timer); sub.remove(); };
  }, [check, custToken, refreshAccount]);

  const addToCart = useCallback((line) => {
    setCart((list) => {
      const same = list.find((l) => l.itemId === line.itemId && l.label === line.label && JSON.stringify(l.extras || []) === JSON.stringify(line.extras || []) && !l.whole);
      if (same) return list.map((l) => (l === same ? { ...l, qty: Math.min(50, l.qty + (line.qty || 1)) } : l));
      return [...list, { ...line, qty: line.qty || 1, uid: Math.random().toString(36).slice(2) }];
    });
  }, []);
  const setQty = useCallback((uid, qty) => setCart((list) => (qty <= 0 ? list.filter((l) => l.uid !== uid) : list.map((l) => (l.uid === uid ? { ...l, qty: Math.min(50, qty) } : l)))), []);
  const clearCart = useCallback(() => setCart([]), []);
  const addOrder = useCallback((o) => setOrders((list) => [o, ...list].slice(0, 60)), []);
  const removeOrder = useCallback((id) => setOrders((list) => list.filter((o) => o.id !== id)), []);

  const value = useMemo(() => ({
    content, loadError, refresh, ready, platform: Platform.OS,
    cart, addToCart, setQty, clearCart,
    profile, setProfile,
    orders, addOrder, removeOrder, checkOrders: check,
    device, cfg, account, custToken, signedIn, signOut, refreshAccount,
    staff, setStaff,
  }), [content, loadError, refresh, ready, cart, addToCart, setQty, clearCart, profile, orders, addOrder, removeOrder, check, device, cfg, account, custToken, signedIn, signOut, refreshAccount, staff, setStaff]);

  return React.createElement(Ctx.Provider, { value }, children);
}
