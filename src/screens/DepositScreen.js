// «Deposit» of the visit's job (DEP-APP; design-mockups/deposits app-take, app-take-low,
// app-done, app-blocked; rules BILLS_MV_DESIGN.md §2.4а). Opened from the Deposit row of the visit:
//   take    — Take a deposit: the amount (any above $0.00), how they pay (the six tiles of Pay),
//             a check number, a note; «Record $X deposit». Who has the money is the server's;
//   open    — the job's deposits: the one just recorded on top («Deposit recorded»), each with
//             Void in its first 15 minutes (their own, taken on this visit), «With you now»;
//   blocked — the final bill is issued: money goes to the bill now, «Open Pay».
// The deposits come from GET /api/my/visits/:id (visit.deposits, DEP-1c), read again on focus and
// after each record or void. Not here yet: the photo of a check (after #52) and the deposit
// receipt to share (DEP-1b).
// A send without an answer: the same client_request_id goes again on the next press (the server
// records it once), the fields stay locked until an answer.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { depositAPI, myDayAPI, payAPI } from '../services/api';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { Sheet } from '../myDay/visitBar';
import { newRequestId } from '../myDay/actions';
import { usd } from '../bill/model';
import { OTHER_CHOICES, VOID_REASONS, chosenMethod, methodWord, numbersOf, payError, shortPerson, voidBody } from '../pay/model';
import {
  NOT_A_BILL, TAKE_HINT, blockedOf, depositAmount, depositBody, depositError, depositHolderLine, depositRows, depositsOf, recordedLine, withYouRows,
} from '../deposit/model';
import { Choice, Field, MethodTiles, Numbers, Pills, Section, payStyles } from '../pay/parts';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';

