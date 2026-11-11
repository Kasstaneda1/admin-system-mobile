// My day (TECH_APP_MY_DAY_SPEC.md §3–4, design A3: design-mockups/tech-app/final-a3.html,
// screens day, busy, tomorrow, empty, offline). Read only: actions come in APP-3, Route in
// APP-2b. The week is one request (GET /api/my/visits?from=Sunday&to=Saturday); what a day
// shows is model.js. The phone keeps the latest weeks for offline (storage.js).
//
// Fresh: on opening, on coming back to the screen or to the app, on pulling down, and every
// 60 seconds while the screen is open (§4 «Свежесть»).
// NEW and UPDATED (fresh.js, N3-APP): each read of the week is noted in what the phone keeps
// of the visits seen (seenStore.js); a row the technician has not had on that day is NEW, one
// the office changed since he opened it is UPDATED; opening the visit clears it (VisitScreen).
// A grey row of the day log the office made since the day was last shown is NEW for this
// showing of the day: a showing begins when a day is picked, when the screen or the app comes
// back. Their count is on the My day tab, a dot on the other days of the week that have one.
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
import { myDayMark, readMyDay, updateMyDay } from '../myDay/storage';
import { freshCounts, freshMarks, noteShown, noteWeek, shownAt } from '../myDay/fresh';
import { seenMark, updateSeen } from '../myDay/seenStore';
import { callCustomer, openDirections } from '../myDay/phoneLinks';
import { DayRow, EmptyDay, GapRow, NoticeBar, Strip, TabBar, WeekRow } from '../myDay/parts';
import { hasIssue } from '../myDay/route';
import { keepRoute, keptRoute, marksOf } from '../myDay/routeMarks';
import Icon from '../myDay/Icon';

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
  // what the phone keeps of the visits seen (fresh.js): undefined until read, read in the
  // queue after any change
  const [seen, setSeen] = useState(undefined);
  const readSeenNow = useCallback(() => { updateSeen((s) => s, seenMark()).then(setSeen); }, []);
  const seenRef = useRef(seen);
  seenRef.current = seen;
  // the showings of the day (fresh.js noteShown): their number, and whether this screen is the
  // one on top — a read while a visit is open over it is not a showing
  const [showingN, setShowingN] = useState(0);
  const nextShowing = useCallback(() => setShowingN((n) => n + 1), []);
  const [focused, setFocused] = useState(false);

  const load = useCallback(async (target, { pull = false } = {}) => {
    const seq = ++loadSeq.current;
    const mark = myDayMark();                           // an answer after sign out is not kept
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
      updateSeen((s) => noteWeek(s, userId, target, visits, savedAt), seenMark()).then(setSeen);
      await updateMyDay((cache) => keepWeek(cache, userId, target, visits, savedAt), mark);
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

  // the week of the selected day: loaded when the week changes, not when another day of the
  // same week is picked (the week is one request)
  useEffect(() => { load(sunday); }, [sunday, load]);
  // the refreshes below read the week shown through a ref, so picking a day neither asks
  // again nor restarts the minute
  const sundayRef = useRef(sunday);
  sundayRef.current = sunday;

  // back on the screen: fresh, then every minute while it stays open
  useFocusEffect(useCallback(() => {
    setTick(Date.now());
    const timer = setInterval(() => { setTick(Date.now()); load(sundayRef.current); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]));
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    // back from a visit: its mark may be gone; the day is shown again
    setFocused(true);
    readSeenNow();
    nextShowing();
    if (firstFocus.current) { firstFocus.current = false; return () => setFocused(false); }
    load(sundayRef.current);
    return () => setFocused(false);
  }, [load, readSeenNow, nextShowing]));

  // back to the app
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setTick(Date.now()); nextShowing(); load(sundayRef.current); }
    });
    return () => sub.remove();
  }, [load, nextShowing]);

  const visits = week && week.sunday === sunday ? week.visits : null;
  const day = useMemo(() => (visits ? buildDay(visits, selected, now) : null), [visits, selected, now]);
  // A showing of the day keeps the moment the day had when it began: its grey rows made since
  // stay NEW while it is on the screen. The day on the screen is noted with the moment of its
  // data, so at the next showing they are seen.
  const [showing, setShowing] = useState(null);         // { n, day, before }
  const seenLoaded = seen !== undefined;
  useEffect(() => {
    if (!seenLoaded) return;
    setShowing({ n: showingN, day: selected, before: shownAt(seenRef.current, userId, sunday, selected) });
  }, [showingN, selected, sunday, seenLoaded, userId]);
  const current = showing && showing.n === showingN && showing.day === selected ? showing : null;
  const dataAt = week && week.sunday === sunday ? week.savedAt : null;
  useEffect(() => {
    if (!current || !focused || !Number.isFinite(dataAt)) return;
    updateSeen((s) => noteShown(s, userId, selected, dataAt), seenMark()).then(setSeen);
  }, [current, focused, dataAt, selected, userId]);
  const marks = useMemo(() => (visits ? freshMarks(seen, userId, sunday, visits, now, current) : {}), [seen, userId, sunday, visits, now, current]);
  const fresh = useMemo(() => freshCounts(marks, visits), [marks, visits]);

  // The Route button (APP-2b): on a day with visits; its amber dot when the server's route of
  // the day has a back-and-forth not answered on this phone yet (route.js hasIssue). The
  // route is asked with the day: when another day is picked and when the week comes fresh.
  const hasStops = !!(day && day.live.length);
  const weekSavedAt = week && week.sunday === sunday ? week.savedAt : null;
  const [dayRoute, setDayRoute] = useState(null);       // { date, route }
  const routeSeq = useRef(0);
  useEffect(() => {
    if (!hasStops) return;
    const mine = ++routeSeq.current;
    myDayAPI.route(selected).then((answer) => {
      if (mine !== routeSeq.current) return;
      keepRoute(userId, selected, answer, Date.now() + skew.current);
      setDayRoute({ date: selected, route: answer });
    }).catch(() => {});                                  // no dot without it; the screen asks again
  }, [selected, weekSavedAt, hasStops, userId]);
  const shownRoute = dayRoute && dayRoute.date === selected ? dayRoute.route : (keptRoute(userId, selected) || {}).route;
  const routeDot = hasStops && hasIssue(shownRoute, marksOf(userId, selected));
  const strip = useMemo(() => (day && day.live.length ? stripOf(day, now) : null), [day, now]);
  const dates = weekOf(selected);
  const counts = useMemo(() => (visits ? weekCounts(visits, dates, now) : null), [visits, sunday, now]); // eslint-disable-line react-hooks/exhaustive-deps
  // no live visit (an empty day, or only rows of the day log): the next busy day of the week
  const offer = day && !day.live.length && counts ? nextBusyDay(counts, selected) : null;
  const small = day ? (day.summary.small || offerText(offer)) : '';

  const notice = problem && week && week.sunday === sunday
    ? (problem === 'offline' ? offlineText(week.savedAt, now) : failedText(week.savedAt, now))
    : null;

  const list = day ? listItems(day).map((item) => (item.type === 'gap'
    ? <GapRow key={`gap-${item.gap.from}`} gap={item.gap} />
    // a row of the day log is not opened: the office took the visit off this day
    : <DayRow key={item.row.key} row={item.row} fresh={marks[item.row.key] || null}
        onPress={item.row.logged ? undefined : () => navigation.navigate('Visit', { id: item.row.id, visit: item.row.visit, n: item.row.n, savedAt: week ? week.savedAt : null, skew: skew.current, fresh: marks[item.row.key] || null })}
        onDirections={() => openDirections(item.row.visit)}
        onCall={() => callCustomer(item.row.visit)} />)) : [];

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.top}>
        <View style={styles.topRow}>
          <View style={styles.greet}>
            <Text style={styles.hello} numberOfLines={1}>{headerLine(selected, now, user?.fullName)}</Text>
            <Text style={styles.sum} numberOfLines={1}>
              <Text style={styles.sumBig}>{day ? day.summary.big : ' '}</Text>
              {small ? ` · ${small}` : ''}
            </Text>
          </View>
          {hasStops ? (
            <TouchableOpacity style={styles.routeBtn} accessibilityRole="button" accessibilityLabel={routeDot ? 'Route, a back-and-forth found' : 'Route'}
              onPress={() => navigation.navigate('Route', { date: selected, visits: visits || [], skew: skew.current })}>
              <Icon name="route" size={18} color={colors.fgOnFill} />
              <Text style={styles.routeText}>Route</Text>
              {routeDot ? <View style={styles.routeDot} /> : null}
            </TouchableOpacity>
          ) : null}
        </View>
        {notice ? <NoticeBar text={notice} kind={problem === 'offline' ? 'offline' : 'failed'} /> : null}
        <WeekRow week={dates} counts={counts} marked={fresh.byDay} selected={selected} today={now.date}
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
            {strip ? <Strip strip={strip} /> : null}
            <View style={styles.list}>{list}</View>
          </>
        ) : null}
      </ScrollView>

      <TabBar navigation={navigation} bottom={insets.bottom} fresh={fresh.total} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  top: { paddingTop: 2, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.borderDefault, backgroundColor: colors.bgCard },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greet: { flex: 1, minWidth: 0 },
  routeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.brandPressed },
  routeText: { fontSize: 15, fontWeight: '800', color: colors.fgOnFill },
  routeDot: { position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bgCard },
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
