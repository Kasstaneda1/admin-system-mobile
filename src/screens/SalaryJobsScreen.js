// Salary, View All Jobs (design-mockups/app-salary-parts salary-jobs; site jobsList): the jobs of
// the month the month screen loaded, newest first as the server gives them. A card: the customer,
// the date, the work status; «Not paid by the customer» with a red stripe; Your Earnings; the
// Cash and Check chips. A card opens Job Details.
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { Tag } from '../myDay/parts';
import { TopBar } from '../bill/parts';
import { MONTHS, jobCardOf, jobsWord, monthTitle } from '../salary/model';
import { SalaryFrame, salaryStyles } from '../salary/parts';

function Chip({ icon, word, value, done = false }) {
  return (
    <View style={[styles.chip, done && styles.chipDone]}>
      <Icon name={icon} size={13} color={done ? colors.successFg : colors.fgSecondary} />
      <Text style={[styles.chipText, done && styles.chipTextDone]}>{word} <Text style={styles.chipValue}>{value}</Text></Text>
    </View>
  );
}

export default function SalaryJobsScreen({ route, navigation }) {
  const { year, month, jobs = [] } = route.params || {};
  const cards = useMemo(() => jobs.map((job) => ({ job, card: jobCardOf(job) })), [jobs]);
  const head = `${monthTitle(year, month)} · ${jobsWord(jobs.length)}`.toUpperCase();

  return (
    <SalaryFrame navigation={navigation} top={<TopBar back={MONTHS[month]} title="Jobs" onBack={() => navigation.goBack()} />}>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.card.key}
        ListHeaderComponent={<Text style={salaryStyles.label} accessibilityRole="header">{head}</Text>}
        ListEmptyComponent={<Text style={styles.none}>No jobs for this period</Text>}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item: { job, card } }) => (
          <TouchableOpacity style={[styles.card, card.unpaid && styles.cardUnpaid]} onPress={() => navigation.navigate('SalaryJob', { job })}
            accessibilityRole="button"
            accessibilityLabel={[card.client, card.date, card.tag.text, card.unpaid ? 'Not paid by the customer' : null, `Your Earnings ${card.earnings}`, `Cash ${card.cash}`, `Check ${card.check}`].filter(Boolean).join(', ')}>
            <View style={styles.l1}>
              <View style={styles.who}>
                <Text style={styles.client} numberOfLines={1}>{card.client}</Text>
                <Text style={styles.date}>{card.date}</Text>
              </View>
              <Tag tag={card.tag} big fixed />
            </View>
            {card.unpaid ? (
              <View style={styles.owe}>
                <Icon name="info" size={13} color={colors.dangerFg} />
                <Text style={styles.oweText}>Not paid by the customer</Text>
              </View>
            ) : null}
            <View style={styles.earn}>
              <Text style={styles.earnLabel}>Your Earnings</Text>
              <Text style={styles.earnValue}>{card.earnings}</Text>
            </View>
            <View style={styles.chips}>
              <Chip icon="money" word="Cash" value={card.cash} />
              <Chip icon={card.handedIn ? 'check' : 'doc'} word="Check" value={card.check} done={card.handedIn} />
            </View>
          </TouchableOpacity>
        )}
      />
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  gap: { height: 8 },
  none: { paddingVertical: 32, textAlign: 'center', fontSize: 16, color: colors.fgSecondary },
  card: { gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  cardUnpaid: { borderColor: colors.dangerBorder, borderLeftWidth: 5 },
  l1: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  who: { flex: 1, minWidth: 0 },
  client: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  date: { fontSize: 13, color: colors.fgSecondary },
  owe: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, minHeight: 22, paddingHorizontal: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerBg },
  oweText: { fontSize: 12, fontWeight: '700', color: colors.dangerFg },
  earn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 24 },
  earnLabel: { fontSize: 16, color: colors.fgSecondary },
  earnValue: { fontSize: 17, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24, paddingHorizontal: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle },
  chipDone: { borderColor: colors.successBorder, backgroundColor: colors.successBg },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.fgSecondary },
  chipTextDone: { color: colors.successFg },
  chipValue: { fontWeight: '800' },
});
