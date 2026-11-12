// The visit's bill (design-mockups/app-invoice: bill-draft, bill-totals, price-book). Opens
// from the visit: «Open the bill» asks the server for the draft (POST: it assembles a new one
// from the visit's kind, its parts and the diagnostics credit, or answers the one there is);
// the Bill tile reads the bill as it is (GET). Everything the screen shows is the server's
// answer (src/bill/model.js); every change goes to the server at once and comes back as the
// whole bill, with the totals and the tax counted there.
//   - a line: tap → Edit line (BillLineScreen); the credit is the server's (a lock);
//   - Price book / + Add …: the sheet of the job's company's price book (PriceBookSheet);
//   - Message on the bill: saved when the field is left;
//   - Preview the bill: what the customer gets, and the issue (BillPreviewScreen).
// An issued bill is frozen: it reads the same, nothing to change.
// No offline queue here: without the connection the bill shows the words and Try again
// (the offline draft of the design is a later step).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { billAPI } from '../services/api';
import { useAuth } from '../session/AuthContext';
import { logError } from '../utils/logError';
import { kindWord, nowWall } from '../myDay/model';
import { Tag } from '../myDay/parts';
import { billError, blockersOf, creditNote, footOf, partiesOf, sectionsOf, statusOf, totalsOf } from '../bill/model';
import { AddRow, Box, Foot, LineRow, MainButton, PlainButton, SectionHead, TopBar, Totals, billStyles } from '../bill/parts';
import { PriceBookSheet } from '../bill/PriceBookSheet';

