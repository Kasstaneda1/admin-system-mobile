// The route of a day (TECH_APP_MY_DAY_SPEC.md §9, APP-2b v1; design A3 final-route*.png). Opens
// from the Route button of My day with the day's date and visits. The server counts the route
// (GET /api/my/route?date); route.js turns it into what is drawn here, nothing is counted again.
// The map is Apple Maps (react-native-maps, no key) on iOS: numbered stops, straight lines
// between them, the legs of a back-and-forth in orange. The library is loaded here only, by
// mapsModule.js, and only when this build of the app has the native map: an app built before
// it shows the list and «Update the app to see the map». On Android the map needs a Google key
// (not yet): the list only. A day without map points (production today: the geocoding key is
// broken) shows no map, the stops with «No map point yet».
// Tell the office: a ready note on the hint's second visit (POST /api/my/visits/:id/notes, the
// same id again on Try again) with the technician's own words if they add some.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { myDayAPI } from '../services/api';
import { logError } from '../utils/logError';
import { useAuth } from '../session/AuthContext';
import { nowWall, skewOf } from '../myDay/model';
import { markerGroups, regionOf, routeLinks, routeNoteText, routeNoticeText, routeView } from '../myDay/route';
import { loadMaps } from '../myDay/mapsModule';
import { keepRoute, keptRoute, markHint, marksOf } from '../myDay/routeMarks';
import { noteBody, noteError, noteRequest } from '../myDay/notesPhotos';
import { openRoute } from '../myDay/phoneLinks';
import { NoticeBar } from '../myDay/parts';
import { HintBox, StopDot, StopRow, TellSheet } from '../myDay/routeParts';
import Icon from '../myDay/Icon';

