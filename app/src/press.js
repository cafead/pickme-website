// A short buzz on every tap (version 1.0.3), so a tap that changes nothing on screen can still be felt.
// It can be switched off in the Me tab; the choice is kept on the phone. `Pressable` here is React Native's own
// with the buzz added, so every button in the app gets it.
import React from 'react';
import { Pressable as RNPressable, Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let on = true;
let Haptics = null;
if (Platform.OS !== 'web') { try { Haptics = require('expo-haptics'); } catch (e) { Haptics = null; } } // eslint-disable-line global-require
AsyncStorage.getItem('pm.vibe').then((v) => { if (v === 'off') on = false; }).catch(() => {});

export const vibeOn = () => on;
export function tap() {
  if (!on || Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android') Vibration.vibrate(15);
    else if (Haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch (e) { /* no vibration on this phone */ }
}
export function setVibe(v) { on = Boolean(v); AsyncStorage.setItem('pm.vibe', on ? 'on' : 'off').catch(() => {}); if (on) tap(); }

export const Pressable = React.forwardRef(({ onPress, ...rest }, ref) => (
  <RNPressable ref={ref} {...rest} onPress={onPress ? (e) => { tap(); onPress(e); } : undefined} />
));
