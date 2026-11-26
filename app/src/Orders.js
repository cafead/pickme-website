import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, RefreshControl } from 'react-native';
import { C, SERIF } from './theme';
import { useApp } from './store';
import { STATUS, BOOKING_STATUS, rs, t12, finished } from './logic';
import { Script, Title, Body, Small, Sheet, Button, Card, Note } from './ui';
import { TrackMap } from './MapView';
import { tableCall } from './api';

const TYPE = { dinein: 'At the cafe', pickup: 'Pickup', delivery: 'Delivery' };
const statusOf = (o) => (o.kind === 'booking' ? BOOKING_STATUS : STATUS)[o.status] || { label: o.status || 'Sent', text: '' };
const color = (o) => (['cancelled', 'declined'].includes(o.status) ? C.bad : ['ready', 'confirmed', 'done', 'seated'].includes(o.status) ? C.ok : C.goldDark);

export default function Orders({ openOrder, go }) {
  const { orders, checkOrders } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 150 }}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={async () => { setBusy(true); await checkOrders(); setBusy(false); }} colors={[C.gold]} />}>
      <Script>Follow along</Script>
      <Title style={{ marginBottom: 12 }}>My orders</Title>
      {!orders.length ? (
        <Card>
          <Body>Orders and table bookings you make in this app show here, with their live status.</Body>
          <Button title="See the menu" onPress={() => go('menu')} style={{ marginTop: 14 }} />
        </Card>
      ) : null}
      {orders.map((o) => {
        const info = statusOf(o);
        return (
          <Pressable key={o.id} onPress={() => openOrder(o.id)} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={s.id}>{o.kind === 'booking' ? `Table for ${o.people}` : o.hasWhole ? 'Cake order' : TYPE[o.type] || 'Order'} · {o.id}</Text>
              <Small>{o.kind === 'booking' ? `${o.bs || o.date} at ${t12(o.time)}` : `${(o.lines || []).map((l) => `${l.qty}× ${l.name}`).join(', ').slice(0, 70)}`}</Small>
              {o.kind !== 'booking' ? <Text style={s.money}>{rs(o.total)}</Text> : null}
            </View>
            <View style={[s.pill, { borderColor: color(o) }]}><Text style={[s.pillText, { color: color(o) }]}>{info.label}</Text></View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// One order or booking, with its live status.
export function OrderSheet({ id, onClose }) {
  const { orders, checkOrders, removeOrder, content: c } = useApp();
  const o = orders.find((x) => x.id === id);
  useEffect(() => { if (id) checkOrders(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o) return null;
  const info = statusOf(o);
  const steps = ['Received', 'Accepted', 'Preparing', 'Ready'];
  const at = o.kind === 'booking' ? -2 : (STATUS[o.status] || {}).step;
  const phone = (c.brand || {}).phone;
  const d = o.delivery;
  const DSTEP = { waiting: 'Waiting for a driver', assigned: 'A driver has your order', picked: 'Picked up from the cafe', onway: 'On the way to you', delivered: 'Delivered' };
  const tableOn = ((c.features || {}).tableButtons !== false) && o.kind !== 'booking' && o.type === 'dinein' && o.tableNo && !finished(o);
  return (
    <Sheet open={Boolean(id)} onClose={onClose} title={o.kind === 'booking' ? 'Your table booking' : o.hasWhole ? 'Your cake order' : 'Your order'}
      footer={<View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="soft" title="Call the cafe" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${phone}`)} />
        {finished(o) ? <Button kind="line" title="Remove" style={{ flex: 1 }} onPress={() => { removeOrder(o.id); onClose(); }} /> : null}
      </View>}>
      <Text style={s.big}>{o.id}</Text>
      <View style={[s.status, { borderColor: color(o) }]}>
        <Text style={[s.statusLabel, { color: color(o) }]}>{info.label}</Text>
        {info.text ? <Body style={{ textAlign: 'center' }}>{info.text}</Body> : null}
      </View>
      {at >= 0 ? (
        <View style={s.steps}>
          {steps.map((t, n) => (
            <View key={t} style={{ alignItems: 'center', flex: 1 }}>
              <View style={[s.dot, n <= at && { backgroundColor: C.gold, borderColor: C.gold }]}><Text style={{ color: n <= at ? '#fff' : C.muted, fontSize: 12 }}>{n <= at ? '✓' : n + 1}</Text></View>
              <Text style={[s.stepText, n <= at && { color: C.brown }]}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {o.type === 'delivery' && d && !finished(o) ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={s.id}>🛵 {DSTEP[d.status] || 'Delivery'}{d.driver ? ` · ${d.driver.name}` : ''}</Text>
          {d.destination || d.where ? <TrackMap id={o.id} orderKey={o.key} /> : null}
          {d.driver && d.driver.phone ? <Button kind="soft" title={`Call ${d.driver.name}`} style={{ marginTop: 10 }} onPress={() => Linking.openURL(`tel:${d.driver.phone}`)} /> : null}
        </Card>
      ) : null}
      {tableOn ? <TableButtons table={o.tableNo} /> : null}
      {o.kind === 'booking' ? (
        <Card style={{ marginTop: 14 }}>
          <Body>{o.people} people</Body>
          <Body>{o.bs || o.date} at {t12(o.time)}</Body>
        </Card>
      ) : (
        <Card style={{ marginTop: 14 }}>
          {(o.lines || []).map((l, n) => <Body key={n}>{l.qty} × {l.name}{l.label ? ` (${l.label})` : ''}{(l.extras || []).length ? ` + ${l.extras.join(', ')}` : ''}</Body>)}
          {o.schedule ? <Small style={{ marginTop: 8 }}>For {o.schedule.bs || o.schedule.date} at {t12(o.schedule.time)}</Small> : null}
          <Text style={[s.money, { marginTop: 8 }]}>Total {rs(o.total)}{o.paid ? ' · Paid' : ''}</Text>
          {o.pointsEarned ? <Small style={{ marginTop: 4 }}>🎁 This order gave you {o.pointsEarned} points.</Small> : o.pointsAsked ? <Small style={{ marginTop: 4 }}>🎁 Staff take {o.pointsAsked} points off at the counter.</Small> : null}
        </Card>
      )}
      <Small style={{ marginTop: 12 }}>This page updates by itself. You also get a notification when the status changes while the app is open or was used recently.</Small>
    </Sheet>
  );
}

// Table guests: call staff, ask for the bill or water.
function TableButtons({ table }) {
  const [msg, setMsg] = useState('');
  const send = async (kind, label) => {
    try { await tableCall(table, kind); setMsg(`${label}: sent. Someone is coming to table ${table}.`); } catch (e) { setMsg(e.message); }
  };
  return (
    <Card style={{ marginTop: 14 }}>
      <Text style={s.id}>Table {table}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Button kind="soft" title="Call staff" style={{ flex: 1 }} onPress={() => send('staff', 'Call staff')} />
        <Button kind="soft" title="The bill" style={{ flex: 1 }} onPress={() => send('bill', 'Bring the bill')} />
        <Button kind="soft" title="Water" style={{ flex: 1 }} onPress={() => send('water', 'Water please')} />
      </View>
      {msg ? <View style={{ marginTop: 8 }}><Note kind="ok">{msg}</Note></View> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 10, gap: 10 },
  id: { color: C.brown, fontWeight: '600', fontSize: 15, marginBottom: 2 },
  money: { color: C.goldDark, fontWeight: '600', marginTop: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 12, fontWeight: '700' },
  big: { fontFamily: SERIF, color: C.brown, fontSize: 28, textAlign: 'center', letterSpacing: 2 },
  status: { borderWidth: 1, borderRadius: 20, padding: 16, alignItems: 'center', marginTop: 10, backgroundColor: C.card, gap: 6 },
  statusLabel: { fontFamily: SERIF, fontSize: 24 },
  steps: { flexDirection: 'row', marginTop: 16 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stepText: { color: C.muted, fontSize: 12, marginTop: 4 },
});
