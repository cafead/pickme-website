// The driver's live location. While he shares it, the phone sends where he is every few seconds, also when the
// app is in the background or the screen is off (Android shows a "Sharing your location" notification, iPhone
// shows the blue location pill). Only drivers can turn it on, and only from the Deliveries screen.
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendDriverLocation } from './api';
import { STAFF_KEY } from './store';

export const TASK = 'pm-driver-location';
const native = Platform.OS !== 'web';

// Runs even when the app was closed by the phone: it reads the driver's login from storage.
if (native) {
  TaskManager.defineTask(TASK, async ({ data, error }) => {
    if (error || !data || !data.locations || !data.locations.length) return;
    try {
      const s = JSON.parse((await AsyncStorage.getItem(STAFF_KEY)) || 'null');
      if (!s || !s.token || s.role !== 'driver') { await Location.stopLocationUpdatesAsync(TASK).catch(() => {}); return; }
      const p = data.locations[data.locations.length - 1];
      await sendDriverLocation(s.token, { ...p.coords });
    } catch (e) { /* offline: the next spot goes through */ }
  });
}

let webWatch = null;

export async function isSharing() {
  if (!native) return webWatch != null;
  try { return await Location.hasStartedLocationUpdatesAsync(TASK); } catch (e) { return false; }
}

// Returns '' when sharing started, or a sentence saying what is missing.
export async function startSharing(token) {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'Please allow location for Pick Me Cafe in the phone settings, so customers can see where their delivery is.';
  if (!native) {
    if (webWatch == null) {
      let last = 0;
      webWatch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 7000, distanceInterval: 15 }, (p) => {
        if (Date.now() - last < 7000) return;
        last = Date.now();
        sendDriverLocation(token, p.coords).catch(() => {});
      });
    }
    return '';
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return Platform.OS === 'android'
      ? 'Please choose "Allow all the time" for location, so the customer still sees you when the screen is off.'
      : 'Please choose "Always" for location in Settings > Pick Me Cafe > Location, so the customer still sees you when the screen is off.';
  }
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 8000,
    distanceInterval: 15,
    deferredUpdatesInterval: 8000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: 'Pick Me Cafe: sharing your location', notificationBody: 'Customers see where their delivery is. Stop it in the app when you finish.', notificationColor: '#A8843A' },
  });
  return '';
}

export async function stopSharing() {
  if (!native) { if (webWatch) { webWatch.remove(); webWatch = null; } return; }
  try { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK); } catch (e) { /* already off */ }
}
