// «Pay» of the visit (design-mockups/payments: pay, pay-part, recorded, paid, void, offline,
// not-given, later). The visit's issued bill and its money come from the server (GET …/bill:
// paid_cents, balance_cents, payment_status, payments); this screen shows them, how much is taken
// now and how it is paid — on one screen (USABILITY_2026-11-24 §5, design tech-app usab-u4-pay:
// a full payment in two taps, Cash → «Record $332.07 cash»; the methods are pay/MethodForm.js).
// What it does:
//   - no issued bill: says so and opens the bill;
//   - issued, not given: the customer gets a copy first (NYC §2-255; T3 d5, design-mockups/
//     tech-bill-plain): «First, the customer gets a copy of the bill.», the bill in one row and
//     the copy's choice (bill/CopyParts.js) — «Email the copy · Get paid» gives it, then the
//     payment; the quiet «Take payment now, send the copy later» takes it at once, the payment
//     goes with before_delivery and «The customer gets the copy later» (the office sends the
//     bill). Only for a company with «Bill before payment» (bill_before_payment, BILLS_MV_DESIGN
//     §3.2а) — without it the customer pays the issued bill at once, nothing about the copy;
//   - the amount: the full balance at once; «Change» opens the amount and «Why only part?» (the
//     server: note_required);
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
import { forgetEntry } from '../pay/cardEntry';
import { canPayOnline } from '../pay/online';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { clockAmPm, nowWall } from '../myDay/model';
import { Sheet } from '../myDay/visitBar';
import { usd } from '../bill/model';
import { LATER_REASON, billCardOf, buttonOf } from '../bill/copy';
import { BillCard, CopyChoice, useCopy } from '../bill/CopyParts';
import {
  PART_REASONS, VOID_REASONS, amountOf, chipOf, countWord, dueOf, historyOf, laterOf, laterReasonGiven, moneyText, noBillText, numbersOf, paidAt, payError, stageOf, voidBody,
} from '../pay/model';
import { balanceWord, collectSub } from '../pay/method';
import { MethodFields, useMethodForm } from '../pay/MethodForm';
import { Chip, Field, History, Numbers, Pills, Section, payStyles } from '../pay/parts';
import { depositPayRows, historyLabel } from '../deposit/model';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';


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
      // the bill as it is now shows what went through: the methods start anew (pay/attempts.js)
      if (data.bill) { forgetBill(data.bill.id); forgetEntry(data.bill.id); }
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
  const [changing, setChanging] = useState(false);       // «Change»: the amount field and the part
  const recordKey = recorded ? recorded.key : null;
  const scroll = useRef(null);
  const collectY = useRef(0);                            // where «Collect now» starts in the page
  const toCollect = useRef(false);                       // «Collect $X now»: go there once it is drawn
  const scrollToCollect = () => { if (scroll.current) scroll.current.scrollTo({ y: Math.max(0, collectY.current - 8), animated: true }); };
  // a new record (here, or back from the card or tip screens): the amount starts over at the full
  // balance, the choice waits; the page goes up to the green line
  useEffect(() => {
    if (recordKey) {
      setPick('full');
      setTyped('');
      setReason(null);
      setNote('');
      setChanging(false);
      if (scroll.current) scroll.current.scrollTo({ y: 0, animated: false });
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
  // «Change»: the amount field opens with the keyboard — the page goes to it, not under the keys
  const change = () => {
    setChanging(true);
    setPick('part');
    setTyped('');
    requestAnimationFrame(scrollToCollect);
  };
  // the bill is still not given: every payment says why (the server asks each one); the
  // reason of the first payment is the office's, the technician's words go again; a company
  // without «Bill before payment» asks none
  const sentLater = bill ? laterOf(bill, later) : null;
  const form = useMethodForm({
    id, visit, bill, amount, partNote: note, later: sentLater, navigation,
    // the record went: the green line and «Collect $X now» or Later; the bill is read again
    onRecorded: (r) => { navigation.setParams({ recorded: r }); load(); },
  });
  // back from the card or tip screens with a record: the next payment starts from no method
  const resetForm = form.reset;
  useEffect(() => {
    if (recordKey) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey]);

  // «Pay online» (ONL-APP1): the customer pays the same amount on their own phone, by the QR code;
  // only when the server's flag says the bill may be paid online
  const payOnline = () => {
    if (amount.error) return;
    navigation.navigate('PayOnline', { id, visit, bill, cents: amount.cents, part: amount.part });
  };

  // ---------- the customer's copy first (d5) ----------
  // starts on Printed copy handed (no tick to miss); a stop scrolls to the choice (QA 25.11)
  const copy = useCopy({ id, bill, required: true, quiet: true });
  const copyY = useRef(0);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyFail, setCopyFail] = useState(null);
  const giveCopy = async () => {
    if (copyBusy) return;
    setCopyBusy(true);
    setCopyFail(null);
    const r = await copy.give();
    setCopyBusy(false);
    if (!r.ok) {
      if (r.text) { setCopyFail(r.text); if (scroll.current) scroll.current.scrollTo({ y: Math.max(0, copyY.current - 8), animated: true }); }
      return;
    }
    // given: the payment comes next on this screen (the bill read again says delivered)
    if (r.bill) setBill(r.bill); else load();
  };
  // «Take payment now, send the copy later»: the reason goes by itself, the office sends the copy
  const takeLater = () => { setCopyFail(null); setLater({ reason: LATER_REASON }); };

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
  const back = <TopBar back="Visit" title={bill && stageOf(bill) === 'show' && !later ? 'Get paid' : 'Payment'} onBack={() => navigation.goBack()} />;

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
              <Text style={billStyles.noDataTitle}>The bill is not final yet</Text>
              <Text style={billStyles.noDataText}>{noBillText(bill)}</Text>
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
  // a payment sent without an answer shows what it sent: the amount is not changed
  const shownCents = form.locked ? form.cents : amount.cents;
  const shownPart = form.locked ? form.part : amount.part;
  const open = changing && !form.locked;
  const paid = stage === 'paid' ? paidAt(bill) : null;

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      {back}
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={payStyles.body} keyboardShouldPersistTaps="handled">
          {stage === 'show' && !offline ? (
            <View style={styles.copyFirst} onLayout={(e) => { copyY.current = e.nativeEvent.layout.y; }}>
              <Box kind="warn" icon="doc" title="First, the customer gets a copy of the bill." text="Then you take the payment." />
              <BillCard card={billCardOf(bill, now.date)} compact />
              <CopyChoice copy={copy} label="THE CUSTOMER’S COPY" off={copyBusy} onChange={() => setCopyFail(null)} />
            </View>
          ) : null}
          {stage === 'show' && !offline ? null : <View style={payStyles.top}>
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
          </View>}

          {stage === 'paid' && bill.payment_status === 'overpaid' ? (
            <Box kind="info" icon="info" style={payStyles.gap} text={`Paid ${usd(-bill.balance_cents)} more than the bill. The office refunds it.`} />
          ) : null}
          {stage === 'void' ? (
            <Box kind="warn" icon="warn" style={payStyles.gap} title="This bill is void"
              text={bill.replaced_by ? `Take the money on the bill that replaced it${bill.replaced_by.label ? ` (${bill.replaced_by.label})` : ''}.` : 'The office makes a new one. Take the money on the new bill.'} />
          ) : null}
          {stage === 'none' ? (
            <Box kind="info" icon="doc" style={payStyles.gap} title="The bill is not final yet"
              text={noBillText(bill)} />
          ) : null}
          {stage === 'free' ? <Box kind="plain" icon="info" style={payStyles.gap} title="Nothing to pay" text="This bill is $0.00." /> : null}
          {offline ? (
            <Box kind="warn" icon="wifioff" style={payStyles.gap} title="No connection · a payment needs the internet"
              text="The server checks the balance so two phones never count the same money twice. Take the money, then record it when you are back online." />
          ) : problem ? <Box kind="danger" icon="warn" style={payStyles.gap} text={problem.text} /> : null}

          {later && stage === 'collect' && !laterReasonGiven(bill) ? (
            <Box kind="info" icon="info" style={payStyles.gap} title="The bill is sent later" text={`${later.reason}. The office sends ${label} to the customer.`} />
          ) : null}

          {/* no payments yet: no empty History over the methods (the Designer on #92) */}
          {rows.length ? (
            <History rows={rows} label={historyLabel(rows, countWord)} onVoid={offline ? null : openVoid} />
          ) : null}
          {rows.some((r) => r.voidLeft > 0) ? (
            <Text style={payStyles.hint}>Wrong amount or method? Void it in the first 15 minutes. After that, ask the office: an admin voids it.</Text>
          ) : null}

          {askAmount ? (
            <>
              <View onLayout={(e) => {
                collectY.current = e.nativeEvent.layout.y;
                if (toCollect.current) { toCollect.current = false; scrollToCollect(); }
              }}>
                <Section label="Collect now">
                  {open ? (
                    <>
                      <Field big prefix="$" value={pick === 'full' ? moneyText(due) : typed} onChange={(t) => { setPick('part'); setTyped(t); }}
                        keyboard="decimal-pad" max={12} placeholder="0.00" label={null} a11y="Amount to collect now" autoFocus off={form.sending} />
                      <Pills items={[{ key: 'full', label: `${balanceWord(bill)} ${usd(due)}` }, { key: 'part', label: 'Part of it' }]} value={pick} onPick={(k) => k && choosePart(k)} off={form.sending} />
                      {pick === 'part' && amount.cents !== null && amount.cents <= due ? (
                        <View style={styles.leftRow}>
                          <Text style={styles.leftLabel}>Left after this</Text>
                          <Text style={styles.leftValue}>{usd(amount.left)}</Text>
                        </View>
                      ) : pick === 'full' ? <Text style={payStyles.text}>Paying with two methods? Take part now, the rest right after.</Text> : null}
                    </>
                  ) : (
                    <View style={styles.collect}>
                      <View style={styles.flex} accessible accessibilityLabel={`Collect now ${usd(shownCents)}, ${collectSub(shownPart, shownCents, due, balanceWord(bill))}`}>
                        <Text style={styles.collectBig} numberOfLines={1} adjustsFontSizeToFit>{usd(shownCents)}</Text>
                        <Text style={styles.collectSub}>{collectSub(shownPart, shownCents, due, balanceWord(bill))}</Text>
                      </View>
                      {form.locked ? null : (
                        <TouchableOpacity style={styles.change} onPress={change} disabled={form.sending} accessibilityRole="button" accessibilityLabel="Change the amount">
                          <Text style={styles.changeText}>Change</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </Section>
              </View>
              {(open && pick === 'part' && amount.part) || (form.locked && shownPart) ? (
                <Section label="Why only part?" need>
                  {form.locked ? <Text style={payStyles.text}>{form.shown.note}</Text> : (
                    <>
                      <Pills items={PART_REASONS.map((r) => ({ key: r, label: r, toggle: true }))} value={reason} onPick={pickReason} off={form.sending} />
                      <Field label="Note" value={note} onChange={setNote} placeholder="Has $100 cash, rest by check" max={500} off={form.sending}
                        hint={`The office sees it with the payment. ${note.length} of 500`} />
                    </>
                  )}
                </Section>
              ) : null}
              <MethodFields form={form} bill={bill} part={shownPart} />
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

        <Foot bottom={insets.bottom} failure={askAmount ? form.failure : stage === 'show' ? copyFail : null}
          note={offline ? `The visit keeps «${usd(due)} due» until it is recorded.` : choice ? `Later: the visit shows «${usd(due)} left» and the office follows up.`
              : askAmount && !form.locked && amount.error && pick === 'part' ? amount.error
                : askAmount ? (form.shown.tile === 'card' ? 'Hand the phone to the customer for the tip.' : form.holder) : null}>
          {offline ? (
            <>
              <MainButton text="Record · needs internet" off onPress={() => {}} />
              <PlainButton text="Try again" icon="refresh" waiting={loading} onPress={load} />
            </>
          ) : stage === 'show' ? (
            <>
              <MainButton text={copyBusy ? 'Sending the copy…' : buttonOf('pay', copy.way).text} icon={buttonOf('pay', copy.way).icon} waiting={copyBusy} onPress={giveCopy} />
              <TouchableOpacity style={styles.later} onPress={takeLater} disabled={copyBusy} accessibilityRole="button">
                <Text style={styles.laterText}>Take payment now, send the copy later</Text>
              </TouchableOpacity>
            </>
          ) : choice ? (
            <>
              <MainButton text={`Collect ${usd(due)} now`} icon="chev" onPress={() => { toCollect.current = true; setCollectingFor(recordKey); }} />
              <PlainButton text={`Later · leave ${usd(due)} due`} onPress={() => navigation.goBack()} />
            </>
          ) : stage === 'none' ? (
            <MainButton text="Open the bill" icon="doc" onPress={() => navigation.navigate('Bill', { id, visit, create: false })} />
          ) : askAmount ? (
            <>
              {form.shown.tile === 'card' ? (
                <MainButton text="Next · add tip" icon="chev" off={!!amount.error} onPress={form.toTip} />
              ) : (
                <MainButton text={form.word ? `Record ${usd(shownCents)} ${form.word}` : 'Choose how they pay'} icon={form.word ? 'check' : null}
                  off={!form.method || form.otherNeed || (!form.locked && !!amount.error)} waiting={form.sending} onPress={form.record} />
              )}
              {canPayOnline(bill) && !form.locked ? <PlainButton text="Pay online · show QR code" off={!!amount.error} onPress={payOnline} /> : null}
            </>
          ) : (
            <MainButton text="Done · back to the visit" onPress={() => navigation.goBack()} />
          )}
        </Foot>
      </KeyboardAvoidingView>


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
  // d5: the copy first — the box, the bill in one row, the choice
  copyFirst: { gap: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  later: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 17, fontWeight: '700', color: colors.fgSecondary },
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
  // «Collect now»: the full balance in the brand box, «Change» on the right (design usab-u4-pay)
  collect: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.brandSoft },
  collectBig: { fontSize: 34, lineHeight: 40, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  collectSub: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.brandPressed },
  change: { minHeight: 48, minWidth: 48, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.bgCard },
  changeText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
});
