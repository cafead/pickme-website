import React from 'react';
import { View, Text, Modal, ScrollView, TextInput, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { Pressable } from './press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, SERIF, shadow } from './theme';
import { imageUrl } from './api';
import { dayChoices, timeChoices } from './logic';

export const Script = ({ children, style }) => <Text style={[s.script, style]}>{children}</Text>;
export const Title = ({ children, style }) => <Text style={[s.title, style]}>{children}</Text>;
export const Body = ({ children, style, ...p }) => <Text style={[s.body, style]} {...p}>{children}</Text>;
export const Small = ({ children, style }) => <Text style={[s.small, style]}>{children}</Text>;
export const Label = ({ children }) => <Text style={s.label}>{children}</Text>;

export function Button({ title, onPress, kind = 'main', disabled, style, icon }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [s.btn, kind === 'soft' && s.btnSoft, kind === 'line' && s.btnLine, disabled && { opacity: 0.45 }, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, style]}
    >
      {icon ? <Text style={[s.btnText, kind !== 'main' && { color: C.brown }, { marginRight: 8 }]}>{icon}</Text> : null}
      <Text style={[s.btnText, kind !== 'main' && { color: C.brown }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ text, on, onPress, sub, disabled, style }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityState={{ selected: Boolean(on), disabled: Boolean(disabled) }}
      style={[s.chip, on && s.chipOn, disabled && { opacity: 0.35 }, style]}>
      <Text style={[s.chipText, on && { color: '#fff' }]}>{text}</Text>
      {sub ? <Text style={[s.chipSub, on && { color: '#F7EEDB' }]}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Photo({ uri, style, round }) {
  const src = imageUrl(uri);
  if (!src) return <View style={[style, { backgroundColor: C.goldSoft }, round && { borderRadius: 999 }]} />;
  return <Image source={{ uri: src }} style={[style, { backgroundColor: C.goldSoft }, round && { borderRadius: 999 }]} resizeMode="cover" />;
}

export function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, maxLength, hint, autoCapitalize, secure, autoComplete, textContentType }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B3A593"
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        secureTextEntry={Boolean(secure)}
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCorrect={secure || autoComplete ? false : undefined}
        style={[s.input, multiline && { minHeight: 84, textAlignVertical: 'top', paddingTop: 12 }]}
      />
      {hint ? <Small style={{ marginTop: 4 }}>{hint}</Small> : null}
    </View>
  );
}

// A sheet that slides up from the bottom.
export function Sheet({ open, onClose, onBack, title, children, footer }) {
  const inset = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onBack || onClose} statusBarTranslucent>
      <View style={s.shade}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.sheet, { paddingBottom: Math.max(inset.bottom, 12) }]}>
          <View style={s.grab} />
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} numberOfLines={2}>{title}</Text>
            <Pressable onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel="Close"><Text style={{ fontSize: 20, color: C.brown }}>✕</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>{children}</ScrollView>
          {footer ? <View style={s.sheetFoot}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function DatePick({ value, onChange, days = 21, from }) {
  const list = dayChoices(days, from);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {list.map((d) => (
        <Pressable key={d.ad} onPress={() => onChange(d)} style={[s.day, value === d.ad && s.chipOn]} accessibilityRole="button" accessibilityLabel={d.bs} accessibilityState={{ selected: value === d.ad }}>
          <Text style={[s.dayTop, value === d.ad && { color: '#F7EEDB' }]}>{d.top}</Text>
          <Text style={[s.dayMid, value === d.ad && { color: '#fff' }]}>{d.mid}</Text>
          <Text style={[s.daySub, value === d.ad && { color: '#F7EEDB' }]}>{d.sub}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function TimePick({ content, date, lead, value, onChange }) {
  if (!date) return <Small>Choose a day first.</Small>;
  const list = timeChoices(content, date, lead);
  const any = list.some((t) => t.ok);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {any ? list.map((t) => <Chip key={t.t} text={t.label} on={value === t.t} disabled={!t.ok} onPress={() => onChange(t.t)} style={{ minWidth: 92 }} />)
        : <Small>No times left on this day. Please choose another day.</Small>}
    </View>
  );
}

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
export const Note = ({ children, kind }) => (
  <View style={[s.note, kind === 'bad' && { backgroundColor: C.badSoft, borderColor: '#E7B9B0' }, kind === 'ok' && { backgroundColor: C.okSoft, borderColor: '#B9D8C0' }]}>
    <Text style={[s.body, { color: kind === 'bad' ? C.bad : kind === 'ok' ? C.ok : C.brown }]}>{children}</Text>
  </View>
);

export const s = StyleSheet.create({
  script: { fontFamily: SERIF, fontStyle: 'italic', color: C.gold, fontSize: 17 },
  title: { fontFamily: SERIF, color: C.brown, fontSize: 26, letterSpacing: 0.5 },
  body: { color: C.ink, fontSize: 15, lineHeight: 22 },
  small: { color: C.muted, fontSize: 13, lineHeight: 18 },
  label: { color: C.muted, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.gold, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 22, ...shadow },
  btnSoft: { backgroundColor: C.goldSoft, elevation: 0, shadowOpacity: 0 },
  btnLine: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.gold, elevation: 0, shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center' },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipText: { color: C.brown, fontSize: 14, fontWeight: '500' },
  chipSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  input: { borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink },
  shade: { flex: 1, backgroundColor: C.shade },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%' },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#D8CBB3', marginTop: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  sheetTitle: { flex: 1, fontFamily: SERIF, fontSize: 22, color: C.brown },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  sheetFoot: { paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  day: { width: 82, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 16, paddingVertical: 10, alignItems: 'center' },
  dayTop: { color: C.muted, fontSize: 12 },
  dayMid: { color: C.brown, fontSize: 15, fontWeight: '600', marginVertical: 2 },
  daySub: { color: C.muted, fontSize: 12 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.line },
  note: { backgroundColor: C.goldSoft, borderColor: '#E2D2AE', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
});
