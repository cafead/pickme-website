// The "Me" tab: an optional customer account (orders on every phone, points, settings, delete account), points
// by phone number for guests, and the login for cafe staff and the delivery driver.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Alert, Linking } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { C, SERIF } from './theme';
import { useApp } from './store';
import * as api from './api';
import { rs } from './logic';
import { Script, Title, Body, Small, Button, Chip, Field, Card, Note } from './ui';
import { askPermission } from './notify';

let Google = null;
try { Google = require('expo-auth-session/providers/google'); require('expo-web-browser').maybeCompleteAuthSession(); } catch (e) { Google = null; } // eslint-disable-line global-require

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export default function Account({ go }) {
  const { account, cfg, refreshAccount } = useApp();
  const on = !cfg || cfg.on !== false;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
      <Script>Welcome</Script>
      <Title style={{ marginBottom: 12 }}>{account && account.me ? `Hello${account.me.name ? `, ${account.me.name.split(' ')[0]}` : ''}` : 'Me'}</Title>
      {on ? (account && account.me ? <SignedIn refresh={refreshAccount} go={go} /> : <SignedOut />) : null}
      {!(account && account.me) && cfg && cfg.points ? <GuestPoints /> : null}
      <StaffLogin />
      <Text style={[s.link, { marginTop: 18, textAlign: 'center', fontWeight: '400' }]} onPress={() => Linking.openURL(`${api.BASE}/privacy`)}>Privacy policy</Text>
    </ScrollView>
  );
}

/* ---------- not signed in ---------- */
function SignedOut() {
  const { cfg, signedIn } = useApp();
  const [mode, setMode] = useState('in'); // in | new | reset
  const [step, setStep] = useState(1);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [to, setTo] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [user, setUser] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const viaSms = Boolean(cfg && cfg.sms);
  const toLabel = viaSms ? 'Email or phone number' : 'Email';
  const reset = (m) => { setMode(m); setStep(1); setErr(''); setMsg(''); setCode(''); setTicket(''); setPw(''); };
  const run = async (fn) => { setErr(''); setMsg(''); setBusy(true); try { await fn(); } catch (e) { setErr(e.message); } setBusy(false); };
  const done = async (r) => { await askPermission(); await signedIn(r); };

  const signIn = () => run(async () => { if (!id.trim() || !pw) throw new Error('Please enter your login ID and password.'); await done(await api.signIn(id.trim(), pw)); });
  const sendCode = (purpose) => run(async () => { if (!to.trim()) throw new Error(`Please enter your ${toLabel.toLowerCase()}.`); const r = await api.sendCode(to.trim(), purpose); setMsg(`We sent a 6-digit code to ${r.to}.`); setStep(2); });
  const check = (purpose) => run(async () => { const r = await api.verifyCode(to.trim(), code.trim(), purpose); setTicket(r.ticket); setMsg(''); setStep(3); });
  const create = () => run(async () => { if (!pw) throw new Error('Please choose a password.'); await done(await api.register({ ticket, username: user.trim(), password: pw, name: name.trim(), phone: phone.trim() })); });
  const newPw = () => run(async () => { if (!pw) throw new Error('Please choose a new password.'); await done(await api.resetPassword(ticket, pw)); });

  return (
    <Card>
      <Body style={{ marginBottom: 12 }}>An account is optional. With one, your orders and points follow you to every phone and the website.</Body>
      <View style={[s.wrap, { marginBottom: 14 }]}>
        <Chip text="Sign in" on={mode === 'in'} onPress={() => reset('in')} />
        <Chip text="Create account" on={mode === 'new'} onPress={() => reset('new')} />
        <Chip text="Forgot password" on={mode === 'reset'} onPress={() => reset('reset')} />
      </View>

      {mode === 'in' ? (
        <>
          <Field label="Login ID, email or phone" value={id} onChangeText={setId} autoCapitalize="none" autoComplete="username" textContentType="username" maxLength={120} />
          <Field label="Password" value={pw} onChangeText={setPw} secure autoComplete="password" textContentType="password" maxLength={200} />
          <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={signIn} disabled={busy} />
        </>
      ) : null}

      {mode !== 'in' && step === 1 ? (
        <>
          <Field label={toLabel} value={to} onChangeText={setTo} autoCapitalize="none" keyboardType="email-address" autoComplete="email" maxLength={120} hint={mode === 'new' ? 'We send a code to check it is yours.' : 'We send a code so you can choose a new password.'} />
          <Button title={busy ? 'Sending…' : 'Send the code'} onPress={() => sendCode(mode === 'new' ? 'signup' : 'reset')} disabled={busy} />
        </>
      ) : null}
      {mode !== 'in' && step === 2 ? (
        <>
          <Field label="The 6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
          <Button title={busy ? 'Checking…' : 'Next'} onPress={() => check(mode === 'new' ? 'signup' : 'reset')} disabled={busy} />
          <Pressable onPress={() => setStep(1)}><Text style={s.link}>Use another address or send again</Text></Pressable>
        </>
      ) : null}
      {mode === 'new' && step === 3 ? (
        <>
          <Field label="Login ID (optional)" value={user} onChangeText={setUser} autoCapitalize="none" maxLength={60} hint="Any name you like. You can also sign in with your email." />
          <Field label="Password" value={pw} onChangeText={setPw} secure autoComplete="new-password" textContentType="newPassword" maxLength={200} hint="At least 4 characters." />
          <Field label="Your name (optional)" value={name} onChangeText={setName} maxLength={80} />
          <Field label="Phone (for your points)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="98XXXXXXXX" />
          <Button title={busy ? 'Creating…' : 'Create my account'} onPress={create} disabled={busy} />
        </>
      ) : null}
      {mode === 'reset' && step === 3 ? (
        <>
          <Field label="New password" value={pw} onChangeText={setPw} secure autoComplete="new-password" textContentType="newPassword" maxLength={200} hint="At least 4 characters." />
          <Button title={busy ? 'Saving…' : 'Save and sign in'} onPress={newPw} disabled={busy} />
        </>
      ) : null}

      {msg ? <View style={{ marginTop: 10 }}><Note kind="ok">{msg}</Note></View> : null}
      {err ? <View style={{ marginTop: 10 }}><Note kind="bad">{err}</Note></View> : null}
      {mode === 'in' ? <OtherSignIn onDone={done} setErr={setErr} /> : null}
    </Card>
  );
}

