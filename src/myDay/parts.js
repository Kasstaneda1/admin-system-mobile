// The pieces of My day, design A3 (design-mockups/tech-app/final-a3.html, src2/v2.css and
// src3/add.css: sizes in pt, colours only tokens from src/constants/colors.js). The words come
// from model.js; nothing here decides what a visit is.
import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from './Icon';
import { dayOfMonth, weekdayLetter, weekdayOf } from './model';

// ---------- tags ----------
const TAG_COLORS = {
  done: [colors.successFg, colors.successBg, colors.successBorder],
  diagnostics: [colors.warningFg, colors.warningBg, colors.warningBorder],
  deposit: [colors.indigoFg, colors.indigoBg, colors.indigoBorder],
  installation: [colors.brandSoftFg, colors.brandSoft, colors.brand],
  recall: [colors.infoFg, colors.infoBg, colors.infoBorder],
  onway: [colors.infoFg, colors.infoBg, colors.infoBorder],
  helper: [colors.violetFg, colors.violetBg, colors.violetBorder],
  neutral: [colors.neutralFg, colors.neutralBg, colors.neutralBorder],
};

export function Tag({ tag, big = false }) {
  if (!tag) return null;
  const [fg, bg, border] = TAG_COLORS[tag.kind] || TAG_COLORS.neutral;
  return (
    <View style={[styles.tag, big && styles.tagBig, { backgroundColor: bg, borderColor: border }]}>
      <Icon name={tag.icon} size={14} color={fg} />
      <Text style={[styles.tagText, big && styles.tagTextBig, { color: fg }]} numberOfLines={1}>{tag.text}</Text>
    </View>
  );
}

export function NowLabel({ text = 'NOW' }) {
  return <Text style={styles.now} accessibilityLabel={text === 'NOW' ? 'Now' : 'Next'}>{text}</Text>;
}

// The visit's number in a circle, coloured as its state
function dotColors(row) {
  if (row.state === 'moved') return [colors.bgCard, colors.fgSecondary, colors.borderStrong];
  if (row.current || row.next) return [colors.accent, colors.onAccent, null];
  if (row.state === 'closed') return [colors.stateDone, colors.stateDoneFg, colors.stateDoneBorder];
  if (row.helper) return [colors.violetBorder, colors.fgOnFill, null];
  return [colors.brandPressed, colors.fgOnFill, null];
}
export function NumberDot({ row }) {
  const [bg, fg, border] = dotColors(row);
  return (
    <View style={[styles.dot, { backgroundColor: bg }, border && { borderWidth: row.state === 'moved' ? 1.5 : 1, borderColor: border }]}>
      <Text style={[styles.dotText, { color: fg }]}>{row.n ?? '–'}</Text>
    </View>
  );
}

// ---------- the strip of the day ----------
function blockColors(item) {
  if (item.current) return { backgroundColor: colors.accent, borderColor: colors.infoBorder, borderWidth: 2, color: colors.onAccent };
  if (item.state === 'closed') return { backgroundColor: colors.stateDone, borderColor: colors.stateDoneBorder, borderWidth: 1, color: colors.stateDoneFg };
  if (item.helper) return { backgroundColor: colors.violetBorder, color: colors.fgOnFill };
  return { backgroundColor: colors.brandPressed, color: colors.fgOnFill };
}
export function Strip({ strip }) {
  const [width, setWidth] = useState(0);
  const px = (f) => f * width;
  return (
    <View style={styles.strip} accessible accessibilityLabel="Day at a glance, 8 AM to 7 PM">
      <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && strip.items.map((it) => {
          const winColor = it.state === 'closed' ? colors.borderStrong : it.helper ? colors.violetBorder : colors.brand;
          const c = blockColors(it);
          const left = px(it.from);
          const w = Math.max(16, px(it.to) - left);
          return (
            <React.Fragment key={it.key}>
              <View style={[styles.win, { top: it.track ? 9 : 3, left: px(it.winFrom), width: Math.max(4, px(it.winTo) - px(it.winFrom)), backgroundColor: winColor }]} />
              <View style={[styles.block, { left: Math.min(left, width - w), width: w, backgroundColor: c.backgroundColor, borderColor: c.borderColor, borderWidth: c.borderWidth || 0, zIndex: it.current ? 4 : 2 }]}>
                <Text style={[styles.blockText, { color: c.color }]} numberOfLines={1}>{it.n}</Text>
              </View>
            </React.Fragment>
          );
        })}
        {width > 0 && strip.now !== null ? <View style={[styles.nowLine, { left: px(strip.now) - 1 }]} /> : null}
      </View>
      <View style={styles.ticks}>
        {width > 0 && strip.ticks.map((t) => (
          <Text key={t.text} style={[styles.tick, { left: px(t.at) - 20 }]}>{t.text}</Text>
        ))}
      </View>
    </View>
  );
}

