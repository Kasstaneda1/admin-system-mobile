// Salary, Unpaid → Unpaid Clients (design-mockups/app-salary-parts salary-unpaid; site
// technician-unpaid.js): tabs Pending and Declined with their counts; a card per record — the
// customer, the date, the status, Amount, the manager's notes when there are any (as the site);
// a red stripe on the left. An empty tab and no records at all: the site's words. route params
// { from? }. Data: salary/money.js unpaidOf.
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import { useAuth } from '../session/AuthContext';
import Icon from '../myDay/Icon';
import { TopBar } from '../bill/parts';
import { salaryMoneyAPI } from '../services/api';
import { MANAGER_NOTES, NO_UNPAID, UNPAID_EMPTY, unpaidOf } from '../salary/money';
import { useAnswer } from '../salary/useAnswer';
import { NoData, SalaryFrame, salaryStyles } from '../salary/parts';
import { EmptyNote, Pill } from '../salary/moneyParts';

export default function UnpaidScreen({ route, navigation }) {
  const params = route.params || {};
  const { user } = useAuth();
  const name = user?.fullName || null;
  const load = useCallback(() => salaryMoneyAPI.unpaid(name), [name]);
  const { answer, problem, refreshing, reload } = useAnswer(load, 'Unpaid Clients');
  const u = useMemo(() => (answer ? unpaidOf(answer) : null), [answer]);
  const [tab, setTab] = useState('pending');
  const rows = u ? u[tab] : [];

  return (
    <SalaryFrame navigation={navigation} top={<TopBar back={params.from || 'Salary'} title="Unpaid Clients" onBack={() => navigation.goBack()} />}>
      {!u ? <NoData problem={problem} onRetry={() => reload()} /> : (
        <>
          {u.none ? null : (
            <View style={styles.chipsBar}>
              <View style={styles.chips} accessibilityRole="tablist">
                {u.tabs.map((t) => {
                  const on = t.key === tab;
                  return (
                    <TouchableOpacity key={t.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setTab(t.key)}
                      accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${t.label}, ${t.count}`}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
                      <Text style={[styles.count, on && styles.countOn]}>{String(t.count)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          <ScrollView contentContainerStyle={[styles.body, salaryStyles.bottomSpace]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload({ pull: true })} tintColor={colors.brand} />}>
            {u.none ? (
              <EmptyNote icon="checkc" title={NO_UNPAID} text="Customers who have not paid show up here." />
            ) : rows.length ? rows.map((r) => (
              <View key={r.key} style={styles.card} accessible
                accessibilityLabel={[r.client, r.date, r.status, `Amount ${r.amount}`, r.note ? `${MANAGER_NOTES}: ${r.note}` : null].filter(Boolean).join(', ')}>
                <View style={styles.l1}>
                  <View style={styles.who}>
                    <Text style={styles.client} numberOfLines={1}>{r.client}</Text>
                    <Text style={styles.date}>{r.date}</Text>
                  </View>
                  <Pill text={r.status} />
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Amount</Text>
                  <Text style={styles.amount}>{r.amount}</Text>
                </View>
                {r.note ? (
                  <View style={styles.note}>
                    <View style={styles.noteHead}>
                      <Icon name="note" size={14} color={colors.fgSecondary} />
                      <Text style={styles.noteLabel}>{MANAGER_NOTES}</Text>
                    </View>
                    <Text style={styles.noteText}>{r.note}</Text>
                  </View>
                ) : null}
              </View>
            )) : (
              <EmptyNote icon="checkc" title={UNPAID_EMPTY[tab].title} text={UNPAID_EMPTY[tab].text} />
            )}
          </ScrollView>
        </>
      )}
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  chipsBar: { borderBottomWidth: 1, borderBottomColor: colors.borderDefault, backgroundColor: colors.bgCard },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  chipOn: { borderColor: colors.brandPressed, backgroundColor: colors.brandPressed },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.fgDefault },
  chipTextOn: { color: colors.fgOnFill },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, overflow: 'hidden', backgroundColor: colors.bgSunken, fontSize: 12, fontWeight: '700', lineHeight: 22, textAlign: 'center', color: colors.fgDefault },
  countOn: { backgroundColor: colors.brand, color: colors.fgOnFill },
  body: { gap: 10, paddingTop: 12, paddingHorizontal: 16 },
  card: { gap: 6, paddingVertical: 12, paddingRight: 14, paddingLeft: 18, borderRadius: 14, borderWidth: 1, borderColor: colors.dangerBorder, borderLeftWidth: 4, borderLeftColor: colors.dangerFg, backgroundColor: colors.bgCard },
  l1: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  who: { flex: 1, minWidth: 0 },
  client: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  date: { fontSize: 13, color: colors.fgSecondary },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  amountLabel: { fontSize: 16, color: colors.fgSecondary },
  amount: { fontSize: 17, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  note: { gap: 2, marginTop: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.fgSecondary },
  noteText: { fontSize: 15, lineHeight: 20, color: colors.fgDefault },
});
