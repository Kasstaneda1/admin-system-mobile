// Salary, Checks → Receipts (design-mockups/app-salary-parts salary-receipts; site
// technician-receipts.js): this technician's checks not handed in yet, of every month — Total
// Unsubmitted, «1 check waiting for submission», a row per check: the customer with the work
// status badge, the date with «Waiting for submission», the amount. Nothing waiting: the site's
// good news. route params { from? }. Data: salary/money.js receiptsOf.
import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/colors';
import { Tag } from '../myDay/parts';
import { SectionHead, TopBar, billStyles } from '../bill/parts';
import { salaryMoneyAPI } from '../services/api';
import { NO_RECEIPTS, WAITING, receiptsOf } from '../salary/money';
import { useAnswer } from '../salary/useAnswer';
import { NoData, SalaryFrame, salaryStyles } from '../salary/parts';
import { EmptyNote, Pill, moneyStyles } from '../salary/moneyParts';

const loadReceipts = () => salaryMoneyAPI.receipts();

export default function ReceiptsScreen({ route, navigation }) {
  const params = route.params || {};
  const { answer, problem, refreshing, reload } = useAnswer(loadReceipts, 'Receipts');
  const r = useMemo(() => (answer ? receiptsOf(answer) : null), [answer]);

  return (
    <SalaryFrame navigation={navigation} top={<TopBar back={params.from || 'Salary'} title="Receipts" onBack={() => navigation.goBack()} />}>
      {!r ? <NoData problem={problem} onRetry={() => reload()} /> : (
        <ScrollView contentContainerStyle={salaryStyles.bottomSpace}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload({ pull: true })} tintColor={colors.brand} />}>
          {r.count ? (
            <>
              <View style={moneyStyles.head}>
                <View style={styles.tile} accessible accessibilityLabel={`Total Unsubmitted ${r.total}, ${r.line}`}>
                  <Text style={[moneyStyles.totalLabel, styles.warn]}>TOTAL UNSUBMITTED</Text>
                  <Text style={[styles.big, styles.warn]} numberOfLines={1} adjustsFontSizeToFit>{r.total}</Text>
                  <Text style={styles.sub}>{r.line}</Text>
                </View>
              </View>
              <View style={[billStyles.section, moneyStyles.firstSection]}>
                <SectionHead label="Checks" />
                {r.rows.map((c) => (
                  <View key={c.key} style={styles.row} accessible accessibilityLabel={`${c.client}, ${c.tag.text}, ${c.date}, ${WAITING}, ${c.amount}`}>
                    <View style={styles.left}>
                      <View style={styles.line}>
                        <Text style={styles.client} numberOfLines={1}>{c.client}</Text>
                        <Tag tag={c.tag} big fixed />
                      </View>
                      <View style={styles.line}>
                        <Text style={styles.date}>{c.date}</Text>
                        <Pill text={WAITING} kind="warn" />
                      </View>
                    </View>
                    <Text style={styles.amount}>{c.amount}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={[billStyles.section, moneyStyles.firstSection]}>
              <EmptyNote icon="checkc" title={NO_RECEIPTS.title} text={NO_RECEIPTS.text} />
            </View>
          )}
        </ScrollView>
      )}
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  tile: { gap: 4, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  warn: { color: colors.warningFg },
  big: { fontSize: 28, lineHeight: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 15, color: colors.fgSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  left: { flex: 1, minWidth: 0, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  client: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  date: { fontSize: 15, color: colors.fgSecondary },
  amount: { fontSize: 17, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
});
