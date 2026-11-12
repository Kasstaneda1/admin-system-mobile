// The pieces the bill's screens share (design-mockups/app-invoice, invoice.css): the top bar
// with its back word and title, a section with its label and link, a line of the bill, the
// «+ Add …» row, a box of words, the totals and the bar at the bottom. Sizes in pt, colours
// only tokens; the words come from model.js.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';

// «< Visit   Bill   Done»; a long title with nothing on the right sits left, after the back
// word (design preview: «< Bill  What the customer gets»)
export function TopBar({ back, title, onBack, right = null, onRight, rightOff = false, wide = false }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel={`Back to ${back}`}>
        <Icon name="back" size={20} color={colors.brandPressed} />
        <Text style={styles.backText} numberOfLines={1}>{back}</Text>
      </TouchableOpacity>
      <Text style={[styles.title, wide && styles.titleWide]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <View style={wide ? null : styles.right}>
        {right ? (
          <TouchableOpacity style={styles.rightBtn} onPress={onRight} disabled={rightOff} accessibilityRole="button" accessibilityState={{ disabled: rightOff }}>
            <Text style={[styles.rightText, rightOff && styles.rightOff]}>{right}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// SERVICES ………… Price book
export function SectionHead({ label, link = null, icon = null, onLink }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel} accessibilityRole="header">{label.toUpperCase()}</Text>
      {link ? (
        <TouchableOpacity style={styles.sectionLink} onPress={onLink} accessibilityRole="button">
          {icon ? <Icon name={icon} size={18} color={colors.brandPressed} /> : null}
          <Text style={styles.sectionLinkText}>{link}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// A line of the bill: name, how it is counted, where it came from, its amount; a chevron when
// it can be changed, a lock when it is the server's
export function LineRow({ row, onPress, note = null }) {
  const Wrap = row.editable ? TouchableOpacity : View;
  const label = [row.name, row.sub, row.badge, row.changed, row.amount, row.locked ? 'set by the office' : null].filter(Boolean).join(', ');
  return (
    <Wrap style={styles.line} onPress={row.editable ? () => onPress(row.line) : undefined}
      accessible accessibilityRole={row.editable ? 'button' : undefined} accessibilityLabel={label}>
      <View style={styles.lineBody}>
        <Text style={styles.lineName}>{row.name}</Text>
        {row.sub ? <Text style={styles.lineSub}>{row.sub}</Text> : null}
        {row.badge || row.changed ? (
          <View style={styles.badges}>
            {row.badge ? <Text style={styles.badge}>{row.badge}</Text> : null}
            {row.changed ? <Text style={[styles.badge, styles.badgeChanged]}>{row.changed}</Text> : null}
          </View>
        ) : null}
        {note ? <Text style={styles.lineNote}>{note}</Text> : null}
      </View>
      <Text style={[styles.amount, row.deduction && styles.deduction]}>{row.amount}</Text>
      {row.editable ? <Icon name="chev" size={18} color={colors.fgSecondary} /> : null}
      {row.locked ? <Icon name="lock" size={18} color={colors.fgSecondary} /> : null}
    </Wrap>
  );
}

// «(+) Add service»
export function AddRow({ text, onPress, off = false }) {
  return (
    <TouchableOpacity style={styles.add} onPress={onPress} disabled={off} accessibilityRole="button" accessibilityState={{ disabled: off }}>
      <View style={[styles.addDot, off && styles.addDotOff]}><Icon name="plus" size={18} color={off ? colors.fgDisabled : colors.brandPressed} /></View>
      <Text style={[styles.addText, off && styles.addTextOff]}>{text}</Text>
    </TouchableOpacity>
  );
}

// A box of words: info (blue), done (green), warn (amber), danger (red)
const BOX = {
  info: [colors.infoFg, colors.infoBg, colors.infoBorder],
  done: [colors.successFg, colors.successBg, colors.successBorder],
  warn: [colors.warningFg, colors.warningBg, colors.warningBorder],
  danger: [colors.dangerFg, colors.dangerBg, colors.dangerBorder],
  plain: [colors.fgSecondary, colors.bgCard, colors.borderDefault],
};
export function Box({ kind = 'info', icon = 'info', title = null, text = null, children = null, style }) {
  const [fg, bg, border] = BOX[kind] || BOX.info;
  return (
    <View style={[styles.box, { backgroundColor: bg, borderColor: border }, style]} accessible accessibilityLabel={[title, text].filter(Boolean).join('. ')}>
      <Icon name={icon} size={20} color={fg} style={styles.boxIcon} />
      <View style={styles.boxBody}>
        {title ? <Text style={[styles.boxTitle, { color: fg }]}>{title}</Text> : null}
        {text ? <Text style={[styles.boxText, { color: fg }]}>{text}</Text> : null}
        {children}
      </View>
    </View>
  );
}

// Subtotal … Balance due (model.js totalsOf)
export function Totals({ rows }) {
  return (
    <View style={styles.totals}>
      {rows.map((r) => (
        <View key={r.key} style={[styles.totalRow, r.kind === 'total' && styles.totalRowTotal]} accessible accessibilityLabel={`${r.label} ${r.value}${r.sub ? `, ${r.sub}` : ''}`}>
          <View style={styles.totalLeft}>
            <Text style={[styles.totalLabel, r.kind === 'total' && styles.totalBig, r.kind === 'balance' && styles.totalBalance]}>{r.label}</Text>
            {r.sub ? <Text style={styles.totalSub}>{r.sub}</Text> : null}
          </View>
          <Text style={[styles.totalValue, r.kind === 'deduction' && styles.deduction, r.kind === 'total' && styles.totalBig, r.kind === 'balance' && styles.totalBalance]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

// The amber button of the screen (one), with its icon; waiting: a spinner in it
export function MainButton({ text, icon, onPress, off = false, waiting = false }) {
  const dead = off || waiting;
  return (
    <TouchableOpacity style={[styles.main, off && styles.mainOff]} onPress={onPress} disabled={dead} accessibilityRole="button" accessibilityState={{ disabled: dead, busy: waiting }}>
      {waiting ? <ActivityIndicator color={colors.onAccent} /> : (
        <>
          {icon ? <Icon name={icon} size={24} color={off ? colors.fgDisabled : colors.onAccent} /> : null}
          <Text style={[styles.mainText, off && styles.mainTextOff]}>{text}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// A plain button (SEMIX_STYLE «Secondary»)
export function PlainButton({ text, icon, onPress, off = false, waiting = false }) {
  const dead = off || waiting;
  return (
    <TouchableOpacity style={[styles.plain, off && styles.plainOff]} onPress={onPress} disabled={dead} accessibilityRole="button" accessibilityState={{ disabled: dead, busy: waiting }}>
      {waiting ? <ActivityIndicator color={colors.fgDefault} /> : (
        <>
          {icon ? <Icon name={icon} size={20} color={off ? colors.fgDisabled : colors.fgDefault} /> : null}
          <Text style={[styles.plainText, off && styles.mainTextOff]}>{text}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// The bar at the bottom: 'Total $250.41 · balance due   $150.41' over the buttons
export function Foot({ foot, bottom, children, note = null }) {
  return (
    <View style={[styles.foot, { paddingBottom: Math.max(bottom, 10) }]}>
      {foot ? (
        <View style={styles.footRow} accessible accessibilityLabel={`${foot.text} ${foot.big}`}>
          <Text style={styles.footText} numberOfLines={1}>{foot.text}</Text>
          <Text style={styles.footBig}>{foot.big}</Text>
        </View>
      ) : null}
      {children}
      {note ? <Text style={styles.footNote}>{note}</Text> : null}
    </View>
  );
}

export const billStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  page: { flex: 1, backgroundColor: colors.bgPage },
  section: { backgroundColor: colors.bgCard, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSubtle, marginTop: 10 },
  quiet: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary, paddingHorizontal: 16, paddingBottom: 14 },
  noData: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28, backgroundColor: colors.bgPage },
  noDataTitle: { fontSize: 22, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  noDataText: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary, textAlign: 'center' },
  retry: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  retryText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },
});

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.borderDefault, backgroundColor: colors.bgCard },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, minWidth: 80, paddingLeft: 4, paddingRight: 8 },
  backText: { fontSize: 17, fontWeight: '600', color: colors.brandPressed, flexShrink: 1 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.fgDefault },
  titleWide: { textAlign: 'left', paddingLeft: 8, paddingRight: 16 },
  right: { minWidth: 80, alignItems: 'flex-end' },
  rightBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  rightText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  rightOff: { color: colors.fgDisabled },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 16, paddingTop: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.3, color: colors.fgSecondary },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  sectionLinkText: { fontSize: 16, fontWeight: '700', color: colors.brandPressed },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  lineBody: { flex: 1, gap: 2 },
  lineName: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  lineSub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  lineNote: { fontSize: 13, lineHeight: 18, color: colors.warningFg, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: { fontSize: 12, fontWeight: '700', color: colors.neutralFg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle, overflow: 'hidden' },
  badgeChanged: { color: colors.infoFg, borderColor: colors.infoBorder, backgroundColor: colors.infoBg },
  amount: { fontSize: 17, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  deduction: { color: colors.successFg },
  add: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  addDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  addDotOff: { backgroundColor: colors.bgSunken },
  addText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  addTextOff: { color: colors.fgDisabled },
  box: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  boxIcon: { marginTop: 1 },
  boxBody: { flex: 1, gap: 2 },
  boxTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800' },
  boxText: { fontSize: 15, lineHeight: 20 },
  totals: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  totalRowTotal: { borderTopWidth: 1.5, borderTopColor: colors.fgDefault, paddingTop: 8 },
  totalLeft: { flex: 1 },
  totalLabel: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary },
  totalSub: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: colors.fgSecondary },
  totalValue: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  totalBig: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.fgDefault },
  totalBalance: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.brandPressed },
  main: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60, borderRadius: 14, backgroundColor: colors.accent },
  mainOff: { backgroundColor: colors.bgSunken, borderWidth: 1.5, borderColor: colors.borderDefault },
  mainText: { fontSize: 20, fontWeight: '800', color: colors.onAccent },
  mainTextOff: { color: colors.fgDisabled },
  plain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  plainOff: { backgroundColor: colors.bgSunken, borderColor: colors.borderDefault },
  plainText: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  foot: { paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.borderDefault, backgroundColor: colors.bgCard },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footText: { flex: 1, fontSize: 15, color: colors.fgSecondary },
  footBig: { fontSize: 24, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  footNote: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary, paddingBottom: 2 },
});
