// A visit, read only (TECH_APP_MY_DAY_SPEC.md §3 «Visit», §4; design A3:
// design-mockups/tech-app/shots/final-visit-*.png). Opens from a row of My day with the
// list's visit, so it shows at once; the card kept on the phone fills in history and notes;
// GET /api/my/visits/:id replaces both. What it shows is visit.js.
// No map at the top (no map key yet, and no fake one), no actions bar: APP-3.
//
// Fresh: on opening, on coming back to the screen or to the app, on pulling down (§4).
// The office took the visit away (404): «This visit was changed by the office», back to the day.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { myDayAPI } from '../services/api';
import { logError } from '../utils/logError';
import { useAuth } from '../session/AuthContext';
import { failedText, nowWall, offlineText, skewOf } from '../myDay/model';
import { dropCard, keepCard, keptCard, visitCard } from '../myDay/visit';
import { readMyDay, writeMyDay } from '../myDay/storage';
import { callCustomer, openDirections } from '../myDay/phoneLinks';
import { NoticeBar, Tag } from '../myDay/parts';
import Icon from '../myDay/Icon';

export default function VisitScreen({ route, navigation }) {
  const { id, visit: fromList = null, n = null, savedAt: listSavedAt = null, skew: skewIn = 0 } = route.params || {};
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const skew = useRef(skewIn);
  const [tick, setTick] = useState(Date.now());
  const now = useMemo(() => nowWall(tick, skew.current), [tick]);
  // { visit, savedAt, source: 'list' | 'kept' | 'server' }
  const [shown, setShown] = useState(fromList ? { visit: fromList, savedAt: listSavedAt, source: 'list' } : null);
  const [problem, setProblem] = useState(null);         // null | 'offline' | 'failed'
  const [refreshing, setRefreshing] = useState(false);
  const loadSeq = useRef(0);
  const gone = useRef(false);

  const load = useCallback(async ({ pull = false } = {}) => {
    if (gone.current) return;
    const seq = ++loadSeq.current;
    if (pull) setRefreshing(true);
    const kept = await readMyDay();
    const keptOne = keptCard(kept, userId, id);
    // the kept card brings history and notes; the list's visit, fresher, its state
    if (keptOne && seq === loadSeq.current) {
      setShown((s) => (s && s.source === 'server' ? s : { visit: { ...keptOne.card, ...(fromList || {}) }, savedAt: keptOne.savedAt, source: 'kept' }));
    }
    try {
      const data = await myDayAPI.visit(id);
      if (seq !== loadSeq.current || gone.current) return;
      const answeredAt = Date.now();
      skew.current = skewOf(data.server_time, answeredAt);
      const savedAt = answeredAt + skew.current;
      setShown({ visit: data.visit, savedAt, source: 'server' });
      setProblem(null);
      setTick(Date.now());
      await writeMyDay(keepCard(kept, userId, data.visit, savedAt));
    } catch (error) {
      if (seq !== loadSeq.current || gone.current) return;
      const status = error.response?.status;
      if (status === 404) {
        // reassigned or no longer there: the card goes from the phone too
        gone.current = true;
        await writeMyDay(dropCard(kept, userId, id));
        Alert.alert('This visit was changed by the office', 'It is no longer on your day.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        return;
      }
      if (status >= 500) logError('Error loading a visit:', error);
      setProblem(status ? 'failed' : 'offline');
    } finally {
      if (seq === loadSeq.current) setRefreshing(false);
    }
  }, [id, userId, fromList, navigation]);

  // on opening and every time the screen comes back
  useFocusEffect(useCallback(() => { setTick(Date.now()); load(); }, [load]));
  // back to the app
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setTick(Date.now()); load(); }
    });
    return () => sub.remove();
  }, [load]);

  // the office's notes beyond the first two show after «+N more»
  const [officeOpen, setOfficeOpen] = useState(false);
  const card = useMemo(() => (shown ? visitCard(shown.visit, { n, now, officeOpen }) : null), [shown, n, now, officeOpen]);
  const notice = problem && shown ? (problem === 'offline' ? offlineText(shown.savedAt, now) : failedText(shown.savedAt, now)) : null;
  // history and notes come only with the card itself
  const waiting = problem ? 'Needs connection' : 'Loading…';

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to My day">
          <Icon name="back" size={20} color={colors.fgDefault} />
          <Text style={styles.backText}>My day</Text>
        </TouchableOpacity>
      </View>
      {notice ? <View style={styles.noticeWrap}><NoticeBar text={notice} kind={problem === 'offline' ? 'offline' : 'failed'} /></View> : null}

      {!card ? (
        <View style={styles.noData}>
          {problem ? (
            <>
              <Text style={styles.noDataTitle}>{problem === 'offline' ? 'No connection' : 'Could not load the visit'}</Text>
              <TouchableOpacity style={styles.retry} onPress={() => load()} accessibilityRole="button">
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : <ActivityIndicator color={colors.brand} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.brand} />}>
          <View style={styles.head}>
            <View style={styles.tagRow}>
              <Tag tag={card.tag} big />
              {card.kindLine ? <Text style={styles.kindLine} numberOfLines={1}>{card.kindLine}</Text> : null}
            </View>
            <Text style={styles.name} accessibilityRole="header">{card.name}</Text>
            {card.address.line1 ? <Text style={styles.addr1}>{card.address.line1}</Text> : null}
            {card.address.line2 ? <Text style={styles.addr2}>{card.address.line2}</Text> : null}

            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.bigBtn, styles.bigFill]} onPress={() => openDirections(shown.visit)} accessibilityRole="button" accessibilityLabel={`Directions to ${card.name}`}>
                <Icon name="nav" size={22} color={colors.fgOnFill} />
                <Text style={[styles.bigText, { color: colors.fgOnFill }]}>Directions</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bigBtn, styles.bigGhost]} onPress={() => callCustomer(shown.visit)} accessibilityRole="button" accessibilityLabel={`Call ${card.name}`}>
                <Icon name="phone" size={22} color={colors.brandPressed} />
                <Text style={[styles.bigText, { color: colors.brandPressed }]}>Call</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tiles}>
              {card.tiles.map((t) => (
                <View key={t.key} style={styles.tile} accessible accessibilityLabel={`${t.label} ${t.big} ${t.small}`}>
                  <Text style={styles.tileLabel}>{t.label.toUpperCase()}</Text>
                  <Text style={[styles.tileBig, t.big.length > 6 && styles.tileBigLong, t.struck && styles.struck]} numberOfLines={1} adjustsFontSizeToFit>{t.big}</Text>
                  {t.small ? <Text style={styles.tileSmall} numberOfLines={1}>{t.small}</Text> : null}
                </View>
              ))}
            </View>

            {card.access ? (
              <View style={styles.access}>
                <Icon name="key" size={18} color={colors.warningFg} />
                <View style={styles.accessBody}>
                  <Text style={styles.accessTitle}>How to get in</Text>
                  <Text style={styles.accessText}>{card.access}</Text>
                </View>
              </View>
            ) : null}

            {card.office ? (
              <View style={styles.office} accessibilityRole="summary">
                <View style={styles.officeTop}>
                  <Icon name="message" size={18} color={colors.infoFg} />
                  <Text style={styles.officeTitle}>From the office</Text>
                </View>
                {card.office.notes.map((note, i) => (
                  <View key={note.key} style={[styles.officeNote, i > 0 && styles.officeNoteNext]}>
                    {note.head ? <Text style={styles.officeHead}>{note.head}</Text> : null}
                    <Text style={styles.officeText}>{note.text}</Text>
                  </View>
                ))}
                {card.office.more ? (
                  <TouchableOpacity style={styles.officeMore} onPress={() => setOfficeOpen(true)} accessibilityRole="button"
                    accessibilityLabel={`Show ${card.office.more} more notes from the office`}>
                    <Text style={styles.officeMoreText}>{`+${card.office.more} more`}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>

          <Section label="Problem">
            <Text style={card.problem ? styles.text : styles.quiet}>{card.problem || 'No description'}</Text>
            {card.appliances.map((a) => (
              <View key={a.key} style={styles.appliance}>
                <Icon name="wrench" size={14} color={colors.fgSecondary} />
                <Text style={styles.applianceText}>
                  <Text style={styles.applianceType}>{a.type}</Text>
                  {a.model ? `  ${a.model}` : ''}
                  {a.serial ? `  ·  ${a.serial}` : ''}
                </Text>
              </View>
            ))}
            {card.team.map((line) => (
              <Text key={line.label} style={styles.teamLine}><Text style={styles.teamLabel}>{line.label}</Text>{`  ${line.value}`}</Text>
            ))}
          </Section>

          {card.full && card.history.length ? (
            <Section label={card.historyTitle}>
              {card.history.map((h) => (
                <View key={h.key} style={[styles.hist, h.mark === 'this' ? styles.histThis : h.mark === 'later' ? styles.histLater : styles.histPast]}>
                  <Text style={styles.histTitle}>{h.title}</Text>
                  <Text style={styles.histText} numberOfLines={3}>{h.text}</Text>
                </View>
              ))}
            </Section>
          ) : null}
          {!card.full && !shown.visit.legacy ? (
            <Section label="This job">
              <Text style={styles.quiet}>{waiting}</Text>
            </Section>
          ) : null}

          <Section label={card.full ? card.notesTitle : 'Notes'}>
            {!card.full ? <Text style={styles.quiet}>{waiting}</Text> : null}
            {card.full && !card.notes.length ? <Text style={styles.quiet}>No notes yet</Text> : null}
            {card.notes.map((note) => (
              <View key={note.key} style={styles.note}>
                <Text style={styles.noteHead}>{note.head}</Text>
                <Text style={styles.noteText}>{note.text}</Text>
              </View>
            ))}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ label, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingLeft: 4, paddingRight: 14, borderRadius: 22 },
  backText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault },
  noticeWrap: { paddingHorizontal: 16, paddingTop: 8 },
  body: { paddingBottom: 32 },
  head: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  kindLine: { fontSize: 14, fontWeight: '600', color: colors.fgSecondary, flexShrink: 1 },
  name: { fontSize: 26, lineHeight: 31, fontWeight: '800', color: colors.fgDefault },
  addr1: { fontSize: 17, lineHeight: 22, color: colors.fgDefault, marginTop: 2 },
  addr2: { fontSize: 17, lineHeight: 22, color: colors.fgSecondary },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  bigBtn: { flex: 1, height: 56, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bigFill: { backgroundColor: colors.brandPressed },
  bigGhost: { backgroundColor: colors.bgCard, borderWidth: 1.5, borderColor: colors.brandPressed },
  bigText: { fontSize: 17, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tile: { flex: 1, minHeight: 74, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle },
  tileLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.fgSecondary },
  tileBig: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.fgDefault },
  tileBigLong: { fontSize: 18, lineHeight: 32 },
  tileSmall: { fontSize: 12, fontWeight: '600', color: colors.fgSecondary },
  struck: { textDecorationLine: 'line-through', color: colors.fgSecondary },
  access: { flexDirection: 'row', gap: 10, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  accessBody: { flex: 1 },
  accessTitle: { fontSize: 15, fontWeight: '700', color: colors.warningFg },
  accessText: { fontSize: 15, lineHeight: 20, color: colors.warningFg },
  office: { marginTop: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.infoBorder, backgroundColor: colors.infoBg },
  officeTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  officeTitle: { fontSize: 15, fontWeight: '700', color: colors.infoFg },
  officeNote: { paddingBottom: 8, paddingLeft: 26 },
  officeNoteNext: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.infoBorder },
  officeHead: { fontSize: 13, fontWeight: '600', color: colors.infoFg },
  officeText: { fontSize: 16, lineHeight: 22, color: colors.infoFg },
  officeMore: { minHeight: 44, justifyContent: 'center', paddingLeft: 26 },
  officeMoreText: { fontSize: 15, fontWeight: '700', color: colors.infoFg },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 8, borderTopWidth: 10, borderTopColor: colors.bgPage },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.fgSecondary },
  text: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  quiet: { fontSize: 15, lineHeight: 20, color: colors.fgMutedField },
  appliance: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applianceText: { flex: 1, fontSize: 15, color: colors.fgSecondary },
  applianceType: { fontWeight: '700', color: colors.fgDefault },
  teamLine: { fontSize: 15, color: colors.fgDefault },
  teamLabel: { fontWeight: '600', color: colors.fgSecondary },
  hist: { paddingLeft: 12, paddingVertical: 4, borderLeftWidth: 4 },
  histPast: { borderLeftColor: colors.borderStrong },
  histThis: { borderLeftColor: colors.accent },
  histLater: { borderLeftColor: colors.brand },
  histTitle: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  histText: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  note: { padding: 12, borderRadius: 12, backgroundColor: colors.bgSubtle, gap: 2 },
  noteHead: { fontSize: 13, fontWeight: '600', color: colors.fgSecondary },
  noteText: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  noData: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28 },
  noDataTitle: { fontSize: 22, fontWeight: '700', color: colors.fgDefault },
  retry: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  retryText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },
});
