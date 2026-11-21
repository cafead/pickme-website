import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { C } from './theme';
import { useApp } from './store';
import { placeBooking } from './api';
import { askPermission } from './notify';
import { Script, Title, Body, Button, Chip, Field, DatePick, TimePick, Note, Small, Photo } from './ui';

export default function Book({ openOrder }) {
  const { content: c, profile, setProfile, addOrder } = useApp();
  const k = c.booking || {};
  const max = Number(k.maxPeople) || 30;
  const seats = String(k.seating || '').split(',').map((x) => x.trim()).filter(Boolean);
  const [day, setDay] = useState(null);
  const [time, setTime] = useState('');
  const [people, setPeople] = useState(2);
  const [seating, setSeating] = useState('');
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    setErr('');
    if (!day || !time) return setErr('Please choose a day and a time.');
    if (!/^\+?\d[\d\s-]{6,17}$/.test(phone.trim())) return setErr('Please enter your phone number so we can confirm your table.');
    setBusy(true);
    try {
      const r = await placeBooking({ name: name.trim(), phone: phone.trim(), people, date: day.ad, time, dateBs: day.bs, seating, remarks: remarks.trim() });
      setProfile({ ...profile, name: name.trim(), phone: phone.trim() });
      addOrder({ kind: 'booking', id: r.id, key: r.key, status: 'pending', people, date: day.ad, time, bs: day.bs, createdAt: new Date().toISOString() });
      askPermission();
      setDay(null); setTime(''); setRemarks('');
      openOrder(r.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
      <Script>{k.script || 'Save your seat'}</Script>
      <Title>{k.title || 'Book a table'}</Title>
      {k.text ? <Body style={{ marginTop: 6, marginBottom: 12 }}>{k.text}</Body> : null}
      {k.image ? <Photo uri={k.image} style={{ width: '100%', height: 160, borderRadius: 20, marginBottom: 6 }} /> : null}

      <Text style={st.h}>Day</Text>
      <DatePick value={day && day.ad} onChange={(d) => { setDay(d); setTime(''); }} days={30} />
      {day ? <Small style={{ marginTop: 4 }}>{day.bs}</Small> : null}

      <Text style={st.h}>Time</Text>
      <TimePick content={c} date={day && day.ad} lead={0} value={time} onChange={setTime} />

      <Text style={st.h}>People</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Chip text="−" onPress={() => setPeople((n) => Math.max(1, n - 1))} style={{ width: 52 }} />
        <Text style={{ fontSize: 20, color: C.brown, minWidth: 28, textAlign: 'center' }}>{people}</Text>
        <Chip text="+" onPress={() => setPeople((n) => Math.min(max, n + 1))} style={{ width: 52 }} />
      </View>

      {seats.length ? (
        <>
          <Text style={st.h}>Seating (optional)</Text>
          <View style={st.wrap}>{seats.map((x) => <Chip key={x} text={x} on={seating === x} onPress={() => setSeating(seating === x ? '' : x)} />)}</View>
        </>
      ) : null}

      <View style={{ marginTop: 18 }}>
        <Field label="Your name" value={name} onChangeText={setName} placeholder="Optional" maxLength={80} />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="98XXXXXXXX" keyboardType="phone-pad" maxLength={20} />
        <Field label="Anything we should know" value={remarks} onChangeText={setRemarks} placeholder="Birthday, decoration, a quiet corner…" multiline maxLength={600} />
      </View>
      {err ? <Note kind="bad">{err}</Note> : null}
      <Button title={busy ? 'Sending…' : (k.button || 'Request booking')} onPress={send} disabled={busy} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  h: { color: C.muted, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
