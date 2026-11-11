// The bottom of the visit (design A3 final-visit-onway / sched / closed) and its sheets
// (final-finish, final-noaccess). What shows comes from actions.js barOf; nothing here
// decides what may be pressed. Sizes in pt, colours only tokens.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from './Icon';
import { TAG_FAMILIES } from './parts';

// bar: barOf(); pending: { action } while a press waits for the server; failure: { text }
// when it got no answer (Try again sends the same request); blocked: why nothing can be
// pressed now ('Needs connection'), or null; onNote: «Add a note for the office» under a
// closed visit (design final-visit-closed), when notes may be added
export function ActionBar({ bar, pending, failure, blocked, bottom, onPress, onRetry, onCancel, onNote = null }) {
  if (bar.empty && !failure) return null;
  const waiting = !!pending && !failure;
  const off = waiting || !!failure || !!blocked;
  const spinner = (action) => waiting && pending.action === action;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottom, 10) }]}>
      {failure ? (
        <View style={styles.fail} accessibilityRole="alert">
          <Icon name="wifioff" size={16} color={colors.warningFg} />
          <Text style={styles.failText}>{failure.text}</Text>
          <TouchableOpacity style={styles.failBtn} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.failBtnText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.failCancel} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.failCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {bar.undo ? (
        <View style={styles.undo}>
          <Text style={styles.undoText} numberOfLines={2}>
            <Text style={styles.undoStrong}>{bar.undo.text}</Text>{` · ${bar.undo.left}`}
          </Text>
          <TouchableOpacity style={[styles.undoBtn, off && styles.off]} disabled={off} onPress={() => onPress(bar.undo.action)} accessibilityRole="button"
            accessibilityLabel={`Undo: ${bar.undo.text}`} accessibilityState={{ disabled: off, busy: spinner(bar.undo.action) }}>
            {spinner(bar.undo.action) ? <ActivityIndicator color={colors.fgOnFill} /> : (
              <>
                <Icon name="undo" size={16} color={colors.fgOnFill} />
                <Text style={styles.undoBtnText}>Undo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {bar.primary ? (
        <TouchableOpacity style={[styles.main, off && styles.off]} disabled={off} onPress={() => onPress(bar.primary.action)} accessibilityRole="button"
          accessibilityState={{ disabled: off, busy: spinner(bar.primary.action) }}>
          {spinner(bar.primary.action) ? <ActivityIndicator color={colors.onAccent} /> : (
            <>
              <Icon name={bar.primary.icon} size={24} color={colors.onAccent} />
              <Text style={styles.mainText}>{bar.primary.label}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {bar.noAccess ? (
        <TouchableOpacity style={styles.link} disabled={off} onPress={() => onPress('no_access')} accessibilityRole="button" accessibilityState={{ disabled: off }}>
          {spinner('no_access') ? <ActivityIndicator color={colors.fgDefault} /> : (
            <>
              <Icon name="door" size={18} color={off ? colors.fgMutedField : colors.fgDefault} />
              <Text style={[styles.linkText, off && styles.linkOff]}>No access</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {bar.closed ? (
        <View style={styles.closed}>
          <Text style={styles.closedText}>
            <Text style={styles.undoStrong}>{bar.closed.text}</Text>{bar.closed.note ? ` · ${bar.closed.note}` : ''}
          </Text>
        </View>
      ) : null}
      {bar.closed && onNote ? (
        <TouchableOpacity style={[styles.noteBtn, !!blocked && styles.off]} disabled={!!blocked} onPress={onNote} accessibilityRole="button"
          accessibilityState={{ disabled: !!blocked }}>
          <Icon name="note" size={20} color={colors.brandPressed} />
          <Text style={styles.ghostText}>Add a note for the office</Text>
        </TouchableOpacity>
      ) : null}
      {bar.closed && onNote && blocked ? <Text style={styles.blocked}>{blocked}</Text> : null}

      {blocked && (bar.primary || bar.noAccess || bar.undo) ? <Text style={styles.blocked}>{blocked}</Text> : null}
      {bar.line ? <Text style={styles.line}>{bar.line}</Text> : null}
    </View>
  );
}

// A sheet from the bottom over a dimmed screen (the dim under the sheet too, so its round
// corners show). keyboard: the sheet rises above the keyboard (a field in it); onDismiss: after
// it has gone (iOS), e.g. to open the camera, which cannot open over a closing sheet
export function Sheet({ visible, onClose, children, bottom, keyboard = false, onDismiss }) {
  const Wrap = keyboard ? KeyboardAvoidingView : View;
  const wrapProps = keyboard && Platform.OS === 'ios' ? { behavior: 'padding' } : {};
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={onDismiss} statusBarTranslucent>
      <Wrap style={styles.sheetWrap} {...wrapProps}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(bottom, 16) }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          {children}
        </View>
      </Wrap>
    </Modal>
  );
}

// «How did it end?»: choices (actions.js finishChoices), one marked, then Finish visit
export function FinishSheet({ visible, choices, initial, subtitle, bottom, onFinish, onClose }) {
  const [chosen, setChosen] = useState(initial);
  useEffect(() => { if (visible) setChosen(initial); }, [visible, initial]);
  return (
    <Sheet visible={visible} onClose={onClose} bottom={bottom}>
      <Text style={styles.title} accessibilityRole="header">How did it end?</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      <View style={styles.choices} accessibilityRole="radiogroup">
        {choices.map((c) => {
          const on = c.outcome === chosen;
          const [fg, bg, border] = TAG_FAMILIES[c.kind] || TAG_FAMILIES.neutral;
          return (
            <TouchableOpacity key={c.outcome} style={[styles.choice, on && styles.choiceOn]} onPress={() => setChosen(c.outcome)}
              accessibilityRole="radio" accessibilityState={{ checked: on }}>
              <View style={[styles.choiceIcon, { backgroundColor: bg, borderColor: border }]}>
                <Icon name={c.icon} size={22} color={fg} />
              </View>
              <View style={styles.choiceText}>
                <Text style={styles.choiceTitle}>{c.title}</Text>
                <Text style={styles.choiceHint}>{c.hint}</Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={styles.main} onPress={() => onFinish(chosen)} accessibilityRole="button">
        <Icon name="check" size={24} color={colors.onAccent} />
        <Text style={styles.mainText}>Finish visit</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.plain} onPress={onClose} accessibilityRole="button">
        <Text style={styles.plainText}>Back</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

// No access in two steps (actions.js noAccessWords): call the customer first, then close
export function NoAccessSheet({ step, words, bottom, onCall, onNext, onClose, onConfirm }) {
  const w = step === 'close' ? words.close : words.call;
  return (
    <Sheet visible={!!step} onClose={onClose} bottom={bottom}>
      <Text style={styles.step}>{w.step.toUpperCase()}</Text>
      <Text style={styles.title} accessibilityRole="header">{w.title}</Text>
      <Text style={styles.sub}>{w.text}</Text>
      {step === 'close' ? (
        <TouchableOpacity style={styles.main} onPress={onConfirm} accessibilityRole="button">
          <Icon name="door" size={22} color={colors.onAccent} />
          <Text style={styles.mainText}>{w.button}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity style={styles.main} onPress={onCall} accessibilityRole="button">
            <Icon name="phone" size={22} color={colors.onAccent} />
            <Text style={styles.mainText}>{w.button}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghost} onPress={onNext} accessibilityRole="button">
            <Text style={styles.ghostText}>{w.skip}</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.plain} onPress={onClose} accessibilityRole="button">
        <Text style={styles.plainText}>Back</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.borderDefault, backgroundColor: colors.bgCard },
  off: { opacity: 0.45 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, paddingLeft: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.infoBorder, backgroundColor: colors.infoBg },
  undoText: { flex: 1, fontSize: 15, lineHeight: 20, color: colors.infoFg },
  undoStrong: { fontWeight: '700' },
  undoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 96, height: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.infoFg },
  undoBtnText: { fontSize: 16, fontWeight: '700', color: colors.fgOnFill },
  main: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60, borderRadius: 14, backgroundColor: colors.accent },
  mainText: { fontSize: 20, fontWeight: '800', color: colors.onAccent },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 },
  linkText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault, textDecorationLine: 'underline' },
  linkOff: { color: colors.fgMutedField },
  blocked: { fontSize: 14, fontWeight: '600', color: colors.fgSecondary, textAlign: 'center' },
  line: { fontSize: 15, color: colors.fgSecondary, textAlign: 'center', paddingVertical: 4 },
  closed: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.successBorder, backgroundColor: colors.successBg },
  closedText: { fontSize: 15, lineHeight: 20, color: colors.successFg },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, paddingLeft: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  failText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.warningFg },
  failBtn: { height: 44, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  failBtnText: { fontSize: 15, fontWeight: '700', color: colors.fgOnFill },
  failCancel: { height: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  failCancelText: { fontSize: 15, fontWeight: '600', color: colors.warningFg, textDecorationLine: 'underline' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  sheet: { paddingHorizontal: 16, paddingTop: 8, gap: 10, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.bgCard },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 6, backgroundColor: colors.borderStrong },
  step: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.fgSecondary },
  title: { fontSize: 24, fontWeight: '800', color: colors.fgDefault },
  sub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  choices: { gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  choiceOn: { borderWidth: 2, borderColor: colors.brandPressed, backgroundColor: colors.brandSoft },
  choiceIcon: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  choiceText: { flex: 1 },
  choiceTitle: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  choiceHint: { fontSize: 14, color: colors.fgSecondary },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brandPressed, backgroundColor: colors.brandPressed },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.fgOnFill },
  ghost: { height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brandPressed, alignItems: 'center', justifyContent: 'center' },
  noteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brandPressed, backgroundColor: colors.bgCard },
  ghostText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  plain: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  plainText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault, textDecorationLine: 'underline' },
});
