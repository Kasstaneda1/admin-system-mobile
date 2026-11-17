// One estimate of this technician and the messages with the office (TECH_APP_ESTIMATE_SCREEN_SPEC.md,
// design-mockups/app-estimate). Opens from Parts (a card), later from the bell (M1, E1, T7) and
// a visit: route params { id, estimate? (the row the list had, shown while the screen loads),
// from? (the back word: 'Parts', 'Notifications', 'Visit'), focus? 'messages', commentId?,
// highlight? 'arrived' } (estimate/model.js landingOf).
//   Top: the status, the date, «Messages · N»; Customer and What; Part; Status (seven points,
//   or a tag off the path); From the office; Customer pays; Messages, the newest at the bottom.
//   The field at the bottom writes to the office; nothing else of the estimate changes here.
//   Messages: re-read every 20 s while the screen is open, on return to the app and on a pull.
//   A new message of others while the technician reads above: «1 new message ↓», no jump.
//   Read (mark-viewed) only once the newest message of others has been on the screen.
//   A message shows at once with «Sending…»; no answer — «Not sent · Tap to retry»; it waits
//   on the phone and goes later, never twice (estimate/outbox.js).
//   Not here yet, no data on the server: Diagnosis, Visits, @mentions, dates on the path.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Image, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { useAuth } from '../session/AuthContext';
import Icon from '../myDay/Icon';
import { Tag } from '../myDay/parts';
import { Box, PlainButton, SectionHead, TopBar, billStyles } from '../bill/parts';
import { estimateAPI } from '../services/api';
import { outbox } from '../estimate/outboxStore';
import { refreshUnread } from '../estimate/unread';
import { newRequestId } from '../myDay/actions';
import { SEEN_REST_MS, onScreen } from '../myDay/officeSeen';
import {
  EMPTY_MESSAGES, MESSAGE_HINT, NOT_SENT, POLL_MS, SENDING, entriesOf, estimateError, estimateOf, headOf, landingOf,
  lastOtherKey, messageReady, messagesOf, newMessagesText, newSince,
} from '../estimate/model';
import { formatAuthorTimeShort } from '../utils/dateUtils';
import { logError } from '../utils/logError';

const OFFLINE_TEXT = 'No connection. Your message goes out when you are back online.';
const NEAR_BOTTOM_PX = 80;
const HIGHLIGHT_MS = 2000;
const CHAT_ART = {
  fill: require('../../assets/art/chat-fill.png'),
  line: require('../../assets/art/chat-line.png'),
  route: require('../../assets/art/chat-route.png'),
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'Nov 6, 2026' (design est-main): the estimate's own date, always with the year
function fullDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : null;
}
const noNbsp = (text) => String(text || '').replace(/ /g, ' ');
const formatTime = (c) => noNbsp(formatAuthorTimeShort(c.created_at_utc, c.author_tz, c.created_at));
const offlineError = (error) => !(error && error.response);

