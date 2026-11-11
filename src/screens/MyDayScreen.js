// My day (TECH_APP_MY_DAY_SPEC.md §3–4, design A3: design-mockups/tech-app/final-a3.html,
// screens day, busy, tomorrow, empty, offline). Read only: actions come in APP-3, Route in
// APP-2b. The week is one request (GET /api/my/visits?from=Sunday&to=Saturday); what a day
// shows is model.js. The phone keeps the latest weeks for offline (storage.js).
//
// Fresh: on opening, on coming back to the screen or to the app, on pulling down, and every
// 60 seconds while the screen is open (§4 «Свежесть»).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { myDayAPI } from '../services/api';
import { logError } from '../utils/logError';
import { useAuth } from '../session/AuthContext';
import {
  addDays, buildDay, emptyText, failedText, headerLine, keepWeek, keptWeek, listItems, nextBusyDay, nowWall, offerText,
  offlineText, skewOf, stripOf, weekCounts, weekOf,
} from '../myDay/model';
import { readMyDay, writeMyDay } from '../myDay/storage';
import { callCustomer, openDirections } from '../myDay/phoneLinks';
import { DayRow, EmptyDay, GapRow, NoticeBar, Strip, TabBar, WeekRow } from '../myDay/parts';

const REFRESH_MS = 60 * 1000;

export default function MyDayScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id ?? null;

  const skew = useRef(0);
  const [tick, setTick] = useState(Date.now());          // re-draws «now» each minute
  const now = useMemo(() => nowWall(tick, skew.current), [tick]);
  const [selected, setSelected] = useState(() => nowWall(Date.now()).date);
  const sunday = weekOf(selected)[0];

  // { sunday, visits, savedAt, source: 'server' | 'kept' } of the week shown
  const [week, setWeek] = useState(null);
  const [problem, setProblem] = useState(null);         // null | 'offline' | 'failed'
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async (target, { pull = false } = {}) => {
    const seq = ++loadSeq.current;
    if (pull) setRefreshing(true); else setLoading(true);
    const kept = await readMyDay();
    const keptOne = keptWeek(kept, userId, target);
    // what the phone has shows at once; the server's answer replaces it
    if (keptOne && seq === loadSeq.current) setWeek((w) => (w && w.sunday === target && w.source === 'server' ? w : { sunday: target, ...keptOne, source: 'kept' }));
    try {
      const data = await myDayAPI.visits(target, addDays(target, 6));
      if (seq !== loadSeq.current) return;
      const answeredAt = Date.now();
      skew.current = skewOf(data.server_time, answeredAt);
      // the moment of the day kept, by the server's clock (the phone's may be off)
      const savedAt = answeredAt + skew.current;
      const visits = Array.isArray(data.visits) ? data.visits : [];
      setWeek({ sunday: target, visits, savedAt, source: 'server' });
      setProblem(null);
      setTick(Date.now());
      await writeMyDay(keepWeek(kept, userId, target, visits, savedAt));
    } catch (error) {
      if (seq !== loadSeq.current) return;
      const status = error.response?.status;
      // no signal is ordinary in the field (a basement, an elevator) and the list asks every
      // minute: only the server's own failure goes to the log
      if (status >= 500) logError('Error loading my day:', error);
      setProblem(status ? 'failed' : 'offline');
      if (!keptOne) setWeek((w) => (w && w.sunday === target ? w : null));
    } finally {
      if (seq === loadSeq.current) { setLoading(false); setRefreshing(false); }
    }
  }, [userId]);

  // the week of the selected day, again when it changes
  useEffect(() => { load(sunday); }, [sunday, load]);

  // back on the screen: fresh, then every minute while it stays open
  useFocusEffect(useCallback(() => {
    setTick(Date.now());
    const timer = setInterval(() => { setTick(Date.now()); load(weekOf(selected)[0]); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, selected]));
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    load(weekOf(selected)[0]);
  }, [load, selected]));

  // back to the app
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setTick(Date.now()); load(weekOf(selected)[0]); }
    });
    return () => sub.remove();
  }, [load, selected]);

  const visits = week && week.sunday === sunday ? week.visits : null;
  const day = useMemo(() => (visits ? buildDay(visits, selected, now) : null), [visits, selected, now]);
  const strip = useMemo(() => (day && day.live.length ? stripOf(day, now) : null), [day, now]);
  const dates = weekOf(selected);
  const counts = useMemo(() => (visits ? weekCounts(visits, dates, now) : null), [visits, sunday, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const offer = day && !day.rows.length && counts ? nextBusyDay(counts, selected) : null;
  const small = day ? (day.summary.small || offerText(offer)) : '';

  const notice = problem && week && week.sunday === sunday
    ? (problem === 'offline' ? offlineText(week.savedAt, now) : failedText(week.savedAt, now))
    : null;

  const list = day ? listItems(day).map((item) => (item.type === 'gap'
    ? <GapRow key={`gap-${item.gap.from}`} gap={item.gap} />
    : <DayRow key={item.row.key} row={item.row}
        onDirections={() => openDirections(item.row.visit)}
        onCall={() => callCustomer(item.row.visit)} />)) : [];

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.top}>
        <Text style={styles.hello} numberOfLines={1}>{headerLine(selected, now, user?.fullName)}</Text>
        <Text style={styles.sum} numberOfLines={1}>
          <Text style={styles.sumBig}>{day ? day.summary.big : ' '}</Text>
          {small ? ` · ${small}` : ''}
        </Text>
        {notice ? <NoticeBar text={notice} kind={problem === 'offline' ? 'offline' : 'failed'} /> : null}
        <WeekRow week={dates} counts={counts} selected={selected} today={now.date}
          onSelect={setSelected} onWeek={(dir) => setSelected((d) => addDays(d, dir * 7))} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(sunday, { pull: true })} tintColor={colors.brand} />}>
        {!day && loading ? <ActivityIndicator style={styles.spinner} color={colors.brand} /> : null}
        {!day && !loading && problem ? (
          <View style={styles.noData}>
            <Text style={styles.noDataTitle}>{problem === 'offline' ? 'No connection' : 'Could not load your day'}</Text>
            <Text style={styles.noDataText}>Nothing is saved on this phone for this week yet.</Text>
            <TouchableOpacity style={styles.retry} onPress={() => load(sunday)} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {day && !day.rows.length ? (
          <EmptyDay title={emptyText(selected, now)}
            offer={offer ? offerText(offer, { long: true }) : null}
            onOffer={() => offer && setSelected(offer.date)} />
        ) : null}
        {day && day.rows.length ? (
          <>
            <Strip strip={strip} />
            <View style={styles.list}>{list}</View>
          </>
        ) : null}
      </ScrollView>

      <TabBar navigation={navigation} bottom={insets.bottom} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  top: { paddingTop: 2, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.borderDefault, backgroundColor: colors.bgCard },
  hello: { fontSize: 14, fontWeight: '600', color: colors.fgMutedField },
  sum: { fontSize: 16, lineHeight: 26, color: colors.fgSecondary },
  sumBig: { fontSize: 21, fontWeight: '800', color: colors.fgDefault },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 16 },
  list: { paddingTop: 4, paddingHorizontal: 12 },
  spinner: { marginTop: 48 },
  noData: { alignItems: 'center', gap: 10, paddingTop: 56, paddingHorizontal: 28 },
  noDataTitle: { fontSize: 22, fontWeight: '700', color: colors.fgDefault },
  noDataText: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary, textAlign: 'center' },
  retry: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  retryText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },
});
