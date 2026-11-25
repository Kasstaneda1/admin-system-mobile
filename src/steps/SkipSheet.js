// «Why no …?» — the sheet of a skip (VS-APP, design-mockups/app-skip k4, k5, k7): a tap on a reason
// is the skip (no second button), «Other…» — a one-line field and the orange button with the
// link's words. No signal or a refusal: the sheet stays with a yellow line (no queue: a skip is not
// the customer's signature, doing it again is easy). Words — steps/skip.js SKIPS.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { Sheet, fieldFocused } from '../myDay/visitBar';
import { keyboardFirst } from '../myDay/keyboardTap';
import { OTHER_REASON, REASON_MAX, SKIPS, skipReason } from './skip';

// stepKey: the step (omw, signs, collect, give) or null (closed); sending: the reason in flight;
// failure: the yellow line's words; onSkip(reason)
export default function SkipSheet({ stepKey, sending = null, failure = null, bottom, onSkip, onClose }) {
  const words = stepKey ? SKIPS[stepKey] : null;
  const [other, setOther] = useState(false);
  const [typed, setTyped] = useState('');
  useEffect(() => { if (stepKey) { setOther(false); setTyped(''); } }, [stepKey]);
  const busy = !!sending;
  const ready = !!skipReason(typed);
  // «Other…» open, the keyboard up: the first tap on a reason or a button only puts it away — a
  // stray tap on a reason above the field is not a skip (myDay/keyboardTap.js); Done on the
  // keyboard still skips with the words written
  const tap = (fn) => keyboardFirst(Keyboard, fn, fieldFocused);
  return (
    <Sheet visible={!!words} onClose={busy ? () => {} : onClose} bottom={bottom} keyboard>
      {words ? (
        <>
          <Text style={styles.step}>{words.link.toUpperCase()}</Text>
          <Text style={styles.title} accessibilityRole="header">{words.title}</Text>
          <Text style={styles.sub}>{words.sub}</Text>
          <View style={styles.list}>
            {words.reasons.map((r) => {
              const mine = sending === r;
              return (
                <TouchableOpacity key={r} style={[styles.reason, mine && styles.reasonOn, busy && !mine && styles.off]} disabled={busy}
                  onPress={tap(() => onSkip(r))} accessibilityRole="button" accessibilityHint={`Skips ${words.hint} with this reason`}>
                  <Text style={styles.reasonText}>{r}</Text>
                  {mine ? <ActivityIndicator color={colors.brandPressed} /> : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.reason, other && styles.reasonOn, busy && styles.off]} disabled={busy}
              onPress={tap(() => setOther(true))} accessibilityRole="button" accessibilityState={{ selected: other }}>
              <Text style={styles.reasonText}>{OTHER_REASON}</Text>
              <Text style={styles.write}>Write it</Text>
            </TouchableOpacity>
          </View>
          {other ? (
            <>
              <TextInput style={styles.field} value={typed} onChangeText={(t) => setTyped(t.replace(/[\r\n]+/g, ' '))} autoFocus editable={!busy}
                maxLength={REASON_MAX} returnKeyType="done" blurOnSubmit onSubmitEditing={() => { if (ready) onSkip(skipReason(typed)); }}
                accessibilityLabel="Why, in your words" />
              <Text style={styles.help}>One line, up to 300 characters.</Text>
              <TouchableOpacity style={[styles.main, !ready && styles.mainOff]} disabled={!ready || busy} onPress={tap(() => onSkip(skipReason(typed)))}
                accessibilityRole="button" accessibilityState={{ disabled: !ready || busy, busy }}>
                {busy && sending === skipReason(typed) ? <ActivityIndicator color={colors.onAccent} />
                  : <Text style={[styles.mainText, !ready && styles.mainTextOff]}>{words.link}</Text>}
              </TouchableOpacity>
            </>
          ) : null}
          {failure ? (
            <View style={styles.fail} accessibilityLiveRegion="polite">
              <Icon name="warn" size={18} color={colors.warningFg} />
              <Text style={styles.failText}>{failure}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.back} onPress={tap(onClose)} disabled={busy} accessibilityRole="button">
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  step: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.fgSecondary },
  title: { fontSize: 24, fontWeight: '800', color: colors.fgDefault, marginTop: -4 },
  sub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary, marginTop: -4 },
  list: { gap: 8 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  reasonOn: { borderWidth: 2.5, paddingHorizontal: 13, borderColor: colors.brandPressed, backgroundColor: colors.brandSoft },
  reasonText: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.fgDefault },
  write: { fontSize: 15, color: colors.fgSecondary },
  off: { opacity: 0.45 },
  field: { minHeight: 52, paddingHorizontal: 12, borderRadius: 14, borderWidth: 2, borderColor: colors.focusRing, fontSize: 16, color: colors.fgDefault, backgroundColor: colors.bgCard },
  help: { fontSize: 14, color: colors.fgSecondary, marginTop: -4 },
  main: { height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  mainOff: { backgroundColor: colors.bgSunken },
  mainText: { fontSize: 18, fontWeight: '800', color: colors.onAccent },
  mainTextOff: { color: colors.fgDisabled },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  failText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.warningFg },
  back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 17, fontWeight: '700', color: colors.fgDefault, textDecorationLine: 'underline' },
});