export default function DepositScreen({ route, navigation }) {
  const { id, visit: firstVisit, mode: firstMode = 'take', bill = null } = route.params || {};
  const insets = useSafeAreaInsets();
  const [visit, setVisit] = useState(firstVisit);
  const [mode, setMode] = useState(firstMode);
  const [tick, setTick] = useState(Date.now());
  const [loadFailed, setLoadFailed] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const data = await myDayAPI.visit(id);
      if (n !== seq.current) return;
      setVisit(data.visit);
      setLoadFailed(null);
    } catch (error) {
      if (n !== seq.current) return;
      const failed = depositError(error);
      if (failed.kind === 'gone') { navigation.popToTop(); return; }
      if (failed.kind === 'failed') logError('Error loading the visit for a deposit:', error);
      setLoadFailed(failed.kind === 'offline' ? 'No connection: the deposits shown may be old.' : failed.text);
    }
  }, [id, navigation]);
  useFocusEffect(useCallback(() => { setTick(Date.now()); load(); }, [load]));
  // the void links count their minutes down
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const d = depositsOf(visit);
  const me = shortPerson(visit && visit.main_technician_name);
  const jobNumber = visit && visit.job_id;

  // ---------- take ----------
  const [typed, setTyped] = useState('');
  const [tile, setTile] = useState(null);
  const [otherKey, setOtherKey] = useState(null);
  const [otherName, setOtherName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(null);
  const [sent, setSent] = useState(null);                // { rid } of a send without an answer: the fields stay
  const [recorded, setRecorded] = useState(null);        // the deposit just recorded
  const amount = depositAmount(typed);
  const { method, name } = chosenMethod(tile, otherKey, otherName);
  const word = method ? methodWord(method, name) : null;
  const locked = !!sent;
  const built = useMemo(() => (method && amount.cents
    ? depositBody({ cents: amount.cents, method, name, note, checkNumber: tile === 'check' ? checkNumber : '', requestId: 'x' }) : null),
  [amount.cents, method, name, note, checkNumber, tile]);
  const otherNeed = tile === 'other' && (!otherKey || (otherKey === 'else' && !otherName.trim()));

  const record = async () => {
    if (sending || !built) return;
    if (built.error) { setFailed(built.error); return; }
    const rid = sent ? sent.rid : newRequestId();
    setSent({ rid });
    setSending(true);
    setFailed(null);
    try {
      const data = await depositAPI.record(id, { ...built.body, client_request_id: rid });
      setSent(null);
      setRecorded(data.deposit);
      setMode('open');
      load();
    } catch (error) {
      const f = depositError(error, { billLabel: bill && bill.label });
      if (f.kind === 'failed') logError('Error recording a deposit:', error);
      if (f.kind === 'gone') { navigation.popToTop(); return; }
      // a refusal is an answer: nothing was recorded, the fields open again
      if (f.kind === 'refused') setSent(null);
      setFailed(f.kind === 'offline' || f.kind === 'failed' ? `${f.text} Press again: the same deposit is sent, and the server records it only once.` : f.text);
    } finally {
      setSending(false);
    }
  };

  // ---------- void one's own ----------
  const [voiding, setVoiding] = useState(null);
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
      await payAPI.void(id, voiding.row.id, body.reason);
      setVoiding(null);
      if (recorded && recorded.id === voiding.row.id) setRecorded(null);
      await load();
    } catch (e) {
      const f = payError(e);
      if (f.kind === 'failed') logError('Error voiding a deposit:', e);
      setVoidFailed(f.text);
    } finally {
      setVoidBusy(false);
    }
  };

  const rows = depositRows(visit, tick);
  const withYou = withYouRows(visit);
  const back = <TopBar back="Visit" title="Deposit" onBack={() => navigation.goBack()} />;

  if (mode === 'blocked') {
    const why = blockedOf(visit, bill);
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        {back}
        <ScrollView contentContainerStyle={payStyles.body}>
          <View style={payStyles.top}>
            <Box kind="info" icon="info" title={why.title} text={why.text} />
            {why.pay ? <Numbers rows={numbersOf(bill)} /> : null}
          </View>
        </ScrollView>
        <Foot bottom={insets.bottom}>
          {why.pay ? <MainButton text="Open Pay" icon="chev" onPress={() => navigation.replace('Pay', { id, visit, bill })} /> : null}
          <PlainButton text="Back to the visit" onPress={() => navigation.goBack()} />
        </Foot>
      </SafeAreaView>
    );
  }

  if (mode === 'open') {
    const open = d ? d.openCents : 0;
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        {back}
        <ScrollView contentContainerStyle={payStyles.body}>
          <View style={payStyles.top}>
            {recorded ? (
              <View style={styles.doneBox} accessible accessibilityLabel={`Deposit recorded. ${recordedLine(recorded, jobNumber)}`}>
                <View style={styles.doneDot}><Icon name="check" size={30} color={colors.fgOnFill} /></View>
                <View style={styles.flex}>
                  <Text style={styles.doneTitle}>Deposit recorded</Text>
                  <Text style={styles.doneSub}>{recordedLine(recorded, jobNumber)}</Text>
                </View>
              </View>
            ) : null}
            <Numbers rows={[
              { key: 'deposits', label: 'Deposits', value: usd(open) },
              { key: 'for', label: 'For the repair', value: d && d.take === 'bill_issued' ? 'Applied' : 'Open' },
            ]} />
          </View>
          {loadFailed ? <Box kind="warn" icon="wifioff" style={payStyles.gap} text={loadFailed} /> : null}
          <Section label={rows.length ? `Deposits · ${rows.filter((r) => !r.voided).length}` : 'Deposits'}>
            {rows.length ? rows.map((r, i) => (
              <View key={r.key} style={[styles.row, i > 0 && styles.rowNext]} accessible
                accessibilityLabel={[r.title, r.sub, r.amount].filter(Boolean).join(', ')}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowTitle, r.voided && styles.struck]}>{r.title}</Text>
                  <Text style={[styles.rowAmount, r.voided && styles.struck]}>{r.amount}</Text>
                </View>
                {r.sub ? <Text style={styles.rowSub}>{r.sub}</Text> : null}
                {r.voidLeft > 0 ? (
                  <TouchableOpacity style={styles.voidLink} onPress={() => openVoid(r)} accessibilityRole="button"
                    accessibilityLabel={`Void ${r.amount}, ${r.voidLeft} minutes left`}>
                    <Icon name="ban" size={18} color={colors.dangerFg} />
                    <Text style={styles.voidText}>{`Void · ${r.voidLeft} min left`}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )) : <Text style={payStyles.text}>No deposits on this job.</Text>}
          </Section>
          {rows.some((r) => r.voidLeft > 0) ? (
            <Text style={payStyles.hint}>Wrong amount or method? Void it in the first 15 minutes. After that, ask the office: an admin voids it.</Text>
          ) : null}
          {withYou.length ? (
            <Section label="With you now">
              {withYou.map((r, i) => (
                <View key={r.key} style={[styles.row, i > 0 && styles.rowNext]} accessible accessibilityLabel={`${r.title}, ${r.amount}`}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle}>{r.title}</Text>
                    <Text style={styles.rowAmount}>{r.amount}</Text>
                  </View>
                  <Text style={styles.rowSub}>Turn it in to the office</Text>
                </View>
              ))}
            </Section>
          ) : null}
        </ScrollView>
        <Foot bottom={insets.bottom}>
          {d && d.canTake && !recorded ? <PlainButton text="Take another deposit" icon="plus" onPress={() => { setMode('take'); setTyped(''); setTile(null); setCheckNumber(''); setNote(''); setFailed(null); }} /> : null}
          <MainButton text="Done · back to the visit" onPress={() => navigation.goBack()} />
        </Foot>

        <Sheet visible={!!voiding} onClose={() => setVoiding(null)} bottom={insets.bottom} keyboard>
          {voiding ? (
            <View style={payStyles.sheetBody}>
              <Text style={payStyles.sheetTitle} accessibilityRole="header">{`Void ${voiding.amount} deposit?`}</Text>
              <Text style={payStyles.sheetSub}>{`${voiding.title} · ${voiding.voidLeft} min left to do it yourself`}</Text>
              <Pills items={VOID_REASONS.map((r) => ({ key: r, label: r, toggle: true }))} value={voidChip} onPick={setVoidChip} off={voidBusy} />
              <TextInput style={payStyles.input} value={voidText} onChangeText={setVoidText} maxLength={400} placeholder="What happened"
                placeholderTextColor={colors.fgMutedField} accessibilityLabel="Why it is voided" />
              <Text style={payStyles.sheetSub}>It stays in the list crossed out. The office sees who voided it and why.</Text>
              {voidFailed ? <Text style={payStyles.failed} accessibilityRole="alert">{voidFailed}</Text> : null}
              <TouchableOpacity style={[payStyles.danger, (!voidChip && !voidText.trim()) && payStyles.dangerOff]} onPress={doVoid}
                disabled={voidBusy || (!voidChip && !voidText.trim())} accessibilityRole="button"
                accessibilityState={{ disabled: voidBusy || (!voidChip && !voidText.trim()), busy: voidBusy }}>
                {voidBusy ? <ActivityIndicator color={colors.dangerFg} /> : (
                  <>
                    <Icon name="ban" size={22} color={colors.dangerFg} />
                    <Text style={payStyles.dangerText}>Void deposit</Text>
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

  // take
  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      {back}
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={payStyles.body} keyboardShouldPersistTaps="handled">
          <Section label={jobNumber ? `Deposit for job #${jobNumber}` : 'Deposit'}>
            <Field big prefix="$" value={typed} onChange={(t) => { setTyped(t); setFailed(null); }} keyboard="decimal-pad" max={12} placeholder="0.00"
              label={null} a11y="Deposit amount" off={locked} hint={typed && amount.error ? amount.error : null} />
            <Text style={payStyles.text}>{TAKE_HINT}</Text>
            <Text style={payStyles.text}>{NOT_A_BILL}</Text>
          </Section>
          <Section label="Pay with">
            <MethodTiles value={tile} onPick={(m) => { setTile(m); setFailed(null); }} off={sending || locked} />
          </Section>
          {tile === 'check' ? (
            <Section label="Check">
              <Field off={locked} label="Check number" value={checkNumber} onChange={setCheckNumber} placeholder="1042" max={30} keyboard="number-pad" />
            </Section>
          ) : null}
          {tile === 'card' ? (
            <Section label="Card">
              <Box kind="info" icon="info" text="Charge it in the card app (Square) on this phone. Never type a card number into SEMIX." />
            </Section>
          ) : null}
          {tile === 'other' ? (
            <Section label="Other · which one?" need>
              <View style={styles.choices} accessibilityRole="radiogroup">
                {OTHER_CHOICES.map((c) => (
                  <Choice key={c.key} on={otherKey === c.key} title={c.title} sub={c.sub} onPress={() => { setOtherKey(c.key); setFailed(null); }} off={sending || locked} />
                ))}
              </View>
              {otherKey === 'else' ? (
                <TextInput style={payStyles.input} value={otherName} onChangeText={setOtherName} editable={!locked} maxLength={60} placeholder="What the customer used"
                  placeholderTextColor={colors.fgMutedField} accessibilityLabel="What the customer used" autoFocus />
              ) : null}
            </Section>
          ) : null}
          {tile ? (
            <Section label="Note">
              <Field off={locked} label={null} optional value={note} onChange={setNote} placeholder="What it is for: the part, the date" max={500} a11y="Note" />
            </Section>
          ) : null}
          {failed ? <Box kind="danger" icon="warn" style={payStyles.gap} text={failed} /> : null}
        </ScrollView>

        <Foot bottom={insets.bottom} note={depositHolderLine(method, me)}>
          <MainButton text={word && amount.cents ? `Record ${usd(amount.cents)} deposit` : !amount.cents ? 'Type the amount' : 'Choose how they pay'}
            icon={word && amount.cents ? 'check' : null} off={!method || !amount.cents || otherNeed} waiting={sending} onPress={record} />
        </Foot>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  choices: { gap: 8 },
  doneBox: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.successBorder, backgroundColor: colors.successBg },
  doneDot: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successBorder },
  doneTitle: { fontSize: 24, fontWeight: '800', color: colors.successFg },
  doneSub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  row: { paddingVertical: 10 },
  rowNext: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  rowAmount: { fontSize: 17, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  rowSub: { marginTop: 2, fontSize: 15, color: colors.fgSecondary },
  struck: { textDecorationLine: 'line-through', color: colors.fgSecondary },
  voidLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 44 },
  voidText: { fontSize: 16, fontWeight: '700', color: colors.dangerFg },
});
