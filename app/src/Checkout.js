import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Image, ScrollView, useWindowDimensions } from 'react-native';
import { C, SERIF } from './theme';
import { useApp } from './store';
import { placeOrder } from './api';
import { askPermission } from './notify';
import { rs, openState, servedNow } from './logic';
import { imageUrl } from './api';
import { Sheet, Button, Chip, Field, DatePick, TimePick, Note, Small, Body, Photo } from './ui';

// The cart, then the order details: dine-in, pickup or delivery, when, contact and payment.
export default function Checkout({ open, onClose, onPlaced, startAt }) {
  const { content: c, cart, setQty, clearCart, profile, setProfile, addOrder } = useApp();
  const [step, setStep] = useState(startAt || 'cart');
  // Every order starts as: at the cafe, now, pay later.
  const [type, setType] = useState('dinein');
  const [when, setWhen] = useState('now');
  const [day, setDay] = useState(null);
  const [time, setTime] = useState('');
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(profile.address);
  const [table, setTable] = useState('');
  const [notes, setNotes] = useState('');
  const [cakeMessage, setCakeMessage] = useState('');
  const [occasion, setOccasion] = useState('');
  const [method, setMethod] = useState('later');
  const [txn, setTxn] = useState('');
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(false);
  const { width, height } = useWindowDimensions();
  const [err, setErr] = useState('');

  const pay = c.payment || {};
  const hasWhole = cart.some((l) => l.whole);
  const lead = hasWhole ? Math.max(Number((c.cake || {}).noticeHours) || 0, ...cart.filter((l) => l.whole).map((l) => l.notice || 0)) : 0;
  const later = hasWhole || when === 'later';
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const fee = type === 'delivery' ? Number(pay.deliveryFee) || 0 : 0;
  const total = subtotal + fee;
  const online = ['esewa', 'fonepay'].filter((m) => pay[m] && pay[m].enabled !== false && pay[m].qr);
  const st = openState(c);
  // A whole-cake pre-order is picked up later, as on the website.
  useEffect(() => { if (open && hasWhole) setType((t) => (t === 'dinein' ? 'pickup' : t)); }, [open, hasWhole]);

  const close = () => { setErr(''); onClose(); setTimeout(() => setStep('cart'), 300); };

  const send = async () => {
    setErr('');
    if (type !== 'dinein' && !/^\+?\d[\d\s-]{6,17}$/.test(phone.trim())) return setErr('Please enter your phone number so we can reach you.');
    if (method !== 'later' && !/^\+?\d[\d\s-]{6,17}$/.test(phone.trim())) return setErr('Please enter your phone number: we call you to confirm the payment.');
    if (type === 'delivery' && address.trim().length < 5) return setErr('Please enter the delivery address.');
    if (later && (!day || !time)) return setErr(hasWhole ? 'Please choose when you want the cake.' : 'Please choose a day and a time.');
    if (hasWhole && !cakeMessage.trim() && !occasion.trim()) { /* the name on the cake is optional */ }
    setBusy(true);
    try {
      const r = await placeOrder({
        type, name: name.trim(), phone: phone.trim(), address: type === 'delivery' ? address.trim() : '', tableNo: type === 'dinein' ? table.trim() : '',
        lines: cart.map((l) => ({ itemId: l.itemId, label: l.label, qty: l.qty, extras: l.extras || [] })),
        when: later ? 'later' : 'now', date: later ? day.ad : '', time: later ? time : '', dateBs: later ? day.bs : '',
        cakeMessage: hasWhole ? cakeMessage.trim() : '', occasion: hasWhole ? occasion.trim() : '',
        notes: notes.trim(), method, txn: method !== 'later' ? txn.trim() : '',
      });
      setProfile({ name: name.trim(), phone: phone.trim() || profile.phone, address: address.trim() || profile.address });
      addOrder({
        kind: 'order', id: r.id, key: r.key, status: 'pending', total: r.total, type, createdAt: new Date().toISOString(),
        lines: cart.map((l) => ({ name: l.name, label: l.label, qty: l.qty, extras: l.extraNames || [] })),
        schedule: later ? { date: day.ad, time, bs: day.bs } : null, hasWhole,
      });
      clearCart();
      askPermission();
      setStep('cart'); setNotes(''); setCakeMessage(''); setOccasion(''); setTxn(''); setDay(null); setTime(''); setWhen('now'); setMethod('later'); setType('dinein');
      onPlaced(r.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (step === 'cart') {
    return (
      <Sheet open={open} onClose={close} title="Your order"
        footer={cart.length ? <Button title={`Continue · ${rs(subtotal)}`} onPress={() => setStep('details')} /> : null}>
        {!cart.length ? <Body style={{ paddingVertical: 30, textAlign: 'center' }}>Your order is empty. Add something from the menu.</Body> : null}
        {cart.map((l) => (
          <View key={l.uid} style={s.line}>
            <Photo uri={l.image} style={{ width: 54, height: 54 }} round />
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={s.lineName}>{l.name}{l.label ? ` (${l.label})` : ''}</Text>
              {(l.extraNames || []).length ? <Small>+ {l.extraNames.join(', ')}</Small> : null}
              <Text style={s.linePrice}>{rs(l.price * l.qty)}</Text>
            </View>
            <View style={s.qty}>
              <Pressable onPress={() => setQty(l.uid, l.qty - 1)} style={s.qBtn} accessibilityLabel={`One less ${l.name}`}><Text style={s.qText}>{l.qty === 1 ? '🗑' : '−'}</Text></Pressable>
              <Text style={s.qNum}>{l.qty}</Text>
              <Pressable onPress={() => setQty(l.uid, l.qty + 1)} style={s.qBtn} accessibilityLabel={`One more ${l.name}`}><Text style={s.qText}>+</Text></Pressable>
            </View>
          </View>
        ))}
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={close} title="Order details"
      footer={<View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Small>Total{fee ? ` (with delivery ${rs(fee)})` : ''}</Small><Text style={s.total}>{rs(total)}</Text></View>
        <Button title={busy ? 'Sending…' : 'Place order'} onPress={send} disabled={busy} />
      </View>}>
      <Pressable onPress={() => setStep('cart')}><Text style={s.back}>‹ Back to your order</Text></Pressable>

      <Text style={s.h}>How</Text>
      <View style={s.wrap}>
        {[['dinein', 'At the cafe'], ['pickup', 'Pickup'], ['delivery', 'Delivery']].map(([k, t]) => <Chip key={k} text={t} on={type === k} onPress={() => setType(k)} />)}
      </View>
      {type === 'delivery' ? <Small style={{ marginTop: 6 }}>{pay.deliveryNote || 'Delivery inside Hetauda only.'} Delivery {rs(pay.deliveryFee)}.</Small> : null}
      {type === 'dinein' ? <View style={{ marginTop: 12 }}><Field label="Table number (optional)" value={table} onChangeText={setTable} keyboardType="number-pad" maxLength={20} /></View> : null}

      {!hasWhole ? (
        <>
          <Text style={s.h}>When</Text>
          <View style={s.wrap}>
            <Chip text="Now" on={when === 'now'} onPress={() => setWhen('now')} />
            <Chip text="Later" on={when === 'later'} onPress={() => setWhen('later')} />
          </View>
          {when === 'now' && !st.open ? <Small style={{ marginTop: 6, color: C.bad }}>We are closed right now ({(c.brand || {}).hoursText}). Choose “Later”.</Small> : null}
        </>
      ) : <Text style={s.h}>When do you want the cake?</Text>}
      {later ? (
        <View style={{ marginTop: 8 }}>
          <DatePick value={day && day.ad} onChange={(d) => { setDay(d); setTime(''); }} days={30} />
          {day ? <Small style={{ marginVertical: 6 }}>{day.bs}</Small> : null}
          <View style={{ marginTop: 6 }}><TimePick content={c} date={day && day.ad} lead={lead} value={time} onChange={setTime} /></View>
          {hasWhole ? <Small style={{ marginTop: 6 }}>Cakes need at least {lead} hours' notice.</Small> : null}
        </View>
      ) : null}

      {hasWhole ? (
        <View style={{ marginTop: 16 }}>
          <Field label="Name or words on the cake" value={cakeMessage} onChangeText={setCakeMessage} placeholder="Happy Birthday Sita" maxLength={120} />
          <Field label="Occasion (optional)" value={occasion} onChangeText={setOccasion} placeholder="Birthday, anniversary…" maxLength={80} />
        </View>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Field label="Your name" value={name} onChangeText={setName} placeholder="Optional" maxLength={80} />
        <Field label={method !== 'later' ? 'Phone (we call to confirm the payment)' : type === 'dinein' ? 'Phone (optional)' : 'Phone'} value={phone} onChangeText={setPhone} placeholder="98XXXXXXXX" keyboardType="phone-pad" maxLength={20} />
        {type === 'delivery' ? <Field label="Delivery address" value={address} onChangeText={setAddress} placeholder="Tole, landmark, ward" multiline maxLength={300} /> : null}
        <Field label="Note for the cafe (optional)" value={notes} onChangeText={setNotes} placeholder="Less spicy, extra napkins…" multiline maxLength={500} />
      </View>

      <Text style={s.h}>Payment</Text>
      <View style={s.wrap}>
        <Chip text="Pay later" sub={type === 'delivery' ? 'on delivery' : 'at the counter'} on={method === 'later'} onPress={() => setMethod('later')} />
        {online.map((m) => <Chip key={m} text={pay[m].name || m} sub="scan the QR" on={method === m} onPress={() => setMethod(m)} />)}
      </View>
      {method !== 'later' ? (
        <View style={{ marginTop: 12, alignItems: 'center' }}>
          <Pressable onPress={() => setBig(true)} accessibilityRole="button" accessibilityLabel="Show the QR code full screen" style={{ alignItems: 'center' }}>
            <Photo uri={pay[method].qr} style={{ width: 220, height: 220, borderRadius: 12 }} />
            <Small style={{ marginTop: 6, color: C.goldDark, textDecorationLine: 'underline' }}>Tap the QR to make it big</Small>
          </Pressable>
          {pay[method].account ? <Small style={{ marginTop: 6 }}>{pay[method].account}</Small> : null}
          <PaySteps total={total} />
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}><Field label="Transaction code (optional)" value={txn} onChangeText={setTxn} maxLength={60} autoCapitalize="characters" /></View>
        </View>
      ) : null}
      <Modal visible={big && method !== 'later'} animationType="fade" onRequestClose={() => setBig(false)} statusBarTranslucent>
        <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ alignItems: 'center', padding: 18, paddingTop: 50 }}>
          <Text style={s.bigName}>{(pay[method] || {}).name || 'Pay'}{(pay[method] || {}).account ? ` · ${pay[method].account}` : ''}</Text>
          {method !== 'later' && imageUrl(pay[method].qr) ? <Image source={{ uri: imageUrl(pay[method].qr) }} style={{ width: Math.min(width - 36, height * 0.62, 520), height: Math.min(width - 36, height * 0.62, 520), marginVertical: 12 }} resizeMode="contain" accessibilityLabel="Payment QR code" /> : null}
          <Small>Amount to pay</Small>
          <Text style={s.bigAmount}>{rs(total)}</Text>
          <PaySteps total={total} />
          <View style={{ alignSelf: 'stretch', marginTop: 16 }}><Button title="Back to my order" onPress={() => setBig(false)} /></View>
        </ScrollView>
      </Modal>

      {err ? <View style={{ marginTop: 12 }}><Note kind="bad">{err}</Note></View> : null}
    </Sheet>
  );
}

// What to do with the QR, the same words as on the website.
function PaySteps({ total }) {
  const steps = ['Take a screenshot of this QR.', 'Open eSewa, Fonepay or your bank app and scan the QR from your screenshot.', `Pay ${rs(total)}.`, 'Come back to this app and place your order.'];
  return (
    <View style={{ alignSelf: 'stretch', marginTop: 10, gap: 4 }}>
      {steps.map((t, i) => <Body key={i}>{i + 1}. {t}</Body>)}
      <Small style={{ marginTop: 4 }}>We will call you on your phone number to confirm the payment.</Small>
    </View>
  );
}

const s = StyleSheet.create({
  bigName: { color: C.brown, fontSize: 16, fontWeight: '600' },
  bigAmount: { fontFamily: SERIF, fontSize: 30, color: C.brown, marginBottom: 6 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  lineName: { color: C.brown, fontSize: 15, fontWeight: '600' },
  linePrice: { color: C.goldDark, marginTop: 2 },
  qty: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 999, backgroundColor: '#fff' },
  qBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  qText: { fontSize: 18, color: C.brown },
  qNum: { minWidth: 20, textAlign: 'center', color: C.brown, fontWeight: '600' },
  h: { color: C.muted, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  back: { color: C.goldDark, fontWeight: '600', marginBottom: 4 },
  total: { fontFamily: SERIF, fontSize: 22, color: C.brown },
});
