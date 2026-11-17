// «Approve the repair» (design-mockups/app-invoice approve): the customer agrees, before the
// work, to the amount without tax of the visit's bill draft and signs with a finger. Opens from
// the visit's Approve tile. src/approve/model.js has the rules, queue.js keeps a signature on
// the phone until the server has it.
//   - The draft is the server's: the screen asks for it (POST …/bill gives the one there is or
//     drafts it from the visit), «See N lines» opens it on BillScreen, where it can change; the
//     screen reads it again on return.
//   - The company's approval terms (latest version) — Read shows them; their version goes with
//     the signature. NYC: the customer chooses about the written estimate (§2-255).
//   - Approve: kept on the phone, then sent with the amount the customer saw. Sent — the
//     approval and the customer's copy (Share the PDF / Handed a printed copy, §2-258). No
//     connection — «Signed · saved on this phone», it goes by itself. The draft or the terms
//     changed meanwhile — the server refuses, the customer sees the new and signs again.
//   - By phone: the office records it (the technician cannot), the screen says so.
//   - A visit with an approval opens on it: its copy, and «The customer signs again»; from a
//     refused issue (over the approved amount) it opens on the new signature at once.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { approveAPI, billAPI } from '../services/api';
import { useAuth } from '../session/AuthContext';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { nowWall } from '../myDay/model';
import { newRequestId } from '../myDay/actions';
import { CONSENT_WORDS, billError, deliverBody, usd } from '../bill/model';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';
import {
  ESTIMATE_CHOICES, ESTIMATE_RIGHT, agreedOf, authBody, countText, estimatePriceOf, estimatePriceText, writtenText, latestOf, needsEstimateChoice, ruleText, signedText, termsLineOf,
} from '../approve/model';
import { approvals } from '../approve/store';
import { downloadApprovalPdf } from '../approve/pdf';
import SignaturePad from '../approve/SignaturePad';

