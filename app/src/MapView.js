// Maps inside the app: the website's small map pages (/m/pick and /m/track), shown in a WebView on phones and in
// a frame in the web preview. They use OpenStreetMap, so no map key or Google account is needed.
import React, { useRef, useState } from 'react';
import { View, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { BASE } from './api';
import { C } from './theme';
import { Sheet, Button, Small, Note } from './ui';

let WebView = null;
if (Platform.OS !== 'web') WebView = require('react-native-webview').WebView; // eslint-disable-line global-require

function Frame({ url, onMessage, style, webRef }) {
  if (Platform.OS === 'web') {
    // In the web preview the map is a frame on the same site; it talks back with postMessage.
    return (
      <WebFrame url={url} onMessage={onMessage} style={style} webRef={webRef} />
    );
  }
  return (
    <WebView
      ref={webRef}
      source={{ uri: url }}
      style={[{ flex: 1, backgroundColor: C.goldSoft }, style]}
      onMessage={(e) => onMessage && onMessage(e.nativeEvent.data)}
      startInLoadingState
      renderLoading={() => <ActivityIndicator color={C.gold} style={StyleSheet.absoluteFill} />}
      setSupportMultipleWindows={false}
      originWhitelist={['https://*']}
    />
  );
}

function WebFrame({ url, onMessage, style, webRef }) {
  const frame = useRef(null);
  React.useEffect(() => {
    const on = (e) => { if (frame.current && e.source === frame.current.contentWindow && onMessage) onMessage(e.data); };
    window.addEventListener('message', on);
    if (webRef) webRef.current = { injectJavaScript: (js) => { try { frame.current.contentWindow.eval(js); } catch (err) { /* not loaded yet */ } } };
    return () => window.removeEventListener('message', on);
  }, [onMessage, webRef]);
  return (
    <View style={[{ flex: 1, backgroundColor: C.goldSoft }, style]}>
      {React.createElement('iframe', { ref: frame, src: url, title: 'Map', style: { border: 0, width: '100%', height: '100%' } })}
    </View>
  );
}

// Choose the delivery spot: move the map so the pin sits on the door.
export function MapPicker({ open, onClose, onPick, content, start }) {
  const area = (content && content.delivery) || {};
  const [pin, setPin] = useState(null);
  const [err, setErr] = useState('');
  const [finding, setFinding] = useState(false);
  const web = useRef(null);
  const q = new URLSearchParams({ clat: String(area.lat || 27.4287), clng: String(area.lng || 85.0322), r: String(area.radiusKm == null ? 9 : area.radiusKm) });
  if (start) { q.set('lat', String(start.lat)); q.set('lng', String(start.lng)); }
  const url = `${BASE}/m/pick?${q.toString()}`;
  const onMessage = (raw) => { try { const m = JSON.parse(raw); if (m.type === 'pin') { setPin(m); setErr(''); } } catch (e) { /* not ours */ } };
  const findMe = async () => {
    setErr('');
    setFinding(true);
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== 'granted') { setErr('Location is off for this app. Move the map by hand, or allow location in the phone settings.'); setFinding(false); return; }
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = here.coords;
      if (web.current) web.current.injectJavaScript(`window.pmGoto(${lat}, ${lng}); true;`);
    } catch (e) { setErr('Your location could not be found. Move the map by hand.'); }
    setFinding(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Where should we bring it?"
      footer={<View style={{ gap: 8 }}>
        {pin && pin.out ? <Note kind="bad">That spot is {pin.km} km from us. We deliver inside Hetauda only{area.radiusKm ? ` (about ${area.radiusKm} km)` : ''}.</Note> : null}
        {err ? <Note kind="bad">{err}</Note> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="soft" title={finding ? 'Finding you…' : 'Use my location'} style={{ flex: 1 }} onPress={findMe} disabled={finding} />
          <Button title="Use this spot" style={{ flex: 1 }} disabled={!pin || pin.out} onPress={() => onPick({ lat: pin.lat, lng: pin.lng, km: pin.km })} />
        </View>
      </View>}>
      <Small style={{ marginBottom: 8 }}>Move the map until the gold pin is on your door. The circle is our delivery area.</Small>
      <View style={{ height: 380, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
        {open ? <Frame url={url} onMessage={onMessage} webRef={web} /> : null}
      </View>
    </Sheet>
  );
}

// Follow the delivery: the driver's scooter and the drop-off, refreshed by the page every 8 seconds.
export function TrackMap({ id, orderKey, height = 260 }) {
  const url = `${BASE}/m/track?id=${encodeURIComponent(id)}&key=${encodeURIComponent(orderKey)}`;
  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line, marginTop: 12 }}>
      <Frame url={url} />
    </View>
  );
}
