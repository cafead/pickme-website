import React, { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { View, Text, StyleSheet, Modal, Image, ScrollView, useWindowDimensions } from 'react-native';
import { Pressable } from './press';
import { C, SERIF } from './theme';
import { useApp } from './store';
import { placeOrder, uploadPhoto, lookup } from './api';
import { MapPicker } from './MapView';
import { askPermission } from './notify';
import { rs, openState, servedNow } from './logic';
import { imageUrl } from './api';
import { Sheet, Button, Chip, Field, DatePick, TimePick, Note, Small, Body, Photo } from './ui';

// The cart, then the order details: dine-in, pickup or delivery, when, contact and payment.
export default function Checkout({ open, onClose, onPlaced, startAt }) {
  const { content: c, cart, setQty, clearCart, profile, setProfile, addOrder, device, account, cfg, refreshAccount } = useApp();
  const on = (k) => ((c.features || {})[k] !== false);
  const [step, setStep] = useState(startAt || 'cart');
  // Every order starts as: at the cafe, now, pay later.
  // 28 Nov 2026: "At the cafe" is preselected only when this phone is at the cafe; otherwise the guest chooses.
  const [type, setType] = useState('');
  const nearRef = useRef(undefined);
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
  // Version 1.0.2: the delivery spot on the map, cash on delivery with change, points, and a cake picture to copy.
  const [loc, setLoc] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [change, setChange] = useState(0);
  const [usePts, setUsePts] = useState(false);
  const [ref, setRef] = useState(null); // { uri, file }
  const [refBusy, setRefBusy] = useState(false);
  const [guestPts, setGuestPts] = useState({});

  const pay = c.payment || {};
  const hasWhole = cart.some((l) => l.whole);
  const lead = hasWhole ? Math.max(Number((c.cake || {}).noticeHours) || 0, ...cart.filter((l) => l.whole).map((l) => l.notice || 0)) : 0;
  const later = hasWhole || when === 'later';
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const fee = type === 'delivery' ? Number(pay.deliveryFee) || 0 : 0;
  // Points (5% back): an account with a confirmed phone spends them at once; otherwise staff take them off at the counter.
  const L = (cfg && cfg.loyalty) || c.loyalty || {};
  const ptsOn = Boolean(cfg && cfg.points);
  const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10);
  const mine = account && account.me && account.me.phone && digits(account.me.phone) === digits(phone) ? account : null;
  const bal = mine && mine.points ? mine.points.balance : guestPts[digits(phone)] || 0;
  const sure = Boolean(mine && mine.canSpend);
  const value = Number(L.rupeesPerPoint) || 1;
  const canPts = ptsOn && Math.min(bal, Math.floor(subtotal / value)) >= Math.max(1, Number(L.minSpend) || 0) && (sure || method === 'later' || method === 'cod');
  const ptsUse = canPts ? Math.min(bal, Math.floor(subtotal / value)) : 0;
  const ptsOff = canPts && usePts && sure ? ptsUse * value : 0;
  const earn = ptsOn ? Math.floor(Math.max(0, subtotal - ptsOff) * (Number(L.percent) || 0) / 100 / value) : 0;
  const total = subtotal + fee - ptsOff;
  const codOn = on('cod');
  const pinOn = on('mapPin');
  const online = ['esewa', 'fonepay'].filter((m) => pay[m] && pay[m].enabled !== false && pay[m].qr);
  const st = openState(c);
  // A whole-cake pre-order is picked up later, as on the website.
  useEffect(() => { if (open && hasWhole) setType((t) => (t === 'dinein' ? 'pickup' : t)); }, [open, hasWhole]);
  // Deliveries are paid in cash to the driver (or online); "Pay later" is for the cafe and pickup.
  useEffect(() => {
    if (type === 'delivery' && codOn && method === 'later') setMethod('cod');
    if (type !== 'delivery' && method === 'cod') setMethod('later');
  }, [type, codOn, method]);
  // A guest without an account: look up the points of the phone number (only after it is typed in full).
  const lastLook = useRef('');
  useEffect(() => {
    const d = digits(phone);
    if (!ptsOn || mine || d.length < 10 || lastLook.current === d || step !== 'details') return undefined;
    const t = setTimeout(() => {
      lastLook.current = d;
      lookup(phone.trim(), device).then((r) => setGuestPts((g) => ({ ...g, [d]: r.points ? r.points.balance : 0 }))).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [phone, ptsOn, mine, device, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickRef = async () => {
    setErr('');
    try {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (p && p.granted === false && p.accessPrivileges !== 'limited') { setErr('Please allow photos for Pick Me Cafe in the phone settings.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const a = r.assets[0];
      setRefBusy(true);
      const file = await uploadPhoto(a.uri, a.mimeType);
      setRef({ uri: a.uri, file });
    } catch (e) { setErr(e.message || 'That photo could not be sent.'); }
    setRefBusy(false);
  };

  useEffect(() => {
    if (!open || nearRef.current !== undefined || type) return;
    nearRef.current = null;
    (async () => {
      try {
        const seo = c.seo || {};
        if (!(Number(seo.lat) && Number(seo.lng))) return;
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const r = Math.PI / 180, a = Number(seo.lat), b = Number(seo.lng), x = (p.coords.latitude - a) * r, y = (p.coords.longitude - b) * r;
        const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(p.coords.latitude * r) * Math.sin(y / 2) ** 2;
        nearRef.current = 12742000 * Math.asin(Math.sqrt(h)) <= 400;
        if (nearRef.current) setType((t) => t || 'dinein');
      } catch (e) { nearRef.current = null; }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setErr(''); onClose(); setTimeout(() => setStep('cart'), 300); };

  const send = async () => {
    setErr('');
    if (!type) return setErr('Please choose how you would like it: At the cafe, Pickup or Delivery.');
    if (type !== 'dinein' && !/^\+?\d[\d\s-]{6,17}$/.test(phone.trim())) return setErr('Please enter your phone number so we can reach you.');
    if (!['later', 'cod'].includes(method) && !/^\+?\d[\d\s-]{6,17}$/.test(phone.trim())) return setErr('Please enter your phone number: we call you to confirm the payment.');
    if (type === 'delivery' && address.trim().length < 5) return setErr('Please enter the delivery address.');
    if (refBusy) return setErr('The cake picture is still sending. One moment, please.');
    if (later && (!day || !time)) return setErr(hasWhole ? 'Please choose when you want the cake.' : 'Please choose a day and a time.');
    if (hasWhole && !cakeMessage.trim() && !occasion.trim()) { /* the name on the cake is optional */ }
    setBusy(true);
    try {
      const r = await placeOrder({
        type, name: name.trim(), phone: phone.trim(), address: type === 'delivery' ? address.trim() : '', tableNo: type === 'dinein' ? table.trim() : '',
        lines: cart.map((l) => ({ itemId: l.itemId, label: l.label, qty: l.qty, extras: l.extras || [] })),
        when: later ? 'later' : 'now', date: later ? day.ad : '', time: later ? time : '', dateBs: later ? day.bs : '',
        cakeMessage: hasWhole ? cakeMessage.trim() : '', occasion: hasWhole ? occasion.trim() : '',
        notes: notes.trim(), method, txn: !['later', 'cod'].includes(method) ? txn.trim() : '',
        device, location: type === 'delivery' && loc ? { lat: loc.lat, lng: loc.lng, acc: 0 } : null,
        change: method === 'cod' ? change : 0, usePoints: canPts && usePts ? ptsUse : 0,
        refPhoto: hasWhole && ref ? ref.file : '',
      });
      setProfile({ name: name.trim(), phone: phone.trim() || profile.phone, address: address.trim() || profile.address });
      addOrder({
        kind: 'order', id: r.id, key: r.key, status: 'pending', total: r.total, type, tableNo: type === 'dinein' ? table.trim() : '', createdAt: new Date().toISOString(),
        lines: cart.map((l) => ({ name: l.name, label: l.label, qty: l.qty, extras: l.extraNames || [] })),
        schedule: later ? { date: day.ad, time, bs: day.bs } : null, hasWhole,
        pointsAsked: canPts && usePts && !sure ? ptsUse : 0,
      });
      clearCart();
      askPermission();
      setStep('cart'); setNotes(''); setCakeMessage(''); setOccasion(''); setTxn(''); setDay(null); setTime(''); setWhen('now'); setMethod('later'); setType(nearRef.current ? 'dinein' : '');
      setLoc(null); setChange(0); setUsePts(false); setRef(null);
      refreshAccount();
      onPlaced(r.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (step === 'cart') {
    return (
      <Sheet open={open} onClose={close} title="Your order"
        footer={cart.length ? <View style={{ gap: 6 }}><Small style={{ textAlign: 'center' }}>Delivery (inside Hetauda) adds {rs(pay.deliveryFee)}.</Small><Button title={`Continue · ${rs(subtotal)}`} onPress={() => setStep('details')} /></View> : null}>
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
    <Sheet open={open} onClose={close} onBack={() => setStep('cart')} title="Order details"
      footer={<View style={{ gap: 8 }}>
        {fee || ptsOff ? (
          <View style={{ gap: 2 }}>
            <View style={s.sumRow}><Small>Subtotal</Small><Small>{rs(subtotal)}</Small></View>
            {fee ? <View style={s.sumRow}><Small>Delivery charge</Small><Small>+{rs(fee)}</Small></View> : null}
            {ptsOff ? <View style={s.sumRow}><Small>Points</Small><Small>−{rs(ptsOff)}</Small></View> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Small>Total to pay</Small><Text style={s.total}>{rs(total)}</Text></View>
        <Button title={busy ? 'Sending…' : 'Place order'} onPress={send} disabled={busy} />
      </View>}>
      <Pressable onPress={() => setStep('cart')}><Text style={s.back}>‹ Back to your order</Text></Pressable>

      <Text style={s.h}>How</Text>
      <View style={s.wrap}>
        {[['dinein', 'At the cafe'], ['pickup', 'Pickup'], ['delivery', 'Delivery']].map(([k, t]) => <Chip key={k} text={t} on={type === k} onPress={() => setType(k)} />)}
      </View>
      {type === 'delivery' ? <View style={{ marginTop: 8 }}><Note>🛵 Delivery charge {rs(pay.deliveryFee)}, added to your total. {pay.deliveryNote || 'Delivery inside Hetauda only.'}</Note></View> : null}
      {type === 'delivery' && pinOn ? (
        <View style={{ marginTop: 10 }}>
          {loc ? <Note kind="ok">📍 Delivery spot set on the map · {loc.km} km from the cafe</Note> : null}
          <Button kind="soft" icon="📍" title={loc ? 'Change the spot' : 'Choose the delivery spot on the map'} onPress={() => setMapOpen(true)} style={{ marginTop: loc ? 8 : 0 }} />
          {!loc ? <Small style={{ marginTop: 6 }}>Helps our driver find you. You can also just write the address.</Small> : null}
        </View>
      ) : null}
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
          <Text style={[s.h, { marginTop: 4 }]}>Have a picture of the cake you want?</Text>
          {ref ? <Image source={{ uri: ref.uri }} style={{ width: 120, height: 120, borderRadius: 14, marginBottom: 8 }} accessibilityLabel="Your cake picture" /> : null}
          <View style={s.wrap}>
            <Button kind="soft" icon="🖼" title={refBusy ? 'Sending…' : ref ? 'Choose another' : 'Add a photo'} onPress={pickRef} disabled={refBusy} />
            {ref ? <Button kind="line" title="Remove" onPress={() => setRef(null)} /> : null}
          </View>
          <Small style={{ marginTop: 6 }}>A photo you downloaded or made with AI. We make a cake like it, as close as we can.</Small>
        </View>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Field label="Your name" value={name} onChangeText={setName} placeholder="Optional" maxLength={80} />
        <Field label={!['later', 'cod'].includes(method) ? 'Phone (we call to confirm the payment)' : type === 'dinein' ? 'Phone (optional)' : 'Phone'} value={phone} onChangeText={setPhone} placeholder="98XXXXXXXX" keyboardType="phone-pad" maxLength={20} />
        {type === 'delivery' ? <Field label="Delivery address" value={address} onChangeText={setAddress} placeholder="Tole, landmark, ward" multiline maxLength={300} /> : null}
        <Field label="Note for the cafe (optional)" value={notes} onChangeText={setNotes} placeholder="Less spicy, extra napkins…" multiline maxLength={500} />
      </View>

      <Text style={s.h}>Payment</Text>
      <View style={s.wrap}>
        {type === 'delivery' && codOn
          ? <Chip text="Cash on delivery" sub="pay the driver" on={method === 'cod'} onPress={() => setMethod('cod')} />
          : <Chip text="Pay later" sub={type === 'delivery' ? 'on delivery' : 'at the counter'} on={method === 'later'} onPress={() => setMethod('later')} />}
        {online.map((m) => <Chip key={m} text={pay[m].name || m} sub="scan the QR" on={method === m} onPress={() => setMethod(m)} />)}
      </View>
      {method === 'cod' ? (
        <View style={{ marginTop: 12 }}>
          <Small style={{ marginBottom: 6 }}>Need change? The driver brings change for one note:</Small>
          <View style={s.wrap}>
            {[[0, 'No change needed'], [500, 'Rs. 500 note'], [1000, 'Rs. 1000 note']].map(([v, t]) => <Chip key={v} text={t} on={change === v} onPress={() => setChange(v)} />)}
          </View>
        </View>
      ) : null}
      {ptsOn && (canPts || bal > 0 || earn > 0) ? (
        <View style={{ marginTop: 14 }}>
          {canPts ? <Chip text={`🎁 Use ${ptsUse} of my ${bal} points · ${rs(ptsUse * value)} off`} sub={sure ? '' : 'staff take them off at the counter'} on={usePts} onPress={() => setUsePts(!usePts)} style={{ alignSelf: 'flex-start' }} />
            : bal > 0 ? <Small>🎁 This number has {bal} points.{Math.min(bal, Math.floor(subtotal / value)) < (Number(L.minSpend) || 0) ? ` You can use them from ${L.minSpend} points.` : ' To use them with an online payment, sign in first, or pay in cash.'}</Small> : null}
          {earn > 0 ? <Small style={{ marginTop: 6 }}>{digits(phone).length >= 7 ? `This order gives ${earn} points to ${phone.trim()} when it is done.` : `Add your phone number to get ${earn} points for this order.`}</Small> : null}
        </View>
      ) : null}
      {method !== 'later' && method !== 'cod' ? (
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
      <Modal visible={big && method !== 'later' && method !== 'cod'} animationType="fade" onRequestClose={() => setBig(false)} statusBarTranslucent>
        <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ alignItems: 'center', padding: 18, paddingTop: 50 }}>
          <Text style={s.bigName}>{(pay[method] || {}).name || 'Pay'}{(pay[method] || {}).account ? ` · ${pay[method].account}` : ''}</Text>
          {pay[method] && imageUrl(pay[method].qr) ? <Image source={{ uri: imageUrl(pay[method].qr) }} style={{ width: Math.min(width - 36, height * 0.62, 520), height: Math.min(width - 36, height * 0.62, 520), marginVertical: 12 }} resizeMode="contain" accessibilityLabel="Payment QR code" /> : null}
          <Small>Amount to pay</Small>
          <Text style={s.bigAmount}>{rs(total)}</Text>
          <PaySteps total={total} />
          <View style={{ alignSelf: 'stretch', marginTop: 16 }}><Button title="Back to my order" onPress={() => setBig(false)} /></View>
        </ScrollView>
      </Modal>

      {err ? <View style={{ marginTop: 12 }}><Note kind="bad">{err}</Note></View> : null}
      <MapPicker open={mapOpen} content={c} start={loc} onClose={() => setMapOpen(false)} onPick={(p) => { setLoc(p); setMapOpen(false); }} />
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
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
