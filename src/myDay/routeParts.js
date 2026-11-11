// The pieces of the Route screen (design A3: final-route*.png, final-a3.html .rm-pt, .detour,
// .stop; colours only tokens). The words and the numbers come from route.js and the server.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from './Icon';
import { Tag } from './parts';
import { Sheet } from './visitBar';
import { NOTE_MAX } from './notesPhotos';

// A stop's number, coloured as in the day's list: closed grey, now amber, helper violet,
// planned dark; a stop of a back-and-forth gets an orange ring. Home (the day's start,
// backend #157): the other way round — a white circle, the house and a 2 pt ring in the
// brand's colour, so it never reads as a stop.
const DOT = {
  closed: [colors.stateDone, colors.stateDoneFg, colors.stateDoneBorder],
  current: [colors.accent, colors.onAccent, null],
  helper: [colors.violetBorder, colors.fgOnFill, null],
  sched: [colors.brandPressed, colors.fgOnFill, null],
  home: [colors.bgCard, colors.brand, colors.brand],
};
export function StopDot({ stop, size = 28, onMap = false }) {
  const [bg, fg, border] = DOT[stop.state] || DOT.sched;
  const dot = (
    <View style={[s.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      border && { borderWidth: stop.home ? 2 : 1, borderColor: border }, onMap && !stop.home && s.dotOnMap]}>
      {stop.home
        ? <Icon name="home" size={Math.round(size * 0.6)} color={fg} />
        : <Text style={[s.dotText, { color: fg, fontSize: size >= 30 ? 15 : 14 }]}>{stop.n}</Text>}
    </View>
  );
  if (!stop.flagged) return dot;
  return <View style={[s.ring, { borderRadius: size / 2 + 5, padding: onMap ? 3 : 2 }]}>{dot}</View>;
}

