// The visit's bill (design-mockups/app-invoice: bill-draft, bill-totals, price-book). Opens
// from the visit: «Open the bill» asks the server for the draft (POST: it assembles a new one
// from the visit's kind, its parts and the diagnostics credit, or answers the one there is);
// the Bill tile reads the bill as it is (GET). Everything the screen shows is the server's
// answer (src/bill/model.js); every change goes to the server at once and comes back as the
// whole bill, with the totals and the tax counted there.
//   - a line: tap → Edit line (BillLineScreen); the credit is the server's (a lock);
//   - Price book / + Add …: the sheet of the job's company's price book (PriceBookSheet);
//   - Tax (TAX-APP): with the office's leave (can_change_tax) the Taxable switch and the rate
//     row that opens «Tax rate»; without it the rate locked «set by the office» (src/bill/tax.js);
//   - Message on the bill: saved when the field is left;
//   - Diagnosis (D1-APP): the visit's text over the lines, «Printed on the bill», Edit on a
//     draft (the same sheet as on the visit); an issued bill shows what it printed;
//   - Preview the bill: what the customer gets, and the issue (BillPreviewScreen).
//   - Over the approval: the draft grew past what the customer approved by the rule of the
//     place (the server's needs_new) — the amber bar over the total, «Approve again» in it.
// An issued bill is frozen: it reads the same, nothing to change.
// No offline queue here: without the connection the bill shows the words and Try again
// (the offline draft of the design is a later step).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { billAPI } from '../services/api';
import { useAuth } from '../session/AuthContext';
import { logError } from '../utils/logError';
import { kindWord, nowWall } from '../myDay/model';
import { Tag } from '../myDay/parts';
import { billError, blockersOf, creditNote, deliveryOf, footOf, overApproval, partiesOf, sectionsOf, statusOf, totalsOf } from '../bill/model';
import { AddRow, Box, Foot, LineRow, MainButton, PlainButton, SectionHead, TopBar, Totals, billStyles } from '../bill/parts';
import { PriceBookSheet } from '../bill/PriceBookSheet';
import { TaxSection, TaxSheet } from '../bill/TaxParts';
import { taxPick, taxRefusal, taxSection } from '../bill/tax';
import { billDiagnosis, diagnosisOf } from '../diagnosis/model';
import { DiagnosisBody, DiagnosisHead, DiagnosisSheet } from '../diagnosis/parts';
import { useDiagnosis } from '../diagnosis/useDiagnosis';
import { billView } from '../perms/model';
import { canApprove } from '../approve/model';

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
      const said = taxRefusal(error);
      const failed = said ? { kind: 'refused', text: said } : billError(error);
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
    if (kind) navigation.navigate('BillLine', { id, mode: 'new', kind, tax: bill ? { rate: bill.tax_rate, name: bill.tax_name, off: bill.tax_off === true } : null });
  }, [navigation, id, bill]);
  const own = (tab) => {
    ownNext.current = tab === 'material' ? 'part' : 'labor';
    setBookOpen(null);
    setTimeout(goOwn, Platform.OS === 'ios' ? 700 : 200);
  };

  // ---------- the diagnosis ----------
  // Its answer is the visit's block: the bill shows it at once (the visit reads its own on return)
  const diag = useDiagnosis({
    id,
    current: bill && bill.status === 'draft' ? diagnosisOf(bill) : null,
    onAnswer: ({ diagnosis }) => { if (diagnosis) setBill((b) => (b ? { ...b, diagnosis } : b)); },
    onGone: () => leave('This visit was changed by the office'),
  });
  const diagBlock = billDiagnosis(bill);

  const openLine = (line) => navigation.navigate('BillLine', { id, mode: 'edit', line, tax: { rate: bill.tax_rate, name: bill.tax_name, off: bill.tax_off === true } });

  // ---------- the tax ----------
  const [taxOpen, setTaxOpen] = useState(false);
  // the switch shows where it was moved while the server answers (a refusal puts it back)
  const [taxWant, setTaxWant] = useState(null);
  const switchTax = async (on) => {
    if (busy) return;
    setTaxWant(on);
    await change('tax', () => billAPI.tax(id, { tax_off: !on }));
    setTaxWant(null);
  };
  const pickTax = async (key) => {
    const body = taxPick(bill, key);
    if (!body) { setTaxOpen(false); return; }
    const ok = await change('tax', () => billAPI.tax(id, body));
    if (ok) setTaxOpen(false);
  };

  // ---------- what the screen shows ----------
  const now = nowWall(Date.now());
  const view = useMemo(() => (bill ? {
    status: statusOf(bill, now),
    parties: partiesOf(bill, visit),
    sections: sectionsOf(bill, userId, billView(user, bill).edit),
    totals: totalsOf(bill),
    foot: footOf(bill),
    blockers: blockersOf(bill),
    creditNote: creditNote(bill),
    tax: taxSection(bill),
    over: overApproval(bill),
  } : null), [bill, visit, userId, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = !!bill && bill.status === 'draft';
  // The technician's permissions (src/perms, the bill's own flags): the lines (can_edit_lines),
  // the money and giving the bill (can_take_payments; without it no amounts, no Preview or PDF)
  const perms = billView(user, bill);
  const canEdit = perms.edit;
  const payments = perms.give;
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
            <Box kind="done" icon="checkc" title={`Bill ${bill.label || `#${bill.bill_number}`} is final`}
              text="It is frozen and has its PDF. To change it now, the office voids and reissues it." />
          ) : null}
          {bill.status === 'issued' && deliveryOf(bill, now) ? (
            <Box kind="done" icon="check" title={deliveryOf(bill, now).title} text={deliveryOf(bill, now).line} />
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

        {diagBlock ? (
          <View style={[billStyles.section, styles.diag]}>
            <DiagnosisHead />
            <DiagnosisBody block={diagBlock} onPress={() => diag.open(diagBlock.opens)} />
          </View>
        ) : null}

        <View style={billStyles.section}>
          <SectionHead label="Services" link={canEdit ? 'Price book' : null} icon="book" onLink={() => openBook('service')} />
          {/* the lines are the office's for this technician (src/perms): said under the head, before the lines */}
          {perms.linesLine ? (
            <View style={styles.permRow}>
              <Icon name="lock" size={16} color={colors.fgMutedField} />
              <Text style={styles.permText}>{perms.linesLine}</Text>
            </View>
          ) : null}
          {sections.services.map((row) => <LineRow key={row.key} row={row} onPress={openLine} />)}
          {!sections.services.length && !canEdit ? <Text style={billStyles.quiet}>No services</Text> : null}
          {canEdit ? <AddRow text="Add service" onPress={() => openBook('service')} off={!!busy} /> : null}
        </View>

        <View style={billStyles.section}>
          <SectionHead label="Materials" link={canEdit ? 'Parts & price book' : null} icon="box" onLink={() => openBook('material')} />
          {sections.materials.map((row) => <LineRow key={row.key} row={row} onPress={openLine} />)}
          {!sections.materials.length && !canEdit ? <Text style={billStyles.quiet}>No materials</Text> : null}
          {canEdit ? <AddRow text="Add material" onPress={() => openBook('material')} off={!!busy} /> : null}
        </View>

        {sections.credits.length ? (
          <View style={billStyles.section}>
            <SectionHead label="Credits" />
            {sections.credits.map((row) => <LineRow key={row.key} row={row} onPress={openLine} note={view.creditNote} />)}
          </View>
        ) : null}

        {sections.discounts.length || canEdit ? (
          <View style={billStyles.section}>
            <SectionHead label="Discounts" />
            {sections.discounts.map((row) => <LineRow key={row.key} row={row} onPress={openLine} />)}
            {canEdit ? <AddRow text="Add discount" onPress={() => openBook('discount')} off={!!busy} /> : null}
          </View>
        ) : null}

        {view.tax ? (
          <View style={billStyles.section}>
            <TaxSection section={view.tax} busy={busy === 'tax'} want={taxWant} onSwitch={switchTax} onOpen={() => setTaxOpen(true)} />
          </View>
        ) : null}

        {totals.length ? (
          <View style={billStyles.section}>
            <SectionHead label="Totals" />
            <Totals rows={totals} />
          </View>
        ) : null}

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

        {/* what stops the issue — only for who issues it (without takes_payments the office does) */}
        {draft && payments && blockers.length ? (
          <View style={styles.blockers}>
            <Box kind="warn" icon="warn" title={blockers.some((b) => b.hard) ? 'The office has to fix this first' : 'Ask the office'} text={blockers.map((b) => b.text).join('\n')} />
          </View>
        ) : null}
      </ScrollView>

      {/* over the customer's approval: said where the total is, for who issues the bill (USABILITY §6) */}
      <Foot foot={foot} bottom={insets.bottom} quiet={perms.paymentsLine}
        over={draft && payments && view.over ? {
          text: view.over.text,
          onAgain: !visit || canApprove(visit) ? () => navigation.navigate('Approve', { id, visit, again: true, back: 'Bill' }) : null,
        } : null}>
        {!payments ? null : draft ? (
          <MainButton text="Preview the bill" icon="eye" off={busy === 'message'}
            onPress={async () => { await saveMessage(); navigation.navigate('BillPreview', { id, visit }); }} />
        ) : bill.status === 'issued' ? (
          <>
            {bill.delivered_at ? (
              <PlainButton text="PDF and delivery" icon="share" onPress={() => navigation.navigate('BillSend', { id, visit })} />
            ) : (
              <MainButton text="Give it to the customer" icon="share" onPress={() => navigation.navigate('BillSend', { id, visit })} />
            )}
            <PlainButton text="What the customer gets" icon="eye" onPress={() => navigation.navigate('BillPreview', { id, visit })} />
          </>
        ) : null}
      </Foot>
      </KeyboardAvoidingView>

      <DiagnosisSheet {...diag.sheet} visible={diag.sheet.visible && draft} bottom={insets.bottom}
        onChangeText={diag.setText} onSave={diag.save} onUseTheirs={diag.keepTheirs} onAddMine={diag.addMine} onSaveMine={diag.saveMine} onClose={diag.close} />
      <TaxSheet visible={taxOpen && draft && !!view.tax && view.tax.change} bill={bill} sending={busy === 'tax'} bottom={insets.bottom}
        onPick={pickTax} onClose={() => setTaxOpen(false)} />
      <PriceBookSheet visible={bookOpen !== null && canEdit} tab={bookOpen} book={book} failed={bookFailed} bill={bill} kindWord={kind}
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
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  permText: { flex: 1, fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  diag: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
});
