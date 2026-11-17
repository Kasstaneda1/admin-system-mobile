// Salary, a month (design-mockups/app-salary-parts salary-month, salary-negative, salary-empty;
// site monthDetail): Your Earnings and the jobs; Paid → Payments, Cash, Checks → Receipts,
// To Pay (the balance as of the last day of the month, below zero in red with a word on what
// the minus means), Unpaid → Unpaid; the Breakdown by work status and View All Jobs.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import { salaryAPI } from '../services/api';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { Tag } from '../myDay/parts';
import { Box, SectionHead, TopBar, billStyles } from '../bill/parts';
import { MINUS_NOTE, breakdownOf, isEmptyMonth, monthTitle, salaryError, summaryOf } from '../salary/model';
import { BrandButton, NoData, SalaryFrame, salaryStyles } from '../salary/parts';

export default function SalaryMonthScreen({ route, navigation }) {
  const { year, month } = route.params || {};
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async ({ pull = false } = {}) => {
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const answer = await salaryAPI.month(year, month);
      if (n !== seq.current) return;
      setData(answer);
      setProblem(null);
    } catch (error) {
      if (n !== seq.current) return;
      const failed = salaryError(error);
      if (failed.kind === 'failed') logError('Error loading the salary month:', error);
      setProblem(failed);
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  }, [year, month]);
  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => (data ? summaryOf(data, year, month) : null), [data, year, month]);
  const breakdown = useMemo(() => (data ? breakdownOf(data.breakdown) : []), [data]);
  const title = monthTitle(year, month);
  const top = <TopBar back={String(year)} title={title} onBack={() => navigation.goBack()} />;

  if (!data) {
    return <SalaryFrame navigation={navigation} top={top}><NoData problem={problem} onRetry={() => load()} /></SalaryFrame>;
  }

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.brand} />;
  if (isEmptyMonth(data)) {
    return (
      <SalaryFrame navigation={navigation} top={top}>
        <ScrollView contentContainerStyle={styles.emptyWrap} refreshControl={refresh}>
          <View style={styles.empty}>
            <View style={styles.emptyCircle}><Icon name="money" size={28} color={colors.fgSecondary} /></View>
            <Text style={styles.emptyTitle}>No jobs for this period</Text>
            <Text style={styles.emptyText}>Jobs show up here after the office enters them.</Text>
          </View>
        </ScrollView>
      </SalaryFrame>
    );
  }

  const open = (row) => {
    if (row.go) navigation.navigate(row.go);
  };

  return (
    <SalaryFrame navigation={navigation} top={top}>
      <ScrollView contentContainerStyle={salaryStyles.bottomSpace} refreshControl={refresh}>
        <View style={salaryStyles.pad}>
          <View style={salaryStyles.card}>
            <View style={styles.earn} accessible accessibilityLabel={`Your Earnings ${summary.total}, ${summary.jobs}`}>
              <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>{summary.total}</Text>
              <Text style={styles.sub}>{summary.jobs}</Text>
            </View>
            <View style={styles.rows}>
              {summary.rows.map((r) => {
                const Wrap = r.go ? TouchableOpacity : View;
                return (
                  <Wrap key={r.key} style={[styles.row, r.strong && styles.strong, r.minus && styles.minus]} onPress={r.go ? () => open(r) : undefined}
                    accessible accessibilityRole={r.go ? 'button' : undefined} accessibilityLabel={`${r.label} ${r.value}${r.sub ? `, ${r.sub}` : ''}`}>
                    <View style={styles.rowLeft}>
                      <Text style={[styles.rowLabel, r.strong && styles.strongLabel, r.minus && styles.minusText]}>{r.label}</Text>
                      {r.sub ? <Text style={[styles.rowSub, r.strong && styles.strongSub, r.minus && styles.minusText]}>{r.sub}</Text> : null}
                    </View>
                    <Text style={[styles.rowValue, r.ok && styles.ok, r.strong && styles.strongValue, r.minus && styles.minusText]}>{r.value}</Text>
                    {r.go ? <Icon name="chev" size={18} color={colors.fgMutedField} /> : null}
                  </Wrap>
                );
              })}
            </View>
          </View>
        </View>
        {summary.minus ? (
          <View style={salaryStyles.pad}><Box kind="danger" icon="info" title={MINUS_NOTE.title} text={MINUS_NOTE.text} /></View>
        ) : null}
        <View style={billStyles.section}>
          <SectionHead label="Breakdown" />
          <View style={styles.breakdown}>
            {breakdown.map((b) => (
              <View key={b.key} style={styles.bdRow} accessible accessibilityLabel={`${b.tag.text}, ${b.value}`}>
                <Tag tag={b.tag} big />
                <Text style={styles.bdValue}>{b.value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.button}>
            <BrandButton text="View All Jobs" onPress={() => navigation.navigate('SalaryJobs', { year, month, jobs: data.jobs || [] })} />
          </View>
        </View>
      </ScrollView>
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  earn: { gap: 2, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  big: { fontSize: 36, lineHeight: 42, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 14, color: colors.fgSecondary },
  rows: { paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: 6, paddingLeft: 16, paddingRight: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 16, color: colors.fgSecondary },
  rowSub: { fontSize: 12, color: colors.fgMutedField },
  rowValue: { fontSize: 16, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  ok: { color: colors.successFg },
  strong: { marginVertical: 4, marginHorizontal: 8, paddingLeft: 12, borderRadius: 12, borderTopWidth: 0, backgroundColor: colors.brandSoft },
  strongLabel: { fontWeight: '800', color: colors.brandSoftFg },
  strongSub: { fontWeight: '600', color: colors.brandSoftFg },
  strongValue: { fontSize: 22, fontWeight: '800', color: colors.brandPressed },
  minus: { borderWidth: 1.5, borderColor: colors.dangerBorder, backgroundColor: colors.dangerBg },
  minusText: { color: colors.dangerFg },
  breakdown: { paddingHorizontal: 16, gap: 10 },
  bdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 30 },
  bdValue: { fontSize: 16, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  button: { padding: 16 },
  emptyWrap: { flexGrow: 1 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  emptyCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSunken },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 21, color: colors.fgSecondary, textAlign: 'center' },
});
