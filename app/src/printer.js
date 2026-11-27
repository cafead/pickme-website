// Bill printing by Bluetooth (version 1.0.3): the cafe's 80 mm receipt printer (ATPOS AT 402, ESC/POS).
// The billing page makes the printer commands; this file finds the printer and sends them.
// The chosen printer is remembered on this phone.
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pm.printer';

// Android prints over classic Bluetooth (the same way as Loyverse and RawBT): this printer drops parts of the
// logo over Bluetooth Low Energy. The small native module is in app/modules/classic-printer. iPhones can only use
// Bluetooth Low Energy, so they keep the slow, careful sending further down.
let Classic = null;
if (Platform.OS === 'android') { try { Classic = require('expo').requireNativeModule('PmClassicPrinter'); } catch (e) { Classic = null; } } // eslint-disable-line global-require
export const usesPairedList = () => Boolean(Classic);
async function allowClassic() {
  if (Platform.Version < 31) return;
  const p = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if ((await PermissionsAndroid.request(p)) !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Allow "Nearby devices" (Bluetooth) for Pick Me Cafe in the phone settings, then print again.');
}
let manager = null;
function ble() {
  if (Platform.OS === 'web') throw new Error('Printing by Bluetooth works in the phone app, not in the web preview.');
  if (!manager) {
    const { BleManager } = require('react-native-ble-plx'); // eslint-disable-line global-require
    manager = new BleManager();
  }
  return manager;
}

async function allow() {
  if (Platform.OS !== 'android') return;
  const P = PermissionsAndroid.PERMISSIONS;
  const list = Platform.Version >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
  const got = await PermissionsAndroid.requestMultiple(list);
  if (list.some((p) => got[p] !== PermissionsAndroid.RESULTS.GRANTED)) throw new Error('Allow "Nearby devices" (Bluetooth) for Pick Me Cafe in the phone settings, then print again.');
}
async function ready() {
  const m = ble();
  await allow();
  const state = await m.state();
  if (state === 'PoweredOn') return m;
  if (state === 'PoweredOff') throw new Error('Turn Bluetooth on, then print again.');
  if (state === 'Unauthorized') throw new Error('Allow Bluetooth for Pick Me Cafe in the phone settings, then print again.');
  // Just started: wait a moment for the phone to say Bluetooth is on.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { sub.remove(); reject(new Error('Turn Bluetooth on, then print again.')); }, 4000);
    const sub = m.onStateChange((s) => { if (s === 'PoweredOn') { clearTimeout(timer); sub.remove(); resolve(); } }, true);
  });
  return m;
}

export const savedPrinter = async () => { try { return JSON.parse(await AsyncStorage.getItem(KEY)); } catch (e) { return null; } };
export const forgetPrinter = () => AsyncStorage.removeItem(KEY).catch(() => {});
export const choosePrinter = (p) => AsyncStorage.setItem(KEY, JSON.stringify({ id: p.id, name: p.name, kind: Classic ? 'classic' : 'ble' })).catch(() => {});

// Looks for Bluetooth devices close by for a few seconds. onFound gets each named device once.
export async function scan(onFound, ms = 8000) {
  if (Classic) { // Android: the printers paired in the phone's Bluetooth settings
    await allowClassic();
    let list;
    try { list = await Classic.paired(); } catch (e) { throw new Error(e.message || 'Could not read the paired Bluetooth devices.'); }
    list.forEach((d) => onFound({ id: d.id, name: d.name }));
    return;
  }
  const m = await ready();
  const seen = new Set();
  return new Promise((resolve, reject) => {
    m.startDeviceScan(null, { allowDuplicates: false }, (err, d) => {
      if (err) { m.stopDeviceScan(); reject(new Error('Could not look for printers. Check that Bluetooth and Location are on.')); return; }
      const name = d && (d.name || d.localName);
      if (d && name && !seen.has(d.id)) { seen.add(d.id); onFound({ id: d.id, name }); }
    });
    setTimeout(() => { m.stopDeviceScan(); resolve(); }, ms);
  });
}
export const stopScan = () => { try { if (manager) manager.stopDeviceScan(); } catch (e) { /* not scanning */ } };

