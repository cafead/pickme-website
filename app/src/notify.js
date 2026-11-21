// Notifications on the phone when an order or booking changes ("Your order is ready").
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

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
