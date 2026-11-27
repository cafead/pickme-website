import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { Pressable } from './press';
import { C, SERIF } from './theme';
import { useApp } from './store';
import { menuGroups, hoursOf, servedNow, hoursText, extrasFor, rs } from './logic';
import { Photo, Script, Title, Small, Body, Sheet, Button, Chip } from './ui';

const MARK = { veg: 'Veg', nonveg: 'Non-veg', eggless: 'Eggless', sugarfree: 'Sugar-free', nuts: 'Nuts', spicy: 'Spicy' };

export default function Menu({ go, pickItem }) {
  const { content: c, refresh } = useApp();
  const groups = useMemo(() => menuGroups(c), [c]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef(null);
  const pos = useRef({});
  // The group chips: the chosen one slides to the middle, so the next group shows beside it.
  const bar = useRef(null);
  const chipAt = useRef({});
  const barW = useRef(0);
  const quietUntil = useRef(0);
  const [sel, setSel] = useState(null);
  const centre = (id) => {
    const k = chipAt.current[id];
    if (!k || !bar.current) return;
    bar.current.scrollTo({ x: Math.max(0, k.x - (barW.current - k.w) / 2), animated: true });
  };
  const choose = (id) => {
    setSel(id);
    centre(id);
    quietUntil.current = Date.now() + 700;
    if (scroll.current) scroll.current.scrollTo({ y: (pos.current[id] || 0) - 4, animated: true });
  };
  const follow = (y) => {
    if (Date.now() < quietUntil.current) return;
    let cur = null;
    for (const g of groups) if ((pos.current[g.id] ?? Infinity) <= y + 40) cur = g.id;
    if (cur && cur !== sel) { setSel(cur); centre(cur); }
  };
  const term = q.trim().toLowerCase();

  const shown = term
    ? groups.map((g) => ({ ...g, items: g.items.filter((it) => `${it.name} ${it.desc || ''}`.toLowerCase().includes(term)) })).filter((g) => g.items.length)
    : groups;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <Script>{(c.menu || {}).script || 'Freshly made'}</Script>
        <Title>{(c.menu || {}).title || 'Our Menu'}</Title>
        <TextInput value={q} onChangeText={setQ} placeholder="Search the menu (latte, cheesecake…)" placeholderTextColor="#B3A593" style={st.search} />
      </View>
      {!term ? (
        <ScrollView ref={bar} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}
          onLayout={(e) => { barW.current = e.nativeEvent.layout.width; }}>
          {groups.map((g) => (
            <View key={g.id} onLayout={(e) => { const l = e.nativeEvent.layout; chipAt.current[g.id] = { x: l.x, w: l.width }; }}>
              <Chip text={(g.special ? '✦ ' : '') + g.name} on={sel === g.id} onPress={() => choose(g.id)} />
            </View>
          ))}
        </ScrollView>
      ) : null}
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 150 }}
        scrollEventThrottle={100} onScroll={term ? undefined : (e) => follow(e.nativeEvent.contentOffset.y)}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={async () => { setBusy(true); await refresh(); setBusy(false); }} colors={[C.gold]} />}>
        {shown.map((g) => (
          <View key={g.id} onLayout={(e) => { pos.current[g.id] = e.nativeEvent.layout.y; }} style={{ marginTop: 14 }}>
            <Text style={st.group}>{g.special ? '✦ ' : ''}{g.name}</Text>
            {g.note ? <Small style={{ marginBottom: 8 }}>{g.note}</Small> : null}
            {g.items.map((it) => <Item key={it.id} it={it} g={g} onPick={(p) => pickItem(it, g.id, p)} onCake={() => go('cake', it.id)} />)}
          </View>
        ))}
        {!shown.length ? <Body style={{ marginTop: 30, textAlign: 'center' }}>Nothing matches “{q}”.</Body> : null}
      </ScrollView>
    </View>
  );
}