// Sign in with Apple (iPhone) and Google (when the cafe's Google app clients are set up).
function OtherSignIn({ onDone, setErr }) {
  const { cfg } = useApp();
  const [apple, setApple] = useState(false);
  React.useEffect(() => { if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setApple).catch(() => {}); }, []);
  const g = cfg && cfg.googleApp;
  const gOk = Google && g && (Platform.OS === 'ios' ? g.ios : Platform.OS === 'android' ? g.android : g.web);
  if (!(apple && cfg && cfg.apple) && !gOk) return null;
  const appleIn = async () => {
    setErr('');
    try {
      const r = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] });
      const n = r.fullName || {};
      await onDone(await api.appleSignIn({ identityToken: r.identityToken, givenName: n.givenName || '', familyName: n.familyName || '' }));
    } catch (e) { if (e.code !== 'ERR_REQUEST_CANCELED') setErr(e.message || 'Sign in with Apple did not work. Please try again.'); }
  };
  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      <Small style={{ textAlign: 'center' }}>or</Small>
      {apple && cfg && cfg.apple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={999}
          style={{ height: 48 }}
          onPress={appleIn}
        />
      ) : null}
      {gOk ? <GoogleButton ids={g} onDone={onDone} setErr={setErr} /> : null}
    </View>
  );
}

