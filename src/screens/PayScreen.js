// «Pay» of the visit (design-mockups/payments: pay, pay-part, recorded, paid, void, offline,
// not-given, later). The visit's issued bill and its money come from the server (GET …/bill:
// paid_cents, balance_cents, payment_status, payments); this screen shows them and asks how
// much is taken now. How it is paid is the next screen (PayMethodScreen). What it does:
//   - no issued bill: says so and opens the bill;
//   - issued, not given: the customer gets the bill first (NYC §2-255) — Give the bill opens
//     BillSendScreen; «Customer gets the bill later…» asks why, and the payment goes with
//     before_delivery and the reason (the office sends the bill);
//   - the amount: the full balance, or part of it with a reason (the server: note_required);
//   - after a record: the green line, «Collect $X now» for a second method, or Later;
//   - one's own record in its first 15 minutes: Void with a reason (the row stays crossed out);
//   - paid in full: the payments, «Add a cash tip», Done;
//   - no connection: the last known numbers, nothing is recorded (the server counts the balance).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { billAPI, payAPI } from '../services/api';
import { forgetBill } from '../pay/attempts';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { clockAmPm, nowWall } from '../myDay/model';
import { Sheet } from '../myDay/visitBar';
import { usd } from '../bill/model';
import {
  PART_REASONS, VOID_REASONS, amountOf, chipOf, countWord, dueOf, historyOf, laterReasonGiven, moneyText, numbersOf, paidAt, payError, stageOf, voidBody,
} from '../pay/model';
import { Chip, Field, History, Numbers, Pills, Section, payStyles } from '../pay/parts';
import { depositPayRows, historyLabel } from '../deposit/model';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';

const LATER_REASONS = ['Wants it by email', 'Printer is out', 'Paying for someone else'];