function Item({ it, g, onPick, onCake }) {
  const hrs = hoursOf(it, g);
  const later = hrs && !servedNow(hrs);
  const off = it.available === false;
  const prices = (it.prices || []).filter((p) => Number(p.price) > 0);
  return (
    <View style={[st.item, (off || later) && { opacity: 0.6 }]}>
      <View style={st.ring}><Photo uri={it.image} style={st.pic} round /></View>
      <View style={{ flex: 1, paddingVertical: 10, paddingRight: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <Text style={st.name}>{it.name}</Text>
          {it.badge ? <Text style={st.badge}>{it.badge}</Text> : null}
        </View>
        {it.desc ? <Text style={st.desc} numberOfLines={2}>{it.desc}</Text> : null}
        {(it.tags || []).length ? <Text style={st.marks}>{it.tags.map((t) => MARK[t]).filter(Boolean).join(' · ')}</Text> : null}
        {off ? <Text style={st.off}>Not available today</Text> : later ? <Text style={st.off}>{hoursText(hrs)}</Text> : null}
        <View style={st.prices}>
          {prices.map((p) => (
            <Pressable key={p.label || 'one'} disabled={off} onPress={() => (p.whole ? onCake() : onPick(p))}
              style={({ pressed }) => [st.price, p.whole && st.whole, pressed && { opacity: 0.8 }]} accessibilityRole="button"
              accessibilityLabel={`${p.whole ? 'Pre-order' : 'Add'} ${it.name} ${p.label || ''} ${rs(p.price)}`}>
              <Text style={[st.priceText, p.whole && { color: '#fff' }]}>{p.label ? `${p.label} ` : ''}{rs(p.price)}{p.whole ? '  🛒' : '  +'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

// Choose the size, extras and how many, then add to the order.
export function ItemSheet({ pick, onClose, onAdded }) {
  const { content: c, addToCart } = useApp();
  // The parent gives this sheet a new key for every item, so these start fresh each time.
  const [label, setLabel] = useState(pick && pick.price ? pick.price.label || '' : null);
  const [extras, setExtras] = useState([]);
  const [qty, setQty] = useState(1);
  if (!pick) return null;
  const it = pick.item;
  const prices = (it.prices || []).filter((p) => Number(p.price) > 0 && !p.whole);
  const price = prices.find((p) => (p.label || '') === (label === null ? (prices[0] || {}).label || '' : label)) || prices[0];
  const opts = extrasFor(c, pick.groupId);
  const extraCost = opts.filter((o) => extras.includes(o.id)).reduce((s, o) => s + (Number(o.price) || 0), 0);
  const unit = (price ? Number(price.price) : 0) + extraCost;
  const add = () => {
    addToCart({ itemId: it.id, label: price.label || '', name: it.name, image: it.image, price: unit, extras, extraNames: opts.filter((o) => extras.includes(o.id)).map((o) => o.name), qty, whole: false });
    onAdded(`${qty} × ${it.name} added`);
  };
  return (
    <Sheet open={Boolean(pick)} onClose={onClose} title={it.name}
      footer={<Button title={`Add to order · ${rs(unit * qty)}`} onPress={add} disabled={!price} />}>
      <Photo uri={it.image} style={{ width: '100%', height: 190, borderRadius: 20, marginBottom: 12 }} />
      {it.desc ? <Body style={{ marginBottom: 12 }}>{it.desc}</Body> : null}
      {prices.length > 1 ? (
        <>
          <Text style={st.h}>Size</Text>
          <View style={st.wrap}>{prices.map((p) => <Chip key={p.label} text={p.label || 'Regular'} sub={rs(p.price)} on={price === p} onPress={() => setLabel(p.label || '')} />)}</View>
        </>
      ) : null}
      {opts.length ? (
        <>
          <Text style={st.h}>{(c.extras || {}).title || 'Make it yours'}</Text>
          <View style={st.wrap}>
            {opts.map((o) => {
              const on = extras.includes(o.id);
              return <Chip key={o.id} text={o.name} sub={Number(o.price) > 0 ? `+ ${rs(o.price)}` : null} on={on} onPress={() => setExtras((x) => (on ? x.filter((y) => y !== o.id) : [...x, o.id]))} />;
            })}
          </View>
        </>
      ) : null}
      <Text style={st.h}>How many</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Chip text="−" onPress={() => setQty((n) => Math.max(1, n - 1))} style={{ width: 52 }} />
        <Text style={{ fontSize: 20, color: C.brown, minWidth: 28, textAlign: 'center' }}>{qty}</Text>
        <Chip text="+" onPress={() => setQty((n) => Math.min(50, n + 1))} style={{ width: 52 }} />
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  search: { borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, fontSize: 15, color: C.ink, marginTop: 10, marginBottom: 12 },
  group: { fontFamily: SERIF, color: C.brown, fontSize: 21, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 60, borderWidth: 1, borderColor: C.line, marginBottom: 10, minHeight: 104 },
  ring: { width: 104, height: 104, borderRadius: 52, padding: 3, backgroundColor: C.gold, marginRight: 12 },
  pic: { width: 98, height: 98 },
  name: { color: C.brown, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  badge: { fontSize: 10, color: C.goldDark, borderWidth: 1, borderColor: C.gold, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, textTransform: 'uppercase', letterSpacing: 0.8 },
  desc: { color: C.muted, fontSize: 13, marginTop: 2 },
  marks: { color: C.ok, fontSize: 11, marginTop: 3 },
  off: { color: C.bad, fontSize: 12, marginTop: 3 },
  prices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  price: { borderWidth: 1, borderColor: C.gold, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  whole: { backgroundColor: C.gold },
  priceText: { color: C.goldDark, fontSize: 13, fontWeight: '600' },
  h: { color: C.muted, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 14, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
