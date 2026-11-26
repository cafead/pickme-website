// Driver mode: the deliveries given to this driver, with Call, the map to the customer's pin, and the steps
// Picked up / On the way / Delivered. While he shares his location, the customer sees him on a map.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Vibration, RefreshControl, AppState, Platform, Alert } from 'react-native';
import { C, SERIF } from './theme';
import { useApp } from './store';
import * as api from './api';
import { rs, t12 } from './logic';
import { Body, Small, Button, Card, Note } from './ui';
import { notify } from './notify';
import { isSharing, startSharing, stopSharing } from './driverTask';

const STEP = { assigned: ['picked', 'Picked up from the cafe'], picked: ['onway', 'On the way'], onway: ['delivered', 'Delivered'] };
const STATE = { assigned: 'Given to you', picked: 'Picked up', onway: 'On the way', delivered: 'Delivered' };

export default function Driver({ inset }) {
  const { staff, setStaff } = useApp();
  const [data, setData] = useState({ active: [], done: [] });
  const [sharing, setSharing] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const seen = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api.driverOrders();
      setData(d); setErr('');
      const ids = new Set(d.active.map((o) => o.id));
      if (seen.current) {
        const fresh = d.active.filter((o) => !seen.current.has(o.id));
        if (fresh.length) { Vibration.vibrate([0, 600, 250, 600, 250, 600]); notify('New delivery', `${fresh[0].id} · ${fresh[0].address || 'see the map'} · ${rs(fresh[0].total)}`); }
      }
      seen.current = ids;
    } catch (e) {
      if (e.status === 401 || e.status === 403) { await stopSharing(); setStaff(null); return; }
      setErr(e.message);
    }
    setSharing(await isSharing());
  }, [setStaff]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [load]);

  const share = async (want) => {
    setErr(''); setMsg('');
    if (want) {
      const why = await startSharing(staff.token);
      if (why) setErr(why); else setMsg('Sharing your location. Customers on the way see you on their map.');
    } else { await stopSharing(); await api.driverStop().catch(() => {}); }
    setSharing(await isSharing());
  };
  const step = async (o, next, cash) => {
    setErr('');
    try {
      await api.driverStep(o.id, next, cash);
      if (next === 'picked' && !(await isSharing())) await share(true);
      if (next === 'delivered' && data.active.length <= 1) { await stopSharing(); await api.driverStop().catch(() => {}); }
      await load();
    } catch (e) { setErr(e.message); }
  };
  const logout = () => {
    const go = async () => { await stopSharing(); await api.driverStop().catch(() => {}); await api.staffLogout().catch(() => {}); setStaff(null); };
    if (Platform.OS === 'web') { if (window.confirm('Log out? You stop getting deliveries on this phone.')) go(); return; } // eslint-disable-line no-alert
    Alert.alert('Log out?', 'You stop getting deliveries on this phone.', [{ text: 'No', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: go }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Deliveries</Text>
          <Small>{staff.name || 'Driver'}</Small>
        </View>
        <Button kind="line" title="Log out" onPress={logout} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 + (inset || 0) }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={async () => { setBusy(true); await load(); setBusy(false); }} colors={[C.gold]} />}>
        <Card style={{ marginBottom: 12, backgroundColor: sharing ? C.okSoft : C.card }}>
          <Text style={s.id}>{sharing ? '📍 Sharing your location' : 'Location is off'}</Text>
          <Small style={{ marginVertical: 6 }}>{sharing ? 'It keeps going with the screen off. Turn it off when you finish your deliveries.' : 'It turns on by itself when you tap "Picked up from the cafe".'}</Small>
          <Button kind={sharing ? 'line' : 'main'} title={sharing ? 'Stop sharing' : 'Share my location now'} onPress={() => share(!sharing)} />
        </Card>
        {msg ? <View style={{ marginBottom: 10 }}><Note kind="ok">{msg}</Note></View> : null}
        {err ? <View style={{ marginBottom: 10 }}><Note kind="bad">{err}</Note></View> : null}
        {!data.active.length ? <Body style={{ textAlign: 'center', paddingVertical: 24 }}>No deliveries right now. A new one rings this phone.</Body> : null}
        {data.active.map((o) => {
          const d = o.delivery || {};
          const next = STEP[d.status || 'assigned'];
          const cod = o.payment && o.payment.method === 'cod';
          const map = o.location ? `https://www.google.com/maps/dir/?api=1&destination=${o.location.lat},${o.location.lng}` : o.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address}, Hetauda`)}` : '';
          return (
            <Card key={o.id} style={{ marginBottom: 12, borderLeftWidth: 5, borderLeftColor: C.gold }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={s.id}>{o.id}</Text>
                <Text style={[s.id, { color: C.goldDark }]}>{STATE[d.status] || 'Given to you'}</Text>
              </View>
              <Body style={{ marginTop: 4 }}>{o.name || 'Guest'} · {o.phone}</Body>
              <Body>{o.address || 'No address written: use the map pin.'}</Body>
              {o.schedule ? <Small>For {o.schedule.bs || o.schedule.date} at {t12(o.schedule.time)}</Small> : null}
              <View style={{ marginVertical: 8 }}>{(o.lines || []).map((l, i) => <Small key={i}>{l.qty} × {l.name}{l.label ? ` (${l.label})` : ''}</Small>)}</View>
              {o.notes ? <Small>Note: {o.notes}</Small> : null}
              <View style={[s.money, { backgroundColor: cod && !o.paid ? C.goldSoft : C.okSoft }]}>
                <Text style={s.moneyText}>{cod && !o.paid ? `Collect ${rs(o.total)} in cash` : `${rs(o.total)} · already paid`}</Text>
                {cod && o.payment.change ? <Small>Bring change for a Rs. {o.payment.change} note</Small> : null}
              </View>
              <View style={s.row}>
                <Button kind="soft" title="Call" onPress={() => Linking.openURL(`tel:${o.phone}`)} />
                {map ? <Button kind="soft" title={o.location ? 'Map to the pin' : 'Find the address'} onPress={() => Linking.openURL(map)} /> : null}
              </View>
              {next ? (
                <View style={s.row}>
                  {next[0] === 'delivered' && cod && !o.paid
                    ? <Button title="Delivered + cash collected" style={{ flex: 1 }} onPress={() => step(o, 'delivered', true)} />
                    : <Button title={next[1]} style={{ flex: 1 }} onPress={() => step(o, next[0])} />}
                </View>
              ) : null}
            </Card>
          );
        })}
        {data.done.length ? <Text style={[s.h, { marginTop: 10 }]}>Delivered today ({data.done.length})</Text> : null}
        {data.done.map((o) => <Small key={o.id}>{o.id} · {o.name || 'Guest'} · {rs(o.total)}{o.payment && o.payment.method === 'cod' ? ' cash' : ''}</Small>)}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  title: { fontFamily: SERIF, fontSize: 24, color: C.brown },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  id: { color: C.brown, fontWeight: '700', fontSize: 15 },
  h: { color: C.muted, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  money: { borderRadius: 12, padding: 10 },
  moneyText: { color: C.brown, fontWeight: '700', fontSize: 16 },
});
