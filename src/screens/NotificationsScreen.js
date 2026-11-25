// Notifications — the technician's bell, the second tab (APP-1; look: design-mockups/notifications
// shots app-bell-list, app-bell-unread, app-bell-empty; words and rules in src/bell/model.js).
//   Top: «Notifications» and «Mark all as read»; All / Unread (the unread count beside it); the
//   items by day (Today, Yesterday, …), the newest first, 30 at a time, more as the list ends.
//   An unread item: a soft brand background and a blue dot (colour is not the only sign). A tap
//   reads it and opens what it is about (a visit, an estimate at the message, My day for a visit
//   that is not this technician's any more); «⋯» — a sheet: Mark as read / Mark as unread, Cancel.
//   Read on the phone at once; the server's answer sets the count. Pull to refresh; re-read on
//   every return to the tab. The server's words go out through <Text> only.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { SalaryFrame, NoData } from '../salary/parts';
import { badgeText } from '../myDay/fresh';
import { nowWall } from '../myDay/model';
import { bellAPI } from '../services/api';
import { setBellFrom, useBellCount } from '../bell/store';
import { EMPTY_WORDS, FEED_LIMIT, daysOf, itemView, lineText, markedAllRead, markedRead, markedUnread, mergeItems } from '../bell/model';
import { logError } from '../utils/logError';

