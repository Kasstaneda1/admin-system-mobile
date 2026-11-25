// The pieces of My day in the calm look (design-mockups/app-calm p1 and r-rules, the owner
// 2026-11-25: «несерьёзно» — too many accent colours and decorated shapes). Two colours mean
// something: brand green — «this is pressed» (Directions, Call, Route, the selected day, the tab);
// orange — «here, now», one on the screen (the next visit's bar and its block in the strip, the
// unread dot). Dark amber text — money due, NEXT, the offline line. The rest is black and grey;
// frames 1 pt; weights 400–700. Sizes in pt, colours only tokens from src/constants/colors.js.
// The words come from model.js; nothing here decides what a visit is.
import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from './Icon';
import { dayOfMonth, weekdayLetter, windowLines } from './model';
import { FRESH_TEXT, markLabel, tabLabel } from './fresh';
import { useUnread } from '../estimate/unread';
import { refreshBell, useBellCount } from '../bell/store';
import { bellTabLabel } from '../bell/model';
import { accessLine, accessParts } from './access';
import { unitText } from './visit';

// «How to get in» text with its codes in large digits (access.js accessParts): style — the text's,
// bigStyle — the codes'
export function AccessText({ text, style, bigStyle, numberOfLines }) {
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {accessParts(text).map((p, i) => (p.big ? <Text key={i} style={bigStyle}>{p.text}</Text> : p.text))}
    </Text>
  );
}

// ---------- tags (other screens still use them; My day says it in words now) ----------
export const TAG_FAMILIES = {
  done: [colors.successFg, colors.successBg, colors.successBorder],
  diagnostics: [colors.warningFg, colors.warningBg, colors.warningBorder],
  deposit: [colors.indigoFg, colors.indigoBg, colors.indigoBorder],
  estimate: [colors.indigoFg, colors.indigoBg, colors.indigoBorder],
  installation: [colors.brandSoftFg, colors.brandSoft, colors.brand],
  recall: [colors.infoFg, colors.infoBg, colors.infoBorder],
  onway: [colors.infoFg, colors.infoBg, colors.infoBorder],
  helper: [colors.violetFg, colors.violetBg, colors.violetBorder],
  neutral: [colors.neutralFg, colors.neutralBg, colors.neutralBorder],
  // the day log (the office took the visit off the day): a white tag with a dashed grey border
  logged: [colors.neutralFg, colors.bgCard, colors.neutralBorder],
};

// fixed: the tag never shrinks in its row, the text beside it gives way (a grey row of the
// day log: its words are short and say what happened)
export function Tag({ tag, big = false, fixed = false }) {
  if (!tag) return null;
  const [fg, bg, border] = TAG_FAMILIES[tag.kind] || TAG_FAMILIES.neutral;
  return (
    <View style={[styles.tag, big && styles.tagBig, fixed && styles.tagFixed, tag.kind === 'logged' && styles.tagDashed, { backgroundColor: bg, borderColor: border }]}>
      <Icon name={tag.icon} size={14} color={fg} />
      <Text style={[styles.tagText, big && styles.tagTextBig, { color: fg }]} numberOfLines={1}>{tag.text}</Text>
    </View>
  );
}

// «New», «Updated», «Note» (fresh.js): the one framed label of the calm look — a black word in
// a grey 1 pt frame, 4 pt corners; on My day under the time, never beside the name. NOTE (an
// office message not seen yet) keeps its message icon.
export function FreshMark({ kind }) {
  const text = FRESH_TEXT[kind];
  if (!text) return null;
  return (
    <View style={styles.mark} accessible accessibilityLabel={markLabel(kind)}>
      {kind === 'note' ? <Icon name="message" size={12} color={colors.fgDefault} /> : null}
      <Text style={styles.markText}>{text}</Text>
    </View>
  );
}