const bytesOf = (b64) => { const s = global.atob(b64); const out = new Array(s.length); for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i); return out; };
const toB64 = (arr) => global.btoa(String.fromCharCode(...arr));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const why = (e) => String((e && (e.reason || e.message)) || 'unknown').slice(0, 120);

// Connects afresh. A connection left over from the last print (or one that is still closing) makes the next
// connect fail, so it is closed first; then up to three tries.
async function connect(m, id) {
  try { if (await m.isDeviceConnected(id)) { await m.cancelDeviceConnection(id); await sleep(400); } } catch (e) { /* was not connected */ }
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const d = await m.connectToDevice(id, attempt === 0 ? { requestMTU: 185, timeout: 8000 } : { timeout: 8000 });
      await d.discoverAllServicesAndCharacteristics();
      return d;
    } catch (e) {
      last = e;
      try { await m.cancelDeviceConnection(id); } catch (err) { /* nothing to close */ }
      await sleep(700);
    }
  }
  throw last || new Error('no connection');
}

let printing = false;
// Sends a bill (base64 printer commands) to the remembered printer. One print at a time: a second tap while
// the first is still going would break both.
export async function print(b64) {
  const p = await savedPrinter();
  if (!p) { const e = new Error('Choose the printer first.'); e.choose = true; throw e; }
  if (printing) throw new Error('Still printing. Wait for the paper to finish, then print again.');
  if (Classic && p.kind !== 'classic') { const e = new Error('Choose the printer again.'); e.choose = true; throw e; }
  printing = true;
  try {
    if (Classic) {
      await allowClassic();
      try { await Classic.print(p.id, b64); } catch (e) {
        if (/Nearby devices|Bluetooth on/.test(e.message || '')) throw new Error(e.message);
        throw new Error(`Could not reach ${p.name}. Check that the printer is on, close to this phone, and not printing for another phone. (${why(e)})`);
      }
      return;
    }
    const m = await ready();
    let d;
    try { d = await connect(m, p.id); } catch (e) {
      throw new Error(`Could not reach ${p.name}. Check that the printer is on and close to this phone, and that no other phone is printing. (${why(e)})`);
    }
    try {
      let ch = null;
      for (const sv of await d.services()) {
        if (/^0000180[01a]-/.test(sv.uuid)) continue; // the phone-standard services (device name and so on)
        const cs = await sv.characteristics();
        ch = cs.find((c) => c.isWritableWithoutResponse) || cs.find((c) => c.isWritableWithResponse);
        if (ch) break;
      }
      if (!ch) { const e = new Error(`${p.name} is not a receipt printer. Choose the printer again.`); e.choose = true; throw e; }
      // Small pieces with pauses: sent faster, the printer drops bytes (the logo printed as rubbish on 27 Nov 2026).
      // A piece that fails is tried again; it is not a reason to stop the bill.
      const size = Math.max(20, Math.min(100, (d.mtu || 23) - 3));
      const all = bytesOf(b64);
      let fast = ch.isWritableWithoutResponse;
      let sent = 0;
      for (let i = 0; i < all.length; i += size) {
        const part = toB64(all.slice(i, i + size));
        let ok = false; let last = null;
        for (let attempt = 0; attempt < 6 && !ok; attempt += 1) {
          try { if (fast) await ch.writeWithoutResponse(part); else await ch.writeWithResponse(part); ok = true; } catch (e) {
            last = e;
            if (attempt === 3 && ch.isWritableWithResponse && ch.isWritableWithoutResponse) fast = !fast; // try the other way of writing
            await sleep(200);
          }
        }
        if (!ok) throw new Error(`The printer stopped part way. Switch the printer off and on, then print again. (${why(last)})`);
        sent += size;
        await sleep(fast ? 35 : 5);
        if (sent >= 1000) { sent = 0; await sleep(150); } // let the printer print what it has
      }
      await sleep(800);
    } finally {
      try { await m.cancelDeviceConnection(p.id); } catch (e) { /* already closed */ }
    }
  } finally { printing = false; }
}
