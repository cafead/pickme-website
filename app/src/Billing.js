// Billing in staff mode (version 1.0.3): the website's billing page (/bill) inside the app, with the staff login
// handed over, and bills printed by Bluetooth on the cafe's receipt printer.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Platform, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { Pressable } from './press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BASE } from './api';
import { C } from './theme';
import { Button, Small, Note, Sheet } from './ui';
import * as printer from './printer';
import { tap } from './press';

let WebView = null;
if (Platform.OS !== 'web') WebView = require('react-native-webview').WebView; // eslint-disable-line global-require

export default function Billing({ open, onClose, token, order }) {
  const inset = useSafeAreaInsets();
  const [msg, setMsg] = useState(null); // { kind, text }
  const [choose, setChoose] = useState(false);
  const [found, setFound] = useState([]);
  const [looking, setLooking] = useState(false);
  const [saved, setSaved] = useState(null);
  const waiting = useRef(null);

  useEffect(() => { if (open) printer.savedPrinter().then(setSaved); }, [open]);
  // On the web preview there is no Bluetooth: the billing page opens in the browser instead.
  useEffect(() => { if (open && Platform.OS === 'web') { Linking.openURL(`${BASE}/bill${order ? `#order=${encodeURIComponent(order)}` : ''}`); onClose(); } }, [open, onClose, order]);

  const look = async () => {
    setFound([]); setLooking(true); setMsg(null);
    try { await printer.scan((d) => setFound((list) => (list.some((x) => x.id === d.id) ? list : [...list, d]))); } catch (e) { setMsg({ kind: 'bad', text: e.message }); }
    setLooking(false);
  };
  const send = async (data) => {
    waiting.current = data;
    setMsg({ kind: 'ok', text: 'Printing…' });
    try {
      await printer.print(data);
      waiting.current = null;
      setMsg({ kind: 'ok', text: 'Sent to the printer.' });
      setTimeout(() => setMsg((m) => (m && m.text === 'Sent to the printer.' ? null : m)), 2500);
    } catch (e) {
      if (e.choose) { setMsg(null); setChoose(true); look(); } else setMsg({ kind: 'bad', text: e.message });
    }
  };
  const pick = async (d) => {
    printer.stopScan();
    await printer.choosePrinter(d);
    setSaved(d); setChoose(false);
    if (waiting.current) send(waiting.current);
  };
  const onMessage = (raw) => { try { const m = JSON.parse(raw); if (m.type === 'print' && typeof m.data === 'string') send(m.data); else if (m.type === 'tap') tap(); } catch (e) { /* not ours */ } };

  if (Platform.OS === 'web' || !WebView) return null;
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: inset.top }}>
        <View style={s.top}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Billing</Text>
            <Pressable onPress={() => { setChoose(true); look(); }}><Small>{saved ? `Printer: ${saved.name} (change)` : 'Choose the printer'}</Small></Pressable>
          </View>
          <Button kind="line" title="Close" onPress={onClose} />
        </View>
        {msg ? <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}><Note kind={msg.kind}>{msg.text}</Note></View> : null}
        <WebView
          source={{ uri: `${BASE}/bill${order ? `#order=${encodeURIComponent(order)}` : ''}` }}
          injectedJavaScriptBeforeContentLoaded={`window.PM_TOKEN = ${JSON.stringify(token || '')}; true;`}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
          style={{ flex: 1, backgroundColor: C.bg }}
          startInLoadingState
          renderLoading={() => <ActivityIndicator color={C.gold} style={StyleSheet.absoluteFill} />}
          setSupportMultipleWindows={false}
          originWhitelist={['https://*']}
        />
        <View style={{ height: inset.bottom }} />
      </View>
      <Sheet open={choose} onClose={() => { printer.stopScan(); setChoose(false); }} title="Choose the printer">
        <Small>Switch the printer on and stand close to it. It usually shows as a name like "Printer", "BlueTooth Printer" or "AT-402".</Small>
        <View style={{ height: 10 }} />
        {found.map((d) => <View key={d.id} style={{ marginBottom: 8 }}><Button kind="line" title={d.name} onPress={() => pick(d)} /></View>)}
        {looking ? <ActivityIndicator color={C.gold} style={{ marginVertical: 12 }} /> : <Button title={found.length ? 'Look again' : 'Look for printers'} onPress={look} />}
        {!looking && !found.length ? <View style={{ marginTop: 10 }}><Small>No Bluetooth device found yet. Check that Bluetooth is on and the printer is not connected to another phone.</Small></View> : null}
        {msg && msg.kind === 'bad' ? <View style={{ marginTop: 10 }}><Note kind="bad">{msg.text}</Note></View> : null}
      </Sheet>
    </Modal>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  title: { fontSize: 20, fontWeight: '700', color: C.brown },
});
