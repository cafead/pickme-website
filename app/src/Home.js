import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Linking, RefreshControl, useWindowDimensions, StyleSheet } from 'react-native';
import { C, SERIF, shadow } from './theme';
import { useApp } from './store';
import { eventSlides, openState, menuGroups, rs } from './logic';
import { Photo, Button, Script, Title, Body, Small, Sheet, Note } from './ui';

const LOGO = require('../assets/logo.png');

export default function Home({ go, openEvent }) {
  const { content: c, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const st = openState(c);
  const b = c.brand || {};
  const h = c.hero || {};
  const reload = async () => { setBusy(true); await refresh(); setBusy(false); };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={reload} colors={[C.gold]} />}>
      <View style={st_.head}>
        <Image source={LOGO} style={st_.logo} />
        <View style={{ flex: 1 }}>
          <Text style={st_.brand}>PICK ME CAFE</Text>
          <Text style={st_.tag}>{b.tagline || 'Coffee • Cakes • Icecream'}</Text>
        </View>
        <View style={[st_.open, { backgroundColor: st.open ? C.okSoft : C.badSoft }]}>
          <Text style={{ color: st.open ? C.ok : C.bad, fontSize: 12, fontWeight: '600' }}>{st.open ? 'Open now' : 'Closed'}</Text>
        </View>
      </View>

      {st.notice ? <View style={{ paddingHorizontal: 16 }}><Note kind="bad">{st.notice}{st.text ? `\n${st.text}` : ''}</Note></View> : null}

      <View style={st_.hero}>
        <Photo uri={h.image} style={StyleSheet.absoluteFill} />
        <View style={st_.heroShade} />
        <View style={{ padding: 20 }}>
          <Text style={st_.heroScript}>{h.script || 'Welcome to'}</Text>
          <Text style={st_.heroTitle}>{h.title || 'Pick Me Cafe'}</Text>
          {h.tagline ? <Text style={st_.heroLine}>{h.tagline}</Text> : null}
        </View>
      </View>

      <View style={st_.actions}>
        <Action icon="☕" text="Menu" onPress={() => go('menu')} />
        <Action icon="🎂" text="Order a cake" onPress={() => go('cake')} />
        <Action icon="🪑" text="Book a table" onPress={() => go('book')} />
      </View>

      <Events go={go} openEvent={openEvent} />

      <Favourites go={go} />

      <View style={{ paddingHorizontal: 16, marginTop: 26 }}>
        <Script>Visit us</Script>
        <Title style={{ marginBottom: 10 }}>Pick Me Cafe</Title>
        <Body>{b.address}</Body>
        <Small style={{ marginTop: 4 }}>{b.hoursText}</Small>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button kind="soft" title="Call" icon="📞" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${b.phone}`)} />
          <Button kind="soft" title="WhatsApp" icon="💬" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${b.whatsapp || ''}`)} />
        </View>
        {(c.visit || {}).mapLink ? <Button kind="line" title="Open in Google Maps" style={{ marginTop: 10 }} onPress={() => Linking.openURL(c.visit.mapLink)} /> : null}
      </View>
    </ScrollView>
  );
}

const Action = ({ icon, text, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [st_.action, pressed && { opacity: 0.8 }]} accessibilityRole="button">
    <Text style={{ fontSize: 24 }}>{icon}</Text>
    <Text style={st_.actionText}>{text}</Text>
  </Pressable>
);