export default function EstimateScreen({ route, navigation }) {
  const params = route.params || {};
  const id = params.id !== undefined ? params.id : params.estimate && params.estimate.id;
  const back = params.from || 'Parts';
  const landing = useMemo(() => landingOf(params), [params]);
  const { user } = useAuth();
  const me = user?.fullName || null;
  const meId = user && user.id !== undefined && user.id !== null ? String(user.id) : null;
  const insets = useSafeAreaInsets();

  const [estimate, setEstimate] = useState(estimateOf(params.estimate) || null);
  const [problem, setProblem] = useState(null);           // the estimate could not load
  const [gone, setGone] = useState(false);                // 404: no longer this technician's
  const [comments, setComments] = useState(null);         // the server's, null until loaded
  const [pending, setPending] = useState([]);             // this phone's, not yet on the server
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [fresh, setFresh] = useState(0);                  // «N new messages ↓»
  const [lit, setLit] = useState(null);                   // a message key, or 'arrived'

  const scroll = useRef(null);
  const view = useRef({ top: 0, height: 0, content: 0 });
  const where = useRef({ thread: null, list: 0, rows: {} }); // px in the scroll's content
  const landed = useRef(false);
  const shownKeys = useRef(null);                         // the keys the list had last time
  const stickToEnd = useRef(false);                       // scroll to the end after the next layout
  const marked = useRef(null);                            // the last other message marked read
  const markBusy = useRef(false);
  const restTimer = useRef(null);
  const litTimer = useRef(null);
  const loadSeq = useRef(0);

  const head = useMemo(() => (estimate ? headOf(estimate, { me, thisYear: new Date().getFullYear() }) : null), [estimate, me]);
  const messages = useMemo(() => (comments ? messagesOf(comments, { meId, pending, formatTime }) : []), [comments, pending, meId]);
  const sentCount = messages.filter((m) => m.state === 'sent').length;

  // ---------- loading ----------
  const readPending = useCallback(async () => {
    const box = await outbox.list();
    setPending(entriesOf(box, id, meId));
  }, [id, meId]);

  const loadComments = useCallback(async () => {
    try {
      const list = await estimateAPI.comments(id);
      const rows = Array.isArray(list) ? list : [];
      await outbox.settleWith(id, meId, rows);
      setComments(rows);
      setOffline(false);
      await readPending();
      // a message the app was closed on goes now (never twice: outbox.retry checks first)
      const waiting = entriesOf(await outbox.list(), id, meId).filter((p) => p.state === 'sending');
      for (const p of waiting) outbox.retry(p.key).then(readPending, readPending);
    } catch (error) {
      if (error && error.response && error.response.status === 404) { setGone(true); return; }
      if (offlineError(error)) setOffline(true);
      else logError('Error loading estimate messages:', error);
      await readPending();
    }
  }, [id, meId, readPending]);

  const load = useCallback(async ({ pull = false } = {}) => {
    const n = ++loadSeq.current;
    if (pull) setRefreshing(true);
    try {
      const answer = await estimateAPI.get(id);
      if (n !== loadSeq.current) return;
      const e = estimateOf(answer);
      if (e) { setEstimate(e); setProblem(null); setGone(false); }
    } catch (error) {
      if (n !== loadSeq.current) return;
      const failed = estimateError(error);
      if (failed.kind === 'gone') setGone(true);
      else {
        if (failed.kind === 'failed') logError('Error loading estimate:', error);
        if (failed.kind === 'offline') setOffline(true);
        setProblem(failed);
      }
    }
    await loadComments();
    if (n === loadSeq.current) setRefreshing(false);
  }, [id, loadComments]);

  // open: everything; every 20 s: the messages; back from the background: everything
  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(() => { loadComments(); }, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [load, loadComments]));

  useEffect(() => () => { clearTimeout(restTimer.current); clearTimeout(litTimer.current); }, []);

  // ---------- where the list is ----------
  const atBottom = () => view.current.top + view.current.height >= view.current.content - NEAR_BOTTOM_PX;
  const toEnd = (animated = true) => scroll.current && scroll.current.scrollToEnd({ animated });
  const rowTop = (key) => {
    const w = where.current;
    const r = w.rows[key];
    return w.thread === null || !r ? null : w.thread + w.list + r.y;
  };

  // Read: the newest message of the others on the screen, the scroll at rest
  const markIfShown = useCallback(async () => {
    const key = lastOtherKey(messages);
    if (!key || key === marked.current || markBusy.current || gone) return;
    const top = rowTop(key);
    const r = where.current.rows[key];
    if (top === null || !r) return;
    const shown = onScreen([{ id: 1, top, height: r.h }], { top: view.current.top, height: view.current.height });
    if (!shown.length) return;
    markBusy.current = true;
    try {
      await estimateAPI.viewed(id);
      marked.current = key;
      setEstimate((e) => (e ? { ...e, has_unread_comments: false } : e));
      refreshUnread(me, { force: true });
    } catch (error) {
      if (!offlineError(error) && !(error.response && error.response.status === 404)) logError('Error marking estimate viewed:', error);
    } finally {
      markBusy.current = false;
    }
  }, [messages, id, gone, me]);
  const markSoon = useCallback(() => {
    clearTimeout(restTimer.current);
    restTimer.current = setTimeout(() => { markIfShown(); }, SEEN_REST_MS);
  }, [markIfShown]);

  // New messages: at the bottom — follow them; above — «N new messages ↓»
  useEffect(() => {
    if (!comments) return;
    const keys = messages.map((m) => m.key);
    if (shownKeys.current) {
      const n = newSince(shownKeys.current, messages);
      const mineNew = messages.some((m) => m.mine && !shownKeys.current.includes(m.key));
      if (mineNew || (n && atBottom())) stickToEnd.current = true;
      else if (n) setFresh((f) => f + n);
    }
    shownKeys.current = keys;
    markSoon();
  }, [comments, messages, markSoon]);

  // Where the screen opens (spec §2), once the list has its place
  const land = () => {
    if (landed.current || !comments || where.current.thread === null) return;
    if (landing.commentId) {
      const key = `c${landing.commentId}`;
      const top = rowTop(key);
      // the comment is in the list but not measured yet: the next layout lands
      if (top === null && messages.some((m) => m.key === key)) return;
      landed.current = true;
      if (top !== null) {
        scroll.current && scroll.current.scrollTo({ y: Math.max(0, top - 60), animated: false });
        setLit(key);
        litTimer.current = setTimeout(() => setLit(null), HIGHLIGHT_MS);
        return;
      }
    }
    landed.current = true;
    if (landing.messages) { toEnd(false); return; }
    if (landing.highlight === 'arrived') {
      setLit('arrived');
      litTimer.current = setTimeout(() => setLit(null), HIGHLIGHT_MS);
    }
  };

  const onContentSize = (w, h) => {
    view.current.content = h;
    if (stickToEnd.current) { stickToEnd.current = false; toEnd(); }
    land();
    markSoon();
  };
  const onScroll = (e) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    view.current = { top: contentOffset.y, height: layoutMeasurement.height, content: contentSize.height };
    if (fresh && atBottom()) setFresh(0);
    markSoon();
  };

  // ---------- sending ----------
  const send = async () => {
    if (!messageReady(text) || !estimate) return;
    const key = newRequestId();
    const body = text;
    setText('');
    setPending((p) => [...p, { key, estimateId: String(id), userId: meId, text: body.trim(), at: Date.now(), state: 'sending' }]);
    stickToEnd.current = true;
    const r = await outbox.send({ key, estimateId: id, userId: meId, text: body });
    if (r.result === 'sent') {
      if (r.comment) setComments((c) => [...(c || []), r.comment]);
      setOffline(false);
    } else if (r.result === 'failed') setOffline(true);
    else if (r.result === 'gone') setGone(true);
    await readPending();
  };
  const retry = async (key) => {
    setPending((p) => p.map((x) => (x.key === key ? { ...x, state: 'sending' } : x)));
    const r = await outbox.retry(key);
    if (r.result === 'sent') { setOffline(false); await loadComments(); return; }
    if (r.result === 'failed') setOffline(true);
    if (r.result === 'gone') setGone(true);
    await readPending();
  };

  // ---------- drawing ----------
  const top = <TopBar back={back} title={head ? head.number : (estimate && estimate.number) || 'Estimate'} onBack={() => navigation.goBack()} />;

  if (gone) {
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        {top}
        <View style={styles.gone}>
          <View style={styles.goneCircle}><Icon name="lock" size={24} color={colors.fgSecondary} /></View>
          <Text style={styles.goneText} accessibilityRole="header">{estimateError({ response: { status: 404 } }).title}</Text>
          <TouchableOpacity style={styles.goneBack} onPress={() => navigation.goBack()} accessibilityRole="button">
            <Text style={styles.goneBackText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      {top}
      {offline ? (
        <View style={styles.off} accessibilityRole="alert">
          <Icon name="wifioff" size={18} color={colors.warningFg} />
          <Text style={styles.offText}>{OFFLINE_TEXT}</Text>
        </View>
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!head ? (
          <View style={billStyles.noData}>
            {problem ? (
              <>
                <Text style={billStyles.noDataTitle}>{problem.title}</Text>
                {problem.text ? <Text style={styles.noDataText}>{problem.text}</Text> : null}
                <View style={styles.stretch}><PlainButton text="Try again" icon="refresh" onPress={() => load()} /></View>
              </>
            ) : <ActivityIndicator color={colors.brand} />}
          </View>
        ) : (
          <View style={styles.flex}>
            <ScrollView ref={scroll} style={styles.page} contentContainerStyle={styles.content}
              onScroll={onScroll} scrollEventThrottle={32} onContentSizeChange={onContentSize}
              onLayout={(e) => { view.current.height = e.nativeEvent.layout.height; }}
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.brand} />}>
              <Head head={head} date={fullDate(estimate.date)} count={comments ? sentCount : null}
                onJump={() => { const y = where.current.thread; if (y !== null && scroll.current) scroll.current.scrollTo({ y: Math.max(0, y - 8), animated: true }); }} />

              <View style={billStyles.section}>
                <SectionHead label="Part" />
                {head.noPart ? <Text style={billStyles.quiet}>No part yet</Text> : head.parts.map((p) => (
                  <View key={p.key} style={styles.part} accessible accessibilityLabel={[p.name, p.number ? `Part number ${p.number}` : null].filter(Boolean).join(', ')}>
                    <Text style={styles.partName}>{p.name}</Text>
                    {p.number ? <Text style={styles.partNumber}>{`Part # ${p.number}`}</Text> : null}
                  </View>
                ))}
              </View>

              {head.path.off ? null : <PathSection path={head.path} lit={lit === 'arrived'} />}

              {head.note ? (
                <View style={billStyles.section}>
                  <SectionHead label="From the office" />
                  <View style={styles.note}><Box kind="info" icon="message" text={head.note} /></View>
                </View>
              ) : null}

              {head.total ? (
                <View style={billStyles.section}>
                  <SectionHead label="Customer pays" />
                  <View style={styles.total} accessible accessibilityLabel={`Estimate total ${head.total}`}>
                    <Text style={styles.totalLabel}>Estimate total</Text>
                    <Text style={styles.totalValue}>{head.total}</Text>
                  </View>
                </View>
              ) : null}

              <View style={[billStyles.section, styles.thread]} onLayout={(e) => { where.current.thread = e.nativeEvent.layout.y; land(); }}>
                <SectionHead label={comments ? `Messages · ${sentCount}` : 'Messages'} />
                {!comments ? (
                  <View style={styles.threadWait}><ActivityIndicator color={colors.brand} /></View>
                ) : messages.length ? (
                  <View style={styles.list} onLayout={(e) => { where.current.list = e.nativeEvent.layout.y; land(); }}>
                    {messages.map((m) => (
                      <Message key={m.key} m={m} lit={lit === m.key} onRetry={retry}
                        onLayout={(e) => { where.current.rows[m.key] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }; land(); }} />
                    ))}
                  </View>
                ) : <EmptyThread />}
              </View>
            </ScrollView>

            {fresh ? (
              <TouchableOpacity style={styles.pill} onPress={() => { setFresh(0); toEnd(); }} accessibilityRole="button" accessibilityLabel={newMessagesText(fresh)}>
                <Text style={styles.pillText}>{newMessagesText(fresh).replace(' ↓', '')}</Text>
                <Icon name="down" size={16} color={colors.fgOnFill} />
              </TouchableOpacity>
            ) : null}

            <View style={[styles.comp, { paddingBottom: Math.max(insets.bottom, 8) }]}>
              <TextInput style={[styles.input, text ? styles.inputOn : null]} value={text} onChangeText={setText} multiline
                placeholder={MESSAGE_HINT} placeholderTextColor={colors.fgMutedField} accessibilityLabel="Message the office" />
              <TouchableOpacity style={[styles.send, !messageReady(text) && styles.sendOff]} onPress={send} disabled={!messageReady(text)}
                accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: !messageReady(text) }}>
                <Icon name="send" size={20} color={messageReady(text) ? colors.fgOnFill : colors.fgDisabled} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// The status, the date and «Messages · N»; Customer and What (design est-main)
