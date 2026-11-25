// The three buttons of the bill and the bill's row on the visit (T3, design-mockups/tech-bill-plain
// README «Для Фулстека» — «Три кнопки — вид»; the states come from three.js threeOf).
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { BUSY_WORDS } from './three';

// The bill's row in the visit's body: «Bill · $136.09 / Diagnostics $125.00 + tax · Change»
export function BillRow({ row, onChange, onOpen }) {
  if (!row) return null;
  return (
    <TouchableOpacity style={s.row} onPress={onOpen} disabled={!onOpen} accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.line}`}>
      <Icon name="doc" size={24} color={colors.fgDefault} />
      <View style={s.rowBody}>
        <Text style={s.rowTitle} numberOfLines={1}>{row.title}</Text>
        <Text style={s.rowLine} numberOfLines={2}>{row.line}</Text>
      </View>
      {row.change ? (
        <TouchableOpacity style={s.change} onPress={onChange} accessibilityRole="button" accessibilityLabel="Change the bill lines">
          <Text style={s.changeText}>Change</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

// The column in the visit's foot: the three in the company's order; busy: the key in flight;
// failure: the red line under them (the press itself is «Try again»)
export function ThreeButtons({ three, busy = null, failure = null, onPress }) {
  if (!three) return null;
  if (three.kind === 'nobill') {
    return (
      <View style={[s.btn, s.done]} accessible accessibilityLabel={`${three.title}${three.line ? `, ${three.line}` : ''}`}>
        <Icon name="checkc" size={24} color={colors.successFg} />
        <View style={s.btnBody}>
          <Text style={[s.title, s.titleDone, { color: colors.successFg }]}>{three.title}</Text>
          {three.line ? <Text style={[s.line, { color: colors.successFg }]}>{three.line}</Text> : null}
        </View>
      </View>
    );
  }
  if (!three.buttons.length) return null;
  return (
    <View style={s.column}>
      {three.buttons.map((b) => {
        const running = busy === b.key;
        const off = !!busy;
        const done = b.state === 'done';
        const tone = done ? (b.warn ? s.waiting : s.done) : b.lit ? s.lit : s.calm;
        const fg = done ? colors.successFg : b.lit ? colors.onAccent : colors.brandPressed;
        const lineFg = done ? colors.successFg : b.lit ? colors.onAccent : colors.fgSecondary;
        return (
          <TouchableOpacity key={b.key} style={[s.btn, tone, off && !running && s.off]} disabled={off} onPress={() => onPress(b.key)}
            accessibilityRole="button" accessibilityLabel={running ? BUSY_LABELS[b.key] : b.label}
            accessibilityHint={b.lit ? 'Next step' : undefined} accessibilityState={{ busy: running, disabled: off }}>
            {running ? <ActivityIndicator color={fg} style={s.icon} /> : <Icon name={done ? 'checkc' : b.icon} size={24} color={fg} />}
            <View style={s.btnBody}>
              <Text style={[s.title, done && s.titleDone, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>{running ? BUSY_WORDS[b.key] : b.title}</Text>
              {!running && b.line ? <Text style={[s.line, { color: lineFg }]} numberOfLines={1}>{b.line}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
      {failure ? <Text style={s.fail} accessibilityLiveRegion="polite" accessibilityRole="alert">{failure}</Text> : null}
    </View>
  );
}
const BUSY_LABELS = { sign: 'Saving the signature', pay: 'Recording the payment', send: 'Sending the bill' };

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: 14, backgroundColor: colors.bgCard },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 18, fontWeight: '800', color: colors.fgDefault },
  rowLine: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  change: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: colors.brandPressed, alignItems: 'center', justifyContent: 'center' },
  changeText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  column: { gap: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5 },
  calm: { backgroundColor: colors.bgCard, borderColor: colors.borderDefault },
  lit: { backgroundColor: colors.accent, borderColor: colors.accent },
  done: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  waiting: { backgroundColor: colors.successBg, borderColor: colors.warningBorder },
  off: { opacity: 0.5 },
  icon: { width: 24 },
  btnBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, fontWeight: '800' },
  titleDone: { fontSize: 17 },
  line: { fontSize: 15, lineHeight: 20 },
  fail: { fontSize: 15, lineHeight: 20, color: colors.dangerFg },
});
