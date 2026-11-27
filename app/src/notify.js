// Notifications on the phone: local ones when the app sees a change itself ("Your order is ready"), and
// push notifications from the cafe's server (new orders for staff, new deliveries for drivers, order updates
// for customers) once push is set up for the app (Apple push key and Firebase in EAS).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerPush, pushWorking } from './api';

// Staff: "Working at the cafe" (kept on this phone). Off = no order alerts on this phone.
let pushToken = '';
export const isWorking = async () => (await AsyncStorage.getItem('pm.working').catch(() => null)) !== 'off';
export async function setWorking(on) {
  await AsyncStorage.setItem('pm.working', on ? 'on' : 'off').catch(() => {});
  if (pushToken) await pushWorking(pushToken, on).catch(() => {});
}

let ready = false;

export async function setupNotifications() {
  if (Platform.OS === 'web') return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Order and booking updates',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#A8843A',
    });
    await Notifications.setNotificationChannelAsync('deliveries', {
      name: 'New deliveries (drivers)',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#1D5FA8',
    });
    ready = true;
  } catch (e) { /* notifications are a bonus; the app works without them */ }
}

export async function askPermission() {
  if (Platform.OS === 'web') return false;
  try {
    const now = await Notifications.getPermissionsAsync();
    if (now.granted) return true;
    const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
    return Boolean(asked.granted);
  } catch (e) { return false; }
}

export async function notify(title, body) {
  if (Platform.OS === 'web' || !ready) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true }, // Android uses the 'orders' channel, set as default in app.json
      trigger: null,
    });
  } catch (e) { /* ignore */ }
}

// Sends this phone's push token to the cafe's server. The server knows from the login whether it is a
// customer, staff or a driver. Quietly does nothing when push is not set up yet or not allowed.
export async function registerForPush(device) {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const projectId = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.eas && Constants.expoConfig.extra.eas.projectId) || (Constants.easConfig && Constants.easConfig.projectId);
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (t && t.data) { pushToken = t.data; await registerPush(t.data, device, Platform.OS, !(await isWorking())); }
  } catch (e) { /* push not set up yet (Apple key / Firebase), or offline */ }
}
