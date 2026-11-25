// The three buttons of the bill and the bill's row on the visit (T3, design-mockups/tech-bill-plain
// README «Для Фулстека» — «Три кнопки — вид»; the states come from three.js threeOf).
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { BUSY_WORDS, tileOf } from './three';

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
// onSkip(stepKey): the quiet link under the orange one (VS-APP, design app-skip k1, k3, k6) —
// only when three.skip says its step may be skipped; a skipped button is grey and still opens its
// action (k6)
export function ThreeButtons({ three, busy = null, failure = null, onPress, onSkip = null }) {
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
        const skipped = b.state === 'skipped';
        const tone = done ? (b.warn ? s.waiting : s.done) : skipped ? s.skipped : b.lit ? s.lit : s.calm;
        const fg = done ? colors.successFg : skipped ? colors.fgSecondary : b.lit ? colors.onAccent : colors.brandPressed;
        const lineFg = done ? colors.successFg : b.lit ? colors.onAccent : colors.fgSecondary;
        // calm and not done: compact — 52 pt, 17 pt, no line under it; Get paid's sum on the right
        // (the Designer on #96)
        const compact = !done && !skipped && !b.lit && !running;
        const link = b.lit && three.skip && onSkip ? (
          <TouchableOpacity key={`${b.key}-skip`} style={s.skip} onPress={() => onSkip(three.skip.key)} disabled={off}
            accessibilityRole="button" accessibilityHint="Asks why">
            <Text style={s.skipText}>{three.skip.words}</Text>
          </TouchableOpacity>
        ) : null;
        if (compact) {
          return (
            <TouchableOpacity key={b.key} style={[s.btn, s.compact, tone, off && s.off]} disabled={off} onPress={() => onPress(b.key)}
              accessibilityRole="button" accessibilityLabel={b.label} accessibilityState={{ busy: false, disabled: off }}>
              <Icon name={b.icon} size={24} color={fg} />
              <Text style={[s.title, s.titleCompact, s.grow, { color: fg }]} numberOfLines={1}>{b.title}</Text>
              {b.key === 'pay' && b.line ? <Text style={[s.titleCompact, s.side]} numberOfLines={1}>{b.line}</Text> : null}
            </TouchableOpacity>
          );
        }
        return (
          <React.Fragment key={b.key}>
            <TouchableOpacity style={[s.btn, tone, off && !running && s.off]} disabled={off} onPress={() => onPress(b.key)}
              accessibilityRole="button" accessibilityLabel={running ? BUSY_LABELS[b.key] : b.label}
              accessibilityHint={b.lit ? 'Next step' : undefined} accessibilityState={{ busy: running, disabled: off }}>
              {running ? <ActivityIndicator color={fg} style={s.icon} /> : <Icon name={done ? 'checkc' : b.icon} size={24} color={fg} />}
              <View style={s.btnBody}>
                <Text style={[s.title, (done || skipped) && s.titleDone, { color: skipped ? colors.fgDefault : fg }]} numberOfLines={1} adjustsFontSizeToFit>{running ? BUSY_WORDS[b.key] : b.title}</Text>
                {!running && b.line ? <Text style={[s.line, { color: lineFg }]} numberOfLines={1}>{b.line}</Text> : null}
              </View>
            </TouchableOpacity>
            {link}
          </React.Fragment>
        );
      })}
      {failure ? <Text style={s.fail} accessibilityLiveRegion="polite" accessibilityRole="alert">{failure}</Text> : null}
    </View>
  );
}
// The row in the visit's foot (design-mockups/app-dock m1–m4, README «Для Фулстека»): three tiles
// side by side, always Signature · Get paid · Send bill, the same place before and after Finish;
// after Finish the next one is the orange tile (no big button over the row). A tile: 64 pt, the
// icon 22 on top, the word 15 pt, a line 13 pt (three.js tileOf). Skip — under the row; a refusal —
// the red line under it. The VoiceOver words are the old buttons' (b.label).
export function ThreeTiles({ three, busy = null, failure = null, onPress, onSkip = null }) {
  if (!three || three.kind !== 'three' || !three.buttons.length) return null;
  const off = !!busy;
  return (
    <View style={s.tilesWrap}>
      <View style={s.tiles}>
        {three.buttons.map((b) => {
          const running = busy === b.key;
          const done = b.state === 'done';
          const skipped = b.state === 'skipped';
          const tone = done ? (b.warn ? s.waiting : s.done) : skipped ? s.skipped : b.lit ? s.lit : s.calm;
          const fg = done ? colors.successFg : skipped ? colors.fgDefault : b.lit ? colors.onAccent : colors.brandPressed;
          const lineFg = done ? colors.successFg : b.lit ? colors.onAccent : colors.fgSecondary;
          const t = tileOf(b, running);
          const icon = done ? 'checkc' : skipped ? 'skipc' : b.icon;
          return (
            <TouchableOpacity key={b.key} style={[s.tile, tone, off && !running && s.off]} disabled={off} onPress={() => onPress(b.key)}
              accessibilityRole="button" accessibilityLabel={running ? BUSY_LABELS[b.key] : b.label}
              accessibilityHint={b.lit ? 'Next step' : undefined} accessibilityState={{ busy: running, disabled: off }}>
              {running ? <ActivityIndicator color={fg} style={s.tileIcon} /> : <Icon name={icon} size={22} color={skipped ? colors.fgSecondary : fg} />}
              <Text style={[s.tileWord, b.lit && s.tileWordLit, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>{t.word}</Text>
              {t.line ? <Text style={[s.tileLine, { color: lineFg }]} numberOfLines={1} adjustsFontSizeToFit>{t.line}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {three.skip && onSkip && three.lit ? (
        <TouchableOpacity style={s.skip} onPress={() => onSkip(three.skip.key)} disabled={off} accessibilityRole="button" accessibilityHint="Asks why">
          <Text style={s.skipText}>{three.skip.words}</Text>
        </TouchableOpacity>
      ) : null}
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
  // a skipped step (design app-skip .act.skp): grey, two lines, still pressable
  skipped: { backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle },
  // the quiet link under the orange one (.sk): centred, 44 pt, 17 pt 700, underlined
  skip: { alignSelf: 'center', minHeight: 44, marginTop: -8, marginBottom: -6, paddingHorizontal: 14, justifyContent: 'center' },
  skipText: { fontSize: 17, fontWeight: '700', color: colors.fgSecondary, textDecorationLine: 'underline' },
  off: { opacity: 0.5 },
  icon: { width: 24 },
  btnBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, fontWeight: '800' },
  titleDone: { fontSize: 17 },
  compact: { minHeight: 52 },
  titleCompact: { fontSize: 17 },
  grow: { flex: 1, minWidth: 0 },
  side: { fontWeight: '400', color: colors.fgSecondary },
  line: { fontSize: 15, lineHeight: 20 },
  fail: { fontSize: 15, lineHeight: 20, color: colors.dangerFg },
  // the row of tiles (app-dock): three equal columns, 8 apart
  tilesWrap: { gap: 10 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, minHeight: 64, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 9, paddingBottom: 8, paddingHorizontal: 6, borderRadius: 14, borderWidth: 1.5, gap: 2 },
  tileIcon: { height: 22 },
  tileWord: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  tileWordLit: { fontWeight: '800' },
  tileLine: { fontSize: 13, lineHeight: 16 },
});
