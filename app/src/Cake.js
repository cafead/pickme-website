import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { C, SERIF, shadow } from './theme';
import { useApp } from './store';
import { wholeCakes, cakeOptions, cakePhoto, pounds, rs } from './logic';
import { Photo, Script, Title, Body, Small, Button, Chip, Field, Note } from './ui';

// Pick a cake, a size and choices, then go to checkout (date, time and the name on the cake are asked there).
export default function Cake({ preselect, startCheckout }) {
  const { content: c } = useApp();
  const cakes = useMemo(() => wholeCakes(c), [c]);
  const k = c.cake || {};
  const [id, setId] = useState(preselect || (cakes[0] && cakes[0].item.id));
  const [size, setSize] = useState(null);
  const [opts, setOpts] = useState([]);
  useEffect(() => { if (preselect) setId(preselect); }, [preselect]);
  const cake = cakes.find((x) => x.item.id === id) || cakes[0];
  useEffect(() => { setSize(cake ? cake.sizes[0].label : null); setOpts([]); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cake) return <View style={{ padding: 24 }}><Body>Whole cakes are not available to pre-order right now. Please call us.</Body></View>;
  const sz = cake.sizes.find((p) => p.label === size) || cake.sizes[0];
  const choices = cakeOptions(c);
  const lb = pounds(sz.label);
  const extra = choices.filter((o) => opts.includes(o.id)).reduce((s, o) => s + Math.round((Number(o.price) || 0) * (o.perPound ? lb : 1)), 0);
  const unit = Number(sz.price) + extra;
  const serves = k.serveMin && k.serveMax ? `Serves about ${Math.round(k.serveMin * lb)} to ${Math.round(k.serveMax * lb)} people` : '';
  const notice = Math.max(Number(k.noticeHours) || 0, ...choices.filter((o) => opts.includes(o.id)).map((o) => Number(o.notice) || 0));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 150 }}>
      <Script>{k.script || 'For your celebration'}</Script>
      <Title>{k.title || 'Order a cake'}</Title>
      {k.text ? <Body style={{ marginTop: 6 }}>{k.text}</Body> : null}

      <View style={[st.big, shadow]}>
        <Photo uri={cakePhoto(c, cake.item)} style={{ width: '100%', height: 230 }} />
        <View style={{ padding: 14 }}>
          <Text style={st.cakeName}>{cake.item.name}</Text>
          {cake.item.desc ? <Small>{cake.item.desc}</Small> : null}
        </View>
      </View>

      <Text style={st.h}>Choose the cake</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {cakes.map((x) => (
          <Pressable key={x.item.id} onPress={() => setId(x.item.id)} style={[st.pick, x.item.id === cake.item.id && st.pickOn]} accessibilityRole="button" accessibilityState={{ selected: x.item.id === cake.item.id }}>
            <Photo uri={cakePhoto(c, x.item)} style={{ width: 70, height: 70 }} round />
            <Text style={st.pickName} numberOfLines={2}>{x.item.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={st.h}>Size</Text>
      <View style={st.wrap}>{cake.sizes.map((p) => <Chip key={p.label} text={p.label || 'Whole'} sub={rs(p.price)} on={p === sz} onPress={() => setSize(p.label)} />)}</View>
      {serves ? <Small style={{ marginTop: 6 }}>{serves}</Small> : null}

      {choices.length ? (
        <>
          <Text style={st.h}>Choices</Text>
          <View style={st.wrap}>
            {choices.map((o) => {
              const on = opts.includes(o.id);
              const cost = Math.round((Number(o.price) || 0) * (o.perPound ? lb : 1));
              return <Chip key={o.id} text={o.name} sub={cost ? `+ ${rs(cost)}` : 'Free'} on={on} onPress={() => setOpts((x) => (on ? x.filter((y) => y !== o.id) : [...x, o.id]))} />;
            })}
          </View>
        </>
      ) : null}

      <Note>Please order at least {notice} hours before you need it. You choose the date, time and the name to write on the cake at the next step.</Note>
      <Button title={`Continue · ${rs(unit)}`} onPress={() => startCheckout({
        itemId: cake.item.id, label: sz.label || '', name: cake.item.name, image: cakePhoto(c, cake.item), price: unit,
        extras: opts, extraNames: choices.filter((o) => opts.includes(o.id)).map((o) => o.name), qty: 1, whole: true, notice,
      })} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  big: { backgroundColor: C.card, borderRadius: 24, overflow: 'hidden', marginTop: 14, borderWidth: 1, borderColor: C.line },
  cakeName: { fontFamily: SERIF, color: C.brown, fontSize: 22 },
  h: { color: C.muted, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { width: 104, alignItems: 'center', padding: 10, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  pickOn: { borderColor: C.gold, backgroundColor: C.goldSoft },
  pickName: { color: C.brown, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 6 },
});