export default function BillScreen({ route, navigation }) {
  const { id, visit = null, create = false } = route.params || {};
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const insets = useSafeAreaInsets();

  const [bill, setBill] = useState(null);
  const [none, setNone] = useState(false);               // the visit has no bill yet
  const [problem, setProblem] = useState(null);          // { kind, text } of the last load
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);                // 'draft' while a change waits
  const asked = useRef(false);                           // the draft was asked for once
  const seq = useRef(0);
  const gone = useRef(false);

  const leave = useCallback((text) => {
    if (gone.current) return;
    gone.current = true;
    Alert.alert(text, 'It is no longer on your day.', [{ text: 'OK', onPress: () => navigation.popToTop() }]);
  }, [navigation]);

  // A bill the server answered: shown; the message field follows it unless it is being typed
  const show = useCallback((next) => {
    setBill(next);
    setNone(false);
    setProblem(null);
  }, []);

  const load = useCallback(async ({ pull = false } = {}) => {
    if (gone.current) return;
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      let data;
      if (create && !asked.current) {
        asked.current = true;
        try {
          data = await billAPI.draft(id);
        } catch (error) {
          // 409: an issued bill (or no work) — read what there is instead
          if (error.response?.status !== 409) throw error;
          data = await billAPI.get(id);
        }
      } else {
        data = await billAPI.get(id);
      }
      if (n !== seq.current) return;
      show(data.bill);
    } catch (error) {
      if (n !== seq.current) return;
      const failed = billError(error);
      if (failed.kind === 'none') { setNone(true); setProblem(null); return; }
      if (failed.kind === 'gone') { leave(failed.text); return; }
      if (failed.kind === 'failed') logError('Error loading a bill:', error);
      setProblem(failed);
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  }, [id, create, show, leave]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // One change at a time: its answer is the whole bill
  const change = useCallback(async (what, request) => {
    if (busy) return false;
    setBusy(what);
    try {
      const data = await request();
      if (data && data.bill) show(data.bill);
      return true;
    } catch (error) {
      const failed = billError(error);
      if (failed.kind === 'gone') leave(failed.text);
      else {
        if (failed.kind === 'failed') logError('Error changing a bill:', error);
        Alert.alert(failed.text);
        if (failed.kind === 'refused') load();
      }
      return false;
    } finally {
      setBusy(null);
    }
  }, [busy, show, leave, load]);

  // ---------- the message ----------
  const [message, setMessage] = useState('');
  const typing = useRef(false);
  // the field is the last thing on the screen: once the keyboard is up, scroll to it
  const scrollRef = useRef(null);
  const toMessage = () => {
    typing.current = true;
    setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 350);
  };
  useEffect(() => {
    if (bill && !typing.current) setMessage(bill.message || '');
  }, [bill]);
  const saveMessage = useCallback(async () => {
    typing.current = false;
    if (!bill || bill.status !== 'draft') return;
    const text = message.trim();
    if (text === (bill.message || '').trim()) return;
    await change('message', () => billAPI.message(id, text || null));
  }, [bill, message, change, id]);

  // ---------- the price book ----------
  const [bookOpen, setBookOpen] = useState(null);        // the tab it opens on, or null
  const [book, setBook] = useState(null);                // { company, items }
  const [bookFailed, setBookFailed] = useState(null);
  const [adding, setAdding] = useState(null);
  const ownNext = useRef(null);
  const loadBook = useCallback(async () => {
    setBookFailed(null);
    try {
      const data = await billAPI.priceBook(id);
      setBook({ company: data.company, items: Array.isArray(data.price_items) ? data.price_items : [] });
    } catch (error) {
      const failed = billError(error);
      if (failed.kind === 'failed') logError('Error loading the price book:', error);
      setBookFailed(failed.kind === 'offline' ? 'No connection. The price book needs the internet.' : failed.text);
    }
  }, [id]);
  const openBook = (tab) => {
    setBookOpen(tab);
    if (!book) loadBook();
  };
  const addItem = async (item) => {
    if (adding !== null) return;
    setAdding(item.id);
    const ok = await change('add', () => billAPI.addLine(id, { price_item_id: item.id }));
    setAdding(null);
    if (ok) setBookOpen(null);
  };
  // «Add your own line»: the editor opens once the sheet has gone (iOS cannot push a screen
  // over a closing sheet): on its onDismiss, or a moment later if that does not come
  const goOwn = useCallback(() => {
    const kind = ownNext.current;
    ownNext.current = null;
    if (kind) navigation.navigate('BillLine', { id, mode: 'new', kind, tax: bill ? { rate: bill.tax_rate, name: bill.tax_name } : null });
  }, [navigation, id, bill]);
  const own = (tab) => {
    ownNext.current = tab === 'material' ? 'part' : 'labor';
    setBookOpen(null);
    setTimeout(goOwn, Platform.OS === 'ios' ? 700 : 200);
  };

  const openLine = (line) => navigation.navigate('BillLine', { id, mode: 'edit', line, tax: { rate: bill.tax_rate, name: bill.tax_name } });

  // ---------- what the screen shows ----------
  const now = nowWall(Date.now());
  const view = useMemo(() => (bill ? {
    status: statusOf(bill, now),
    parties: partiesOf(bill, visit),
    sections: sectionsOf(bill, userId),
    totals: totalsOf(bill),
    foot: footOf(bill),
    blockers: blockersOf(bill),
    creditNote: creditNote(bill),
  } : null), [bill, visit, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = !!bill && bill.status === 'draft';
  const kind = kindWord({ visit_kind: (bill && bill.visit_kind) || (visit && visit.visit_kind) });

  const top = <TopBar back="Visit" title="Bill" onBack={() => navigation.goBack()} />;

  if (!bill) {
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        {top}
        <View style={billStyles.noData}>
          {none ? (
            <>
              <Text style={billStyles.noDataTitle}>No bill yet</Text>
              <Text style={billStyles.noDataText}>The server drafts it from this visit: the service, the parts and the diagnostics credit.</Text>
              <MainButton text="Start the bill" icon="doc" waiting={busy === 'draft'}
                onPress={() => change('draft', () => billAPI.draft(id))} />
            </>
          ) : problem ? (
            <>
              <Text style={billStyles.noDataTitle}>{problem.kind === 'offline' ? 'No connection' : 'Could not load the bill'}</Text>
              <Text style={billStyles.noDataText}>{problem.kind === 'offline' ? 'The bill is kept by the office’s server. Try again when you are back online.' : problem.text}</Text>
              <View style={styles.retryWrap}><PlainButton text="Try again" icon="refresh" onPress={() => load()} /></View>
            </>
          ) : <ActivityIndicator color={colors.brand} />}
        </View>
      </SafeAreaView>
    );
  }

  const { status, parties, sections, totals, foot, blockers } = view;
  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      {top}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} style={billStyles.page} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.brand} />}>
        <View style={styles.head}>
          {problem ? <Box kind="warn" icon="wifioff" title={problem.kind === 'offline' ? 'No connection' : 'Not refreshed'} text="This is the bill as it was. Pull down to refresh." /> : null}
          {!draft && bill.status === 'issued' ? (
            <Box kind="done" icon="checkc" title={`Bill ${bill.label || `#${bill.bill_number}`} is issued`}
              text="It is frozen and has its PDF. To change it now, the office voids and reissues it." />
          ) : null}
          <View style={styles.chipRow}>
            <Tag tag={status.chip} big />
            {status.saved ? <Text style={styles.saved}>{status.saved}</Text> : null}
          </View>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.cardCell, styles.cardCellLeft]}>
                <Text style={styles.cardLabel}>FROM</Text>
                <Text style={styles.cardTitle}>{parties.from.title}</Text>
                <Text style={styles.cardSub}>{parties.from.sub}</Text>
              </View>
              <View style={styles.cardCell}>
                <Text style={styles.cardLabel}>TO</Text>
                <Text style={styles.cardTitle}>{parties.to.title}</Text>
                {parties.to.sub ? <Text style={styles.cardSub}>{parties.to.sub}</Text> : null}
              </View>
            </View>
            {parties.appliances.map((a) => (
              <View key={a.key} style={styles.cardAppliance}>
                <Text style={styles.cardLabel}>APPLIANCE</Text>
                <Text style={styles.cardTitle}>{a.title}</Text>
                {a.serial ? <Text style={styles.cardSub}>{a.serial}</Text> : null}
              </View>
            ))}
          </View>
        </View>

        <View style={billStyles.section}>
          <SectionHead label="Services" link={draft ? 'Price book' : null} icon="book" onLink={() => openBook('service')} />
          {sections.services.map((row) => <LineRow key={row.key} row={row} onPress={openLine} />)}
          {!sections.services.length && !draft ? <Text style={billStyles.quiet}>No services</Text> : null}
          {draft ? <AddRow text="Add service" onPress={() => openBook('service')} off={!!busy} /> : null}
        </View>

        <View style={billStyles.section}>
          <SectionHead label="Materials" link={draft ? 'Parts & price book' : null} icon="box" onLink={() => openBook('material')} />
          {sections.materials.map((row) => <LineRow key={row.key} row={row} onPress={openLine} />)}
          {!sections.materials.length && !draft ? <Text style={billStyles.quiet}>No materials</Text> : null}
          {draft ? <AddRow text="Add material" onPress={() => openBook('material')} off={!!busy} /> : null}
        </View>

        {sections.credits.length ? (
          <View style={billStyles.section}>
            <SectionHead label="Credits" />
            {sections.credits.map((row) => <LineRow key={row.key} row={row} onPress={openLine} note={view.creditNote} />)}
          </View>
        ) : null}

        {sections.discounts.length || draft ? (
          <View style={billStyles.section}>
            <SectionHead label="Discounts" />
            {sections.discounts.map((row) => <LineRow key={row.key} row={row} onPress={openLine} />)}
            {draft ? <AddRow text="Add discount" onPress={() => openBook('discount')} off={!!busy} /> : null}
          </View>
        ) : null}

        <View style={billStyles.section}>
          <SectionHead label="Totals" />
          <Totals rows={totals} />
        </View>

        <View style={billStyles.section}>
          <SectionHead label="Message on the bill" />
          {draft ? (
            <View style={styles.messageWrap}>
              <TextInput style={styles.message} value={message} multiline maxLength={2000}
                placeholder="A note for the customer, printed on the bill" placeholderTextColor={colors.fgMutedField}
                onFocus={toMessage} onChangeText={(t) => { typing.current = true; setMessage(t); }} onBlur={saveMessage}
                accessibilityLabel="Message on the bill" />
              {busy === 'message' ? <Text style={styles.messageState}>Saving…</Text> : null}
            </View>
          ) : <Text style={billStyles.quiet}>{bill.message || 'No message'}</Text>}
        </View>

        {draft && blockers.length ? (
          <View style={styles.blockers}>
            <Box kind="warn" icon="warn" title={blockers.some((b) => b.hard) ? 'The office has to fix this first' : 'Ask the office'} text={blockers.map((b) => b.text).join('\n')} />
          </View>
        ) : null}
      </ScrollView>

      <Foot foot={foot} bottom={insets.bottom}>
        <MainButton text={draft ? 'Preview the bill' : 'What the customer gets'} icon="eye" off={busy === 'message'}
          onPress={async () => { if (draft) await saveMessage(); navigation.navigate('BillPreview', { id, visit }); }} />
      </Foot>
      </KeyboardAvoidingView>

      <PriceBookSheet visible={bookOpen !== null} tab={bookOpen} book={book} failed={bookFailed} bill={bill} kindWord={kind}
        adding={adding} bottom={insets.bottom} onTryAgain={loadBook} onAdd={addItem} onOwn={own}
        onClose={() => setBookOpen(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingBottom: 24 },
  head: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  saved: { fontSize: 15, fontWeight: '600', color: colors.fgSecondary },
  card: { borderRadius: 18, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard, overflow: 'hidden' },
  cardRow: { flexDirection: 'row' },
  cardCell: { flex: 1, padding: 12, gap: 2 },
  cardCellLeft: { borderRightWidth: 1, borderRightColor: colors.borderDefault },
  cardAppliance: { padding: 12, gap: 2, borderTopWidth: 1, borderTopColor: colors.borderDefault },
  cardLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.fgSecondary },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  cardSub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  messageWrap: { paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  message: { minHeight: 88, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, fontSize: 17, lineHeight: 22, color: colors.fgDefault, textAlignVertical: 'top' },
  messageState: { fontSize: 13, color: colors.fgSecondary },
  blockers: { paddingHorizontal: 16, paddingTop: 12 },
  retryWrap: { alignSelf: 'stretch' },
});
