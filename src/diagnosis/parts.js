// The diagnosis on the screen (design-mockups/visit-diagnosis: app-visit-empty, app-after,
// app-after-bill; VISIT_DIAGNOSIS_SPEC.md §3.2): the block of the visit and of the bill, and the
// sheet that writes it. What shows and what a press may do is model.js. Sizes in pt, colours
// only tokens; the block's names follow the design's vd-*.
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { Sheet } from '../myDay/visitBar';
import { DIAGNOSIS_HINT, DIAGNOSIS_MAX, LOCKED_HINT, diagnosisLength, diagnosisReady } from './model';

// «Printed on the bill» beside the title (design .vd-print)
export function PrintedPill() {
  return (
    <View style={s.pill} accessible accessibilityLabel="Printed on the bill">
      <Icon name="doc" size={13} color={colors.infoFg} />
      <Text style={s.pillText}>Printed on the bill</Text>
    </View>
  );
}

// The title row of the block: DIAGNOSIS and the pill
export function DiagnosisHead() {
  return (
    <View style={s.head}>
      <Text style={s.label} accessibilityRole="header">DIAGNOSIS</Text>
      <PrintedPill />
    </View>
  );
}

// The block's body: block — model.js diagnosisBlock / billDiagnosis; blocked: why nothing can
// be written now ('Needs connection'), or null; changed: under the text, what it was before the
// office's edit (visit.js updatedOf), or null; onPress: the button (block.mode)
export function DiagnosisBody({ block, blocked = null, changed = null, onPress }) {
  const off = !!blocked;
  const wide = block.mode === 'write' || block.mode === 'add';
  return (
    <>
      {block.mode === 'write' && block.hint ? <Text style={s.hint}>{block.hint}</Text> : null}
      {block.text ? (
        <View style={changed ? s.chg : null}>
          <Text style={s.text} selectable>{block.text}</Text>
          {block.by ? <Text style={s.by}>{block.by}</Text> : null}
          {changed}
        </View>
      ) : null}
      {!block.text && !block.mode && !block.addenda.length ? <Text style={s.quiet}>No diagnosis written</Text> : null}
      {block.addenda.map((a) => (
        <View key={a.key} style={s.add} accessible accessibilityLabel={`${a.head}. ${a.text}`}>
          <Text style={s.addHead}>{a.head}</Text>
          <Text style={s.addText}>{a.text}</Text>
        </View>
      ))}
      {block.button ? (
        <TouchableOpacity style={[wide ? s.wide : s.small, off && s.off]} disabled={off} onPress={onPress} accessibilityRole="button"
          accessibilityState={{ disabled: off }}>
          <Icon name="note" size={18} color={colors.brandPressed} />
          <Text style={wide ? s.wideText : s.smallText}>{block.button}</Text>
        </TouchableOpacity>
      ) : null}
      {block.mode === 'add' && block.hint ? <Text style={s.hint}>{block.hint}</Text> : null}
      {block.button && blocked ? <Text style={s.blocked}>{blocked}</Text> : null}
    </>
  );
}