// "Happening at Pick Me": every photo of every event that is on, one slide each.
// It moves on its own; a finger held on it pauses it; a quick tap opens the event.
function Events({ openEvent }) {
  const { content: c } = useApp();
  const { width } = useWindowDimensions();
  const slides = eventSlides(c);
  const [i, setI] = useState(0);
  const ref = useRef(null);
  const held = useRef(false);
  const secs = Math.max(2, Number((c.events || {}).seconds) || 5);
  const w = width - 32;

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const t = setInterval(() => {
      if (held.current) return;
      setI((n) => {
        const next = (n + 1) % slides.length;
        if (ref.current) ref.current.scrollTo({ x: next * w, animated: true });
        return next;
      });
    }, secs * 1000);
    return () => clearInterval(t);
  }, [slides.length, secs, w]);

  if (!slides.length || (c.sections || []).some((x) => x.id === 'events' && x.show === false)) return null;
  return (
    <View style={{ marginTop: 26 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Script>{(c.events || {}).script || 'What is on'}</Script>
        <Title style={{ marginBottom: 12 }}>{(c.events || {}).title || 'Happening at Pick Me'}</Title>
      </View>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: 16 }}
        onScrollBeginDrag={() => { held.current = true; }}
        onMomentumScrollEnd={(e) => { setI(Math.round(e.nativeEvent.contentOffset.x / w)); held.current = false; }}
        onTouchStart={() => { held.current = true; }}
        onTouchEnd={() => { held.current = false; }}
      >
        {slides.map((sl) => (
          <Pressable key={sl.key} onPress={() => openEvent(sl.e)} style={[st_.slide, { width: w }]} accessibilityRole="button" accessibilityLabel={sl.heading}>
            <Photo uri={sl.image} style={st_.slidePic} />
            <View style={st_.slideText}>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                {sl.e.tag ? <Text style={st_.pill}>{sl.e.tag}</Text> : null}
                <Text style={[st_.pill, { backgroundColor: C.goldSoft, color: C.brown }]}>{sl.left} day{sl.left === 1 ? '' : 's'} left</Text>
              </View>
              <Text style={st_.slideHead}>{sl.heading}</Text>
              {sl.text ? <Text style={[st_.slideBody]} numberOfLines={3}>{sl.text}</Text> : null}
              <Text style={st_.slideLink}>{sl.e.button || 'See the specials'} →</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {slides.length > 1 ? (
        <View style={st_.dots}>
          {slides.map((sl, n) => <View key={sl.key} style={[st_.dot, n === i && st_.dotOn]} />)}
        </View>
      ) : null}
    </View>
  );
}

// A few dishes to start with: the house favourites on the website, or the first items of the menu.
function Favourites({ go }) {
  const { content: c } = useApp();
  const groups = menuGroups(c).filter((g) => !g.special);
  const picks = [];
  for (const g of groups) {
    const it = g.items.find((x) => x.badge && x.available !== false) || g.items.find((x) => x.available !== false && x.image);
    if (it) picks.push(it);
    if (picks.length >= 6) break;
  }
  if (!picks.length) return null;
  return (
    <View style={{ marginTop: 26 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Script>From our menu</Script>
        <Title style={{ marginBottom: 12 }}>Guest favourites</Title>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {picks.map((it) => {
          const p = (it.prices || []).find((x) => Number(x.price) > 0);
          return (
            <Pressable key={it.id} onPress={() => go('menu')} style={st_.fav} accessibilityRole="button">
              <Photo uri={it.image} style={st_.favPic} round />
              <Text style={st_.favName} numberOfLines={2}>{it.name}</Text>
              {p ? <Text style={st_.favPrice}>{rs(p.price)}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// The event's own page: its message, photos and special items to order.
export function EventSheet({ event, onClose, onAdd }) {
  const { content: c } = useApp();
  if (!event) return null;
  const items = (event.menu || []).filter((it) => !it.hidden);
  const photos = (event.photos || []).filter((p) => p && p.image);
  return (
    <Sheet open={Boolean(event)} onClose={onClose} title={event.title}>
      {event.tag ? <Text style={[st_.pill, { alignSelf: 'flex-start', marginBottom: 10 }]}>{event.tag}</Text> : null}
      {event.text ? <Body style={{ marginBottom: 12 }}>{event.text}</Body> : null}
      {event.message ? <Note>{event.message}</Note> : null}
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
          {photos.map((p, n) => (
            <View key={n} style={{ width: 230 }}>
              <Photo uri={p.image} style={{ width: 230, height: 160, borderRadius: 16 }} />
              {p.caption ? <Text style={[st_.favName, { textAlign: 'left', marginTop: 6 }]}>{p.caption}</Text> : null}
              {p.text ? <Small>{p.text}</Small> : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {items.length ? (
        <View style={{ marginTop: 16 }}>
          <Script>{event.menuTitle || 'Specials'}</Script>
          {items.map((it) => (
            <View key={it.id} style={st_.evItem}>
              <Photo uri={it.image} style={{ width: 56, height: 56 }} round />
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={st_.favName2}>{it.name}</Text>
                {it.desc ? <Small>{it.desc}</Small> : null}
              </View>
              <View style={{ gap: 6 }}>
                {(it.prices || []).filter((p) => Number(p.price) > 0).map((p) => (
                  <Pressable key={p.label} disabled={it.available === false} onPress={() => onAdd(it, 'event-' + event.id, p)} style={[st_.priceBtn, it.available === false && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={`Add ${it.name} ${p.label || ''}`}>
                    <Text style={st_.priceText}>{p.label ? `${p.label} · ` : ''}{rs(p.price)}  +</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {!items.length && !photos.length && !event.message ? <Small>{(c.brand || {}).hoursText}</Small> : null}
    </Sheet>
  );
}

const st_ = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  logo: { width: 52, height: 46, resizeMode: 'contain' },
  brand: { fontFamily: SERIF, fontSize: 22, letterSpacing: 3, color: C.brown },
  tag: { fontFamily: SERIF, fontStyle: 'italic', color: C.gold, fontSize: 14 },
  open: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  hero: { marginHorizontal: 16, height: 230, borderRadius: 26, overflow: 'hidden', justifyContent: 'flex-end', ...shadow, backgroundColor: C.goldSoft },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(43,33,24,0.32)' },
  heroScript: { fontFamily: SERIF, fontStyle: 'italic', color: '#F3E6C6', fontSize: 18 },
  heroTitle: { fontFamily: SERIF, color: '#fff', fontSize: 34, letterSpacing: 1 },
  heroLine: { color: '#F7EEDB', fontSize: 15, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16 },
  action: { flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: 'center', paddingVertical: 16, gap: 6 },
  actionText: { color: C.brown, fontSize: 14, fontWeight: '600' },
  slide: { backgroundColor: C.card, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  slidePic: { width: '100%', height: 210 },
  slideText: { padding: 16 },
  pill: { backgroundColor: C.gold, color: '#fff', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  slideHead: { fontFamily: SERIF, color: C.brown, fontSize: 22 },
  slideBody: { color: C.ink, fontSize: 14, lineHeight: 20, marginTop: 4 },
  slideLink: { color: C.goldDark, fontWeight: '700', marginTop: 10 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#DCCFB6' },
  dotOn: { backgroundColor: C.gold, width: 20 },
  fav: { width: 132, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: 'center', padding: 12 },
  favPic: { width: 92, height: 92, borderWidth: 3, borderColor: C.goldSoft },
  favName: { color: C.brown, fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  favName2: { color: C.brown, fontSize: 15, fontWeight: '600' },
  favPrice: { color: C.goldDark, fontSize: 13, marginTop: 2 },
  evItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  priceBtn: { backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  priceText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
