// The pieces the Salary screens share (design-mockups/app-salary-parts, sp.css): the tab's own
// title, the screen with the tab bar under it, «could not load» with Try again, a section of
// rows (label · value), the brand button. Sizes in pt, colours only tokens; words from model.js.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { TabBar } from '../myDay/parts';
import { PlainButton } from '../bill/parts';

// A Salary (or Parts: tab) screen: its top (the tab title or a back bar), what it shows, the tab bar
export function SalaryFrame({ navigation, top, children, tab = 'Salary' }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="dark" />
      {top}
      <View style={styles.page}>{children}</View>
      <TabBar navigation={navigation} bottom={insets.bottom} current={tab} />
    </SafeAreaView>
  );
}

// «Salary» on the left, no back (design sp-top)
export function TabTitle({ title }) {
  return (
    <View style={styles.top}>
      <Text style={styles.topText} accessibilityRole="header">{title}</Text>
    </View>
  );
}

// No data yet: a spinner, or why not and Try again
export function NoData({ problem, onRetry }) {
  return (
    <View style={styles.noData}>
      {problem ? (
        <>
          <Text style={styles.noDataTitle}>{problem.title}</Text>
          <Text style={styles.noDataText}>{problem.text}</Text>
          <View style={styles.stretch}><PlainButton text="Try again" icon="refresh" onPress={onRetry} /></View>
        </>
      ) : <ActivityIndicator color={colors.brand} />}
    </View>
  );
}

// Label · value rows (design iv-tr): base = the line over it and big, salary = big in brand,
// muted = grey value (No parts, a check handed in)
export function KvRows({ rows }) {
  return (
    <View style={styles.kv}>
      {rows.map((r) => (
        <View key={r.key} style={[styles.kvRow, r.kind === 'base' && styles.kvBase]} accessible accessibilityLabel={`${r.label} ${r.value}`}>
          <Text style={[styles.kvLabel, r.kind === 'base' && styles.kvBig, r.kind === 'salary' && styles.kvSalary]}>{r.label}</Text>
          <Text style={[styles.kvValue, r.kind === 'base' && styles.kvBig, r.kind === 'salary' && styles.kvSalary, r.kind === 'muted' && styles.kvMuted]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

// The brand button (design sp-btn: View All Jobs)
export function BrandButton({ text, onPress }) {
  return (
    <TouchableOpacity style={styles.brandBtn} onPress={onPress} accessibilityRole="button">
      <Text style={styles.brandBtnText}>{text}</Text>
    </TouchableOpacity>
  );
}

export const salaryStyles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 12 },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, overflow: 'hidden' },
  label: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: colors.fgMutedField },
  bottomSpace: { paddingBottom: 24 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  page: { flex: 1, backgroundColor: colors.bgPage },
  top: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.borderDefault, backgroundColor: colors.bgCard },
  topText: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.fgDefault },
  noData: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28 },
  noDataTitle: { fontSize: 22, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  noDataText: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary, textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  kv: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  kvRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 26 },
  kvBase: { borderTopWidth: 1.5, borderTopColor: colors.fgDefault, paddingTop: 8 },
  kvLabel: { flexShrink: 1, fontSize: 16, lineHeight: 22, color: colors.fgSecondary },
  kvValue: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  kvBig: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.fgDefault },
  kvSalary: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.brandPressed },
  kvMuted: { fontWeight: '600', color: colors.fgMutedField },
  brandBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.brand },
  brandBtnText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },
});
