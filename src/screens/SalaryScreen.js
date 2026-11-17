// Salary, the year (design-mockups/app-salary-parts salary-year; site technician.html «Your
// Earnings»): the year switcher and twelve months — Your Earnings and how many jobs, the month of
// today marked, a month without jobs grey. A month opens its summary (SalaryMonthScreen).
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { salaryAPI } from '../services/api';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { canGoNext, monthsOf, salaryError, yearTiles } from '../salary/model';
import { NoData, SalaryFrame, TabTitle, salaryStyles } from '../salary/parts';

const todayOf = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
};

export default function SalaryScreen({ navigation }) {
  const [year, setYear] = useState(() => todayOf().year);
  const [months, setMonths] = useState(null); // { year, months }
  const [problem, setProblem] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (which, { pull = false } = {}) => {
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const data = await salaryAPI.year(which);
      if (n !== seq.current) return;
      setMonths({ year: which, months: monthsOf(data.jobs, which) });
      setProblem(null);
    } catch (error) {
      if (n !== seq.current) return;
      const failed = salaryError(error);
      if (failed.kind === 'failed') logError('Error loading the salary year:', error);
      setProblem(failed);
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(year); }, [load, year]));

  const today = todayOf();
  const shown = months && months.year === year ? months.months : null;
  const tiles = useMemo(() => (shown ? yearTiles(shown, year, today) : null), [shown, year, today.year, today.month]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = canGoNext(year, today);
  const go = (delta) => {
    setProblem(null);
    setYear((y) => y + delta);
  };

  return (
    <SalaryFrame navigation={navigation} top={<TabTitle title="Salary" />}>
      <ScrollView contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(year, { pull: true })} tintColor={colors.brand} />}>
        <View style={salaryStyles.pad}>
          <View style={styles.switch}>
            <TouchableOpacity style={styles.arrow} onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Previous year">
              <Icon name="back" size={22} color={colors.brandPressed} />
            </TouchableOpacity>
            <Text style={styles.year} accessibilityRole="header">{String(year)}</Text>
            <TouchableOpacity style={styles.arrow} onPress={() => go(1)} disabled={!next} accessibilityRole="button" accessibilityLabel="Next year" accessibilityState={{ disabled: !next }}>
              <Icon name="chev" size={22} color={next ? colors.brandPressed : colors.fgDisabled} />
            </TouchableOpacity>
          </View>
        </View>
        {tiles ? (
          <View style={[salaryStyles.pad, styles.grid]}>
            {tiles.map((t) => (
              <TouchableOpacity key={t.key} style={[styles.tile, t.empty && styles.tileEmpty, t.now && styles.tileNow]}
                onPress={() => navigation.navigate('SalaryMonth', { year, month: t.month })}
                accessibilityRole="button" accessibilityLabel={`${t.name} ${year}, ${t.empty ? 'no jobs' : `${t.amount}, ${t.sub}`}`}>
                <Text style={[styles.tileName, t.empty && styles.tileQuiet]}>{t.name}</Text>
                <Text style={[styles.tileAmount, t.empty && styles.tileQuiet]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.amount}</Text>
                <Text style={[styles.tileSub, t.empty && styles.tileQuiet]}>{t.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.wait}><NoData problem={problem} onRetry={() => load(year)} /></View>
        )}
      </ScrollView>
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 24 },
  switch: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  arrow: { width: 52, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  year: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.fgDefault },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', flexGrow: 1, minHeight: 84, gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  tileEmpty: { borderColor: colors.bgSubtle, backgroundColor: colors.bgSubtle },
  tileNow: { borderWidth: 1.5, borderColor: colors.brandPressed, backgroundColor: colors.brandSoft },
  tileName: { fontSize: 15, fontWeight: '700', color: colors.fgDefault },
  tileAmount: { fontSize: 16, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  tileSub: { fontSize: 12, color: colors.fgSecondary },
  tileQuiet: { color: colors.fgMutedField },
  wait: { minHeight: 320 },
});
