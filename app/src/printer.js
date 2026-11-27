// Bill printing by Bluetooth (version 1.0.3): the cafe's 80 mm receipt printer (ATPOS AT 402, ESC/POS).
// The billing page makes the printer commands; this file finds the printer and sends them.
// The chosen printer is remembered on this phone.
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pm.printer';
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
export const choosePrinter = (p) => AsyncStorage.setItem(KEY, JSON.stringify({ id: p.id, name: p.name })).catch(() => {});

// Looks for Bluetooth devices close by for a few seconds. onFound gets each named device once.
export async function scan(onFound, ms = 8000) {
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

// Sends a bill (base64 printer commands) to the remembered printer.
export async function print(b64) {
  const p = await savedPrinter();
  if (!p) { const e = new Error('Choose the printer first.'); e.choose = true; throw e; }
  const m = await ready();
  let d;
  try {
    d = await m.connectToDevice(p.id, { requestMTU: 185, timeout: 10000 });
    await d.discoverAllServicesAndCharacteristics();
  } catch (e) {
    throw new Error(`Could not reach ${p.name}. Check that the printer is on and close to this phone.`);
  }
  try {
    let ch = null;
    for (const sv of await d.services()) {
      const cs = await sv.characteristics();
      ch = cs.find((c) => c.isWritableWithoutResponse) || cs.find((c) => c.isWritableWithResponse);
      // Skip the phone-standard services (device name and so on); printers use their own.
      if (ch && !/^0000180[01a]-/.test(sv.uuid)) break;
      ch = null;
    }
    if (!ch) { const e = new Error(`${p.name} is not a receipt printer. Choose the printer again.`); e.choose = true; throw e; }
    const size = Math.max(20, Math.min(180, (d.mtu || 23) - 3));
    const all = bytesOf(b64);
    for (let i = 0; i < all.length; i += size) {
      const part = toB64(all.slice(i, i + size));
      if (ch.isWritableWithoutResponse) await ch.writeWithoutResponse(part); else await ch.writeWithResponse(part);
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 400));
  } finally {
    m.cancelDeviceConnection(p.id).catch(() => {});
  }
}