function GoogleButton({ ids, onDone, setErr }) {
  const [req, res, prompt] = Google.useIdTokenAuthRequest({ iosClientId: ids.ios || undefined, androidClientId: ids.android || undefined, webClientId: ids.web || undefined });
  React.useEffect(() => {
    if (!res) return;
    if (res.type === 'success') {
      const t = (res.params && res.params.id_token) || (res.authentication && res.authentication.idToken);
      if (t) api.googleSignIn(t).then(onDone).catch((e) => setErr(e.message));
    } else if (res.type === 'error') setErr('Google sign-in did not work. Please try again.');
  }, [res]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Button kind="line" icon="G" title="Sign in with Google" disabled={!req} onPress={() => prompt()} />;
}

/* ---------- signed in ---------- */
function SignedIn({ refresh }) {
  const { account, signOut, cfg, device, setProfile } = useApp();
  const me = account.me;
  const p = account.points;
  const L = (cfg && cfg.loyalty) || {};
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone);
  const [address, setAddress] = useState(me.address);
  const [bm, setBm] = useState(0);
  const [bd, setBd] = useState(0);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const run = async (what, fn) => { setErr(''); setMsg(''); setBusy(what); try { await fn(); } catch (e) { setErr(e.message); } setBusy(''); };

  const saveDetails = () => run('details', async () => {
    await api.updateMe({ name: name.trim(), phone: phone.trim(), address: address.trim(), device });
    setProfile((x) => ({ ...x, name: name.trim() || x.name, phone: phone.trim() || x.phone, address: address.trim() || x.address }));
    await refresh(); setMsg('Saved.');
  });
  const saveBirthday = () => run('birthday', async () => {
    if (!bm || !bd) throw new Error('Please choose the month and the day.');
    await api.updateMe({ birthday: `${String(bm).padStart(2, '0')}-${String(bd).padStart(2, '0')}`, device });
    await refresh(); setMsg('Birthday saved. Happy early birthday!');
  });
  const savePw = () => run('pw', async () => {
    if (!pw) throw new Error('Please choose a new password.');
    await api.updateMe({ current: cur, password: pw, device });
    setCur(''); setPw(''); setMsg('Password changed.');
  });
  const remove = () => {
    const go = () => run('delete', async () => { await api.deleteMe(); await signOut(); });
    const text = `Your account and its login are deleted for good.${p && p.balance ? ` Your ${p.balance} points are lost.` : ''} Orders stay in the cafe's records without your account.`;
    if (Platform.OS === 'web') { if (window.confirm(`Delete my account? ${text}`)) go(); return; } // eslint-disable-line no-alert
    Alert.alert('Delete my account?', text, [{ text: 'Keep it', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  return (
    <>
      {cfg && cfg.points ? (
        <Card style={{ marginBottom: 14, backgroundColor: C.goldSoft }}>
          <Text style={s.h}>{L.title || 'Pick Me points'}</Text>
          {p ? (
            <>
              <Text style={s.big}>{p.balance} <Text style={{ fontSize: 16 }}>points</Text></Text>
              <Small>Worth {rs(p.balance * (Number(L.rupeesPerPoint) || 1))} off.{p.next ? ` ${p.next.amount} of them end on ${fmtDate(p.next.exp)}.` : ''}</Small>
              {!account.canSpend ? <Small style={{ marginTop: 6 }}>Show this screen at the counter once, so staff confirm your phone number. Then you can use points straight away in the app.</Small> : null}
            </>
          ) : <Small>{me.phone ? 'Order once with your phone number, or show this screen at the counter, to see your points here.' : 'Add your phone number below to collect points.'}</Small>}
          {L.text ? <Small style={{ marginTop: 6 }}>{L.text}</Small> : null}
        </Card>
      ) : null}

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.h}>My details</Text>
        <Small style={{ marginBottom: 10 }}>Signed in as {me.username || me.email || me.phone}{me.email && me.username ? ` (${me.email})` : ''}</Small>
        <Field label="Name" value={name} onChangeText={setName} maxLength={80} />
        <Field label={`Phone${me.phone && me.phoneVerified ? ' (confirmed)' : ''}`} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} />
        <Field label="Delivery address" value={address} onChangeText={setAddress} multiline maxLength={300} />
        <Button title={busy === 'details' ? 'Saving…' : 'Save my details'} onPress={saveDetails} disabled={Boolean(busy)} />
      </Card>

      {!me.birthday && cfg && cfg.points ? (
        <Card style={{ marginBottom: 14 }}>
          <Text style={s.h}>My birthday</Text>
          <Small style={{ marginBottom: 8 }}>Get {L.birthdayPoints || 100} points in your birthday week. You can set it once.</Small>
          <View style={s.wrap}>{MONTHS.map((m, i) => <Chip key={m} text={m} on={bm === i + 1} onPress={() => setBm(i + 1)} />)}</View>
          {bm ? <View style={[s.wrap, { marginTop: 10 }]}>{Array.from({ length: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][bm - 1] }, (_, i) => <Chip key={i} text={String(i + 1)} on={bd === i + 1} onPress={() => setBd(i + 1)} style={{ minWidth: 44 }} />)}</View> : null}
          <Button title={busy === 'birthday' ? 'Saving…' : 'Save my birthday'} onPress={saveBirthday} disabled={Boolean(busy)} style={{ marginTop: 12 }} />
        </Card>
      ) : me.birthday ? <Small style={{ marginBottom: 14 }}>Birthday: {Number(me.birthday.slice(3))} {MONTHS[Number(me.birthday.slice(0, 2)) - 1]}</Small> : null}

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.h}>{me.hasPassword ? 'Change password' : 'Set a password'}</Text>
        {me.hasPassword ? <Field label="Current password" value={cur} onChangeText={setCur} secure autoComplete="password" maxLength={200} /> : null}
        <Field label="New password" value={pw} onChangeText={setPw} secure autoComplete="new-password" textContentType="newPassword" maxLength={200} hint="At least 4 characters." />
        <Button title={busy === 'pw' ? 'Saving…' : 'Save password'} onPress={savePw} disabled={Boolean(busy)} />
      </Card>

      {msg ? <View style={{ marginBottom: 10 }}><Note kind="ok">{msg}</Note></View> : null}
      {err ? <View style={{ marginBottom: 10 }}><Note kind="bad">{err}</Note></View> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="soft" title="Sign out" style={{ flex: 1 }} onPress={signOut} />
        <Button kind="line" title={busy === 'delete' ? 'Deleting…' : 'Delete my account'} style={{ flex: 1 }} onPress={remove} disabled={Boolean(busy)} />
      </View>
    </>
  );
}

// Points by phone number, for guests without an account.
function GuestPoints() {
  const { profile, device, cfg } = useApp();
  const [phone, setPhone] = useState(profile.phone || '');
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const L = (cfg && cfg.loyalty) || {};
  const look = async () => { setErr(''); try { setR(await api.lookup(phone.trim(), device)); } catch (e) { setErr(e.message); } };
  return (
    <Card style={{ marginTop: 14 }}>
      <Text style={s.h}>My points</Text>
      <Small style={{ marginBottom: 8 }}>{L.text || 'Every order gives you points back.'} Check the points of the phone number you order with.</Small>
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="98XXXXXXXX" />
      <Button kind="soft" title="Check my points" onPress={look} />
      {r ? <View style={{ marginTop: 10 }}><Note kind="ok">{r.points ? `${r.points.balance} points (${rs(r.points.balance * (Number(L.rupeesPerPoint) || 1))} off).` : 'No points yet for this number on this phone. Order with it, or create an account.'}</Note></View> : null}
      {err ? <View style={{ marginTop: 10 }}><Note kind="bad">{err}</Note></View> : null}
    </Card>
  );
}

// Staff and the delivery driver log in with the ID and password the owner gives them in the website admin.
function StaffLogin() {
  const { setStaff } = useApp();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setErr(''); setBusy(true);
    try {
      if (!id.trim() || !pw) throw new Error('Please enter your staff login ID and password.');
      const r = await api.staffLogin(id.trim(), pw);
      await askPermission();
      setStaff({ token: r.token, role: r.role, name: r.name });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  if (!open) return <Pressable onPress={() => setOpen(true)} style={{ marginTop: 22 }}><Text style={[s.link, { textAlign: 'center' }]}>Cafe staff or delivery driver? Log in</Text></Pressable>;
  return (
    <Card style={{ marginTop: 18 }}>
      <Text style={s.h}>Staff and driver login</Text>
      <Field label="Login ID" value={id} onChangeText={setId} autoCapitalize="none" autoComplete="username" maxLength={40} />
      <Field label="Password" value={pw} onChangeText={setPw} secure autoComplete="password" maxLength={200} />
      {err ? <View style={{ marginBottom: 10 }}><Note kind="bad">{err}</Note></View> : null}
      <Button title={busy ? 'Logging in…' : 'Log in'} onPress={go} disabled={busy} />
    </Card>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { color: C.goldDark, fontWeight: '600', marginTop: 10 },
  h: { color: C.muted, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  big: { fontFamily: SERIF, fontSize: 34, color: C.brown },
});