// ---------- the strip of the day ----------
// Plain blocks at the planned times, no numbers, no window lines; now — a thin black line a little
// taller than the strip; hour labels under it (model.js stripOf)
const BLOCK = {
  done: { backgroundColor: colors.borderDefault },
  here: { backgroundColor: colors.accent },
  later: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderControl },
};
export function Strip({ strip }) {
  const [width, setWidth] = useState(0);
  const px = (f) => f * width;
  return (
    <View style={styles.strip} accessible accessibilityLabel={strip.label}>
      <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && strip.items.map((it) => {
          const w = Math.max(6, px(it.to) - px(it.from));
          return <View key={it.key} style={[styles.block, BLOCK[it.kind], { left: Math.min(px(it.from), width - w), width: w, zIndex: it.kind === 'here' ? 2 : 1 }]} />;
        })}
        {width > 0 && strip.now !== null ? <View style={[styles.nowLine, { left: px(strip.now) - 1 }]} /> : null}
      </View>
      <View style={styles.hours}>
        {width > 0 && strip.ticks.map((t) => (
          <Text key={`${t.text}-${t.at}`} numberOfLines={1}
            style={[styles.hour, t.align === 'left' ? { left: 0 } : t.align === 'right' ? { right: 0, textAlign: 'right' } : { left: px(t.at) - 20, width: 40, textAlign: 'center' }]}>
            {t.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ---------- the list ----------
// A row in three lines of text (model.js): the name on its own line (never cut by labels); the
// appliance and the problem; the third line — town and kind ahead, result and money after.
// The visit to go to (NEXT, or NOW on the way / on site) has an orange bar on its left, its full
// address, «how to get in» as plain text, Directions and Call.
export function DayRow({ row, fresh = null, onDirections, onCall, onPress }) {
  const open = row.current || row.next;
  const closed = row.state === 'closed';
  const grey = row.state === 'moved';
  const access = open ? accessLine(row.visit.access_notes) : null;
  const unit = unitText(row.visit.address_unit);
  const address = [row.visit.address_line, unit, row.visit.city].filter(Boolean).join(', ');
  const left = (
    <View style={styles.left}>
      {windowLines(row.window).map((line, i, lines) => (
        <Text key={i} style={[styles.window, (closed || grey) && styles.quiet, grey && styles.struck]}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={lines.length > 1 ? 0.7 : 0.8}>{line}</Text>
      ))}
      {open ? <Text style={styles.nextWord} accessibilityLabel={row.current ? 'Now' : 'Next'}>{row.current ? 'NOW' : 'NEXT'}</Text> : null}
      {row.under ? <Text style={styles.under} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{row.under}</Text> : null}
      {fresh ? <FreshMark kind={fresh} /> : null}
    </View>
  );
  const middle = (
    <View style={styles.middle}>
      <Text style={[styles.name, open && styles.nameOpen, (closed || grey) && styles.nameQuiet]} numberOfLines={1}>{row.clientFull}</Text>
      {row.what ? <Text style={[styles.what, (closed || grey) && styles.quiet]} numberOfLines={open ? 2 : 1}>{row.what}</Text> : null}
      {row.meta && row.meta.length ? (
        <Text style={styles.meta} numberOfLines={open ? 2 : 1}>
          {/* each part whole (no '$95 / fee'): the line breaks only between the parts */}
          {row.meta.map((m, i) => (
            <Text key={i} style={m.due ? styles.due : null}>{`${i ? ' · ' : ''}${m.text.replace(/ /g, ' ')}`}</Text>
          ))}
        </Text>
      ) : null}
      {open ? (
        <>
          {address ? (
            <View style={styles.line}>
              <Icon name="pin" size={16} color={colors.fgSecondary} />
              <Text style={styles.lineText} numberOfLines={2}>{address}</Text>
            </View>
          ) : null}
          {access ? (
            <View style={styles.line} accessible accessibilityLabel={`How to get in: ${access}`}>
              <Icon name="key" size={16} color={colors.fgSecondary} />
              <AccessText text={access} style={styles.lineText} bigStyle={styles.code} numberOfLines={2} />
            </View>
          ) : null}
          <View style={styles.acts}>
            <TouchableOpacity style={styles.dir} onPress={onDirections} accessibilityRole="button" accessibilityLabel={`Directions to ${row.clientFull}`}>
              <Icon name="nav" size={18} color={colors.fgOnFill} />
              <Text style={styles.dirText}>Directions</Text>
            </TouchableOpacity>
            {/* contacts hidden from this technician (src/perms): the office's phone in place of the customer's */}
            <TouchableOpacity style={styles.call} onPress={onCall} accessibilityRole="button"
              accessibilityLabel={row.contactsHidden ? 'Call the office' : `Call ${row.clientFull}`}>
              <Icon name="phone" size={18} color={colors.brandPressed} />
              <Text style={styles.callText}>{row.contactsHidden ? 'Office' : 'Call'}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
  if (open) {
    return (
      <Pressable style={[styles.row, styles.rowOpen]} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
        <View style={styles.bar} />
        {left}
        {middle}
      </Pressable>
    );
  }
  const body = (
    <>
      {left}
      {middle}
      {onPress ? <Icon name="chev" size={14} color={colors.fgSecondary} style={styles.chev} /> : null}
    </>
  );
  return onPress
    ? <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={row.label || undefined}>{body}</TouchableOpacity>
    : <View style={styles.row} accessible={!!row.label} accessibilityLabel={row.label || undefined}>{body}</View>;
}

// Free time: a thin grey line between the rows, dashed rules on both sides, no fill
// (iOS draws a dashed border only on all four sides: a 1 pt window onto a dashed box)
function Dashes() {
  return <View style={styles.dashClip}><View style={styles.dashBox} /></View>;
}
export function GapRow({ gap }) {
  return (
    <View style={styles.gap} accessible accessibilityLabel={gap.text}>
      <Dashes />
      <Text style={styles.gapText}>{gap.text}</Text>
      <Dashes />
    </View>
  );
}

// ---------- the week ----------
// Seven days, Sunday first; the day's number in a circle (the selected day filled brand green),
// under it the number of visits (nothing on a day without). A swipe sideways goes to the week
// before or after.
// marked: { date: n } of the days with a NEW or UPDATED visit (fresh.js freshCounts): a small
// orange dot by the day's number, but not on the day open (its rows show the marks)
export function WeekRow({ week, counts, marked = null, selected, today, onSelect, onWeek }) {
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 50) onWeek(g.dx < 0 ? 1 : -1); },
  })).current;
  return (
    <View style={styles.week} {...pan.panHandlers} accessibilityRole="tablist">
      {week.map((date) => {
        const on = date === selected;
        const count = counts ? counts[date] : undefined;
        const dot = !on && !!(marked && marked[date]);
        return (
          <TouchableOpacity key={date} style={styles.wd} onPress={() => onSelect(date)}
            accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={`${date}${count !== undefined ? `, ${count} visits` : ''}${marked && marked[date] ? ', new or changed' : ''}`}>
            <Text style={styles.wl}>{weekdayLetter(date)}</Text>
            <View style={[styles.wCircle, on && styles.wCircleOn]}>
              <Text style={[styles.wn, date === today && styles.wToday, on && styles.wOnText]}>{dayOfMonth(date)}</Text>
              {dot ? <View style={styles.wdot} /> : null}
            </View>
            <Text style={styles.wc}>{count ? String(count) : ''}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------- offline / failure line ----------
// Dark amber text, no fill (the calm rules: amber is text only)
export function NoticeBar({ text, kind = 'offline' }) {
  return (
    <View style={styles.offbar} accessibilityRole="alert">
      <Icon name={kind === 'offline' ? 'wifioff' : 'refresh'} size={14} color={colors.warningFg} />
      <Text style={styles.offText}>{text}</Text>
    </View>
  );
}

// ---------- the empty day ----------
export function EmptyDay({ title, offer, onOffer, onCallOffice }) {
  return (
    <View style={styles.empty}>
      <Icon name="sun" size={44} color={colors.fgMutedField} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>Nothing is booked for you. The office may still add a visit; you will see it here.</Text>
      {offer ? (
        <TouchableOpacity style={styles.btnPrimary} onPress={onOffer} accessibilityRole="button">
          <Text style={styles.btnPrimaryText}>{offer}</Text>
        </TouchableOpacity>
      ) : null}
      {onCallOffice ? (
        <TouchableOpacity style={styles.btnGhost} onPress={onCallOffice} accessibilityRole="button">
          <Icon name="phone" size={18} color={colors.brandPressed} />
          <Text style={styles.btnGhostText}>Call the office</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ---------- the tab bar ----------
// Notifications second, after My day (APP-1, design-mockups/notifications app-bell-day): something
// unread is an orange dot without a number (the calm look); VoiceOver still says how many
const TABS = [['cal', 'My day', 'MyDay'], ['bell', 'Notifications', 'Notifications'], ['money', 'Salary', 'Salary'], ['box', 'Parts', 'Parts'], ['more', 'More', 'Home']];
// A tab already in the stack is gone back to (React Navigation 7: navigate no longer goes back
// by itself); a tab not in it opens on top, as before
function openTab(navigation, screen) {
  const state = navigation.getState();
  if (state && state.routes.some((r) => r.name === screen)) navigation.popTo(screen);
  else navigation.navigate(screen);
}
// the dot: on Notifications — the bell's unread (bell/store.js), asked at most once a minute when
// a tab bar shows; on Parts — its estimates with messages not read (estimate/unread.js);
// fresh (My day's NEW and UPDATED) — only for VoiceOver of My day;
// current: the tab this screen belongs to (My day, Salary); pressing it goes back to the tab's
// first screen (Salary from a job), as tabs do on iPhone
export function TabBar({ navigation, bottom, fresh = 0, current = 'My day' }) {
  const unread = useUnread();
  const bell = useBellCount();
  useEffect(() => { refreshBell(); }, []);
  return (
    <View style={[styles.tabbar, { paddingBottom: Math.max(bottom, 8) }]} accessibilityRole="tablist">
      {TABS.map(([icon, label, screen]) => {
        const on = label === current;
        const count = screen === 'Notifications' && bell > 0 ? bell : screen === 'Parts' && unread > 0 ? unread : 0;
        const said = screen === 'MyDay' ? tabLabel(fresh) : screen === 'Notifications' ? bellTabLabel(count)
          : count ? `${label}, ${count} with new messages` : label;
        return (
          <TouchableOpacity key={label} style={styles.tb} onPress={() => openTab(navigation, screen)}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={said}>
            <View>
              <Icon name={icon} size={24} color={on ? colors.brand : colors.fgMutedField} />
              {count ? <View style={styles.badge} /> : null}
            </View>
            <Text style={[styles.tbText, on && { color: colors.brand }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 7, borderRadius: 11, borderWidth: 1, flexShrink: 1 },
  tagBig: { height: 26 },
  tagDashed: { borderStyle: 'dashed' },
  tagFixed: { flexShrink: 0 },
  tagText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  tagTextBig: { fontSize: 13 },
  mark: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, paddingHorizontal: 5, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4 },
  markText: { fontSize: 12, lineHeight: 17, fontWeight: '600', color: colors.fgDefault },

  strip: { marginTop: 12, marginHorizontal: 16 },
  track: { height: 14, borderRadius: 4, backgroundColor: colors.bgSunken },
  block: { position: 'absolute', top: 2, height: 10, borderRadius: 3 },
  nowLine: { position: 'absolute', top: -3, bottom: -3, width: 2, borderRadius: 1, backgroundColor: colors.fgDefault, zIndex: 3 },
  hours: { height: 16, marginTop: 4, marginBottom: 6 },
  hour: { position: 'absolute', top: 0, fontSize: 11, color: colors.fgSecondary },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 12, paddingBottom: 12, paddingLeft: 16, paddingRight: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, backgroundColor: colors.bgCard },
  rowOpen: { paddingRight: 16 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.accent },
  left: { width: 74 },
  window: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  quiet: { color: colors.fgSecondary },
  struck: { textDecorationLine: 'line-through' },
  under: { marginTop: 2, fontSize: 13, color: colors.fgSecondary, fontVariant: ['tabular-nums'] },
  nextWord: { marginTop: 2, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.warningFg },
  middle: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.fgDefault },
  nameOpen: { fontSize: 18, lineHeight: 23, fontWeight: '700' },
  nameQuiet: { fontWeight: '500', color: colors.fgSecondary },
  what: { marginTop: 2, fontSize: 15, lineHeight: 20, color: colors.fgDefault },
  meta: { marginTop: 3, fontSize: 13, lineHeight: 18, color: colors.fgSecondary },
  due: { fontWeight: '600', color: colors.warningFg },
  chev: { marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  lineText: { flex: 1, fontSize: 15, lineHeight: 20, color: colors.fgDefault },
  code: { fontWeight: '700', color: colors.fgDefault },
  acts: { flexDirection: 'row', gap: 8, marginTop: 10 },
  dir: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10, backgroundColor: colors.brand },
  dirText: { fontSize: 16, fontWeight: '600', color: colors.fgOnFill },
  call: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  callText: { fontSize: 16, fontWeight: '600', color: colors.brandPressed },

  gap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  gapText: { fontSize: 13, color: colors.fgSecondary },
  dashClip: { flex: 1, height: 1, overflow: 'hidden' },
  dashBox: { height: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderDefault },

  week: { flexDirection: 'row', paddingTop: 8, paddingBottom: 2 },
  wd: { flex: 1, alignItems: 'center', gap: 2, minHeight: 44 },
  wl: { fontSize: 12, color: colors.fgSecondary },
  wCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  wCircleOn: { backgroundColor: colors.brand },
  wn: { fontSize: 16, fontWeight: '500', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  wToday: { fontWeight: '600', color: colors.brandPressed },
  wOnText: { fontWeight: '600', color: colors.fgOnFill },
  // a small orange dot with a white ring at the top right of the number
  wdot: { position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.bgCard, backgroundColor: colors.accent },
  wc: { height: 13, fontSize: 11, lineHeight: 13, color: colors.fgSecondary },

  offbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  offText: { flex: 1, fontSize: 13, color: colors.warningFg },

  empty: { alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 28 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 21, color: colors.fgSecondary, textAlign: 'center', marginBottom: 6 },
  btnPrimary: { alignSelf: 'stretch', minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.brand },
  btnPrimaryText: { fontSize: 16, fontWeight: '600', color: colors.fgOnFill },
  btnGhost: { alignSelf: 'stretch', flexDirection: 'row', gap: 8, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  btnGhostText: { fontSize: 16, fontWeight: '600', color: colors.brandPressed },

  tabbar: { flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: colors.borderDefault, backgroundColor: colors.bgCard },
  tb: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
  // five tabs in 390: «Notifications» fits at 10.5 pt (the Designer, APP-1)
  tbText: { fontSize: 10.5, fontWeight: '600', color: colors.fgMutedField },
  // something unread: an orange dot with a white ring at the icon's top right (design .c-dot)
  badge: { position: 'absolute', top: -2, right: -4, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.bgCard, backgroundColor: colors.accent },
});
