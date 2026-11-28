// Staff mode: the counter screen in the app. New orders and table calls ring the phone; staff acknowledge,
// move orders along, confirm online payments, approve points and give deliveries to the driver.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Vibration, RefreshControl, AppState, Platform, Alert, Switch } from 'react-native';
import { C, SERIF } from './theme';
import { useApp } from './store';
import * as api from './api';
import { rs, t12 } from './logic';
import { Body, Small, Button, Chip, Card, Note } from './ui';
import { notify, isWorking, setWorking } from './notify';
import Billing from './Billing';

const TYPE = { dinein: 'At the cafe', pickup: 'Pickup', delivery: 'Delivery' };
const NEXT = { pending: ['acknowledged', 'Acknowledge'], acknowledged: ['preparing', 'Preparing'], preparing: ['ready', 'Ready'], ready: ['done', 'Done'] };
const NAMES = { pending: 'New', acknowledged: 'Acknowledged', preparing: 'Preparing', ready: 'Ready', done: 'Done', cancelled: 'Cancelled' };
const PAY = { later: 'Pay later', cod: 'Cash on delivery', esewa: 'eSewa', fonepay: 'Fonepay' };
const day = (iso) => new Date(Date.parse(iso) + 345 * 60e3).toISOString().slice(0, 10);
const ask = (title, text, yes) => {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${text}`)) yes(); return; } // eslint-disable-line no-alert
  Alert.alert(title, text, [{ text: 'No', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: yes }]);
};

export default function Staff({ inset }) {
  const { staff, setStaff } = useApp();
  const [orders, setOrders] = useState([]);
  const [billing, setBilling] = useState(null); // null = closed, '' = billing, an order id = that order's bill or slip
  const [working, setWork] = useState(true);
  const workRef = useRef(true);
  useEffect(() => { isWorking().then((v) => { setWork(v); workRef.current = v; }); }, []);
  const flipWork = (v) => { setWork(v); workRef.current = v; setWorking(v); };
  const [bookings, setBookings] = useState([]);
  const [calls, setCalls] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [view, setView] = useState('open');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const seen = useRef(null);

  const load = useCallback(async () => {
    try {
      const [o, b, c, d] = await Promise.all([api.deskOrders(), api.deskBookings(), api.deskCalls().catch(() => []), api.deskDrivers().catch(() => [])]);
      setOrders(o); setBookings(b); setCalls(c); setDrivers(d); setErr('');
      // Ring for anything new since the last look (not on the first load).
      const ids = new Set([...o.filter((x) => x.status === 'pending').map((x) => x.id), ...c.map((x) => x.id), ...b.filter((x) => x.status === 'pending').map((x) => x.id)]);
      if (seen.current) {
        const fresh = [...ids].filter((id) => !seen.current.has(id));
        if (fresh.length && workRef.current) {
          Vibration.vibrate([0, 500, 250, 500]);
          const call = c.find((x) => fresh.includes(x.id));
          const ord = o.find((x) => fresh.includes(x.id));
          if (call) notify(`Table ${call.table}: ${call.label}`, 'Tap Done when it is sorted.');
          else if (ord) notify(`New order ${ord.id}`, `${TYPE[ord.type] || ''}${ord.tableNo ? `, table ${ord.tableNo}` : ''} · ${rs(ord.total)}`);
          else notify('New table booking', 'Open the app to confirm it.');
        }
        // A guest cancelled their own order in the first minute: tell the counter so it is not made.
        const gone = o.filter((x) => x.cancelledBy === 'customer' && seen.current.has(x.id));
        if (gone.length && workRef.current) { Vibration.vibrate([0, 800, 300, 800]); notify(`Order ${gone[0].id} CANCELLED`, 'The guest cancelled it. Do not make it.'); }
      }
      seen.current = ids;
    } catch (e) {
      if (e.status === 401 || e.status === 403) { setStaff(null); return; }
      setErr(e.message);
    }
  }, [setStaff]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [load]);

  const act = async (fn, okText) => { setErr(''); try { await fn(); await load(); if (okText) setErr(''); } catch (e) { setErr(e.message); } };
  const logout = () => ask('Log out?', 'This phone stops getting new orders.', async () => { await api.staffLogout().catch(() => {}); setStaff(null); });

  const today = day(new Date().toISOString());
  // New orders first, then the oldest first, so nothing waits too long.
  const open = orders.filter((o) => !['done', 'cancelled'].includes(o.status)).sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || String(a.createdAt).localeCompare(String(b.createdAt)));
  const shown = view === 'open' ? open : orders.filter((o) => ['done', 'cancelled'].includes(o.status) && day(o.createdAt) === today);
  const books = bookings.filter((b) => b.status === 'pending');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Counter</Text>
          <Small>{staff.name || 'Staff'} · checks every 8 seconds</Small>
        </View>
        {staff.role !== 'driver' ? <Button title="Billing" onPress={() => setBilling('')} /> : null}
        <Button kind="line" title="Log out" onPress={logout} />
      </View>
      <View style={s.work}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.brown }}>Working at the cafe</Text>
          <Small>{working ? 'On: this phone rings for new orders, also when the app is closed.' : 'Off: no order alerts on this phone.'}</Small>
        </View>
        <Switch value={working} onValueChange={flipWork} trackColor={{ true: C.gold }} />
      </View>
      <Billing open={billing !== null} order={billing || ''} onClose={() => setBilling(null)} token={staff.token} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 + (inset || 0) }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={async () => { setBusy(true); await load(); setBusy(false); }} colors={[C.gold]} />}>
        {err ? <View style={{ marginBottom: 10 }}><Note kind="bad">{err}</Note></View> : null}
        {calls.map((c) => (
          <View key={c.id} style={s.call}>
            <Text style={s.callText}>Table {c.table}: {c.label}</Text>
            <Button title="Done" onPress={() => act(() => api.callDone(c.id))} style={{ backgroundColor: '#fff' }} />
          </View>
        ))}
        {books.map((b) => (
          <Card key={b.id} style={{ marginBottom: 10, borderLeftWidth: 5, borderLeftColor: C.gold }}>
            <Text style={s.id}>Table booking · {b.people} people</Text>
            <Body>{b.bs || b.date} at {t12(b.time)} · {b.name || 'Guest'}</Body>
            {b.remarks || b.food ? <Small>{[b.food, b.remarks].filter(Boolean).join(' · ')}</Small> : null}
            <View style={s.row}>
              <Button kind="soft" title="Call" onPress={() => Linking.openURL(`tel:${b.phone}`)} />
              <Button title="Confirm" onPress={() => act(() => api.patchBooking(b.id, { status: 'confirmed' }))} />
              <Button kind="line" title="Decline" onPress={() => ask('Decline this booking?', `${b.name || 'Guest'}, ${b.people} people`, () => act(() => api.patchBooking(b.id, { status: 'declined' })))} />
            </View>
          </Card>
        ))}
        <View style={[s.row, { marginBottom: 12 }]}>
          <Chip text={`Open (${open.length})`} on={view === 'open'} onPress={() => setView('open')} />
          <Chip text="Done today" on={view === 'done'} onPress={() => setView('done')} />
        </View>
        {!shown.length ? <Body style={{ textAlign: 'center', paddingVertical: 30 }}>{view === 'open' ? 'No open orders. New ones ring this phone.' : 'Nothing finished yet today.'}</Body> : null}
        {shown.map((o) => <OrderCard key={o.id} o={o} drivers={drivers} act={act} onBill={setBilling} />)}
        <Small style={{ marginTop: 12, textAlign: 'center' }}>The full counter (sold out, points look-up, slips) is on pickmecafe.com.np/counter.</Small>
      </ScrollView>
    </View>
  );
}

function OrderCard({ o, drivers, act, onBill }) {
  const online = ['esewa', 'fonepay'].includes(o.payment && o.payment.method);
  const toCheck = online && !o.paid && !['done', 'cancelled'].includes(o.status);
  const next = NEXT[o.status];
  const asked = o.points && o.points.asked && o.points.approved === undefined ? o.points.asked : 0;
  const color = o.status === 'pending' ? C.bad : o.status === 'ready' ? C.ok : C.gold;
  return (
    <Card style={{ marginBottom: 10, borderLeftWidth: 5, borderLeftColor: color }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={s.id}>{o.id} · {o.hasWhole ? 'Cake' : TYPE[o.type]}{o.tableNo ? ` · Table ${o.tableNo}` : ''}</Text>
        <Text style={[s.state, { color }]}>{NAMES[o.status] || o.status}{o.cancelledBy === 'customer' ? ' by guest' : ''}</Text>
      </View>
      <Small>{new Date(o.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{o.source === 'app' ? ' · app' : ''}{o.schedule ? ` · for ${o.schedule.bs || o.schedule.date} ${t12(o.schedule.time)}` : ''}</Small>
      <View style={{ marginVertical: 8 }}>
        {(o.lines || []).map((l, i) => <Body key={i}>{l.qty} × {l.name}{l.label ? ` (${l.label})` : ''}{(l.extras || []).length ? ` + ${l.extras.join(', ')}` : ''}</Body>)}
        {o.cakeMessage ? <Small>On the cake: “{o.cakeMessage}”</Small> : null}
        {o.notes ? <Small>Note: {o.notes}</Small> : null}
      </View>
      <Text style={s.money}>{rs(o.total)} · {PAY[o.payment && o.payment.method] || 'Pay later'}{o.paid ? ' · Paid' : ''}{o.payment && o.payment.change ? ` · bring change for Rs. ${o.payment.change}` : ''}</Text>
      {o.name || o.phone ? <Small>{[o.name, o.phone].filter(Boolean).join(' · ')}</Small> : null}
      {o.type === 'delivery' ? <Small>{o.address}{o.location ? ' · 📍 pin on the map' : ''}</Small> : null}

      {toCheck ? <View style={{ marginTop: 8 }}><Note kind="bad">Payment to check: call the guest and check the eSewa/Fonepay app.</Note></View> : null}
      {asked ? (
        <View style={{ marginTop: 8 }}>
          <Note>Wants to use {asked} points ({rs(asked)} off). Check the phone number first.</Note>
          <View style={s.row}>
            <Button title="Take them off" onPress={() => act(() => api.approvePoints(o.id, true))} />
            <Button kind="line" title="Not now" onPress={() => act(() => api.approvePoints(o.id, false))} />
          </View>
        </View>
      ) : null}

      {o.type === 'delivery' && !['done', 'cancelled'].includes(o.status) && drivers.length ? (
        <View style={{ marginTop: 8 }}>
          <Small>Driver{o.delivery && o.delivery.status ? ` · ${o.delivery.status}` : ''}</Small>
          <View style={[s.row, { marginTop: 4 }]}>
            {drivers.map((d) => <Chip key={d.id} text={`${d.name}${d.online ? ' ●' : ''}`} on={Boolean(o.driver && o.driver.id === d.id)} onPress={() => act(() => api.giveToDriver(o.id, o.driver && o.driver.id === d.id ? '' : d.id))} />)}
          </View>
        </View>
      ) : null}

      <View style={s.row}>
        <Button kind="line" title={o.paid ? 'Print' : 'Bill and print'} onPress={() => onBill(o.id)} />
        {o.phone ? <Button kind="soft" title="Call" onPress={() => Linking.openURL(`tel:${o.phone}`)} /> : null}
        {toCheck ? <Button title="Payment confirmed" onPress={() => act(() => api.patchOrder(o.id, o.status === 'pending' ? { paid: true, status: 'acknowledged' } : { paid: true }))} />
          : next ? <Button title={next[1]} onPress={() => act(() => api.patchOrder(o.id, { status: next[0] }))} /> : null}
        {!o.paid && !online && !['cancelled'].includes(o.status) ? <Button kind="line" title="Paid" onPress={() => act(() => api.patchOrder(o.id, { paid: true }))} /> : null}
        {!['done', 'cancelled'].includes(o.status) ? <Button kind="line" title="Cancel" onPress={() => ask('Cancel this order?', `${o.id} · ${rs(o.total)}`, () => act(() => api.patchOrder(o.id, { status: 'cancelled' })))} /> : null}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  work: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  title: { fontFamily: SERIF, fontSize: 24, color: C.brown },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  id: { color: C.brown, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  state: { fontWeight: '700', fontSize: 13 },
  money: { color: C.goldDark, fontWeight: '700' },
  call: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bad, borderRadius: 16, padding: 12, marginBottom: 10 },
  callText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 16 },
});