const MAP_HEIGHT = 280;
// the stops keep clear of Open in Maps (top right) and of the line about straight lines
const MAP_PADDING = { top: 76, right: 44, bottom: 44, left: 44 };
// the map's own marks (the Apple Maps logo, Legal) sit above that line, never under it
const MAP_INSETS = { top: 0, right: 0, bottom: 28, left: 0 };
// on top: the stop of now, then those of a back-and-forth
const markerZ = (stop) => (stop.state === 'current' ? 3 : stop.flagged ? 2 : 1);
const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export default function RouteScreen({ route: nav, navigation }) {
  const { date, visits = [], skew: skewIn = 0 } = nav.params || {};
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const insets = useSafeAreaInsets();
  const skew = useRef(skewIn);
  const [tick, setTick] = useState(Date.now());
  const now = useMemo(() => nowWall(tick, skew.current), [tick]);

  // { route, savedAt } of this day: what the phone has at once, then the server's
  const [data, setData] = useState(() => keptRoute(userId, date));
  const [problem, setProblem] = useState(null);       // null | 'offline' | 'failed'
  const [refreshing, setRefreshing] = useState(false);
  const [marks, setMarks] = useState(() => marksOf(userId, date));
  const seq = useRef(0);

  const load = useCallback(async ({ pull = false } = {}) => {
    const mine = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const answer = await myDayAPI.route(date);
      if (mine !== seq.current) return;
      const answeredAt = Date.now();
      skew.current = skewOf(answer.server_time, answeredAt) || skew.current;
      const savedAt = answeredAt + skew.current;
      keepRoute(userId, date, answer, savedAt);
      setData({ route: answer, savedAt });
      setProblem(null);
      setTick(Date.now());
    } catch (error) {
      if (mine !== seq.current) return;
      const status = error.response?.status;
      if (status >= 500) logError('Error loading the route:', error);
      setProblem(status ? 'failed' : 'offline');
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  }, [date, userId]);

  useFocusEffect(useCallback(() => { setTick(Date.now()); load(); }, [load]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
    return () => sub.remove();
  }, [load]);

  const view = useMemo(() => (data ? routeView(data.route, { visits, marks }) : null), [data, visits, marks]);
  const links = useMemo(() => routeLinks(view), [view]);
  const Maps = loadMaps();                              // null: no map in this build (or Android)
  const MapView = Maps ? Maps.default : null;
  const hasPoints = !!view && view.points.length > 0;
  const showMap = !!Maps && hasPoints;
  const needsUpdate = Platform.OS === 'ios' && !Maps && hasPoints;

  // stops that would overlap at this zoom share one marker: every number reads
  const [mapSize, setMapSize] = useState(null);
  const [mapRegion, setMapRegion] = useState(null);
  const groups = useMemo(() => (hasPoints ? markerGroups(view.points, mapRegion || regionOf(view.points), mapSize) : []),
    [hasPoints, view, mapRegion, mapSize]);

  // the map shows all its stops
  const mapRef = useRef(null);
  const fit = useCallback(() => {
    if (!mapRef.current || !view || !view.points.length) return;
    if (view.points.length === 1) {
      mapRef.current.animateToRegion(regionOf(view.points), 0);
      return;
    }
    mapRef.current.fitToCoordinates(view.points.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: MAP_PADDING, animated: false });
  }, [view]);
  useEffect(() => { fit(); }, [fit]);

  const mark = (hint, value) => {
    markHint(userId, date, hint.key, value);
    setMarks(marksOf(userId, date));
  };

  // ---------- Tell the office ----------
  const [tell, setTell] = useState(null);             // the hint being sent
  const [own, setOwn] = useState('');
  const [send, setSend] = useState(null);              // { text, requestId, sending, failed }
  const busy = useRef(false);
  const openTell = (hint) => { setTell(hint); setOwn(''); setSend(null); };
  const sendTell = useCallback(async () => {
    if (!tell || busy.current) return;
    busy.current = true;
    const request = noteRequest(send, routeNoteText(tell, own), Date.now() + skew.current);
    setSend({ ...request, sending: true, failed: null });
    try {
      await myDayAPI.note(tell.noteVisitId, noteBody(request));
      markHint(userId, date, tell.key, 'sent');
      setMarks(marksOf(userId, date));
      setSend(null);
      setTell(null);
    } catch (error) {
      const failed = noteError(error);
      if (failed.kind === 'offline' || failed.kind === 'failed') {
        if (failed.kind === 'failed') logError('Error sending a route note:', error);
        setSend({ ...request, sending: false, failed: failed.text });
      } else {
        // the visit is not the technician's any more, closed or cancelled: the server's words
        setSend(null);
        setTell(null);
        Alert.alert(failed.kind === 'gone' ? 'This visit was changed by the office' : failed.text);
        load();
      }
    } finally {
      busy.current = false;
    }
  }, [tell, own, send, userId, date, load]);
  const tellClient = tell && view ? (view.stops.find((st) => st.visitId === tell.noteVisitId) || {}).client : null;

  const notice = problem && data ? routeNoticeText(problem, data.savedAt, now) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.top}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to My day">
          <Icon name="back" size={20} color={colors.fgDefault} />
          <Text style={styles.backText}>My day</Text>
        </TouchableOpacity>
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{view ? view.title : 'Route'}</Text>
          <Text style={styles.summary} numberOfLines={1}>{view ? view.summary : ' '}</Text>
        </View>
      </View>
      {notice ? <View style={styles.noticeWrap}><NoticeBar text={notice} kind={problem === 'offline' ? 'offline' : 'failed'} /></View> : null}

      {showMap ? (
        <View style={styles.map} onLayout={(e) => setMapSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={regionOf(view.points)} onMapReady={fit}
            onRegionChangeComplete={setMapRegion} mapPadding={MAP_INSETS}
            showsPointsOfInterest={false} showsBuildings={false} pitchEnabled={false} rotateEnabled={false} toolbarEnabled={false}
            accessibilityLabel="Map of the day's stops">
            {view.legs.map((leg) => (
              <Maps.Polyline key={leg.key} coordinates={[leg.from, leg.to]}
                strokeColor={leg.bad ? colors.stateLate : leg.done ? colors.borderStrong : colors.brandPressed}
                strokeWidth={leg.bad ? 4.5 : 3} lineDashPattern={leg.bad ? undefined : [7, 5]} lineCap="round" />
            ))}
            {groups.map((group) => (
              <Maps.Marker key={group.key} coordinate={{ latitude: group.latitude, longitude: group.longitude }} anchor={{ x: 0.5, y: 0.5 }}
                zIndex={Math.max(...group.stops.map(markerZ))} tracksViewChanges={false}
                accessibilityLabel={`${group.stops.length > 1 ? 'Stops' : 'Stop'} ${listOf(group.stops.map((st) => st.n))}, ${listOf(group.stops.map((st) => st.client))}`}>
                {group.stops.length === 1 ? <StopDot stop={group.stops[0]} size={30} onMap /> : (
                  <View style={styles.group}>
                    {group.stops.map((stop) => <StopDot key={stop.key} stop={stop} size={28} onMap />)}
                  </View>
                )}
              </Maps.Marker>
            ))}
          </MapView>
          <View style={styles.mapNote} pointerEvents="none">
            <Text style={styles.mapNoteText}>Straight lines between stops · not the road</Text>
          </View>
          {links ? (
            <TouchableOpacity style={styles.openOnMap} onPress={() => openRoute(links)} accessibilityRole="button" accessibilityLabel="Open the route in Maps">
              <Icon name="nav" size={18} color={colors.brandPressed} />
              <Text style={styles.openOnMapText}>Open in Maps</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!view ? (
        <View style={styles.noData}>
          <Text style={styles.noDataTitle}>{problem === 'offline' ? 'No connection' : problem ? 'Could not load the route' : 'Loading…'}</Text>
          {problem ? (
            <TouchableOpacity style={styles.retry} onPress={() => load()} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.brand} />}>
          {needsUpdate ? (
            <View style={styles.noPoints}>
              <Icon name="mapoff" size={20} color={colors.fgSecondary} />
              <View style={styles.noPointsBody}>
                <Text style={styles.noPointsTitle}>Update the app to see the map</Text>
                <Text style={styles.noPointsText}>This version of the app has no map. The stops and miles are below.</Text>
              </View>
            </View>
          ) : null}
          {view.hints.filter((h) => h.mark !== 'ok').map((hint) => (
            <HintBox key={hint.key} hint={hint} onTell={() => openTell(hint)} onOk={() => mark(hint, 'ok')} />
          ))}
          {view.stops.length && !view.points.length ? (
            <View style={styles.noPoints}>
              <Icon name="mapoff" size={20} color={colors.fgSecondary} />
              <View style={styles.noPointsBody}>
                <Text style={styles.noPointsTitle}>No map point yet</Text>
                <Text style={styles.noPointsText}>The addresses of this day are not on the map yet, so there is no map and no miles. The stops are in their order below.</Text>
              </View>
            </View>
          ) : null}
          {view.stops.length ? view.stops.map((stop) => <StopRow key={stop.key} stop={stop} />) : (
            <Text style={styles.quiet}>No visits on this day.</Text>
          )}
          {links && !showMap ? (
            <TouchableOpacity style={styles.open} onPress={() => openRoute(links)} accessibilityRole="button">
              <Icon name="nav" size={20} color={colors.brandPressed} />
              <Text style={styles.openText}>Open in Maps</Text>
            </TouchableOpacity>
          ) : null}
          {view.points.length > 1 ? (
            <Text style={styles.foot}>Order = planned time. Miles are straight lines between stops, a rough guide; real roads come later.</Text>
          ) : null}
        </ScrollView>
      )}

      <TellSheet visible={!!tell} hint={tell} client={tellClient} own={own} onChangeOwn={setOwn}
        sending={!!(send && send.sending)} failure={send ? send.failed : null} bottom={insets.bottom}
        onSend={sendTell} onClose={() => { if (!busy.current) { setTell(null); setSend(null); } }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1.5, borderColor: colors.borderDefault },
  backText: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  titles: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, lineHeight: 24, fontWeight: '800', color: colors.fgDefault },
  summary: { fontSize: 15, fontWeight: '700', color: colors.fgDefault },
  noticeWrap: { paddingHorizontal: 16, paddingBottom: 6 },
  map: { height: MAP_HEIGHT, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle },
  mapNote: { position: 'absolute', left: 8, bottom: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.bgCard },
  mapNoteText: { fontSize: 11, fontWeight: '700', color: colors.fgSecondary },
  group: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2, borderRadius: 18, backgroundColor: colors.bgCard },
  openOnMap: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1.5, borderColor: colors.brandPressed, backgroundColor: colors.bgCard },
  openOnMapText: { fontSize: 15, fontWeight: '700', color: colors.brandPressed },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 10 },
  open: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, marginTop: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brandPressed },
  openText: { fontSize: 16, fontWeight: '700', color: colors.brandPressed },
  noPoints: { flexDirection: 'row', gap: 10, marginBottom: 6, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.bgSubtle },
  noPointsBody: { flex: 1, gap: 2 },
  noPointsTitle: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  noPointsText: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  quiet: { paddingVertical: 16, fontSize: 16, color: colors.fgSecondary },
  foot: { marginTop: 14, fontSize: 13, lineHeight: 18, color: colors.fgMutedField },
  noData: { alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 28 },
  noDataTitle: { fontSize: 20, fontWeight: '700', color: colors.fgDefault },
  retry: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  retryText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },
});
