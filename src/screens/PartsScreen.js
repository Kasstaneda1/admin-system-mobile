// Parts (design-mockups/app-salary-parts parts-all, parts-onboard; site technician.html Parts):
// this technician's estimates with parts in the four stages of the portal — Arrived first and
// amber (only that stage waits for the technician), then In Transit, On Board, Scheduled. Chips
// filter by stage; a card opens the estimate (PartsEstimateScreen).
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { partsAPI } from '../services/api';
import { logError } from '../utils/logError';
import { useAuth } from '../session/AuthContext';
import Icon from '../myDay/Icon';
import { Tag } from '../myDay/parts';
import { EMPTY, EMPTY_TEXT, cardOf, chipsOf, estimatesOf, groupsOf, partsError, partsQuery } from '../parts/model';
import { NoData, SalaryFrame, TabTitle } from '../salary/parts';

export function PartCard({ card, onPress }) {
  return (
    <TouchableOpacity style={[styles.card, card.need && styles.cardNeed]} onPress={onPress} accessibilityRole="button"
      accessibilityLabel={[card.client, card.sub, card.tag.text, ...card.parts.map((p) => [p.name, p.number].filter(Boolean).join(' ')), card.note, `Estimate total ${card.total}`].filter(Boolean).join(', ')}>
      <View style={styles.l1}>
        <View style={styles.who}>
          <Text style={styles.client} numberOfLines={1}>{card.client}</Text>
          {card.sub ? <Text style={styles.sub}>{card.sub}</Text> : null}
        </View>
        <Tag tag={card.tag} big fixed />
      </View>
      <View style={styles.parts}>
        {card.parts.map((p) => (
          <View key={p.key} style={styles.part}>
            <Icon name="box" size={15} color={colors.fgSecondary} />
            <Text style={styles.partText}>
              {p.name}
              {p.number ? <Text style={styles.partNumber}>{`  ${p.number}`}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
      {card.note ? (
        <View style={styles.note}>
          <Icon name="message" size={15} color={colors.infoFg} style={styles.noteIcon} />
          <Text style={styles.noteText}>{card.note}</Text>
        </View>
      ) : null}
      <View style={styles.total}>
        <Text style={styles.totalLabel}>Estimate total</Text>
        <Text style={styles.totalValue}>{card.total}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PartsScreen({ navigation }) {
  const { user } = useAuth();
  const me = user?.fullName || null;
  const [rows, setRows] = useState(null);
  const [problem, setProblem] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const seq = useRef(0);

  const load = useCallback(async ({ pull = false } = {}) => {
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const answer = await partsAPI.list(partsQuery(me));
      if (n !== seq.current) return;
      setRows(estimatesOf(answer));
      setProblem(null);
    } catch (error) {
      if (n !== seq.current) return;
      const failed = partsError(error);
      if (failed.kind === 'failed') logError('Error loading parts:', error);
      setProblem(failed);
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const thisYear = new Date().getFullYear();
  const chips = useMemo(() => (rows ? chipsOf(rows) : []), [rows]);
  const groups = useMemo(() => (rows ? groupsOf(rows, filter) : []), [rows, filter]);

  return (
    <SalaryFrame navigation={navigation} tab="Parts" top={<TabTitle title="Parts" />}>
      {!rows ? <NoData problem={problem} onRetry={() => load()} /> : (
        <>
          <View style={styles.chipsBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
              {chips.map((c) => {
                const on = c.key === filter;
                return (
                  <TouchableOpacity key={c.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setFilter(c.key)}
                    accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${c.label}, ${c.count}`}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                    <Text style={[styles.count, on && styles.countOn, c.need && !on && styles.countNeed]}>{String(c.count)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          <ScrollView contentContainerStyle={styles.body}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.brand} />}>
            {groups.length ? groups.map((g) => (
              <View key={g.key}>
                <View style={styles.group}>
                  <Text style={styles.groupTitle} accessibilityRole="header">{g.title.toUpperCase()}</Text>
                  <Text style={styles.groupLine}>{g.line}</Text>
                </View>
                <View style={styles.cards}>
                  {g.items.map((e) => {
                    const card = cardOf(e, { me, thisYear });
                    return <PartCard key={card.key} card={card} onPress={() => navigation.navigate('PartsEstimate', { estimate: e })} />;
                  })}
                </View>
              </View>
            )) : (
              <View style={styles.empty}>
                <View style={styles.emptyCircle}><Icon name="box" size={28} color={colors.fgSecondary} /></View>
                <Text style={styles.emptyTitle}>{filter === 'all' ? EMPTY.all : EMPTY.stage}</Text>
                <Text style={styles.emptyText}>{EMPTY_TEXT}</Text>
              </View>
            )}
          </ScrollView>
        </>
      )}
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  chipsBar: { borderBottomWidth: 1, borderBottomColor: colors.borderDefault, backgroundColor: colors.bgCard },
  chips: { gap: 8, paddingVertical: 10, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  chipOn: { borderColor: colors.brandPressed, backgroundColor: colors.brandPressed },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.fgDefault },
  chipTextOn: { color: colors.fgOnFill },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, overflow: 'hidden', backgroundColor: colors.bgSunken, fontSize: 12, fontWeight: '700', lineHeight: 22, textAlign: 'center', color: colors.fgDefault },
  countOn: { backgroundColor: colors.brand, color: colors.fgOnFill },
  countNeed: { backgroundColor: colors.warningSolid, color: colors.warningOnSolid },
  body: { paddingBottom: 24 },
  group: { gap: 2, paddingTop: 14, paddingBottom: 6, paddingHorizontal: 16 },
  groupTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: colors.fgMutedField },
  groupLine: { fontSize: 13, color: colors.fgMutedField },
  cards: { gap: 8, paddingHorizontal: 16 },
  card: { gap: 6, paddingVertical: 12, paddingRight: 12, paddingLeft: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  cardNeed: { borderWidth: 1.5, borderColor: colors.warningBorder, borderLeftWidth: 5, borderLeftColor: colors.warningSolid },
  l1: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  who: { flex: 1, minWidth: 0 },
  client: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  sub: { fontSize: 13, color: colors.fgSecondary },
  parts: { gap: 3 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partText: { flex: 1, fontSize: 15, lineHeight: 20, color: colors.fgDefault },
  partNumber: { color: colors.fgMutedField, fontVariant: ['tabular-nums'] },
  note: { flexDirection: 'row', gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.infoBg },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, fontSize: 14, lineHeight: 19, color: colors.infoFg },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 24 },
  totalLabel: { fontSize: 16, color: colors.fgSecondary },
  totalValue: { fontSize: 17, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  emptyCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSunken },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 21, color: colors.fgSecondary, textAlign: 'center' },
});
