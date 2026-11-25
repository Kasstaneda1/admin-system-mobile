// The bottom of the visit (design A3 final-visit-onway / sched / closed) and its sheets
// (final-finish, final-noaccess). What shows comes from actions.js barOf; nothing here
// decides what may be pressed. Sizes in pt, colours only tokens.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from './Icon';
import { TAG_FAMILIES } from './parts';
import { FinishDiagnosisField } from '../diagnosis/field';
import { PART_NAME_MAX, PART_NUMBER_MAX } from './actions';
import { ThreeButtons } from '../bill/ThreeParts';

// bar: barOf(); pending: { action } while a press waits for the server; failure: { text }
// when it got no answer (Try again sends the same request); blocked: why nothing can be
// pressed now ('Needs connection'), or null; onNote: «Add a note for the office» under a
// closed visit (design final-visit-closed), when notes may be added.
// steps: steps.js stepsOf() — the big button is the visit's next step (usability п. 1, design
// usab-u1-next-step) and the step after it, when this one may be passed, a plain button beside
// On my way; onStep(key) opens it. Without steps (a helper, an old task, no money permission) or
// with no step to press now, the server's bar as before.
// bill: «Open the bill» as the big amber button of a closed visit without steps (no money
// permission: the office issues the bill); billLink: the same as an underlined link under the
// step (design usab-u1), not while Undo shows: { label, onPress } or null
// three: bill/three.js threeOf() — the bill's three buttons (T3, design-mockups/tech-bill-plain):
// a column under On my way / Finish, before Finish too; then the steps' big button is gone, and the
// only one left of them is «Next: …» once all three are done (threeNext) and «Customer approves»
// plain beside Finish. threeBusy / threeFailure / onThree: bill/ThreeParts.js ThreeButtons.
export function ActionBar({ bar, pending, failure, blocked, bottom, onPress, onRetry, onCancel, onNote = null, bill = null, steps = null, onStep = null, billLink = null,
  three = null, threeNext = null, threeBusy = null, threeFailure = null, onThree = null }) {
  const main = three ? threeNext : steps && steps.main ? steps.main : null;
  if (bar.empty && !failure && !main && !three) return null;
  const waiting = !!pending && !failure;
  const off = waiting || !!failure || !!blocked;
  const spinner = (action) => waiting && pending.action === action;
  // a server's press (Finish, On my way) waits for the connection; a step that opens a screen
  // only for a press in flight — the screen it opens says what works without the connection
  const buttonOf = (b, isStep) => {
    const action = isStep ? b.key : b.action;
    const server = !isStep || !!b.server;
    return { ...b, action, off: server ? off : waiting || !!failure, press: isStep ? () => onStep(b.key) : () => onPress(b.action) };
  };
  // d0 (design-mockups/tech-bill-plain): one lit button, what to do now — On my way while the
  // visit is planned (Finish plain under it), then the steps' own (Finish, later the bill's)
  const omwFirst = !!(bar.primary && bar.primary.action === 'omw');
  const primary = omwFirst ? buttonOf(bar.primary, false)
    : main ? buttonOf(main, true) : bar.primary ? buttonOf(bar.primary, false) : null;
  // with the three: «Customer approves» (a repair, before Finish) stays a plain step beside Finish
  const approve = three && !omwFirst && steps ? [steps.main, steps.second].find((b) => b && b.key === 'approve') || null : null;
  // with the three under it On my way stands alone (README d0: «On my way», then «Finish …»): the
  // foot would take half the screen with a plain Finish too
  const plains = (omwFirst ? [bar.secondary && !three ? buttonOf(bar.secondary, false) : null] : three ? [
    approve ? buttonOf(approve, true) : null,
    bar.secondary ? buttonOf(bar.secondary, false) : null,
  ] : [
    main && steps.second ? buttonOf(steps.second, true) : null,
    bar.secondary ? buttonOf(bar.secondary, false) : null,
  ]).filter(Boolean);
  const isNext = !omwFirst && !!main && main.tone === 'brand';
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

      {bar.closed ? (
        <View style={styles.closed}>
          <Text style={styles.closedText}>
            <Text style={styles.undoStrong}>{bar.closed.text}</Text>{bar.closed.note ? ` · ${bar.closed.note}` : ''}
          </Text>
        </View>
      ) : null}

      {primary ? (
        <TouchableOpacity style={[styles.main, isNext && styles.mainNext, primary.off && styles.off]} disabled={primary.off} onPress={primary.press} accessibilityRole="button"
          accessibilityState={{ disabled: primary.off, busy: spinner(primary.action) }}>
          {spinner(primary.action) ? <ActivityIndicator color={isNext ? colors.fgOnFill : colors.onAccent} /> : (
            <>
              <Icon name={primary.icon} size={24} color={isNext ? colors.fgOnFill : colors.onAccent} />
              <Text style={[styles.mainText, isNext && styles.mainTextNext]} numberOfLines={1} adjustsFontSizeToFit>{primary.label}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {plains.length ? (
        <View style={styles.plains}>
          {plains.map((b) => (
            <TouchableOpacity key={b.action} style={[styles.second, styles.secondHalf, b.off && styles.off]} disabled={b.off} onPress={b.press} accessibilityRole="button"
              accessibilityState={{ disabled: b.off, busy: spinner(b.action) }}>
              {spinner(b.action) ? <ActivityIndicator color={colors.fgDefault} /> : (
                <>
                  <Icon name={b.icon} size={20} color={colors.fgDefault} />
                  <Text style={styles.secondText} numberOfLines={1} adjustsFontSizeToFit>{b.label}</Text>
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {three ? <ThreeButtons three={three} busy={threeBusy} failure={threeFailure} onPress={onThree} /> : null}

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

      {bill ? (
        <TouchableOpacity style={styles.main} onPress={bill.onPress} accessibilityRole="button">
          <Icon name="doc" size={24} color={colors.onAccent} />
          <Text style={styles.mainText}>{bill.label}</Text>
        </TouchableOpacity>
      ) : null}
      {/* while Undo shows, the Bill tile is right over the bar: no link, the bar 44 pt lower (Дизайнер, #84) */}
      {billLink && !bar.undo ? (
        <TouchableOpacity style={styles.link} onPress={billLink.onPress} accessibilityRole="button">
          <Text style={styles.billLinkText}>{billLink.label}</Text>
        </TouchableOpacity>
      ) : null}
      {bar.closed && onNote ? (
        <TouchableOpacity style={[styles.noteBtn, !!blocked && styles.off]} disabled={!!blocked} onPress={onNote} accessibilityRole="button"
          accessibilityState={{ disabled: !!blocked }}>
          <Icon name="note" size={20} color={colors.brandPressed} />
          <Text style={styles.ghostText}>Add a note for the office</Text>
        </TouchableOpacity>
      ) : null}
      {bar.closed && onNote && blocked ? <Text style={styles.blocked}>{blocked}</Text> : null}

      {blocked && (bar.primary || bar.secondary || bar.noAccess || bar.undo) ? <Text style={styles.blocked}>{blocked}</Text> : null}
      {bar.line ? <Text style={styles.line}>{bar.line}</Text> : null}
    </View>
  );
}

// The strip of the visit's steps over its tiles (usability п. 1, design usab-u1-next-step):
// strip — steps.js stepsOf().strip; done — a tick, the next one — its number on amber, the rest —
// a grey number in a ring; the line between two steps is filled once the first is done
export function StepStrip({ strip, label }) {
  if (!strip || !strip.length) return null;
  return (
    <View style={styles.strip} accessible accessibilityLabel={label}>
      {strip.map((s, i) => (
        <View key={s.key} style={styles.stripItem}>
          {i > 0 ? <View style={[styles.stripLine, styles.stripLineLeft, strip[i - 1].mark === 'done' && styles.stripLineDone]} /> : null}
          {i < strip.length - 1 ? <View style={[styles.stripLine, styles.stripLineRight, s.mark === 'done' && styles.stripLineDone]} /> : null}
          <View style={[styles.stripDot, s.mark === 'done' && styles.stripDotDone, s.mark === 'now' && styles.stripDotNow]}>
            {s.mark === 'done' ? <Icon name="check" size={16} color={colors.fgOnFill} />
              : <Text style={[styles.stripNum, s.mark === 'now' && styles.stripNumNow]}>{s.n}</Text>}
          </View>
          <Text style={[styles.stripLabel, s.mark === 'now' && styles.stripLabelNow]} numberOfLines={1} adjustsFontSizeToFit>{s.label}</Text>
        </View>
      ))}
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

// «How did it end?»: choices (actions.js finishChoices), one marked, then Finish visit.
// diagnosis (D1-APP, design visit-diagnosis app-finish): the visit's diagnosis under the choices
// where the outcome asks for it — { asks(outcome), needs(outcome), text, failure, sending,
// onChangeText } — or null; «required» where needs (Д-2): empty, Finish waits. The screen saves a
// changed text before the finish (onFinish waits for it). Estimate needed (D3) adds Part needed
// and Part #, both optional: onFinish(outcome, field, part)
export function FinishSheet({ visible, choices, initial, subtitle, bottom, onFinish, onClose, diagnosis = null }) {
  const [chosen, setChosen] = useState(initial);
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  // Finish pressed with a required diagnosis empty: the hint turns red (until then grey)
  const [tried, setTried] = useState(false);
  useEffect(() => { if (visible) { setChosen(initial); setPartName(''); setPartNumber(''); setTried(false); } }, [visible, initial]);
  useEffect(() => { setTried(false); }, [chosen]);
  const field = !!diagnosis && diagnosis.asks(chosen);
  const required = field && !!diagnosis.needs && diagnosis.needs(chosen);
  const waits = required && !String(diagnosis.text || '').trim();
  const saving = !!diagnosis && diagnosis.sending;
  const askPart = chosen === 'estimate_needed';
  // the field is under the choices: once the keyboard is up, bring it into view (simulator check)
  const scroll = useRef(null);
  const toField = () => setTimeout(() => scroll.current && scroll.current.scrollToEnd({ animated: true }), 300);
  return (
    <Sheet visible={visible} onClose={saving ? () => {} : onClose} bottom={bottom} keyboard={!!diagnosis}>
      <ScrollView ref={scroll} style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollBody} keyboardShouldPersistTaps="handled">
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
      {field ? <FinishDiagnosisField text={diagnosis.text} failure={diagnosis.failure} sending={saving} required={required} tried={tried} onChangeText={diagnosis.onChangeText} onFocus={toField} /> : null}
      {askPart ? (
        <View style={styles.partRow}>
          <View style={styles.partCell}>
            <Text style={styles.partLabel}>Part needed<Text style={styles.partOpt}> · optional</Text></Text>
            <TextInput style={styles.partField} value={partName} onChangeText={setPartName} onFocus={toField} editable={!saving}
              maxLength={PART_NAME_MAX} accessibilityLabel="Part needed, optional" />
          </View>
          <View style={styles.partCell}>
            <Text style={styles.partLabel}>Part #<Text style={styles.partOpt}> · optional</Text></Text>
            <TextInput style={styles.partField} value={partNumber} onChangeText={setPartNumber} onFocus={toField} editable={!saving}
              maxLength={PART_NUMBER_MAX} autoCapitalize="characters" autoCorrect={false}
              accessibilityLabel="Part number, optional" />
          </View>
        </View>
      ) : null}
      </ScrollView>
      {/* Grey while the diagnosis it needs is empty, and a press then answers in the field above
          (the hint turns red and the field comes into view) instead of doing nothing */}
      <TouchableOpacity style={[styles.main, saving && styles.off, waits && styles.mainWaits]} disabled={saving}
        onPress={() => {
          if (waits) { setTried(true); toField(); return; }
          onFinish(chosen, field, askPart ? { name: partName, number: partNumber } : null);
        }} accessibilityRole="button"
        accessibilityHint={waits ? 'Write the diagnosis first' : undefined}
        accessibilityState={{ disabled: saving || waits, busy: saving }}>
        {saving ? <ActivityIndicator color={colors.onAccent} /> : (
          <>
            <Icon name="check" size={24} color={waits ? colors.fgDisabled : colors.onAccent} />
            <Text style={[styles.mainText, waits && styles.mainTextWaits]}>Finish visit</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.plain} onPress={onClose} disabled={saving} accessibilityRole="button">
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
  mainText: { fontSize: 20, fontWeight: '800', color: colors.onAccent, flexShrink: 1 },
  // all done: «Next: Nguyen T. · 1:30» — the brand's dark button, not the amber one (design usab-u1)
  mainNext: { backgroundColor: colors.brandPressed },
  mainTextNext: { color: colors.fgOnFill },
  // the plain buttons under the big one, the full width; two side by side (Finish · On my way)
  plains: { flexDirection: 'row', gap: 8 },
  secondHalf: { flex: 1 },
  billLinkText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed, textDecorationLine: 'underline' },
  // the strip of steps (design usab-u1 .steps)
  strip: { flexDirection: 'row', marginTop: 10, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  stripItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  stripLine: { position: 'absolute', top: 14, height: 2, backgroundColor: colors.borderDefault },
  stripLineLeft: { left: 0, right: '50%' },
  stripLineRight: { left: '50%', right: 0 },
  stripLineDone: { backgroundColor: colors.brand },
  stripDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  stripDotDone: { borderColor: colors.brand, backgroundColor: colors.brand },
  stripDotNow: { borderColor: colors.accent, backgroundColor: colors.accent },
  stripNum: { fontSize: 14, fontWeight: '700', color: colors.fgSecondary },
  stripNumNow: { color: colors.onAccent },
  stripLabel: { fontSize: 13, fontWeight: '600', color: colors.fgSecondary },
  stripLabelNow: { fontWeight: '800', color: colors.fgDefault },
  // On my way under Finish: optional, so a plain button (SEMIX_STYLE «Secondary»)
  second: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  secondText: { fontSize: 17, fontWeight: '700', color: colors.fgDefault, flexShrink: 1 },
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
  sheet: { maxHeight: '94%', paddingHorizontal: 16, paddingTop: 8, gap: 10, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.bgCard },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  // Part needed · Part # (design app-finish .vd-pr)
  partRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  partCell: { flex: 1, minWidth: 0, gap: 6 },
  partLabel: { fontSize: 14, fontWeight: '700', color: colors.fgSecondary },
  partOpt: { fontWeight: '500', color: colors.fgMutedField },
  partField: { minHeight: 52, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, fontSize: 16, color: colors.fgDefault, backgroundColor: colors.bgCard },
  mainWaits: { backgroundColor: colors.bgSunken },
  mainTextWaits: { color: colors.fgDisabled },
  // room under the last field: Part needed / Part # never end under Finish visit (QA Б13)
  sheetScrollBody: { gap: 10, paddingBottom: 16 },
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
