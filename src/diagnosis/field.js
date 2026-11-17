// The diagnosis field of «How did it end?» (design-mockups/visit-diagnosis app-finish), apart
// from parts.js: the Finish sheet (myDay/visitBar.js) uses it, and parts.js uses that sheet.
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { DIAGNOSIS_HINT, DIAGNOSIS_MAX } from './model';

// The field in «How did it end?» (design app-finish): «Diagnosis · optional» for now (Д-2 makes
// it required with D2-BE), the text of the visit to start with. failure: its save got no answer
export function FinishDiagnosisField({ text, failure, sending, onChangeText }) {
  return (
    <View style={s.finish}>
      <Text style={s.finishLabel}>Diagnosis<Text style={s.finishOpt}> · optional</Text></Text>
      <TextInput style={s.finishField} value={text} onChangeText={onChangeText} multiline editable={!sending}
        maxLength={DIAGNOSIS_MAX} placeholder={DIAGNOSIS_HINT} placeholderTextColor={colors.fgMutedField}
        textAlignVertical="top" accessibilityLabel="Diagnosis, printed on the bill" />
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
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  failText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.warningFg },
});