// The sheet that writes the diagnosis (mode 'write' | 'edit') or adds to it ('add').
// current: the visit's text now (Save is off while the field says the same); sending: the save
// waits for the server; failure: the words of no answer (Try again: the same request) or of
// the bill issued meanwhile; conflict: { text, by } of «Someone changed it before you» —
// onUseTheirs drops this text, onSaveMine writes it over theirs
export function DiagnosisSheet({ visible, mode, text, current, sending, failure, conflict, bottom, onChangeText, onSave, onUseTheirs, onSaveMine, onClose }) {
  const adding = mode === 'add';
  const ready = diagnosisReady(mode, text, current);
  const off = !!sending || !ready;
  const length = diagnosisLength(text);
  const title = adding ? 'Add to diagnosis' : mode === 'edit' ? 'Edit diagnosis' : 'Add diagnosis';
  return (
    <Sheet visible={visible} onClose={sending ? () => {} : onClose} bottom={bottom} keyboard>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollBody} keyboardShouldPersistTaps="handled">
        <View style={s.sheetHead}>
          <Text style={s.title} accessibilityRole="header">{title}</Text>
          {adding ? null : <PrintedPill />}
        </View>
        <Text style={s.sub}>{adding ? LOCKED_HINT : 'The customer will see this on the bill.'}</Text>
        <TextInput style={s.field} value={text} onChangeText={onChangeText} multiline autoFocus={!conflict} editable={!sending}
          maxLength={DIAGNOSIS_MAX} placeholder={adding ? 'What should be added?' : DIAGNOSIS_HINT} placeholderTextColor={colors.fgMutedField}
          textAlignVertical="top" accessibilityLabel={adding ? 'Addition to the diagnosis' : 'Diagnosis'} />
        {length > DIAGNOSIS_MAX - 200 ? <Text style={s.count}>{`${length} / ${DIAGNOSIS_MAX}`}</Text> : null}
        {conflict ? (
          <View style={s.conflict} accessibilityRole="alert">
            <View style={s.conflictTop}>
              <Icon name="warn" size={16} color={colors.warningFg} />
              <Text style={s.conflictTitle}>Someone changed the diagnosis before you</Text>
            </View>
            <Text style={s.conflictBy}>{conflict.by}</Text>
            <Text style={s.conflictText} selectable>{conflict.text || 'They cleared it.'}</Text>
            <Text style={s.conflictAsk}>Keep their text, or save yours over it?</Text>
          </View>
        ) : null}
        {failure && !conflict ? (
          <View style={s.fail} accessibilityRole="alert">
            <Icon name="wifioff" size={16} color={colors.warningFg} />
            <Text style={s.failText}>{failure}</Text>
          </View>
        ) : null}
      </ScrollView>
      {conflict ? (
        <>
          <TouchableOpacity style={[s.primary, sending && s.off]} disabled={!!sending} onPress={onSaveMine} accessibilityRole="button"
            accessibilityState={{ disabled: !!sending, busy: !!sending }}>
            {sending ? <ActivityIndicator color={colors.fgOnFill} /> : <Text style={s.primaryText}>Save mine instead</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.ghost} disabled={!!sending} onPress={onUseTheirs} accessibilityRole="button">
            <Text style={s.ghostText}>Keep their text</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={[s.primary, off && s.off]} disabled={off} onPress={onSave} accessibilityRole="button"
          accessibilityState={{ disabled: off, busy: !!sending }}>
          {sending ? <ActivityIndicator color={colors.fgOnFill} /> : (
            <>
              <Icon name="check" size={20} color={colors.fgOnFill} />
              <Text style={s.primaryText}>{failure ? 'Try again' : adding ? 'Add to diagnosis' : 'Save diagnosis'}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      <TouchableOpacity style={s.plain} onPress={onClose} disabled={!!sending} accessibilityRole="button">
        <Text style={s.plainText}>Cancel</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.fgSecondary },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.infoBg },
  pillText: { fontSize: 12, fontWeight: '700', color: colors.infoFg },
  hint: { fontSize: 14, lineHeight: 20, color: colors.fgSecondary },
  text: { fontSize: 16, lineHeight: 23, color: colors.fgDefault },
  by: { marginTop: 4, fontSize: 13, color: colors.fgSecondary },
  quiet: { fontSize: 15, lineHeight: 20, color: colors.fgMutedField },
  chg: { marginHorizontal: -2, paddingVertical: 8, paddingLeft: 12, paddingRight: 10, borderLeftWidth: 4, borderLeftColor: colors.infoBorder, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 10, borderBottomRightRadius: 10, backgroundColor: colors.infoBg },
  // an addition after the bill (design .vd-add): yellow, a stripe on the left
  add: { gap: 2, paddingVertical: 8, paddingRight: 12, paddingLeft: 12, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: colors.warningSolid, backgroundColor: colors.warningBg },
  addHead: { fontSize: 13, fontWeight: '700', color: colors.warningFg },
  addText: { fontSize: 15, lineHeight: 21, color: colors.fgDefault },
  wide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brandPressed, backgroundColor: colors.bgCard },
  wideText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  small: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brandPressed, backgroundColor: colors.bgCard },
  smallText: { fontSize: 16, fontWeight: '700', color: colors.brandPressed },
  off: { opacity: 0.45 },
  blocked: { fontSize: 14, fontWeight: '600', color: colors.fgSecondary },
  // the sheet
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollBody: { gap: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 24, fontWeight: '800', color: colors.fgDefault },
  sub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  field: { minHeight: 120, maxHeight: 220, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: colors.focusRing, fontSize: 16, lineHeight: 22, color: colors.fgDefault, backgroundColor: colors.bgCard },
  count: { alignSelf: 'flex-end', marginTop: -4, fontSize: 13, color: colors.fgMutedField },
  conflict: { gap: 4, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  conflictTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  conflictTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.warningFg },
  conflictBy: { fontSize: 13, fontWeight: '600', color: colors.warningFg },
  conflictText: { fontSize: 15, lineHeight: 21, color: colors.fgDefault },
  conflictAsk: { marginTop: 4, fontSize: 14, color: colors.warningFg },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  failText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.warningFg },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: 14, backgroundColor: colors.brandPressed },
  primaryText: { fontSize: 18, fontWeight: '700', color: colors.fgOnFill },
  ghost: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brandPressed, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  plain: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  plainText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault, textDecorationLine: 'underline' },
});