export default function PayScreen({ route, navigation }) {
  const { id, visit, bill: lastBill = null, recorded = null } = route.params || {};
  const insets = useSafeAreaInsets();
  const [bill, setBill] = useState(lastBill);
  const [problem, setProblem] = useState(null);         // { kind, text } of the last read
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(Date.now());
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const data = await billAPI.get(id);
      if (n !== seq.current) return;
      // the bill as it is now shows what went through: the method screens start anew (pay/attempts.js)
      if (data.bill) forgetBill(data.bill.id);
      setBill(data.bill);
      setProblem(null);
    } catch (error) {
      if (n !== seq.current) return;
      const failed = payError(error);
      if (failed.code === 'no_bill') { setBill(null); setProblem(null); return; }
      if (failed.kind === 'failed') logError('Error loading the bill to pay:', error);
      if (failed.kind === 'gone') { navigation.popToTop(); return; }
      setProblem(failed);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [id, navigation]);
  useFocusEffect(useCallback(() => { setTick(Date.now()); load(); }, [load]));
  // the void links count their minutes down
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // ---------- the amount ----------
  const [collectingFor, setCollectingFor] = useState(null); // after a record: «Collect now» opens the amount again
  const [pick, setPick] = useState('full');
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [later, setLater] = useState(null);             // { reason } — the bill is sent later
  const recordKey = recorded ? recorded.key : null;
  // a new record came back from the method screen: the amount starts over, the choice waits
  useEffect(() => {
    if (recordKey) {
      setPick('full');
      setTyped('');
      setReason(null);
      setNote('');
    }
  }, [recordKey]);

  const due = bill ? dueOf(bill) : 0;
  const amount = amountOf({ full: pick === 'full', typed, note }, due);
  const choosePart = (key) => {
    setPick(key);
    if (key === 'part' && !typed) setTyped('');
  };
  const pickReason = (key) => {
    setReason(key);
    // a quick answer is the note's words; the technician may change them
    if (key && (!note.trim() || PART_REASONS.includes(note.trim()))) setNote(key);
    if (!key && PART_REASONS.includes(note.trim())) setNote('');
  };
  const next = () => {
    if (amount.error) return;
    // the bill is still not given: every payment says why (the server asks each one); the
    // reason of the first payment is the office's, the technician's words go again
    const sentLater = later || (!bill.delivered_at && laterReasonGiven(bill) ? { reason: 'The bill is sent later, as with the first payment' } : null);
    navigation.navigate('PayMethod', { id, visit, bill, cents: amount.cents, part: amount.part, note: amount.part ? note.trim() : '', later: sentLater });
  };

  // ---------- «Customer gets the bill later…» ----------
  const [laterOpen, setLaterOpen] = useState(false);
  const [laterChip, setLaterChip] = useState(null);
  const [laterText, setLaterText] = useState('');
  const laterReason = [laterChip, laterText.trim()].filter(Boolean).join(': ');
  const takeLater = () => {
    if (!laterReason) return;
    setLater({ reason: laterReason.slice(0, 300) });
    setLaterOpen(false);
  };

  // ---------- voiding one's own record ----------
  const [voiding, setVoiding] = useState(null);         // the history row
  const [voidChip, setVoidChip] = useState(null);
  const [voidText, setVoidText] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidFailed, setVoidFailed] = useState(null);
  const openVoid = (row) => { setVoiding(row); setVoidChip(null); setVoidText(''); setVoidFailed(null); };
  const doVoid = async () => {
    if (voidBusy || !voiding) return;
    const { body, error } = voidBody(voidChip, voidText);
    if (error) { setVoidFailed(error); return; }
    setVoidBusy(true);
    setVoidFailed(null);
    try {
      const data = await payAPI.void(id, voiding.payment.id, body.reason);
      if (data && data.bill) setBill(data.bill);
      setVoiding(null);
    } catch (e) {
      const failed = payError(e);
      if (failed.kind === 'failed') logError('Error voiding a payment:', e);
      setVoidFailed(failed.text);
      if (failed.kind === 'refused') load();
    } finally {
      setVoidBusy(false);
    }
  };

  const now = nowWall(Date.now());
  // the deposits this bill took (DEP-APP, design app-repair-pay): first in History, no void
  const rows = useMemo(() => (bill ? [...depositPayRows(visit, bill.label), ...historyOf(bill, tick)] : []), [bill, tick, visit]);
  const offline = problem && problem.kind === 'offline';
  const back = <TopBar back="Visit" title="Payment" onBack={() => navigation.goBack()} />;

  if (!bill) {
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        {back}
        <View style={billStyles.noData}>
          {loading && !problem ? <ActivityIndicator color={colors.brand} /> : problem ? (
            <>
              <Text style={billStyles.noDataTitle}>{offline ? 'No connection' : 'Could not load the bill'}</Text>
              <Text style={billStyles.noDataText}>{offline ? 'A payment needs the internet: the server counts the balance. Try again when you are back online.' : problem.text}</Text>
              <View style={styles.stretch}><PlainButton text="Try again" icon="refresh" onPress={load} /></View>
            </>
          ) : (
            <>
              <Text style={billStyles.noDataTitle}>Issue the bill first</Text>
              <Text style={billStyles.noDataText}>The customer pays an issued bill. Open the bill, issue it, then give it to the customer.</Text>
              <View style={styles.stretch}><MainButton text="Open the bill" icon="doc" onPress={() => navigation.navigate('Bill', { id, visit, create: true })} /></View>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  let stage = stageOf(bill);
  if (stage === 'show' && later) stage = 'collect';
  const label = bill.label || `#${bill.bill_number}`;
  const showRecorded = !!recorded && stage !== 'paid';
  const collecting = showRecorded && collectingFor === recordKey;
  const askAmount = stage === 'collect' && !offline && (!showRecorded || collecting);
  const choice = stage === 'collect' && !offline && showRecorded && !collecting;
  const paid = stage === 'paid' ? paidAt(bill) : null;

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      {back}
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={payStyles.body} keyboardShouldPersistTaps="handled">
          <View style={payStyles.top}>
            {stage === 'paid' ? (
              <View style={styles.paidBox} accessible accessibilityLabel={`Paid in full. Bill ${label}, ${usd(bill.total_cents)}`}>
                <View style={styles.paidDot}><Icon name="check" size={30} color={colors.fgOnFill} /></View>
                <View style={styles.flex}>
                  <Text style={styles.paidTitle}>{bill.payment_status === 'overpaid' ? 'Paid' : 'Paid in full'}</Text>
                  <Text style={styles.paidSub}>{[`Bill ${label}`, usd(bill.total_cents), paid ? clockAmPm(paid.minutes) : null].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
            ) : showRecorded ? (
              <Box kind="done" icon="checkc" title={recorded.line} text="Saved on the server. The office sees it now." />
            ) : (
              <Chip chip={chipOf(bill, now)} />
            )}
            <Numbers rows={numbersOf(bill)} />
          </View>

          {stage === 'paid' && bill.payment_status === 'overpaid' ? (
            <Box kind="info" icon="info" style={payStyles.gap} text={`Paid ${usd(-bill.balance_cents)} more than the bill. The office refunds it.`} />
          ) : null}
          {stage === 'void' ? (
            <Box kind="warn" icon="warn" style={payStyles.gap} title="This bill is void"
              text={bill.replaced_by ? `Take the money on the bill that replaced it${bill.replaced_by.label ? ` (${bill.replaced_by.label})` : ''}.` : 'The office reissues it. Take the money on the new bill.'} />
          ) : null}
          {stage === 'none' ? (
            <Box kind="info" icon="doc" style={payStyles.gap} title="Issue the bill first"
              text="The customer pays an issued bill. Open the bill, issue it, then give it to the customer." />
          ) : null}
          {stage === 'free' ? <Box kind="plain" icon="info" style={payStyles.gap} title="Nothing to pay" text="This bill is $0.00." /> : null}
          {offline ? (
            <Box kind="warn" icon="wifioff" style={payStyles.gap} title="No connection · a payment needs the internet"
              text="The server checks the balance so two phones never count the same money twice. Take the money, then record it when you are back online." />
          ) : problem ? <Box kind="danger" icon="warn" style={payStyles.gap} text={problem.text} /> : null}

          {stage === 'show' && !offline ? (
            <Box kind="warn" icon="warn" style={payStyles.gap} title="Give the bill first"
              text="In NYC the customer gets the bill before paying: a copy they keep, printed or the PDF sent. Showing it on your phone does not count." />
          ) : null}
          {later && stage === 'collect' && !laterReasonGiven(bill) ? (
            <Box kind="info" icon="info" style={payStyles.gap} title="The bill is sent later" text={`${later.reason}. The office sends ${label} to the customer.`} />
          ) : null}

          {rows.length || stage === 'collect' ? (
            <History rows={rows} label={historyLabel(rows, countWord)} onVoid={offline ? null : openVoid} />
          ) : null}
          {rows.some((r) => r.voidLeft > 0) ? (
            <Text style={payStyles.hint}>Wrong amount or method? Void it in the first 15 minutes. After that, ask the office: an admin voids it.</Text>
          ) : null}

          {askAmount ? (
            <>
              <Section label="Collect now">
                <Field big prefix="$" value={pick === 'full' ? moneyText(due) : typed} onChange={(t) => { setPick('part'); setTyped(t); }}
                  keyboard="decimal-pad" max={12} placeholder="0.00" label={null} a11y="Amount to collect now" />
                <Pills items={[{ key: 'full', label: `Full balance ${usd(due)}` }, { key: 'part', label: 'Part of it' }]} value={pick} onPick={(k) => k && choosePart(k)} />
                {pick === 'part' && amount.cents !== null && amount.cents <= due ? (
                  <View style={styles.leftRow}>
                    <Text style={styles.leftLabel}>Left after this</Text>
                    <Text style={styles.leftValue}>{usd(amount.left)}</Text>
                  </View>
                ) : pick === 'full' ? <Text style={payStyles.text}>Paying with two methods? Take part now, the rest right after.</Text> : null}
              </Section>
              {pick === 'part' && amount.part ? (
                <Section label="Why only part?" need>
                  <Pills items={PART_REASONS.map((r) => ({ key: r, label: r, toggle: true }))} value={reason} onPick={pickReason} />
                  <Field label="Note" value={note} onChange={setNote} placeholder="Has $100 cash, rest by check" max={500}
                    hint={`The office sees it with the payment. ${note.length} of 500`} />
                </Section>
              ) : null}
            </>
          ) : null}

          {stage === 'paid' ? (
            <Section label="Tip">
              <TouchableOpacity style={styles.addRow} onPress={() => navigation.navigate('CashTip', { id, visit, bill })} accessibilityRole="button">
                <View style={styles.addDot}><Icon name="plus" size={18} color={colors.brandPressed} /></View>
                <Text style={styles.addText}>Add a cash tip</Text>
              </TouchableOpacity>
              <Text style={payStyles.text}>Card tips are taken inside the card payment. Here: cash, or a tip given later. Not part of the bill.</Text>
            </Section>
          ) : null}
        </ScrollView>

        <Foot bottom={insets.bottom}
          note={offline ? `The visit keeps «${usd(due)} due» until it is recorded.` : choice ? `Later: the visit shows «${usd(due)} left» and the office follows up.`
            : stage === 'show' ? 'Later needs a reason. The office sees it.' : askAmount && amount.error && (pick === 'part') ? amount.error : null}>
          {offline ? (
            <>
              <MainButton text="Record · needs internet" off onPress={() => {}} />
              <PlainButton text="Try again" icon="refresh" waiting={loading} onPress={load} />
            </>
          ) : stage === 'show' ? (
            <>
              <MainButton text="Give the bill" icon="doc" onPress={() => navigation.navigate('BillSend', { id, visit })} />
              <PlainButton text="Customer gets the bill later…" onPress={() => { setLaterChip(null); setLaterText(''); setLaterOpen(true); }} />
            </>
          ) : choice ? (
            <>
              <MainButton text={`Collect ${usd(due)} now`} icon="chev" onPress={() => setCollectingFor(recordKey)} />
              <PlainButton text={`Later · leave ${usd(due)} due`} onPress={() => navigation.goBack()} />
            </>
          ) : stage === 'none' ? (
            <MainButton text="Open the bill" icon="doc" onPress={() => navigation.navigate('Bill', { id, visit, create: false })} />
          ) : askAmount ? (
            <MainButton text="Next · how they pay" icon="chev" off={!!amount.error} onPress={next} />
          ) : (
            <MainButton text="Done · back to the visit" onPress={() => navigation.goBack()} />
          )}
        </Foot>
      </KeyboardAvoidingView>

      <Sheet visible={laterOpen} onClose={() => setLaterOpen(false)} bottom={insets.bottom} keyboard>
        <View style={payStyles.sheetBody}>
          <Text style={payStyles.sheetTitle} accessibilityRole="header">Bill later, payment now?</Text>
          <Text style={payStyles.sheetSub}>{`The office sends ${label} to the customer. Say why.`}</Text>
          <Pills items={LATER_REASONS.map((r) => ({ key: r, label: r, toggle: true }))} value={laterChip} onPick={setLaterChip} />
          <TextInput style={payStyles.input} value={laterText} onChangeText={setLaterText} maxLength={250} placeholder="More words, if needed"
            placeholderTextColor={colors.fgMutedField} accessibilityLabel="Why the bill is sent later" />
          <MainButton text="Take the payment" off={!laterReason} onPress={takeLater} />
          <TouchableOpacity style={payStyles.plainLink} onPress={() => setLaterOpen(false)} accessibilityRole="button">
            <Text style={payStyles.plainLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Sheet>

      <Sheet visible={!!voiding} onClose={() => setVoiding(null)} bottom={insets.bottom} keyboard>
        {voiding ? (
          <View style={payStyles.sheetBody}>
            <Text style={payStyles.sheetTitle} accessibilityRole="header">{`Void ${voiding.amount} ${voiding.tip ? 'tip' : voiding.title.split(' · ').pop().toLowerCase()}?`}</Text>
            <Text style={payStyles.sheetSub}>{`${voiding.title.split(' · ')[0]} · ${voiding.voidLeft} min left to do it yourself`}</Text>
            <Pills items={VOID_REASONS.map((r) => ({ key: r, label: r, toggle: true }))} value={voidChip} onPick={setVoidChip} off={voidBusy} />
            <TextInput style={payStyles.input} value={voidText} onChangeText={setVoidText} maxLength={400} placeholder="What happened"
              placeholderTextColor={colors.fgMutedField} accessibilityLabel="Why it is voided" />
            <Text style={payStyles.sheetSub}>It stays in the history crossed out. The office sees who voided it and why.</Text>
            {voidFailed ? <Text style={payStyles.failed} accessibilityRole="alert">{voidFailed}</Text> : null}
            <TouchableOpacity style={[payStyles.danger, (!voidChip && !voidText.trim()) && payStyles.dangerOff]} onPress={doVoid}
              disabled={voidBusy || (!voidChip && !voidText.trim())} accessibilityRole="button" accessibilityState={{ disabled: voidBusy || (!voidChip && !voidText.trim()), busy: voidBusy }}>
              {voidBusy ? <ActivityIndicator color={colors.dangerFg} /> : (
                <>
                  <Icon name="ban" size={22} color={colors.dangerFg} />
                  <Text style={payStyles.dangerText}>{voiding.tip ? 'Void tip' : 'Void payment'}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={payStyles.plainLink} onPress={() => setVoiding(null)} accessibilityRole="button">
              <Text style={payStyles.plainLinkText}>Keep it</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch', gap: 10 },
  paidBox: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.successBorder, backgroundColor: colors.successBg },
  paidDot: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successBorder },
  paidTitle: { fontSize: 24, fontWeight: '800', color: colors.successFg },
  paidSub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  leftRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leftLabel: { fontSize: 16, color: colors.fgSecondary },
  leftValue: { fontSize: 20, fontWeight: '800', color: colors.warningFg, fontVariant: ['tabular-nums'] },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  addDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  addText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
});
