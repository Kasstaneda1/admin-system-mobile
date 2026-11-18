// The diagnosis field of «How did it end?» (design-mockups/visit-diagnosis app-finish), apart
// from parts.js: the Finish sheet (myDay/visitBar.js) uses it, and parts.js uses that sheet.
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { DIAGNOSIS_HINT, DIAGNOSIS_MAX, DIAGNOSIS_REQUIRED_HINT, diagnosisToSend } from './model';

// The field in «How did it end?» (design app-finish, app-finish-empty): «Diagnosis · optional»,
// or «· required» (Д-2: a diagnostics visit, Estimate needed) — empty, a red frame and the words
// why; the text of the visit to start with. failure: its save got no answer; onFocus: the sheet
// scrolls the field into view above the keyboard
export function FinishDiagnosisField({ text, failure, sending, required = false, onChangeText, onFocus }) {
  const missing = required && !diagnosisToSend(text);
  return (
    <View style={s.finish}>
      <Text style={s.finishLabel}>Diagnosis<Text style={s.finishOpt}>{required ? ' · required' : ' · optional'}</Text></Text>
      <TextInput style={[s.finishField, missing && s.finishMissing]} value={text} onChangeText={onChangeText} onFocus={onFocus} multiline editable={!sending}
        maxLength={DIAGNOSIS_MAX} placeholder={DIAGNOSIS_HINT} placeholderTextColor={colors.fgMutedField}
        textAlignVertical="top" accessibilityLabel={required ? 'Diagnosis, required, printed on the bill' : 'Diagnosis, printed on the bill'} />
      {missing ? (
        <View style={s.need} accessibilityRole="alert">
          <Icon name="warn" size={16} color={colors.dangerFg} />
          <Text style={s.needText}>{DIAGNOSIS_REQUIRED_HINT}</Text>
        </View>
      ) : null}
      {failure ? (
        <View style={s.fail} accessibilityRole="alert">
          <Icon name="wifioff" size={16} color={colors.warningFg} />
          <Text style={s.failText}>{failure}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  // the Finish field (design .vd-f, .vd-l, .vd-ta)
  finish: { gap: 6, marginTop: 4 },
  finishLabel: { fontSize: 14, fontWeight: '700', color: colors.fgSecondary },
  finishOpt: { fontWeight: '500', color: colors.fgMutedField },
  finishField: { minHeight: 96, maxHeight: 180, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: colors.brand, fontSize: 16, lineHeight: 22, color: colors.fgDefault, backgroundColor: colors.bgCard },
  finishMissing: { borderColor: colors.dangerBorder },
  need: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  needText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.dangerFg },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  failText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.warningFg },
});
