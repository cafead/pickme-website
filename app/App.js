import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, BackHandler, Animated, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/store';
import { setupNotifications } from './src/notify';
import { C, SERIF, shadow } from './src/theme';
import { rs } from './src/logic';
import { Button, Body } from './src/ui';
import Home, { EventSheet } from './src/Home';
import Menu, { ItemSheet } from './src/Menu';
import Cake from './src/Cake';
import Book from './src/Book';
import Orders, { OrderSheet } from './src/Orders';
import Checkout from './src/Checkout';
import Account from './src/Account';
import Staff from './src/Staff';
import Driver from './src/Driver';
import './src/driverTask'; // the driver's background location task must be known when the app starts

const TABS = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'menu', label: 'Menu', icon: '☕' },
  { id: 'cake', label: 'Cakes', icon: '🎂' },
  { id: 'book', label: 'Book', icon: '🪑' },
  { id: 'orders', label: 'Orders', icon: '🧾' },
  { id: 'me', label: 'Me', icon: '☺' },
];

export default function App() {
  useEffect(() => { setupNotifications(); }, []);
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { content, loadError, refresh, ready, cart, addToCart, orders, staff } = useApp();
  const inset = useSafeAreaInsets();
  const [tab, setTabState] = useState('home');
  // The tabs the guest came through, so the Android Back button goes one tab back, then out of the app.
  const tabs = useRef(['home']);
  const setTab = useCallback((t) => {
    setTabState((cur) => {
      if (t !== cur) { tabs.current = [...tabs.current.filter((x) => x !== t), t].slice(-8); }
      return t;
    });
  }, []);
  const [cakeId, setCakeId] = useState(null);
  const [pick, setPick] = useState(null);
  const [event, setEvent] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartStep, setCartStep] = useState('cart');
  const [orderId, setOrderId] = useState(null);
  const [toast, setToast] = useState('');
  const fade = useRef(new Animated.Value(0)).current;

  const go = useCallback((t, id) => { setTab(t); if (t === 'cake' && id) setCakeId(id); }, [setTab]);
  const say = useCallback((text) => {
    setToast(text);
    Animated.sequence([Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }), Animated.delay(1600), Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true })]).start();
  }, [fade]);

  // Android back button: close what is open, then go back to Home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pick || event || cartOpen || orderId) return false; // the open sheet closes itself
      if (tabs.current.length > 1) {
        tabs.current = tabs.current.slice(0, -1);
        setTabState(tabs.current[tabs.current.length - 1]);
        return true;
      }
      if (tab !== 'home') { tabs.current = ['home']; setTabState('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [tab, pick, event, cartOpen, orderId]);

  if (!content) {
    return (
      <View style={[st.center, { paddingTop: inset.top }]}>
        <Image source={require('./assets/logo.png')} style={{ width: 110, height: 96, resizeMode: 'contain' }} />
        <Text style={st.splash}>PICK ME CAFE</Text>
        {loadError && ready ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 30 }}>
            <Body style={{ textAlign: 'center', marginVertical: 14 }}>{loadError}</Body>
            <Button title="Try again" onPress={refresh} />
          </View>
        ) : <ActivityIndicator color={C.gold} style={{ marginTop: 20 }} />}
      </View>
    );
  }

  // Cafe staff and the delivery driver get their own screens after they log in (in the Me tab).
  if (staff && staff.token) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: inset.top }}>
        {staff.role === 'driver' ? <Driver inset={inset.bottom} /> : <Staff inset={inset.bottom} />}
      </View>
    );
  }

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const live = orders.filter((o) => !['done', 'cancelled', 'declined'].includes(o.status)).length;
  const pickItem = (item, groupId, price) => setPick({ item, groupId, price, n: Date.now() });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: inset.top }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' ? <Home go={go} openEvent={setEvent} /> : null}
        {tab === 'menu' ? <Menu go={go} pickItem={pickItem} /> : null}
        {tab === 'cake' ? <Cake preselect={cakeId} startCheckout={(line) => { addToCart(line); setCartStep('details'); setCartOpen(true); }} /> : null}
        {tab === 'book' ? <Book openOrder={(id) => { setTab('orders'); setOrderId(id); }} /> : null}
        {tab === 'orders' ? <Orders go={go} openOrder={setOrderId} /> : null}
        {tab === 'me' ? <Account go={go} /> : null}
      </View>

      {count ? (
        <Pressable onPress={() => { setCartStep('cart'); setCartOpen(true); }} style={[st.cartBar, { bottom: 72 + Math.max(inset.bottom, 8) }]} accessibilityRole="button" accessibilityLabel={`Your order, ${count} items, ${rs(total)}`}>
          <View style={st.cartCount}><Text style={{ color: C.gold, fontWeight: '700' }}>{count}</Text></View>
          <Text style={st.cartText}>View your order</Text>
          <Text style={[st.cartText, { flex: 0, flexShrink: 0 }]} numberOfLines={1}>{rs(total)}</Text>
        </Pressable>
      ) : null}

      <View style={[st.tabs, { paddingBottom: Math.max(inset.bottom, 8) }]}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={st.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} accessibilityLabel={t.label}>
            <Text style={[st.tabIcon, tab === t.id && { opacity: 1 }]}>{t.icon}</Text>
            <Text style={[st.tabText, tab === t.id && { color: C.goldDark, fontWeight: '700' }]}>{t.label}</Text>
            {t.id === 'orders' && live ? <View style={st.badge}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{live}</Text></View> : null}
          </Pressable>
        ))}
      </View>

      {pick ? <ItemSheet key={pick.n} pick={pick} onClose={() => setPick(null)} onAdded={(t) => { setPick(null); say(t); }} /> : null}
      <EventSheet event={event} onClose={() => setEvent(null)} onAdd={(it, groupId, p) => { setEvent(null); if (p.whole) go('cake', it.id); else pickItem(it, groupId, p); }} />
      <Checkout key={cartStep + (cartOpen ? '1' : '0')} open={cartOpen} startAt={cartStep} onClose={() => setCartOpen(false)} onPlaced={(id) => { setCartOpen(false); setTab('orders'); setOrderId(id); }} />
      <OrderSheet id={orderId} onClose={() => setOrderId(null)} />

      <Animated.View pointerEvents="none" style={[st.toast, { opacity: fade, bottom: 140 + inset.bottom }]}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>{toast}</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  splash: { fontFamily: SERIF, fontSize: 26, letterSpacing: 4, color: C.brown, marginTop: 12 },
  tabs: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 20, opacity: 0.55 },
  tabText: { fontSize: 11, color: C.muted },
  badge: { position: 'absolute', top: -4, right: '24%', backgroundColor: C.bad, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cartBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: C.brown, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 14, gap: 12, ...shadow },
  cartCount: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cartText: { color: '#fff', fontWeight: '600', fontSize: 15, flex: 1 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(43,33,24,0.9)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
});
