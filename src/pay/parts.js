// The pieces the Pay screens share (design-mockups/payments app.css, classes pp-* over the
// bill's iv-*): the chip and TOTAL / PAID / DUE at the top, the pill choices, a radio card,
// the six method tiles, a labelled field, the history of payments. Colours only tokens.
import React from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { METHODS } from './model';
import { PHOTO_ADDED, PHOTO_ASK, PHOTO_NOTE } from './checkPhoto';

// The chip over the numbers: given (green), issued not given (amber), draft or void (grey)
const CHIP = {
  done: [colors.successFg, colors.successBg, colors.successBorder, 'check'],
  warn: [colors.warningFg, colors.warningBg, colors.warningBorder, 'info'],
  neutral: [colors.neutralFg, colors.neutralBg, colors.neutralBorder, 'doc'],
};
export function Chip({ chip }) {
  const [fg, bg, border, icon] = CHIP[chip.kind] || CHIP.neutral;
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: border }]} accessible accessibilityLabel={chip.text}>
      <Icon name={icon} size={16} color={fg} />
      <Text style={[styles.chipText, { color: fg }]} numberOfLines={2}>{chip.text}</Text>
    </View>
  );
}

// TOTAL | PAID | DUE in one card
export function Numbers({ rows }) {
  return (
    <View style={styles.numbers}>
      {rows.map((r, i) => (
        <View key={r.key} style={[styles.number, i > 0 && styles.numberNext]} accessible accessibilityLabel={`${r.label} ${r.value}`}>
          <Text style={styles.numberLabel}>{r.label.toUpperCase()}</Text>
          <Text style={[styles.numberValue, r.key === 'due' && styles.numberDue]} numberOfLines={1} adjustsFontSizeToFit>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

// The head of a step: COLLECT FOR NY-1048 / $100.00 / Part of $175.29 · $75.29 left after this
export function BigHead({ label, big, sub }) {
  return (
    <View style={styles.bigHead} accessible accessibilityLabel={[label, big, sub].filter(Boolean).join(', ')}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>{big}</Text>
      {sub ? <Text style={styles.bigSub}>{sub}</Text> : null}
    </View>
  );
}

// A white section with its label (and «Required» on the right)
export function Section({ label, need = false, children, style }) {
  return (
    <View style={[styles.section, style]}>
      {label ? (
        <View style={styles.sectionHead}>
          <Text style={styles.label} accessibilityRole="header">{label.toUpperCase()}</Text>
          {need ? <Text style={styles.need}>Required</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// Pills in a row that wrap: «✓ Full balance $175.29» «Part of it»
export function Pills({ items, value, onPick, off = false }) {
  return (
    <View style={styles.pills} accessibilityRole="radiogroup">
      {items.map((it) => {
        const on = value === it.key;
        return (
          <TouchableOpacity key={it.key} style={[styles.pill, on && styles.pillOn]} onPress={() => onPick(on && it.toggle ? null : it.key)} disabled={off}
            accessibilityRole="radio" accessibilityState={{ checked: on, disabled: off }} accessibilityLabel={it.label}>
            {on ? <Icon name="check" size={18} color={colors.brandPressed} /> : null}
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// A radio card (design .iv-opt): title and the words under it
export function Choice({ on, title, sub, onPress, off = false }) {
  return (
    <TouchableOpacity style={[styles.choice, on && styles.choiceOn]} onPress={onPress} disabled={off}
      accessibilityRole="radio" accessibilityState={{ checked: on, disabled: off }} accessibilityLabel={sub ? `${title}. ${sub}` : title}>
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.flex}>
        <Text style={styles.choiceText}>{title}</Text>
        {sub ? <Text style={styles.choiceSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// PAY WITH: Cash Check Card / Zelle Venmo Other (only: the methods to show)
export function MethodTiles({ value, onPick, only = null, off = false }) {
  const list = only ? METHODS.filter((m) => only.includes(m.method)) : METHODS;
  return (
    <View style={styles.tiles} accessibilityRole="radiogroup">
      {list.map((m) => {
        const on = value === m.method;
        return (
          <TouchableOpacity key={m.method} style={[styles.tile, on && styles.tileOn]} onPress={() => onPick(m.method)} disabled={off}
            accessibilityRole="radio" accessibilityState={{ checked: on, disabled: off }} accessibilityLabel={m.word}>
            <Icon name={m.icon} size={26} color={colors.brandPressed} />
            <Text style={[styles.tileText, on && styles.tileTextOn]}>{m.word}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// NOTE · optional and its field
// off: shown, not editable (a payment sent without an answer keeps what it sent, pay/attempts.js)
export function Field({ label, optional = false, value, onChange, placeholder, hint = null, max = 500, keyboard = 'default', big = false, prefix = null, autoFocus = false, a11y = null, off = false }) {
  return (
    <View style={styles.field}>
      {label ? (
        <Text style={styles.label}>
          {label.toUpperCase()}
          {optional ? <Text style={styles.optional}> · optional</Text> : null}
        </Text>
      ) : null}
      <View style={[styles.inputWrap, big && styles.inputBig]}>
        {prefix ? <Text style={[styles.prefix, big && styles.prefixBig]}>{prefix}</Text> : null}
        <TextInput style={[styles.input, big && styles.inputBigText]} value={value} onChangeText={onChange} placeholder={placeholder}
          placeholderTextColor={colors.fgMutedField} maxLength={max} keyboardType={keyboard} autoCorrect={false} autoFocus={autoFocus}
          returnKeyType="done" accessibilityLabel={a11y || label || placeholder} editable={!off} />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

// The photo of a check (design method-check, «pp-shot»): not taken — a row with the camera, the
// photo is optional; taken — green, a thumbnail of it, «Retake». photo: { uri } or null
export function CheckPhotoRow({ photo, onTake, off = false }) {
  if (!photo) {
    return (
      <TouchableOpacity style={styles.shotAsk} onPress={onTake} disabled={off} accessibilityRole="button"
        accessibilityLabel={`${PHOTO_ASK}, optional`} accessibilityState={{ disabled: off }}>
        <View style={styles.shotIcon}><Icon name="camera" size={24} color={colors.brandPressed} /></View>
        <View style={styles.flex}>
          <Text style={styles.shotAskTitle}>{PHOTO_ASK}</Text>
          <Text style={styles.shotSub}>{`Optional. ${PHOTO_NOTE}`}</Text>
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.shot}>
      <Image source={{ uri: photo.uri }} style={styles.shotThumb} accessibilityIgnoresInvertColors accessible={false} />
      <View style={styles.flex}>
        <Text style={styles.shotTitle}>{PHOTO_ADDED}</Text>
        <Text style={styles.shotSub}>{PHOTO_NOTE}</Text>
      </View>
      <TouchableOpacity style={styles.shotLink} onPress={onTake} disabled={off} accessibilityRole="button" accessibilityLabel="Retake the photo of the check">
        <Text style={styles.shotLinkText}>Retake</Text>
      </TouchableOpacity>
    </View>
  );
}

// HISTORY · 2 PAYMENTS: the rows of model.historyOf; a void link on one's own fresh record
export function History({ rows, label, onVoid, off = false }) {
  return (
    <Section label={label}>
      {rows.length ? rows.map((r, i) => (
        <View key={r.key} style={[styles.payRow, i > 0 && styles.payRowNext, r.voided && styles.payRowVoid]} accessible
          accessibilityLabel={[r.title, r.sub, r.amount, r.voided ? r.voidLine : null].filter(Boolean).join(', ')}>
          <View style={styles.payTop}>
            <Text style={[styles.payTitle, r.voided && styles.struck]}>{r.title}</Text>
            <Text style={[styles.payAmount, r.voided && styles.struck, r.tip && styles.payTip]}>{r.amount}</Text>
          </View>
          {r.sub ? <Text style={styles.paySub}>{r.sub}</Text> : null}
          {r.voidLine ? <Text style={styles.voidLine}>{r.voidLine}</Text> : null}
          {r.voidLeft > 0 && onVoid ? (
            <TouchableOpacity style={styles.voidLink} onPress={() => onVoid(r)} disabled={off} accessibilityRole="button" accessibilityLabel={`Void ${r.amount}, ${r.voidLeft} minutes left`}>
              <Icon name="ban" size={18} color={colors.dangerFg} />
              <Text style={styles.voidText}>{`Void · ${r.voidLeft} min left`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )) : <Text style={styles.quiet}>No payments yet</Text>}
    </Section>
  );
}

export const payStyles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  gap: { marginHorizontal: 16, marginTop: 12 },
  body: { paddingBottom: 40 },
  sheetTitle: { fontSize: 26, fontWeight: '800', color: colors.fgDefault },
  sheetSub: { fontSize: 16, lineHeight: 21, color: colors.fgSecondary },
  sheetBody: { gap: 12 },
  failed: { fontSize: 15, lineHeight: 20, color: colors.dangerFg },
  plainLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  plainLinkText: { fontSize: 17, fontWeight: '700', color: colors.fgDefault, textDecorationLine: 'underline' },
  danger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: colors.dangerBorder, backgroundColor: colors.dangerBg },
  dangerOff: { opacity: 0.5 },
  dangerText: { fontSize: 19, fontWeight: '800', color: colors.dangerFg },
  hint: { paddingHorizontal: 16, paddingTop: 10, fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  text: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard, fontSize: 17, color: colors.fgDefault },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shotAsk: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  shotIcon: { width: 52, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: colors.borderDefault },
  shotAskTitle: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  shot: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, paddingLeft: 10, paddingRight: 4, borderRadius: 12, borderWidth: 1.5, borderColor: colors.successBorder, backgroundColor: colors.successBg },
  shotThumb: { width: 52, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  shotTitle: { fontSize: 15, fontWeight: '700', color: colors.successFg },
  shotSub: { fontSize: 13, lineHeight: 17, color: colors.fgSecondary },
  shotLink: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  shotLinkText: { fontSize: 15, fontWeight: '700', color: colors.brandPressed },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  chipText: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  numbers: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  number: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  numberNext: { borderLeftWidth: 1, borderLeftColor: colors.borderDefault },
  numberLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1, color: colors.fgSecondary },
  numberValue: { fontSize: 22, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  numberDue: { color: colors.brandPressed },
  bigHead: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  big: { fontSize: 44, lineHeight: 52, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  bigSub: { fontSize: 16, lineHeight: 21, color: colors.fgSecondary },
  section: { marginTop: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 10, backgroundColor: colors.bgCard, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSubtle },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 1.3, color: colors.fgSecondary },
  optional: { fontWeight: '600', letterSpacing: 0, color: colors.fgSecondary },
  need: { fontSize: 14, fontWeight: '700', color: colors.warningFg },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  pillOn: { borderWidth: 2, paddingHorizontal: 13.5, borderColor: colors.brandPressed, backgroundColor: colors.brandSoft },
  pillText: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  pillTextOn: { color: colors.brandPressed },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  choiceOn: { borderWidth: 2, paddingHorizontal: 13.5, paddingVertical: 11.5, borderColor: colors.brand, backgroundColor: colors.brandSoft },
  radio: { width: 22, height: 22, marginTop: 1, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  choiceText: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  choiceSub: { marginTop: 2, fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.6%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 68, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  tileOn: { borderWidth: 2.5, borderColor: colors.brandPressed, backgroundColor: colors.brandSoft },
  tileText: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  tileTextOn: { color: colors.brandPressed },
  field: { gap: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  inputBig: { minHeight: 64, borderWidth: 2, borderColor: colors.brand },
  prefix: { marginRight: 8, fontSize: 18, fontWeight: '700', color: colors.fgSecondary },
  prefixBig: { fontSize: 24 },
  input: { flex: 1, minHeight: 48, fontSize: 17, color: colors.fgDefault },
  inputBigText: { fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  quiet: { fontSize: 16, color: colors.fgSecondary },
  payRow: { paddingVertical: 10, gap: 2 },
  payRowNext: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  payRowVoid: { backgroundColor: colors.bgSubtle },
  payTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  payTitle: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  payAmount: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  payTip: { color: colors.fgSecondary },
  paySub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  struck: { textDecorationLine: 'line-through', color: colors.fgSecondary },
  voidLine: { fontSize: 14, lineHeight: 19, color: colors.dangerFg },
  // 44 pt to press, without an empty line under it: it takes the row's bottom padding
  voidLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, marginTop: -4, marginBottom: -10 },
  voidText: { fontSize: 16, fontWeight: '700', color: colors.dangerFg },
});
