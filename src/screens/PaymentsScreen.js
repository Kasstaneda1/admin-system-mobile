// Salary, Paid → Payments (design-mockups/app-salary-parts salary-payments; site
// technician-payments.js): Total Payments of the month, «November 2026 · 2 payments», the payouts
// by date, the newest first. route params { year, month, from? } — the month of the Paid row;
// opened from More without a month: this month. Data: salary/money.js paymentsOf.
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/colors';
import { useAuth } from '../session/AuthContext';
import Icon from '../myDay/Icon';
import { SectionHead, TopBar, billStyles } from '../bill/parts';
import { salaryMoneyAPI } from '../services/api';
import { NO_PAYMENTS, monthOfParams, paymentsOf, cameFrom } from '../salary/money';
import { useAnswer } from '../salary/useAnswer';
import { NoData, SalaryFrame, salaryStyles } from '../salary/parts';
import { EmptyNote, moneyStyles } from '../salary/moneyParts';

export default function PaymentsScreen({ route, navigation }) {
  const params = route.params || {};
  const { year, month } = useMemo(() => monthOfParams(params), [params]);
  const { user } = useAuth();
  const name = user?.fullName || null;
  const load = useCallback(() => salaryMoneyAPI.payments(name), [name]);
  const { answer, problem, refreshing, reload } = useAnswer(load, 'Payments');
  const p = useMemo(() => (answer ? paymentsOf(answer, year, month) : null), [answer, year, month]);

  return (
    <SalaryFrame navigation={navigation} tab={cameFrom(params)} top={<TopBar back={cameFrom(params)} title="Payments" onBack={() => navigation.goBack()} />}>
      {!p ? <NoData problem={problem} onRetry={() => reload()} /> : (
        <ScrollView contentContainerStyle={salaryStyles.bottomSpace}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload({ pull: true })} tintColor={colors.brand} />}>
          <View style={moneyStyles.head}>
            <View style={[salaryStyles.card, moneyStyles.total]} accessible accessibilityLabel={`Total Payments ${p.total}, ${p.line}`}>
              <Text style={moneyStyles.totalLabel}>TOTAL PAYMENTS</Text>
              <Text style={moneyStyles.totalBig} numberOfLines={1} adjustsFontSizeToFit>{p.total}</Text>
              <Text style={moneyStyles.totalSub}>{p.line}</Text>
            </View>
          </View>
          <View style={[billStyles.section, moneyStyles.firstSection]}>
            <SectionHead label="Payments" />
            {p.rows.length ? p.rows.map((r) => (
              <View key={r.key} style={styles.pay} accessible accessibilityLabel={`${r.date}, ${r.amount}`}>
                <View style={styles.ico}><Icon name="wallet" size={22} color={colors.successFg} /></View>
                <Text style={styles.date}>{r.date}</Text>
                <Text style={styles.amount}>{r.amount}</Text>
              </View>
            )) : <EmptyNote icon="wallet" title={NO_PAYMENTS.title} text={NO_PAYMENTS.text} />}
          </View>
        </ScrollView>
      )}
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.borderSubtle, backgroundColor: colors.bgCard },
  ico: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successBg },
  date: { flex: 1, fontSize: 16, color: colors.fgDefault },
  amount: { fontSize: 16, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
});