const NOT_LOADED = { title: 'Couldn’t load notifications', text: 'Check the connection and try again.' };

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const count = useBellCount();
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState(null);           // null until the first answer
  const [cursor, setCursor] = useState(null);         // next_cursor of the last page, or null (the end)
  const [problem, setProblem] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [sheet, setSheet] = useState(null);           // the item whose «⋯» is open
  const seq = useRef(0);

  // the first page of the filter (again on every return, a pull, a change of All / Unread)
  const load = useCallback(async (which = filter, { pull = false } = {}) => {
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const page = await bellAPI.feed(which, null, FEED_LIMIT);
      if (n !== seq.current) return;
      setItems(mergeItems([], page.items));
      setCursor(page.next_cursor || null);
      setProblem(null);
      setBellFrom(page);
    } catch (error) {
      if (n !== seq.current) return;
      if (error && error.response && error.response.status >= 500) logError('Error loading notifications:', error);
      setProblem(NOT_LOADED);
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  }, [filter]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = useCallback(async () => {
    if (!cursor || more || items === null) return;
    const n = seq.current;
    setMore(true);
    try {
      const page = await bellAPI.feed(filter, cursor, FEED_LIMIT);
      if (n !== seq.current) return;
      setItems((had) => mergeItems(had, page.items));
      setCursor(page.next_cursor || null);
      setBellFrom(page);
    } catch (error) {
      // the end of the list stays; the next scroll tries again
    } finally {
      setMore(false);
    }
  }, [cursor, more, items, filter]);

  const pick = (which) => {
    if (which === filter) return;
    setFilter(which);
    setItems(null);
    setCursor(null);
    load(which);
  };

  // read: on the phone at once, then the server (its answer sets the count; no answer — the
  // next load shows the truth)
  const nowIso = () => new Date().toISOString();
  const read = useCallback((ids) => {
    if (!ids.length) return;
    setItems((had) => (had ? markedRead(had, ids, nowIso()) : had));
    bellAPI.read({ ids }).then(setBellFrom).catch(() => {});
  }, []);
  const unread = useCallback((id) => {
    setItems((had) => (had ? markedUnread(had, id) : had));
    bellAPI.unread(id).then(setBellFrom).catch(() => {});
  }, []);
  const readAll = useCallback(() => {
    setItems((had) => (had ? markedAllRead(had, nowIso()) : had));
    bellAPI.read({ all: true }).then((answer) => { setBellFrom(answer); if (filter === 'unread') load('unread'); }).catch(() => {});
  }, [filter, load]);

  const today = nowWall(Date.now()).date;
  const shown = useMemo(() => (items || []).filter((i) => filter === 'all' || !i.read_at), [items, filter]);
  const sections = useMemo(() => daysOf(shown, today).map((d) => ({ title: d.title, data: d.items.map((i) => itemView(i, { today })) })), [shown, today]);

  const open = (view) => {
    if (view.unread) read([view.id]);
    const to = view.open;
    if (!to) return;
    if (to.screen === 'Visit') navigation.navigate('Visit', { id: to.id });
    else if (to.screen === 'Estimate') {
      navigation.navigate('Estimate', { id: to.id, from: 'Notifications', focus: to.focus, commentId: to.commentId, highlight: to.highlight });
    } else if (to.screen === 'MyDay') navigation.popTo('MyDay');
  };

  const top = (
    <View style={styles.top}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Notifications</Text>
        {count > 0 ? (
          <TouchableOpacity style={styles.readAll} onPress={readAll} accessibilityRole="button">
            <Text style={styles.readAllText}>Mark all as read</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.seg} accessibilityRole="tablist">
        {[['all', 'All'], ['unread', 'Unread']].map(([key, word]) => {
          const on = filter === key;
          return (
            <TouchableOpacity key={key} style={[styles.segBtn, on && styles.segOn]} onPress={() => pick(key)}
              accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={key === 'unread' && count ? `Unread, ${count}` : word}>
              <Text style={[styles.segText, on && styles.segTextOn]}>{word}</Text>
              {key === 'unread' && count ? <Text style={styles.segCount}>{badgeText(count)}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <SalaryFrame navigation={navigation} top={top} tab="Notifications">
      {items === null ? <NoData problem={problem} onRetry={() => load()} /> : (
        <SectionList
          sections={sections}
          keyExtractor={(v) => String(v.id)}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(filter, { pull: true })} tintColor={colors.brand} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={sections.length ? null : styles.emptyWrap}
          renderSectionHeader={({ section }) => <Text style={styles.day} accessibilityRole="header">{section.title.toUpperCase()}</Text>}
          renderItem={({ item: view }) => <Row view={view} onOpen={() => open(view)} onMore={() => setSheet(view)} />}
          ListEmptyComponent={<Empty />}
          ListFooterComponent={more ? <ActivityIndicator style={styles.more} color={colors.brand} /> : null}
        />
      )}
      <Sheet view={sheet} bottom={insets.bottom} onClose={() => setSheet(null)}
        onToggle={() => { const v = sheet; setSheet(null); if (v.unread) read([v.id]); else unread(v.id); }} />
    </SalaryFrame>
  );
}

// One item (design nb-item): the circle, the words (bold where the server's names are), the quote,
// the grey line; «⋯» on the right
function Row({ view, onOpen, onMore }) {
  const sys = !view.avatar.initials;
  const tone = view.avatar.tone === 'part' ? [colors.successBg, colors.successBorder, colors.successFg] : [colors.warningBg, colors.warningBorder, colors.warningFg];
  return (
    <View style={[styles.item, view.unread && styles.itemUnread]}>
      <TouchableOpacity style={styles.itemMain} onPress={onOpen} accessibilityRole="button"
        accessibilityLabel={`${view.unread ? 'Unread. ' : ''}${lineText(view)}. ${view.sub}`}>
        {view.unread ? <View style={styles.dot} /> : null}
        {sys ? (
          <View style={[styles.avatar, { backgroundColor: tone[0], borderWidth: 1, borderColor: tone[1] }]}>
            <Icon name={view.avatar.icon} size={20} color={tone[2]} />
          </View>
        ) : (
          <View style={[styles.avatar, styles.avatarPerson]}><Text style={styles.avatarText}>{view.avatar.initials}</Text></View>
        )}
        <View style={styles.itemText}>
          <Text style={styles.line}>
            {view.line.map((p, i) => <Text key={i} style={p.bold ? styles.bold : null}>{p.text}</Text>)}
            {view.quote ? <Text>{` “${view.quote}”`}</Text> : null}
          </Text>
          {view.sub ? <Text style={styles.sub}>{view.sub}</Text> : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.moreBtn} onPress={onMore} accessibilityRole="button" accessibilityLabel="More actions">
        <Icon name="more" size={22} color={colors.fgSecondary} />
      </TouchableOpacity>
    </View>
  );
}

function Empty() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyArt}><Icon name="bell" size={40} color={colors.successFg} /></View>
      <Text style={styles.emptyTitle}>{EMPTY_WORDS.title}</Text>
      <Text style={styles.emptyText}>{EMPTY_WORDS.text}</Text>
    </View>
  );
}

// «⋯»: a sheet from the bottom (a phone's dropdown is too small) — Mark as read / unread, Cancel
function Sheet({ view, bottom, onClose, onToggle }) {
  return (
    <Modal visible={!!view} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetWrap}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        {view ? (
          <View style={[styles.sheet, { paddingBottom: Math.max(bottom, 16) }]} accessibilityViewIsModal>
            <Text style={styles.sheetTitle} numberOfLines={2}>{lineText(view)}</Text>
            <TouchableOpacity style={styles.sheetBtn} onPress={onToggle} accessibilityRole="button">
              <Text style={styles.sheetBtnText}>{view.unread ? 'Mark as read' : 'Mark as unread'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetCancel]} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.sheetBtnText, styles.sheetCancelText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 12, backgroundColor: colors.bgCard },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: colors.fgDefault },
  readAll: { minHeight: 44, justifyContent: 'center' },
  readAllText: { fontSize: 16, fontWeight: '700', color: colors.brandPressed },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: colors.bgSubtle },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 10 },
  segOn: { backgroundColor: colors.bgCard, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segText: { fontSize: 16, fontWeight: '700', color: colors.fgSecondary },
  segTextOn: { color: colors.fgDefault },
  segCount: { minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, overflow: 'hidden', backgroundColor: colors.infoBorder, color: colors.fgOnFill, fontSize: 12, fontWeight: '800', lineHeight: 22, textAlign: 'center' },
  day: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.fgMutedField },
  item: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, backgroundColor: colors.bgCard },
  itemUnread: { backgroundColor: colors.brandSoft },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingLeft: 16 },
  dot: { position: 'absolute', left: 4, top: 30, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.infoBorder },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarPerson: { backgroundColor: colors.brand },
  avatarText: { fontSize: 15, fontWeight: '800', color: colors.fgOnFill },
  itemText: { flex: 1, minWidth: 0, gap: 4 },
  line: { fontSize: 16, lineHeight: 21, color: colors.fgDefault },
  bold: { fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  moreBtn: { width: 44, height: 44, marginTop: 10, marginRight: 4, alignItems: 'center', justifyContent: 'center' },
  more: { paddingVertical: 16 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 48 },
  emptyArt: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successBg },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: colors.fgDefault, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 21, color: colors.fgSecondary, textAlign: 'center' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  sheet: { gap: 8, paddingHorizontal: 16, paddingTop: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.bgCard },
  sheetTitle: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary, paddingBottom: 4 },
  sheetBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.brandPressed },
  sheetBtnText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  sheetCancel: { borderColor: colors.borderControl },
  sheetCancelText: { color: colors.fgDefault },
});