function Head({ head, date, count, onJump }) {
  return (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <Tag tag={head.tag} big fixed />
        {date ? <Text style={styles.headDate} numberOfLines={1}>{date}</Text> : <View style={styles.flex} />}
        {count !== null ? (
          <TouchableOpacity style={styles.jump} onPress={onJump} accessibilityRole="button" accessibilityLabel={`Messages, ${count}`}>
            <Icon name="message" size={18} color={colors.brandPressed} />
            <Text style={styles.jumpText}>{`Messages · ${count}`}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.who}>
        <View style={styles.whoCol} accessible accessibilityLabel={`Customer ${head.client}${head.partner ? `, with ${head.partner}` : ''}`}>
          <Text style={styles.whoLabel}>CUSTOMER</Text>
          <Text style={styles.whoValue}>{head.client}</Text>
          {head.partner ? <Text style={styles.whoSub}>{`with ${head.partner}`}</Text> : null}
        </View>
        {head.what ? (
          <View style={[styles.whoCol, styles.whoRight]} accessible accessibilityLabel={`What ${head.what.main}${head.what.sub ? `, ${head.what.sub}` : ''}`}>
            <Text style={styles.whoLabel}>WHAT</Text>
            <Text style={styles.whoValue}>{head.what.main}</Text>
            {head.what.sub ? <Text style={styles.whoSub}>{head.what.sub}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// Seven points in a row; under them «Sold → In Transit → Arrived · step 3 of 7»
function PathSection({ path, lit }) {
  const at = path.steps.findIndex((s) => s.state === 'now');
  const label = `Status: ${path.line.now}, ${path.line.step}`;
  return (
    <View style={[billStyles.section, lit && styles.sectionLit]}>
      <SectionHead label="Status" />
      <View style={styles.path} accessible accessibilityLabel={label}>
        {path.steps.map((s, i) => (
          <View key={s.key} style={[styles.pathStep, i === path.steps.length - 1 && styles.pathLast]}>
            <View style={[styles.dot, s.state === 'done' && styles.dotDone, s.state === 'now' && styles.dotNow]} />
            {i < path.steps.length - 1 ? <View style={[styles.link, i < at && styles.linkDone]} /> : null}
          </View>
        ))}
      </View>
      <Text style={styles.steps} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {path.line.before ? `${path.line.before} → ` : ''}
        <Text style={styles.stepsNow}>{path.line.now}</Text>
        {path.line.after ? ` → ${path.line.after}` : ''}
        <Text style={styles.stepsSmall}>{` · ${path.line.step}`}</Text>
      </Text>
    </View>
  );
}

// A message: others on the left with name and role, mine on the right; the author's time, or
// «Sending…», or «Not sent · Tap to retry»
function Message({ m, lit, onRetry, onLayout }) {
  const label = [m.mine ? 'You' : [m.author, m.role].filter(Boolean).join(', '), m.text,
    m.state === 'sending' ? SENDING : m.state === 'failed' ? NOT_SENT : m.time].filter(Boolean).join('. ');
  return (
    <View style={[styles.msg, m.mine && styles.msgMine]} onLayout={onLayout}>
      <View accessible accessibilityLabel={label} style={[styles.msgBody, m.mine && styles.msgMine]}>
        {m.mine ? null : (
          <View style={styles.from}>
            <Text style={styles.fromName}>{m.author}</Text>
            {m.role ? <Text style={styles.fromRole}>{m.role}</Text> : null}
          </View>
        )}
        <View style={[styles.bub, m.mine && styles.bubMine, lit && styles.bubLit]}>
          <Text style={styles.bubText} selectable>{m.text}</Text>
        </View>
        {m.state === 'sent' ? <Text style={styles.time}>{m.time}</Text> : null}
        {m.state === 'sending' ? (
          <View style={styles.timeRow}>
            <Icon name="clock" size={13} color={colors.fgMutedField} />
            <Text style={styles.time}>{SENDING}</Text>
          </View>
        ) : null}
      </View>
      {m.state === 'failed' ? (
        <TouchableOpacity style={styles.failRow} onPress={() => onRetry(m.pendingKey)} accessibilityRole="button" accessibilityLabel={NOT_SENT}>
          <Icon name="retry" size={13} color={colors.dangerFg} />
          <Text style={styles.failText}>{NOT_SENT}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// «No messages yet» with the «chat» drawing of the empty states (design est-empty), in tokens
function EmptyThread() {
  const [title, ...rest] = EMPTY_MESSAGES.split('. ');
  return (
    <View style={styles.empty} accessible accessibilityLabel={EMPTY_MESSAGES}>
      <View style={styles.art}>
        <View style={styles.artCircle} />
        <Image source={CHAT_ART.route} style={[styles.artLayer, styles.artRoute]} />
        <Image source={CHAT_ART.fill} style={[styles.artLayer, { tintColor: colors.bgCard }]} />
        <Image source={CHAT_ART.line} style={[styles.artLayer, { tintColor: colors.brand }]} />
        <View style={styles.artDot} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{rest.join('. ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.bgPage },
  content: { paddingBottom: 16 },
  stretch: { alignSelf: 'stretch' },
  noDataText: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary, textAlign: 'center' },

  off: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.warningBg, borderBottomWidth: 1, borderBottomColor: colors.warningBorder },
  offText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: colors.warningFg },

  head: { gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headDate: { flexShrink: 1, fontSize: 15, color: colors.fgSecondary },
  jump: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 4 },
  jumpText: { fontSize: 15, fontWeight: '700', color: colors.brandPressed },
  who: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard, overflow: 'hidden' },
  whoCol: { flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 12 },
  whoRight: { borderLeftWidth: 1, borderLeftColor: colors.borderDefault },
  whoLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.fgMutedField },
  whoValue: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  whoSub: { fontSize: 14, color: colors.fgSecondary },

  part: { gap: 2, paddingHorizontal: 16, paddingVertical: 10 },
  partName: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  partNumber: { fontSize: 15, color: colors.fgSecondary, fontVariant: ['tabular-nums'] },

  sectionLit: { borderColor: colors.infoBorder, borderTopWidth: 2, borderBottomWidth: 2, backgroundColor: colors.infoBg },
  path: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingHorizontal: 22, paddingBottom: 2, minHeight: 28 },
  pathStep: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  pathLast: { flex: 0 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  dotDone: { borderWidth: 0, backgroundColor: colors.brandPressed },
  dotNow: { width: 28, height: 28, borderRadius: 14, borderWidth: 4, borderColor: colors.brandSoft, backgroundColor: colors.brandPressed, marginHorizontal: -4 },
  link: { flex: 1, height: 2, backgroundColor: colors.borderDefault },
  linkDone: { backgroundColor: colors.brandPressed },
  steps: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 14, fontSize: 15, color: colors.fgSecondary },
  stepsNow: { fontWeight: '700', color: colors.fgDefault },
  stepsSmall: { fontSize: 13, color: colors.fgMutedField },

  note: { paddingHorizontal: 16, paddingBottom: 12 },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingBottom: 4 },
  totalLabel: { fontSize: 16, color: colors.fgSecondary },
  totalValue: { fontSize: 17, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },

  thread: { paddingBottom: 8 },
  threadWait: { paddingVertical: 24, alignItems: 'center' },
  list: { gap: 12, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 8 },
  msg: { alignItems: 'flex-start', maxWidth: '86%' },
  msgMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgBody: { alignItems: 'flex-start', gap: 3 },
  from: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  fromName: { fontSize: 14, fontWeight: '700', color: colors.fgDefault },
  fromRole: { fontSize: 13, color: colors.fgSecondary },
  bub: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  bubMine: { borderBottomLeftRadius: 14, borderBottomRightRadius: 4, borderColor: colors.brand, backgroundColor: colors.brandSoft },
  bubLit: { borderWidth: 2, borderColor: colors.infoBorder, shadowColor: colors.infoBorder, shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  bubText: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  time: { fontSize: 12, color: colors.fgMutedField },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  failRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, marginTop: 3 },
  failText: { fontSize: 12, fontWeight: '700', color: colors.dangerFg },

  empty: { alignItems: 'center', gap: 6, paddingTop: 16, paddingHorizontal: 24, paddingBottom: 24 },
  art: { width: 96, height: 96 },
  artCircle: { position: 'absolute', left: 13, top: 14.6, width: 70.4, height: 70.4, borderRadius: 35.2, backgroundColor: colors.brandSoft },
  artLayer: { position: 'absolute', left: 0, top: 0, width: 96, height: 96 },
  artRoute: { tintColor: colors.brand, opacity: 0.55 },
  artDot: { position: 'absolute', left: 79.2, top: 10.4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  emptyTitle: { marginTop: 4, fontSize: 17, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary, textAlign: 'center' },

  pill: { position: 'absolute', alignSelf: 'center', bottom: 84, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.brandPressed, shadowColor: colors.shadow, shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  pillText: { fontSize: 15, fontWeight: '700', color: colors.fgOnFill },

  comp: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8, paddingHorizontal: 12, backgroundColor: colors.bgCard, borderTopWidth: 1, borderTopColor: colors.borderDefault },
  input: { flex: 1, minHeight: 44, maxHeight: 132, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: colors.borderControl, fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  inputOn: { borderWidth: 2, borderColor: colors.brandPressed },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  sendOff: { backgroundColor: colors.bgSunken },

  gone: { flex: 1, alignItems: 'center', gap: 12, paddingTop: 80, paddingHorizontal: 32, backgroundColor: colors.bgPage },
  goneCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSunken },
  goneText: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
  goneBack: { minHeight: 52, minWidth: 160, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  goneBackText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },
});
