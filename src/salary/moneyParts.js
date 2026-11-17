// What Payments, Receipts and Unpaid Clients share (design-mockups/app-salary-parts sp.css): the
// total card on the page colour, a small empty note inside a section, the pill of a row.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';

// A section with nothing in it: a soft circle with the icon, the title, one line
export function EmptyNote({ icon, title, text }) {
  return (
    <View style={moneyStyles.empty} accessible accessibilityLabel={`${title}. ${text}`}>
      <View style={moneyStyles.emptyCircle}><Icon name={icon} size={26} color={colors.fgSecondary} /></View>
      <Text style={moneyStyles.emptyTitle}>{title}</Text>
      <Text style={moneyStyles.emptyText}>{text}</Text>
    </View>
  );
}

// «Waiting for submission» (warn), «Pending», «Declined» (plain)
export function Pill({ text, kind = 'plain' }) {
  return (
    <View style={[moneyStyles.pill, kind === 'warn' && moneyStyles.pillWarn]}>
      <Text style={[moneyStyles.pillText, kind === 'warn' && moneyStyles.pillWarnText]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export const moneyStyles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.bgPage },
  total: { gap: 2, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
  totalLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: colors.fgMutedField },
  totalBig: { fontSize: 36, lineHeight: 42, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  totalSub: { fontSize: 15, color: colors.fgSecondary },
  firstSection: { marginTop: 0 },
  empty: { alignItems: 'center', gap: 6, paddingTop: 20, paddingBottom: 24, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  emptyCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSunken },
  emptyTitle: { marginTop: 4, fontSize: 17, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary, textAlign: 'center' },
  pill: { flexShrink: 1, height: 24, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle, justifyContent: 'center' },
  pillWarn: { borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.fgSecondary },
  pillWarnText: { color: colors.warningFg },
});
