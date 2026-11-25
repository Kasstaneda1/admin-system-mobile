// The three buttons of the bill and the bill's row on the visit (T3, design-mockups/tech-bill-plain
// README «Для Фулстека» — «Три кнопки — вид»; the states come from three.js threeOf).
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { BUSY_WORDS, tileOf } from './three';

// The bill's row in the visit's body, calm (design-mockups/app-calm p2, p3): no frame, no icon —
// «BILL» in small caps, then «$103.43  Diagnostics $95.00 + tax» and the Change link on the right;
// note — a line under it in dark amber ('Not paid yet' after Finish), or null
export function BillRow({ row, note = null, onChange, onOpen }) {
  if (!row) return null;
  return (
    <TouchableOpacity style={s.row} onPress={onOpen} disabled={!onOpen} accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${row.line}${note ? `, ${note}` : ''}`}>
      <Text style={s.rowHead}>{(row.head || 'Bill').toUpperCase()}</Text>
      <View style={s.rowMain}>
        <Text style={s.rowLine} numberOfLines={2}>
          {row.amount ? <Text style={s.rowAmount}>{`${row.amount}  `}</Text> : null}
          {row.text || row.line}
        </Text>
        {row.change ? (
          <TouchableOpacity style={s.change} onPress={onChange} accessibilityRole="button" accessibilityLabel="Change the bill lines">
            <Text style={s.changeText}>Change</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {note ? <Text style={s.rowNote}>{note}</Text> : null}
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
        <Icon name="check" size={20} color={colors.fgSecondary} />
        <View style={s.btnBody}>
          <Text style={[s.title, s.titleDone, { color: colors.fgDefault }]}>{three.title}</Text>
          {three.line ? <Text style={[s.line, { color: colors.fgSecondary }]}>{three.line}</Text> : null}
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
        const fg = done || skipped ? colors.fgSecondary : b.lit ? colors.onAccent : colors.brandPressed;
        const lineFg = done && b.warn ? colors.warningFg : b.lit ? colors.onAccent : colors.fgSecondary;
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
// Skip under the row (calm p3: «Skip the signature» in brand green like every other link, centred,
// 44 pt to press, underlined)
export function SkipButton({ words, off = false, onPress }) {
  return (
    <TouchableOpacity style={[s.skipBtn, off && s.off]} onPress={onPress} disabled={off} accessibilityRole="button" accessibilityHint="Asks why">
      <Text style={s.skipBtnText} numberOfLines={1} adjustsFontSizeToFit>{words}</Text>
    </TouchableOpacity>
  );
}

// The row in the visit's foot (design-mockups/app-dock m1–m4, calm p2/p3): three tiles side by
// side, always Signature · Get paid · Send bill, the same place before and after Finish; after
// Finish the next one is the orange tile (no big button over the row). Calm: words only in brand
// green (they are pressed, like Call), a grey 1 pt frame, 54 pt; the line under the word 13 pt
// (three.js tileOf: the sum under Get paid, «next» under the orange one); a done one — white, a
// small grey tick and grey words (no green fill); a skipped one — grey. Skip — a link under the
// row; a refusal — the red line under it. The VoiceOver words are the old buttons' (b.label).
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
          const fg = done || skipped ? colors.fgSecondary : b.lit ? colors.onAccent : colors.brandPressed;
          const lineFg = done && b.warn ? colors.warningFg : b.lit ? colors.onAccent : colors.fgSecondary;
          const t = tileOf(b, running);
          return (
            <TouchableOpacity key={b.key} style={[s.tile, b.lit && !done && !skipped ? s.tileLit : s.tileCalm, off && !running && s.off]} disabled={off} onPress={() => onPress(b.key)}
              accessibilityRole="button" accessibilityLabel={running ? BUSY_LABELS[b.key] : b.label}
              accessibilityHint={b.lit ? (b.mode === 'optional' ? 'Next step, optional' : 'Next step') : undefined} accessibilityState={{ busy: running, disabled: off }}>
              {running ? <ActivityIndicator color={fg} style={s.tileIcon} /> : null}
              <View style={s.tileWordRow}>
                {done && !running ? <Icon name="check" size={14} color={colors.fgSecondary} /> : null}
                <Text style={[s.tileWord, b.lit && s.tileWordLit, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>{t.word}</Text>
              </View>
              {t.line ? <Text style={[s.tileLine, { color: lineFg }]} numberOfLines={1} adjustsFontSizeToFit>{t.line}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {three.skip && onSkip && three.lit ? <SkipButton words={three.skip.words} off={off} onPress={() => onSkip(three.skip.key)} /> : null}
      {failure ? <Text style={s.fail} accessibilityLiveRegion="polite" accessibilityRole="alert">{failure}</Text> : null}
    </View>
  );
}
const BUSY_LABELS = { sign: 'Saving the signature', pay: 'Recording the payment', send: 'Sending the bill' };

const s = StyleSheet.create({
  row: { gap: 2 },
  rowHead: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, color: colors.fgSecondary },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  rowLine: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, color: colors.fgSecondary },
  rowAmount: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  rowNote: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.warningFg },
  // Change: a link in brand green, 44 pt to press
  change: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 },
  changeText: { fontSize: 16, fontWeight: '600', color: colors.brandPressed, textDecorationLine: 'underline' },
  column: { gap: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  calm: { backgroundColor: colors.bgCard, borderColor: colors.borderDefault },
  lit: { backgroundColor: colors.accent, borderColor: colors.accent },
  // done: white, a grey frame, grey words (calm: no green fill)
  done: { backgroundColor: colors.bgCard, borderColor: colors.borderDefault },
  waiting: { backgroundColor: colors.bgCard, borderColor: colors.borderDefault },
  // a skipped step (design app-skip .act.skp): grey, two lines, still pressable
  skipped: { backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle },
  // the quiet link under the orange one (.sk): centred, 44 pt, 17 pt 700, underlined
  skip: { alignSelf: 'center', minHeight: 44, marginTop: -8, marginBottom: -6, paddingHorizontal: 14, justifyContent: 'center' },
  skipText: { fontSize: 16, fontWeight: '600', color: colors.brandPressed, textDecorationLine: 'underline' },
  off: { opacity: 0.5 },
  icon: { width: 24 },
  btnBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '700' },
  titleDone: { fontSize: 16, fontWeight: '600' },
  compact: { minHeight: 52 },
  titleCompact: { fontSize: 17 },
  grow: { flex: 1, minWidth: 0 },
  side: { fontWeight: '400', color: colors.fgSecondary },
  line: { fontSize: 15, lineHeight: 20 },
  fail: { fontSize: 15, lineHeight: 20, color: colors.dangerFg },
  // the row of tiles (app-dock): three equal columns, 8 apart
  tilesWrap: { gap: 10 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, gap: 1 },
  tileCalm: { backgroundColor: colors.bgCard, borderColor: colors.borderDefault },
  tileLit: { backgroundColor: colors.accent, borderColor: colors.accent },
  tileIcon: { height: 20 },
  tileWordRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  tileWord: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
  tileWordLit: { fontWeight: '700' },
  tileLine: { fontSize: 13, lineHeight: 16 },
  skipBtn: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  skipBtnText: { fontSize: 16, fontWeight: '600', color: colors.brandPressed, textDecorationLine: 'underline' },
});