// A back-and-forth the server found: its words, then Tell the office and It's OK (not on a
// past one: both visits are closed, it was driven). Answered on this phone: «Sent to the office».
// The title names no stops: the server's words under it do («Visit 4 could go before 3…»).
export function HintBox({ hint, onTell, onOk }) {
  return (
    <View style={s.hint} accessibilityRole="alert">
      <Icon name="warn" size={20} color={colors.lateFg} style={s.hintIcon} />
      <View style={s.hintBody}>
        <Text style={s.hintTitle}>Back and forth</Text>
        <Text style={s.hintText}>{hint.text}</Text>
        {hint.mark === 'sent' ? (
          <View style={s.sent}>
            <Icon name="checkc" size={16} color={colors.lateFg} />
            <Text style={s.sentText}>Sent to the office</Text>
          </View>
        ) : null}
        {!hint.past && !hint.mark ? (
          <View style={s.hintActions}>
            <TouchableOpacity style={s.tell} onPress={onTell} accessibilityRole="button">
              <Icon name="send" size={18} color={colors.fgOnFill} />
              <Text style={s.tellText}>Tell the office</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ok} onPress={onOk} accessibilityRole="button" accessibilityLabel="It's OK, hide this">
              <Text style={s.okText}>It’s OK</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// The top of the list: the day starts at home (no number, no visit to open; the leg under it
// is the first stop's); or, with no point of home, a quiet line and the route from the first stop
const HOME_DOT = { home: true, state: 'home' };
export function HomeRow() {
  return (
    <View style={s.stop} accessible accessibilityLabel="Home, the start of the day">
      <View style={s.dotBox}><StopDot stop={HOME_DOT} /></View>
      <View style={s.stopBody}>
        <Text style={s.stopTitle}>Home</Text>
      </View>
    </View>
  );
}
export function HomeMissing() {
  return (
    <View style={s.stop} accessible accessibilityLabel="Home address not set, ask the office">
      <View style={s.dotBox}><Icon name="home" size={20} color={colors.fgMutedField} /></View>
      <Text style={s.homeMissing}>Home address not set · ask the office</Text>
    </View>
  );
}

// One stop in the list, the leg from the stop before above it
export function StopRow({ stop }) {
  return (
    <View>
      {stop.leg ? (
        <View style={s.leg}>
          <View style={[s.legLine, stop.leg.bad && s.legLineBad]} />
          <Text style={[s.legText, stop.leg.bad && s.legTextBad]}>{stop.leg.text}</Text>
        </View>
      ) : null}
      <View style={s.stop} accessible accessibilityLabel={`Stop ${stop.n}, ${stop.time}, ${stop.client}, ${stop.line}`}>
        <View style={s.dotBox}><StopDot stop={stop} /></View>
        <View style={s.stopBody}>
          <Text style={s.stopTitle} numberOfLines={1}>{[stop.time, stop.client].filter(Boolean).join(' · ')}</Text>
          <View style={s.stopLineRow}>
            {!stop.hasPoint ? <Icon name="mapoff" size={14} color={colors.fgMutedField} /> : null}
            <Text style={s.stopLine} numberOfLines={1}>{stop.line}</Text>
          </View>
        </View>
        <Tag tag={stop.tag} />
      </View>
    </View>
  );
}

// Tell the office: the hint's words as they go, the technician's own words under them if
// they want (the owner's decision), then Send. The note goes to the hint's second visit.
export function TellSheet({ visible, hint, client, own, onChangeOwn, sending, failure, bottom, onSend, onClose }) {
  if (!hint) return null;
  const room = NOTE_MAX - (`Route: ${hint.text}\n`).length;
  return (
    <Sheet visible={visible} onClose={onClose} bottom={bottom} keyboard>
      <Text style={s.sheetTitle} accessibilityRole="header">Tell the office</Text>
      <Text style={s.sheetSub}>{`The office sees it on the board, in the notes of stop ${hint.between[1]}${client ? ` · ${client}` : '.'}`}</Text>
      <View style={s.ready}>
        <Text style={s.readyText}>{`Route: ${hint.text}`}</Text>
      </View>
      <TextInput style={s.own} value={own} onChangeText={onChangeOwn} placeholder="Add your words (optional)"
        placeholderTextColor={colors.fgMutedField} multiline maxLength={room} editable={!sending}
        accessibilityLabel="Your words for the office, optional" />
      {failure ? <Text style={s.fail} accessibilityRole="alert">{failure}</Text> : null}
      <TouchableOpacity style={[s.send, sending && s.sendBusy]} onPress={onSend} disabled={sending} accessibilityRole="button">
        {sending ? <ActivityIndicator color={colors.fgOnFill} /> : <Icon name="send" size={20} color={colors.fgOnFill} />}
        <Text style={s.sendText}>{failure ? 'Try again' : 'Send to the office'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.cancel} onPress={onClose} accessibilityRole="button">
        <Text style={s.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

const s = StyleSheet.create({
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotOnMap: { borderWidth: 2.5, borderColor: colors.bgCard },
  dotText: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  ring: { borderWidth: 2.5, borderColor: colors.stateLate, backgroundColor: colors.bgCard },

  hint: { flexDirection: 'row', gap: 10, padding: 12, marginBottom: 10, borderRadius: 14, borderWidth: 2, borderColor: colors.lateBorder, backgroundColor: colors.lateBg },
  hintIcon: { marginTop: 1 },
  hintBody: { flex: 1, gap: 2 },
  hintTitle: { fontSize: 16, fontWeight: '800', color: colors.lateFg },
  hintText: { fontSize: 15, lineHeight: 20, color: colors.lateFg },
  hintActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  tell: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.brandPressed },
  tellText: { fontSize: 15, fontWeight: '700', color: colors.fgOnFill },
  ok: { minHeight: 44, minWidth: 44, paddingHorizontal: 6, justifyContent: 'center' },
  okText: { fontSize: 15, fontWeight: '700', color: colors.lateFg, textDecorationLine: 'underline' },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  sentText: { fontSize: 14, fontWeight: '700', color: colors.lateFg },

  // every number in a box of one width, ringed or not, so the rows and the legs line up
  dotBox: { width: 40, alignItems: 'center' },
  leg: { flexDirection: 'row', alignItems: 'center', minHeight: 28, paddingLeft: 19 },
  legLine: { width: 2, alignSelf: 'stretch', marginRight: 29, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: colors.borderStrong },
  legLineBad: { borderStyle: 'solid', borderColor: colors.stateLate },
  legText: { fontSize: 14, fontWeight: '600', color: colors.fgSecondary, fontVariant: ['tabular-nums'] },
  legTextBad: { fontWeight: '800', color: colors.lateFg },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  stopBody: { flex: 1, minWidth: 0 },
  stopTitle: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  stopLineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stopLine: { flexShrink: 1, fontSize: 13, color: colors.fgMutedField },
  homeMissing: { flex: 1, fontSize: 15, color: colors.fgSecondary },

  sheetTitle: { fontSize: 24, fontWeight: '800', color: colors.fgDefault },
  sheetSub: { marginTop: 4, fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  ready: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.bgSubtle, borderWidth: 1, borderColor: colors.borderDefault },
  readyText: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  own: { marginTop: 10, minHeight: 88, maxHeight: 160, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderControl, fontSize: 17, color: colors.fgDefault, textAlignVertical: 'top' },
  fail: { marginTop: 10, fontSize: 15, fontWeight: '600', color: colors.warningFg },
  send: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, marginTop: 14, borderRadius: 14, backgroundColor: colors.brandPressed },
  sendBusy: { opacity: 0.7 },
  sendText: { fontSize: 18, fontWeight: '800', color: colors.fgOnFill },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.fgSecondary, textDecorationLine: 'underline' },
});