export default function ApproveScreen({ route, navigation }) {
  const { id, visit, again: askAgain = false } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const today = nowWall(Date.now()).date;

  // ---------- what the server says ----------
  const [state, setState] = useState({ status: 'loading' }); // loading | ready | problem
  const [bill, setBill] = useState(null);
  const [terms, setTerms] = useState(null);
  const [rule, setRule] = useState('none');
  const [latest, setLatest] = useState(null);
  const [pending, setPending] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    const kept = userId === null ? null : await approvals.pendingOf(id, userId);
    if (n !== seq.current) return;
    setPending(kept);
    try {
      const [draft, termsAnswer, listAnswer, book] = await Promise.all([billAPI.draft(id), approveAPI.terms(id), approveAPI.list(id), billAPI.priceBook(id)]);
      if (n !== seq.current) return;
      setBill(draft.bill || null);
      setTerms(termsAnswer.terms || null);
      setRule(listAnswer.rule || 'none');
      setLatest(latestOf(listAnswer.authorizations));
      setEstimatePrice(estimatePriceOf(book.price_items));
      setState({ status: 'ready' });
    } catch (error) {
      if (n !== seq.current) return;
      const failed = billError(error);
      if (failed.kind === 'failed') logError('Error loading the approval:', error);
      setState({ status: 'problem', failed });
    }
  }, [id, userId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ---------- the form ----------
  const [again, setAgain] = useState(askAgain);      // a new signature over an existing approval (the issue asked for it)
  const [name, setName] = useState((visit && visit.client_name) || '');
  const [estimate, setEstimate] = useState(null);    // { choice, price }
  const [estimatePrice, setEstimatePrice] = useState(0); // the written estimate's price (the price book's estimate_fee)
  const [drawn, setDrawn] = useState(false);
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState(null);            // { kind, text } of the last try
  const [termsOpen, setTermsOpen] = useState(false);
  const pad = useRef(null);
  const [scroll, setScroll] = useState(true);

  const agreed = agreedOf(bill);
  const termsLine = termsLineOf(terms, bill && bill.company && (bill.company.name || bill.company.legal_name));
  const nyc = needsEstimateChoice(rule);
  const signing = !latest || again || (pending && pending.failed);
  const mustChoose = nyc && !estimate;               // NYC: the customer chooses about the written estimate before signing
  const written = writtenText(latest);

  const approve = async () => {
    if (sending) return;
    const png = pad.current ? await pad.current.png() : null;
    const { body, error } = authBody({
      name, png, agreed, terms, rule,
      estimate: estimate ? { choice: estimate, price: estimatePrice } : null,
      requestId: newRequestId(),
    });
    if (error) { setSaid({ kind: 'refused', text: error }); return; }
    setSending(true);
    setSaid(null);
    const r = await approvals.sign({ visitId: id, userId, body, at: Date.now() });
    setSending(false);
    if (r.result === 'sent') {
      setAgain(false);
      setPending(null);
      setLatest(r.authorization);
      return;
    }
    if (r.result === 'waiting') {
      setPending(await approvals.pendingOf(id, userId));
      setSaid(r.failed.kind === 'offline' ? null : r.failed);
      return;
    }
    setPending(await approvals.pendingOf(id, userId));
    setSaid(r.failed);
    if (r.result === 'resign' || r.result === 'refused') { pad.current && pad.current.clear(); load(); }
    if (r.result === 'gone') Alert.alert('The visit changed', r.failed.text, [{ text: 'OK', onPress: () => navigation.goBack() }]);
  };

  // ---------- the customer's copy ----------
  const [copyBusy, setCopyBusy] = useState(null);    // 'share' | 'handed'
  const [copyDone, setCopyDone] = useState(null);    // words of the last copy given
  const giveCopy = async (via, consent = false, auth = latest) => {
    const { body, error } = deliverBody(via, '', consent);
    if (error) { Alert.alert('The copy is not marked', error); return; }
    setCopyBusy(via === 'shared' ? 'share' : 'handed');
    try {
      await approveAPI.copies(id, auth.id, body);
      setCopyDone(via === 'shared' ? 'The PDF copy went to the customer.' : 'The customer has a printed copy.');
    } catch (e) {
      const failed = billError(e);
      if (failed.kind === 'failed') logError('Error marking an approval copy:', e);
      Alert.alert('The copy is not marked', failed.kind === 'offline' ? 'No connection. Try again online.' : failed.text);
    } finally {
      setCopyBusy(null);
    }
  };
  const shareCopy = async (auth = latest) => {
    if (copyBusy || !auth) return;
    setCopyBusy('share');
    try {
      const file = await downloadApprovalPdf(id, auth);
      const result = await Share.share({ url: file.uri, title: 'Repair approval' });
      setCopyBusy(null);
      if (result && result.action === Share.sharedAction) {
        Alert.alert('Did the customer get it?', CONSENT_WORDS, [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Yes, they agreed', onPress: () => giveCopy('shared', true, auth) },
        ]);
      }
    } catch (e) {
      setCopyBusy(null);
      const failed = billError(e);
      if (failed.kind === 'failed') logError('Error downloading an approval copy:', e);
      Alert.alert('The PDF did not open', failed.kind === 'offline' ? 'No connection. The copy comes from the office’s server: try again online.' : failed.text);
    }
  };

  // ---------- the screen ----------
  const top = <TopBar back="Visit" title="Approve the repair" onBack={() => navigation.goBack()} />;

  if (state.status !== 'ready') {
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        {top}
        <View style={styles.center}>
          {state.status === 'loading' ? <ActivityIndicator color={colors.brandPressed} /> : (
            <>
              {pending ? <Box kind="done" icon="checkc" title="Signed · saved on this phone" text="It goes to the office by itself when the phone is back online. You can start the repair." style={styles.gap} /> : null}
              <Text style={styles.problem}>{state.failed.kind === 'offline' ? 'No connection. The amount comes from the office’s server.' : state.failed.text}</Text>
              <PlainButton text="Try again" icon="retry" onPress={load} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const waitingOnPhone = pending && !pending.failed;
  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      {top}
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} scrollEnabled={scroll} canCancelContentTouches={scroll} keyboardShouldPersistTaps="handled">
          {waitingOnPhone ? (
            <Box kind="done" icon="checkc" title="Signed · saved on this phone" text="No connection. The signature goes to the office by itself when the phone is back online. You can start the repair." style={styles.boxGap} />
          ) : null}
          {pending && pending.failed ? <Box kind="warn" icon="warn" title="The signature was not accepted" text={pending.failed.text} style={styles.boxGap} /> : null}
          {said && !(pending && pending.failed && said.text === pending.failed.text) ? <Box kind="warn" icon="warn" text={said.text} style={styles.boxGap} /> : null}

          {!signing && latest && !waitingOnPhone ? (
            <View style={styles.pad}>
              <Text style={styles.label}>THE CUSTOMER APPROVED</Text>
              <View style={styles.card} accessible accessibilityLabel={`${signedText(latest, today)}, ${usd(latest.amount_cents)} before tax, by ${latest.signer_name}`}>
                <View style={styles.rowTop}>
                  <Text style={styles.big}>{usd(latest.amount_cents)}</Text>
                  <View style={styles.tag}><Icon name="checkc" size={16} color={colors.successFg} /><Text style={styles.tagText}>{signedText(latest, today)}</Text></View>
                </View>
                <Text style={styles.sub}>Before tax · {latest.signer_name}</Text>
              </View>
              {written ? (
                <View style={[styles.card, styles.termsRow]}>
                  <Icon name="doc" size={22} color={colors.fgSecondary} />
                  <View style={styles.flex}>
                    <Text style={styles.termsTitle}>Written estimate</Text>
                    <Text style={styles.sub}>{written}</Text>
                  </View>
                </View>
              ) : null}
              <Text style={[styles.label, styles.labelGap]}>THE CUSTOMER’S COPY</Text>
              <Text style={styles.note}>The customer keeps a copy of what they signed. Showing it on the phone does not count.</Text>
              {copyDone ? <Box kind="done" icon="checkc" text={copyDone} style={styles.gapTop} /> : null}
              <View style={styles.copyButtons}>
                <PlainButton text={written ? 'Share the copy' : 'Share the PDF'} icon="share" onPress={() => shareCopy()} waiting={copyBusy === 'share'} off={!!copyBusy} />
                <PlainButton text="Handed a printed copy" icon="doc" onPress={() => giveCopy('handed')} waiting={copyBusy === 'handed'} off={!!copyBusy} />
              </View>
            </View>
          ) : null}

          {signing && !waitingOnPhone ? (
            <>
              <View style={styles.pad}>
                <Text style={styles.label}>BEFORE WORK · THE CUSTOMER AGREES TO</Text>
                {agreed ? (
                  <View style={styles.card}>
                    <View style={styles.rowTop}>
                      <Text style={styles.cardTitle}>Agreed before tax</Text>
                      <Text style={styles.big}>{usd(agreed.amount)}</Text>
                    </View>
                    {agreed.summary ? <Text style={styles.sub}>{agreed.summary}</Text> : null}
                    <View style={styles.rowFoot}>
                      <Text style={styles.withTax}>With tax about {usd(agreed.withTax)}</Text>
                      <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Bill', { id, visit })} accessibilityRole="button">
                        <Text style={styles.linkText}>{countText(agreed.count)}</Text>
                        <Icon name="chev" size={18} color={colors.brandPressed} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Box kind="warn" icon="warn" text="The bill has nothing to approve yet. Add the work to it first." />
                )}
                {termsLine ? (
                  <View style={[styles.card, styles.termsRow]}>
                    <Icon name="doc" size={22} color={colors.fgSecondary} />
                    <View style={styles.flex}>
                      <Text style={styles.termsTitle}>{termsLine.title}</Text>
                      <Text style={styles.sub}>{termsLine.sub}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setTermsOpen(true)} accessibilityRole="button" accessibilityLabel="Read the terms" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={styles.linkText}>Read</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {nyc ? (
                <View style={styles.pad} accessibilityRole="radiogroup" accessibilityLabel="Written estimate">
                  <Text style={styles.label} accessibilityRole="header">WRITTEN ESTIMATE</Text>
                  <Text style={styles.right}>{ESTIMATE_RIGHT} <Text style={styles.rightPrice}>{estimatePriceText(estimatePrice)}</Text></Text>
                  {ESTIMATE_CHOICES.map((c) => {
                    const on = estimate === c.choice;
                    return (
                      <TouchableOpacity key={c.choice} style={[styles.choice, on && styles.choiceOn]} onPress={() => setEstimate(c.choice)} disabled={sending}
                        accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${c.title}. ${c.sub}`}>
                        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                        <View style={styles.flex}>
                          <Text style={styles.choiceText}>{c.title}</Text>
                          <Text style={styles.choiceSub}>{c.sub}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {estimate ? null : (
                    <View style={styles.need}>
                      <Icon name="info" size={16} color={colors.warningFg} />
                      <Text style={styles.needText}>Choose one to sign</Text>
                    </View>
                  )}
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>CUSTOMER NAME</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name of who signs" placeholderTextColor={colors.fgMutedField}
                  autoCapitalize="words" autoCorrect={false} returnKeyType="done" maxLength={200} accessibilityLabel="Customer name" />
              </View>
              <View onTouchStart={() => setScroll(false)} onTouchEnd={() => setScroll(true)} onTouchCancel={() => setScroll(true)}>
                <SignaturePad ref={pad} onDrawn={setDrawn} disabled={sending || mustChoose} />
              </View>
              <Text style={styles.rule}>{ruleText(rule)}</Text>
            </>
          ) : null}
        </ScrollView>

        <Foot bottom={insets.bottom}>
          {signing && !waitingOnPhone ? (
            <>
              <MainButton text={agreed ? `Approve · ${usd(agreed.amount)}` : 'Approve'} icon="check" onPress={approve} waiting={sending}
                off={!agreed || !drawn || !name.trim() || mustChoose} />
              <Text style={styles.byPhone}>Agreed by phone? The office records it.</Text>
              {latest && again ? <TouchableOpacity onPress={() => setAgain(false)} accessibilityRole="button"><Text style={styles.cancelAgain}>Keep the earlier approval</Text></TouchableOpacity> : null}
            </>
          ) : waitingOnPhone ? (
            <PlainButton text="Back to the visit" icon="back" onPress={() => navigation.goBack()} />
          ) : (
            <PlainButton text="The customer signs again" icon="replay" onPress={() => { setAgain(true); setDrawn(false); setSaid(null); }} />
          )}
        </Foot>
      </KeyboardAvoidingView>

      <Modal visible={termsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTermsOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={billStyles.screen}>
          <TopBar back="Approve" title={termsLine ? termsLine.title : 'Terms'} onBack={() => setTermsOpen(false)} />
          <ScrollView contentContainerStyle={styles.termsBody}>
            <Text style={styles.sub}>{termsLine ? termsLine.sub : ''}</Text>
            <Text style={styles.termsText}>{terms ? terms.body : ''}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  problem: { fontSize: 15, lineHeight: 21, color: colors.fgSecondary, textAlign: 'center' },
  gap: { alignSelf: 'stretch' },
  gapTop: { marginTop: 10 },
  body: { paddingTop: 12, paddingBottom: 24 },
  pad: { paddingHorizontal: 16, paddingBottom: 12 },
  boxGap: { marginHorizontal: 16, marginBottom: 12 },
  flex: { flex: 1 },
  label: { marginBottom: 8, fontSize: 13, fontWeight: '800', letterSpacing: 1.1, color: colors.fgSecondary },
  labelGap: { marginTop: 16 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  rowFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  cardTitle: { flexShrink: 1, fontSize: 20, fontWeight: '800', color: colors.fgDefault },
  big: { fontSize: 22, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  sub: { marginTop: 4, fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  withTax: { fontSize: 14, color: colors.fgSecondary, fontVariant: ['tabular-nums'] },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36 },
  linkText: { fontSize: 15, fontWeight: '700', color: colors.brandPressed },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, paddingVertical: 10 },
  termsTitle: { fontSize: 15, fontWeight: '700', color: colors.fgDefault },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.successBg },
  tagText: { fontSize: 13, fontWeight: '700', color: colors.successFg },
  note: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  copyButtons: { gap: 10, marginTop: 12 },
  right: { marginBottom: 12, fontSize: 15, lineHeight: 21, color: colors.fgSecondary },
  rightPrice: { fontWeight: '800', color: colors.fgDefault },
  // the choices (design .iv-opt): a card, the chosen one brand-soft with a brand border
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 56, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  choiceOn: { borderWidth: 2, paddingHorizontal: 13.5, paddingVertical: 11.5, borderColor: colors.brand, backgroundColor: colors.brandSoft },
  radio: { width: 22, height: 22, marginTop: 1, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  choiceText: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.fgDefault },
  choiceSub: { marginTop: 2, fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  need: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  needText: { fontSize: 14, fontWeight: '600', color: colors.warningFg },
  field: { paddingHorizontal: 16, paddingBottom: 12 },
  input: { minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard, fontSize: 17, color: colors.fgDefault },
  rule: { paddingTop: 8, paddingHorizontal: 16, fontSize: 13, lineHeight: 18, color: colors.fgMutedField },
  byPhone: { marginTop: 10, textAlign: 'center', fontSize: 14, color: colors.fgSecondary },
  cancelAgain: { marginTop: 8, textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.brandPressed, paddingVertical: 6 },
  termsBody: { padding: 16, paddingBottom: 40 },
  termsText: { marginTop: 12, fontSize: 15, lineHeight: 22, color: colors.fgDefault },
});
