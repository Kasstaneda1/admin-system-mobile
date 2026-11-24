// Salary, Paid → Payments (design-mockups/app-salary-parts salary-payments; site
// technician-payments.js): Total Payments of the month, «November 2026 · 2 payments», the payouts
// by date, the newest first. route params { year, month, from? } — the month of the Paid row;
// opened from More without a month: this month, with the month switcher ‹ November 2026 › (the
// owner from the phone: past payouts could not be seen from More; Salary's year switcher look;
// the payouts are one answer, a step asks nothing). Data: salary/money.js paymentsOf.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import { useAuth } from '../session/AuthContext';
import Icon from '../myDay/Icon';
import { SectionHead, TopBar, billStyles } from '../bill/parts';
import { salaryMoneyAPI } from '../services/api';
import { NO_PAYMENTS, canNextMonth, monthOfParams, paymentsOf, cameFrom, stepMonth } from '../salary/money';
import { MONTHS } from '../salary/model';
import { useAnswer } from '../salary/useAnswer';
import { NoData, SalaryFrame, salaryStyles } from '../salary/parts';
import { EmptyNote, moneyStyles } from '../salary/moneyParts';

export default function PaymentsScreen({ route, navigation }) {
  const params = route.params || {};
  const fromMore = cameFrom(params) === 'More';
  const [shown, setShown] = useState(() => monthOfParams(params));
  // opened again with other params (the Paid row of another month): that month
  useEffect(() => { setShown(monthOfParams(params)); }, [params.year, params.month, params.from]); // eslint-disable-line react-hooks/exhaustive-deps
  const { year, month } = shown;
  const next = canNextMonth(shown);
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
          {fromMore ? (
            <View style={styles.switchWrap}>
              <View style={styles.switch}>
                <TouchableOpacity style={styles.arrow} onPress={() => setShown((m) => stepMonth(m, -1))} accessibilityRole="button" accessibilityLabel="Previous month">
                  <Icon name="back" size={22} color={colors.brandPressed} />
                </TouchableOpacity>
                <Text style={styles.month} accessibilityRole="header">{`${MONTHS[month]} ${year}`}</Text>
                <TouchableOpacity style={styles.arrow} onPress={() => setShown((m) => stepMonth(m, 1))} disabled={!next} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !next }}>
                  <Icon name="chev" size={22} color={next ? colors.brandPressed : colors.fgDisabled} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View style={moneyStyles.head}>
            <View style={[salaryStyles.card, moneyStyles.total]} accessible accessibilityLabel={`Total Payments ${p.total}, ${p.line}`}>
              <Text style={moneyStyles.totalLabel}>TOTAL PAYMENTS</Text>
              {/* no adjustsFontSizeToFit here: on iOS it drew the amount tiny once the month changed; a long
                  amount ($100,000.00 and more) takes a smaller size instead */}
              <Text style={[moneyStyles.totalBig, p.total.length > 11 && styles.totalLong]} numberOfLines={1}>{p.total}</Text>
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
  // Salary's year switcher (SalaryScreen styles.switch), its own block over the total
  switchWrap: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bgPage },
  switch: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  arrow: { width: 52, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  totalLong: { fontSize: 28, lineHeight: 42 },
  month: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.fgDefault },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.borderSubtle, backgroundColor: colors.bgCard },
  ico: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successBg },
  date: { flex: 1, fontSize: 16, color: colors.fgDefault },
  amount: { fontSize: 16, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
});