// ---------- the list ----------
export function DayRow({ row, onDirections, onCall, onPress }) {
  const open = row.current || row.next;
  const address = [row.visit.address_line, row.visit.address_unit ? `Apt ${row.visit.address_unit}`.replace(/^Apt (apt|unit|#)/i, '$1') : null].filter(Boolean).join(', ');
  const body = (
    <>
      <View style={styles.left}>
        <NumberDot row={row} />
        <Text style={[styles.window, row.state === 'closed' && styles.closedText, row.state === 'moved' && styles.movedText]}>{row.window}</Text>
        <Text style={styles.time}>{row.timeText}</Text>
      </View>
      <View style={styles.middle}>
        <View style={styles.line1Row}>
          <Text style={[styles.line1, styles.line1Text]} numberOfLines={1}>
            <Text style={[styles.client, (row.state === 'closed' || row.state === 'moved') && styles.closedText]}>{row.client}</Text>
            {row.area ? <Text style={styles.area}>{` · ${row.area}`}</Text> : null}
          </Text>
          {open ? <NowLabel text={row.current ? 'NOW' : 'NEXT'} /> : null}
        </View>
        <View style={styles.line2}>
          <Text style={styles.kind} numberOfLines={1}>{[row.kind, row.duration].filter(Boolean).join(' · ')}</Text>
          <Tag tag={row.tag} />
        </View>
      </View>
      {onPress && !open ? <Icon name="chev" size={18} color={colors.fgMutedField} style={styles.chev} /> : null}
    </>
  );
  if (!open) {
    return onPress
      ? <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button">{body}</TouchableOpacity>
      : <View style={styles.row}>{body}</View>;
  }
  return (
    <View style={[styles.row, styles.rowOpen, row.current ? styles.rowCurrent : styles.rowNext]}>
      <Pressable style={styles.openTop} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>{body}</Pressable>
      <View style={styles.openActions}>
        <View style={styles.where}>
          <Icon name="pin" size={14} color={row.current ? colors.infoFg : colors.brandSoftFg} />
          <Text style={[styles.whereText, { color: row.current ? colors.infoFg : colors.brandSoftFg }]} numberOfLines={2}>{address || row.area}</Text>
        </View>
        <TouchableOpacity style={styles.mini} onPress={onDirections} accessibilityRole="button" accessibilityLabel={`Directions to ${row.client}`}>
          <Icon name="nav" size={18} color={colors.fgOnFill} />
          <Text style={styles.miniText}>Directions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mini, styles.miniGhost]} onPress={onCall} accessibilityRole="button" accessibilityLabel={`Call ${row.client}`}>
          <Icon name="phone" size={18} color={colors.brandPressed} />
          <Text style={[styles.miniText, styles.miniGhostText]}>Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function GapRow({ gap }) {
  return (
    <View style={styles.gap}>
      <Text style={styles.gapText}>{gap.text}</Text>
    </View>
  );
}

// ---------- the week ----------
// Seven days, Sunday first; under each the number of visits. A swipe sideways goes to the
// week before or after.
export function WeekRow({ week, counts, selected, today, onSelect, onWeek }) {
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 50) onWeek(g.dx < 0 ? 1 : -1); },
  })).current;
  return (
    <View style={styles.week} {...pan.panHandlers} accessibilityRole="tablist">
      {week.map((date) => {
        const on = date === selected;
        const weekend = weekdayOf(date) === 0 || weekdayOf(date) === 6;
        const count = counts ? counts[date] : undefined;
        return (
          <TouchableOpacity key={date} style={[styles.wd, on && styles.wdOn]} onPress={() => onSelect(date)}
            accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={`${date}${count !== undefined ? `, ${count} visits` : ''}`}>
            <Text style={[styles.wl, on && styles.wOnText]}>{weekdayLetter(date)}</Text>
            <Text style={[styles.wn, weekend && styles.wWeekend, date === today && styles.wToday, on && styles.wOnText]}>{dayOfMonth(date)}</Text>
            <Text style={[styles.wc, weekend && styles.wWeekend, on && styles.wOnText]}>{count ? String(count) : '–'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------- offline / failure line ----------
export function NoticeBar({ text, kind = 'offline' }) {
  return (
    <View style={styles.offbar} accessibilityRole="alert">
      <Icon name={kind === 'offline' ? 'wifioff' : 'refresh'} size={14} color={colors.warningFg} />
      <Text style={styles.offText}>{text}</Text>
    </View>
  );
}

// ---------- the empty day ----------
export function EmptyDay({ title, offer, onOffer }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyArt}><Icon name="sun" size={52} color={colors.warningFg} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>Nothing is booked for you. The office may still add a visit; you will see it here.</Text>
      {offer ? (
        <TouchableOpacity style={styles.btnPrimary} onPress={onOffer} accessibilityRole="button">
          <Text style={styles.btnPrimaryText}>{offer}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ---------- the tab bar ----------
const TABS = [['cal', 'My day', null], ['money', 'Salary', 'Salary'], ['box', 'Parts', 'Parts'], ['more', 'More', 'Home']];
export function TabBar({ navigation, bottom }) {
  return (
    <View style={[styles.tabbar, { paddingBottom: Math.max(bottom, 8) }]} accessibilityRole="tablist">
      {TABS.map(([icon, label, screen]) => {
        const on = screen === null;
        return (
          <TouchableOpacity key={label} style={styles.tb} onPress={() => (screen ? navigation.navigate(screen) : null)}
            accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Icon name={icon} size={24} color={on ? colors.brand : colors.fgMutedField} />
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
  tagText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  tagTextBig: { fontSize: 13 },
  now: { flexShrink: 0, paddingHorizontal: 6, height: 20, lineHeight: 20, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.accent, color: colors.onAccent, fontSize: 11, fontWeight: '800', letterSpacing: 0.66 },
  dot: { position: 'absolute', left: 0, top: 2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },

  strip: { marginTop: 6, marginHorizontal: 20, height: 62 },
  track: { height: 44, borderRadius: 8, backgroundColor: colors.bgSubtle, borderWidth: 1, borderColor: colors.borderDefault, overflow: 'hidden' },
  win: { position: 'absolute', height: 4, borderRadius: 2 },
  block: { position: 'absolute', top: 15, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  blockText: { fontSize: 12, fontWeight: '800' },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.nowLine, zIndex: 3 },
  ticks: { height: 18 },
  tick: { position: 'absolute', top: 3, width: 40, textAlign: 'center', fontSize: 11, fontWeight: '600', color: colors.fgMutedField },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 52, paddingVertical: 6, paddingRight: 4, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  rowOpen: { flexDirection: 'column', alignItems: 'stretch', gap: 6, marginVertical: 4, marginHorizontal: -4, paddingTop: 10, paddingBottom: 10, paddingLeft: 4, paddingRight: 8, borderWidth: 2, borderBottomWidth: 2, borderRadius: 14 },
  rowCurrent: { borderColor: colors.infoBorder, borderBottomColor: colors.infoBorder, backgroundColor: colors.infoBg },
  rowNext: { borderColor: colors.brand, borderBottomColor: colors.brand, backgroundColor: colors.brandSoft },
  openTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  openActions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10 },
  where: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  whereText: { flex: 1, fontSize: 12, fontWeight: '700' },
  left: { width: 92, paddingLeft: 30 },
  window: { fontSize: 18, lineHeight: 22, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  time: { fontSize: 12, fontWeight: '600', color: colors.fgMutedField },
  closedText: { color: colors.fgSecondary },
  movedText: { color: colors.fgMutedField, textDecorationLine: 'line-through' },
  middle: { flex: 1, minWidth: 0, gap: 3 },
  line1: { fontSize: 16, lineHeight: 21, color: colors.fgDefault },
  line1Row: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  line1Text: { flexShrink: 1 },
  client: { fontWeight: '700', color: colors.fgDefault },
  area: { color: colors.fgSecondary },
  line2: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  kind: { flexShrink: 1, fontSize: 13, color: colors.fgMutedField },
  chev: { alignSelf: 'center' },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.brandPressed },
  miniText: { fontSize: 14, fontWeight: '700', color: colors.fgOnFill },
  miniGhost: { backgroundColor: colors.bgCard, borderWidth: 1.5, borderColor: colors.brandPressed },
  miniGhostText: { color: colors.brandPressed },
  gap: { justifyContent: 'center', height: 30, marginVertical: 4, paddingLeft: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.successBorder, borderRadius: 8, backgroundColor: colors.successBg },
  gapText: { fontSize: 13, fontWeight: '700', color: colors.successFg },

  week: { flexDirection: 'row', gap: 2, marginTop: 8 },
  wd: { flex: 1, alignItems: 'center', height: 58, paddingVertical: 4, borderRadius: 12 },
  wdOn: { backgroundColor: colors.brandPressed },
  wl: { fontSize: 12, fontWeight: '600', color: colors.fgMutedField },
  wn: { fontSize: 19, lineHeight: 24, fontWeight: '700', color: colors.fgDefault },
  wc: { fontSize: 12, fontWeight: '700', color: colors.brand },
  wWeekend: { color: colors.fgMutedField, fontWeight: '500' },
  wToday: { color: colors.brand },
  wOnText: { color: colors.fgOnFill },

  offbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder },
  offText: { flex: 1, fontSize: 13, color: colors.warningFg },

  empty: { alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 28 },
  emptyArt: { width: 96, height: 96, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningBg },
  emptyTitle: { fontSize: 26, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  emptyText: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary, textAlign: 'center', marginBottom: 6 },
  btnPrimary: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.brandPressed },
  btnPrimaryText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },

  tabbar: { flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: colors.borderDefault, backgroundColor: colors.bgCard },
  tb: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
  tbText: { fontSize: 11, fontWeight: '600', color: colors.fgMutedField },
});
